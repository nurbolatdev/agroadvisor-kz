package kz.agroadvisor.diagnosis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import kz.agroadvisor.catalog.service.CatalogService;
import kz.agroadvisor.catalog.service.CatalogService.CropView;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.diagnosis.config.AiProperties;

/** The client against a fake AI service that speaks the contract of docs/api/ai-predict.md. */
class HttpAiClientTest {

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 1, 2, 3};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3};

    private static final String OK = """
            {"status": "ok", "crop": "tomato",
             "top1": {"code": "tomato__late_blight", "confidence": 0.91},
             "top3": [{"code": "tomato__late_blight", "confidence": 0.91},
                      {"code": "tomato__early_blight", "confidence": 0.05}],
             "detected_crop": null, "model_version": "effnet-b0-v1", "classes_version": 1,
             "inference_ms": 84, "a_field_added_later": true}""";
    private static final String NOT_LOADED = "{\"error\": \"model_not_loaded\", \"reason\": null, \"message\": \"x\"}";

    private HttpServer server;
    private final List<Reply> replies = new CopyOnWriteArrayList<>();
    private final AtomicInteger requests = new AtomicInteger();
    private volatile String lastBody = "";

    private record Reply(int status, String body, long delayMillis) {
    }

    @BeforeEach
    void startFakeAiService() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/predict", this::answer);
        server.createContext("/health", exchange -> send(exchange, 200,
                "{\"status\": \"ok\", \"model_version\": \"effnet-b0-v1\", \"classes_version\": 1, \"calibrated\": true}"));
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private void answer(HttpExchange exchange) throws IOException {
        int n = requests.getAndIncrement();
        lastBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.ISO_8859_1);
        Reply reply = replies.get(Math.min(n, replies.size() - 1));
        try {
            Thread.sleep(reply.delayMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        send(exchange, reply.status(), reply.body());
    }

    private static void send(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        try {
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
        } catch (IOException clientGone) {
            // the client gave up (a timeout test)
        } finally {
            exchange.close();
        }
    }

    private void reply(int status, String body) {
        replies.add(new Reply(status, body, 0));
    }

    private HttpAiClient client(int retries) {
        return client("http://127.0.0.1:" + server.getAddress().getPort(), retries, Duration.ofMillis(20));
    }

    private static HttpAiClient client(String url, int retries) {
        return client(url, retries, Duration.ofMillis(20));
    }

    private static HttpAiClient client(String url, int retries, Duration retryDelay) {
        CatalogService catalog = mock(CatalogService.class);
        when(catalog.crops("en")).thenReturn(List.of(new CropView("tomato", "Tomato"), new CropView("wheat", "Wheat")));
        return new HttpAiClient(new AiProperties("http", url, Duration.ofSeconds(1), Duration.ofMillis(400), retries,
                retryDelay), catalog);
    }

    private static ApiException failure(ThrowingCallable call) {
        ApiException error = catchThrowableOfType(ApiException.class, call);
        assertThat(error).as("an ApiException").isNotNull();
        return error;
    }

    @Test
    void sendsTheCropAndThePhotoAsMultipartAndReadsTheAnswer() {
        reply(200, OK);

        Prediction prediction = client(1).predict("tomato", JPEG);

        assertThat(prediction.status()).isEqualTo("ok");
        assertThat(prediction.crop()).isEqualTo("tomato");
        assertThat(prediction.top1().code()).isEqualTo("tomato__late_blight");
        assertThat(prediction.top1().confidence()).isEqualTo(0.91);
        assertThat(prediction.top3()).hasSize(2);
        assertThat(prediction.detectedCrop()).isNull();
        assertThat(prediction.modelVersion()).isEqualTo("effnet-b0-v1");
        assertThat(prediction.classesVersion()).isEqualTo(1);
        assertThat(prediction.inferenceMs()).isEqualTo(84);
        assertThat(prediction.isPlaceholder()).isFalse();
        assertThat(lastBody).contains("name=\"crop\"").contains("tomato")
                .contains("name=\"image\"").contains("Content-Type: image/jpeg");
    }

    @Test
    void declaresAPngAsPng() {
        reply(200, OK);

        client(1).predict("tomato", PNG);

        assertThat(lastBody).contains("Content-Type: image/png");
    }

    @Test
    void readsACropMismatchWithTheDetectedCrop() {
        reply(200, """
                {"status": "crop_mismatch", "crop": "potato",
                 "top1": {"code": "potato__healthy", "confidence": 0.38},
                 "top3": [{"code": "potato__healthy", "confidence": 0.38}],
                 "detected_crop": "tomato", "model_version": "effnet-b0-v1", "classes_version": 1, "inference_ms": 70}""");

        Prediction prediction = client(1).predict("potato", JPEG);

        assertThat(prediction.status()).isEqualTo("crop_mismatch");
        assertThat(prediction.detectedCrop()).isEqualTo("tomato");
    }

    @Test
    void passesOnALowQualityPhotoWithItsReason() {
        reply(422, "{\"error\": \"low_quality\", \"reason\": \"blurry\", \"message\": \"Photo is too blurry\"}");

        ApiException e = failure(() -> client(1).predict("tomato", JPEG));

        assertThat(e.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_CONTENT);
        assertThat(e.getCode()).isEqualTo(DiagnosisErrors.LOW_QUALITY);
        assertThat(e.getMessage()).isEqualTo("blurry");
        assertThat(requests.get()).isEqualTo(1); // asked once per call: a bad photo is not retried
    }

    @Test
    void passesOnAPhotoTheServiceCannotDecode() {
        reply(400, "{\"error\": \"invalid_image\", \"reason\": \"corrupted\", \"message\": \"x\"}");

        ApiException e = failure(() -> client(1).predict("tomato", JPEG));

        assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(e.getCode()).isEqualTo(DiagnosisErrors.INVALID_IMAGE);
    }

    @Test
    void aCropTheServiceDoesNotKnowIsOurFaultNotTheFarmers() {
        reply(400, "{\"error\": \"unknown_crop\", \"reason\": null, \"message\": \"x\"}");

        ApiException e = failure(() -> client(1).predict("tomato", JPEG));

        assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_GATEWAY);
        assertThat(e.getCode()).isEqualTo(DiagnosisErrors.AI_ERROR);
    }

    @Test
    void triesOnceMoreWhenTheModelIsNotLoadedYet() {
        reply(503, NOT_LOADED);
        reply(200, OK);

        Prediction prediction = client(1).predict("tomato", JPEG);

        assertThat(prediction.status()).isEqualTo("ok");
        assertThat(requests.get()).isEqualTo(2);
    }

    @Test
    void givesUpAfterOneRetryWhenTheModelStaysNotLoaded() {
        reply(503, NOT_LOADED);

        assertThatThrownBy(() -> client(1).predict("tomato", JPEG))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                    assertThat(e.getCode()).isEqualTo(DiagnosisErrors.AI_UNAVAILABLE);
                });
        assertThat(requests.get()).isEqualTo(2); // the first try and one retry, not more
    }

    @Test
    void waitsBeforeTheRetryAndRetriesExactlyOnceWithTheDefaults() {
        reply(503, NOT_LOADED); // every answer is "not loaded"
        HttpAiClient withDefaults = client("http://127.0.0.1:" + server.getAddress().getPort(), 1,
                Duration.ofMillis(400));
        long started = System.nanoTime();

        assertThatThrownBy(() -> withDefaults.predict("tomato", JPEG)).isInstanceOf(ApiException.class);

        assertThat(requests.get()).isEqualTo(2); // one try and one retry, never a third
        assertThat(Duration.ofNanos(System.nanoTime() - started)).isGreaterThanOrEqualTo(Duration.ofMillis(400));
    }

    @Test
    void doesNotRetryWhenRetriesAreSwitchedOff() {
        reply(503, NOT_LOADED);

        assertThatThrownBy(() -> client(0).predict("tomato", JPEG)).isInstanceOf(ApiException.class);

        assertThat(requests.get()).isEqualTo(1);
    }

    @Test
    void doesNotRetryAnotherKindOf503() {
        reply(503, "{\"error\": \"overloaded\", \"reason\": null, \"message\": \"x\"}");

        ApiException e = failure(() -> client(1).predict("tomato", JPEG));

        assertThat(e.getCode()).isEqualTo(DiagnosisErrors.AI_UNAVAILABLE);
        assertThat(requests.get()).isEqualTo(1);
    }

    @Test
    void doesNotRetryAServerFault() {
        reply(500, "{\"error\": \"internal_error\", \"reason\": null, \"message\": \"x\"}");

        ApiException e = failure(() -> client(1).predict("tomato", JPEG));

        assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_GATEWAY);
        assertThat(e.getCode()).isEqualTo(DiagnosisErrors.AI_ERROR);
        assertThat(requests.get()).isEqualTo(1);
    }

    @Test
    void doesNotRetryWhenTheServiceIsTooSlow() {
        replies.add(new Reply(200, OK, 2_000));
        long started = System.nanoTime();

        assertThatThrownBy(() -> client(1).predict("tomato", JPEG))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                    assertThat(e.getCode()).isEqualTo(DiagnosisErrors.AI_UNAVAILABLE);
                });

        assertThat(requests.get()).isEqualTo(1); // the model may have run: not asked again
        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofMillis(1500));
    }

    @Test
    void retriesOnceWhenNothingListensAndThenAnswersUnavailable() throws IOException {
        int closedPort;
        try (ServerSocket socket = new ServerSocket(0)) {
            closedPort = socket.getLocalPort();
        }

        assertThatThrownBy(() -> client("http://127.0.0.1:" + closedPort, 1).predict("tomato", JPEG))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                    assertThat(e.getCode()).isEqualTo(DiagnosisErrors.AI_UNAVAILABLE);
                });
    }

    @Test
    void aSuccessfulAnswerThatBreaksTheContractIsAnAiError() {
        reply(200, "{\"status\": \"ok\", \"model_version\": \"effnet-b0-v1\", \"classes_version\": 1}");

        ApiException e = failure(() -> client(1).predict("tomato", JPEG));

        assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_GATEWAY);
        assertThat(e.getCode()).isEqualTo(DiagnosisErrors.AI_ERROR);
    }

    @Test
    void anUnknownStatusIsAnAiError() {
        reply(200, OK.replace("\"status\": \"ok\"", "\"status\": \"maybe\""));

        assertThatThrownBy(() -> client(1).predict("tomato", JPEG))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo(DiagnosisErrors.AI_ERROR));
    }

    @Test
    void aBodyThatIsNotJsonIsAnAiError() {
        reply(200, "<html>bad gateway</html>");

        assertThatThrownBy(() -> client(1).predict("tomato", JPEG))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo(DiagnosisErrors.AI_ERROR));
    }

    @Test
    void anErrorWithoutTheContractsBodyIsAnAiError() {
        reply(404, "{\"detail\": \"Not Found\"}");

        assertThatThrownBy(() -> client(1).predict("tomato", JPEG))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo(DiagnosisErrors.AI_ERROR));
    }

    @Test
    void aPlaceholderModelAnswerIsReadAndStillMarkedAsPlaceholder() {
        reply(200, OK.replace("effnet-b0-v1", "placeholder-v0"));

        assertThat(client(1).predict("tomato", JPEG).isPlaceholder()).isTrue();
    }

    @Test
    void cropsComeFromTheReference() {
        assertThat(client(1).crops()).containsExactly("tomato", "wheat");
    }

    @Test
    void theStartupCheckNeverThrows() throws IOException {
        int closedPort;
        try (ServerSocket socket = new ServerSocket(0)) {
            closedPort = socket.getLocalPort();
        }

        assertThatCode(() -> client("http://127.0.0.1:" + closedPort, 1).checkHealthOnStartup()).doesNotThrowAnyException();
        assertThatCode(() -> client(1).checkHealthOnStartup()).doesNotThrowAnyException();
    }
}
