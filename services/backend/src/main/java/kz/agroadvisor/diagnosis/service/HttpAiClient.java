package kz.agroadvisor.diagnosis.service;

import java.net.ConnectException;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.time.Duration;
import java.util.List;
import java.util.Set;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import kz.agroadvisor.catalog.service.CatalogService;
import kz.agroadvisor.catalog.service.CatalogService.CropView;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.diagnosis.config.AiProperties;
import kz.agroadvisor.diagnosis.model.ClassScore;

/**
 * Calls {@code POST /predict} of the AI service (contract: {@code docs/api/ai-predict.md}).
 *
 * <p>Failures are mapped to what the farmer can act on, never to a bare 500:
 * <ul>
 * <li>{@code 422 low_quality} is passed on as {@code 422 low_quality} with the {@code reason}
 * ({@code blurry}, {@code dark}, {@code too_small});
 * <li>{@code 400 invalid_image} is passed on as {@code 400 invalid_image};
 * <li>the service down, not ready ({@code 503 model_not_loaded}) or too slow is {@code 503 ai_unavailable};
 * <li>a {@code 500}, a rejected crop or an answer that breaks the contract is {@code 502 ai_error};
 * <li>an answer of the placeholder model is refused as {@code 503 ai_unavailable} unless
 * {@code app.ai.allow-placeholder} is set (local and test profiles).
 * </ul>
 * One extra try is made only when the service could not be reached or is not ready yet
 * ({@link AiProperties#retries()}); a timeout while waiting for the answer and a {@code 500} are not
 * retried, because the model may already have run.
 */
@Component
@ConditionalOnProperty(name = "app.ai.client", havingValue = "http", matchIfMissing = true)
@EnableConfigurationProperties(AiProperties.class)
class HttpAiClient implements AiClient {

    private static final Logger log = LoggerFactory.getLogger(HttpAiClient.class);
    private static final Set<String> STATUSES = Set.of("ok", "low_confidence", "unknown", "crop_mismatch");

    private final RestClient http;
    private final CatalogService catalog;
    private final int retries;
    private final Duration retryDelay;
    private final boolean allowPlaceholder;

    HttpAiClient(AiProperties props, CatalogService catalog) {
        HttpClient jdk = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(props.connectTimeout())
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(jdk);
        factory.setReadTimeout(props.readTimeout());
        this.http = RestClient.builder().baseUrl(props.url()).requestFactory(factory).build();
        this.catalog = catalog;
        this.retries = props.retries();
        this.retryDelay = props.retryDelay();
        this.allowPlaceholder = props.allowPlaceholder();
    }

    @Override
    public Prediction predict(String crop, byte[] image) {
        for (int attempt = 0;; attempt++) {
            try {
                return once(crop, image);
            } catch (NotReady e) {
                if (attempt >= retries) {
                    log.error("AI service unavailable after {} tries: {}", attempt + 1, e.getMessage());
                    throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, DiagnosisErrors.AI_UNAVAILABLE,
                            "The recognition service is not available, try again later");
                }
                log.warn("AI service not ready ({}), trying again in {} ms", e.getMessage(), retryDelay.toMillis());
                pause();
            }
        }
    }

    private void pause() {
        try {
            Thread.sleep(retryDelay);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unavailable();
        }
    }

    @Override
    public List<String> crops() {
        // The reference mirrors the AI class registry; codes do not depend on the language
        return catalog.crops("en").stream().map(CropView::code).toList();
    }

    @Override
    public ModelInfo modelInfo() {
        WireHealth health;
        try {
            health = http.get().uri("/health").exchange((request, response) ->
                    response.getStatusCode().value() == 200 ? response.bodyTo(WireHealth.class) : null);
        } catch (RuntimeException e) {
            log.warn("AI service did not answer /health: {}", e.toString());
            throw unavailable();
        }
        // Not ready (/health is not 200), or an answer without the model: nothing to show
        if (health == null || health.modelVersion() == null || health.classesVersion() == null) {
            throw unavailable();
        }
        // A placeholder model is the same as no model for an app that must not show an invented version
        if (Prediction.isPlaceholderVersion(health.modelVersion()) && !allowPlaceholder) {
            throw unavailable();
        }
        return new ModelInfo(health.modelVersion(), health.classesVersion(), Boolean.TRUE.equals(health.calibrated()));
    }

    private Prediction once(String crop, byte[] image) {
        Raw raw;
        try {
            raw = http.post().uri("/predict")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(multipart(crop, image))
                    .exchange((request, response) -> {
                        int code = response.getStatusCode().value();
                        return code == 200 ? new Raw(code, response.bodyTo(WirePrediction.class), null)
                                : new Raw(code, null, readError(response));
                    });
        } catch (ResourceAccessException e) {
            if (isConnectionFailure(e)) {
                throw new NotReady("cannot connect: " + e.getMessage());
            }
            log.error("AI service did not answer: {}", e.getMessage());
            throw unavailable();
        } catch (RuntimeException e) {
            log.error("Unreadable answer of the AI service: {}", e.toString());
            throw aiError();
        }
        return map(raw, crop);
    }

    private Prediction map(Raw raw, String crop) {
        int code = raw.status();
        WireError error = raw.error();
        String errorCode = error == null ? null : error.error();
        if (code == 200) {
            return toPrediction(raw.body(), crop);
        }
        if (code == 503 && "model_not_loaded".equals(errorCode)) {
            throw new NotReady("model_not_loaded");
        }
        if (code == 503) {
            log.error("AI service answered 503 {}", errorCode);
            throw unavailable();
        }
        if (code == 422 && "low_quality".equals(errorCode)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, DiagnosisErrors.LOW_QUALITY,
                    lowQualityText(error.reason()), error.reason());
        }
        if (code == 400 && "invalid_image".equals(errorCode)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, DiagnosisErrors.INVALID_IMAGE,
                    "The photo cannot be read, send another JPEG or PNG");
        }
        // 500, a crop the service does not know (the reference and the registry disagree), anything else
        log.error("AI service answered {} {} {}", code, errorCode, error == null ? null : error.reason());
        throw aiError();
    }

    /** English text for logs and developers; the app shows its own localized message for code and reason. */
    private static String lowQualityText(String reason) {
        return switch (reason == null ? "" : reason) {
            case "blurry" -> "The photo is blurry, retake it in focus";
            case "dark" -> "The photo is too dark, retake it in better light";
            case "too_small" -> "The photo is too small, retake it closer to the leaf";
            default -> "The photo is not good enough, retake it";
        };
    }

    private Prediction toPrediction(WirePrediction body, String crop) {
        if (body == null || body.status() == null || !STATUSES.contains(body.status())
                || body.top1() == null || body.top1().code() == null
                || body.top3() == null || body.top3().isEmpty()
                || !body.top3().stream().allMatch(score -> score != null && score.code() != null)
                || body.modelVersion() == null || body.classesVersion() == null) {
            log.error("The AI service answer breaks the contract: {}", body);
            throw aiError();
        }
        if (Prediction.isPlaceholderVersion(body.modelVersion()) && !allowPlaceholder) {
            // A fake model answers plausibly for any photo: never record it as a diagnosis
            log.error("The AI service runs the placeholder model {}; its answer is refused "
                    + "(app.ai.allow-placeholder is false)", body.modelVersion());
            throw unavailable();
        }
        return new Prediction(body.status(), crop, body.top1(), body.top3(), body.detectedCrop(),
                body.modelVersion(), body.classesVersion(), body.inferenceMs());
    }

    private static MultiValueMap<String, Object> multipart(String crop, byte[] image) {
        boolean png = image.length > 3 && image[0] == (byte) 0x89 && image[1] == 'P';
        HttpHeaders part = new HttpHeaders();
        part.setContentType(png ? MediaType.IMAGE_PNG : MediaType.IMAGE_JPEG);
        MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add("crop", crop);
        parts.add("image", new HttpEntity<>(new NamedBytes(image, png ? "photo.png" : "photo.jpg"), part));
        return parts;
    }

    private static WireError readError(RestClient.RequestHeadersSpec.ConvertibleClientHttpResponse response) {
        try {
            return response.bodyTo(WireError.class);
        } catch (RuntimeException e) {
            return null; // not the contract's error body (a proxy page, a FastAPI default body)
        }
    }

    /** Refused, unreachable or timed out while connecting: the request never reached the service. */
    private static boolean isConnectionFailure(Throwable error) {
        for (Throwable t = error; t != null; t = t.getCause()) {
            if (t instanceof ConnectException || t instanceof HttpConnectTimeoutException
                    || t instanceof UnknownHostException) {
                return true;
            }
        }
        return false;
    }

    private static ApiException unavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, DiagnosisErrors.AI_UNAVAILABLE,
                "The recognition service is not available, try again later");
    }

    private static ApiException aiError() {
        return new ApiException(HttpStatus.BAD_GATEWAY, DiagnosisErrors.AI_ERROR,
                "The recognition service failed, try again later");
    }

    /** Warns at startup when the service is not the calibrated real model; never stops the backend. */
    @EventListener(ApplicationReadyEvent.class)
    void checkHealthOnStartup() {
        try {
            WireHealth health = http.get().uri("/health").exchange((request, response) ->
                    response.getStatusCode().value() == 200 ? response.bodyTo(WireHealth.class) : null);
            if (health == null) {
                log.warn("AI service is up but not ready (/health is not 200)");
            } else if (health.modelVersion() == null || Prediction.isPlaceholderVersion(health.modelVersion())) {
                log.warn("AI service runs the placeholder model ({}): its answers are {}", health.modelVersion(),
                        allowPlaceholder ? "saved and marked as not real" : "refused with 503 ai_unavailable");
            } else if (!Boolean.TRUE.equals(health.calibrated())) {
                log.warn("AI service model {} is not calibrated: it will not answer ok", health.modelVersion());
            } else {
                log.info("AI service ready: model {}", health.modelVersion());
            }
        } catch (RuntimeException e) {
            log.warn("AI service is not reachable at startup: {}", e.getMessage());
        }
    }

    /** The service was not reachable or not ready: the only case that is tried again. */
    private static final class NotReady extends RuntimeException {
        NotReady(String message) {
            super(message, null, false, false);
        }
    }

    private static final class NamedBytes extends ByteArrayResource {
        private final String filename;

        NamedBytes(byte[] bytes, String filename) {
            super(bytes);
            this.filename = filename;
        }

        @Override
        public String getFilename() {
            return filename;
        }
    }

    private record Raw(int status, WirePrediction body, WireError error) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record WirePrediction(String status, ClassScore top1, List<ClassScore> top3,
            @JsonProperty("detected_crop") String detectedCrop,
            @JsonProperty("model_version") String modelVersion,
            @JsonProperty("classes_version") Integer classesVersion,
            @JsonProperty("inference_ms") Integer inferenceMs) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record WireError(String error, String reason, String message) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record WireHealth(String status, @JsonProperty("model_version") String modelVersion,
            @JsonProperty("classes_version") Integer classesVersion, Boolean calibrated) {
    }
}
