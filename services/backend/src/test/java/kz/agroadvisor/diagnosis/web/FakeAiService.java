package kz.agroadvisor.diagnosis.web;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

import com.sun.net.httpserver.HttpServer;

/** A canned AI service that speaks the contract of docs/api/ai-predict.md; for the Spring tests. */
final class FakeAiService {

    static final String TOMATO_SEPTORIA = """
            {"status": "ok", "crop": "tomato",
             "top1": {"code": "tomato__septoria_leaf_spot", "confidence": 0.8599},
             "top3": [{"code": "tomato__septoria_leaf_spot", "confidence": 0.8599},
                      {"code": "tomato__early_blight", "confidence": 0.0445},
                      {"code": "tomato__leaf_mold", "confidence": 0.0419}],
             "detected_crop": null, "model_version": "effnet-b0-v1", "classes_version": 1, "inference_ms": 47}""";

    private final HttpServer server;
    private volatile int status = 200;
    private volatile String body = TOMATO_SEPTORIA;
    private final AtomicInteger predictCalls = new AtomicInteger();

    FakeAiService() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        server.createContext("/predict", exchange -> {
            exchange.getRequestBody().readAllBytes();
            predictCalls.incrementAndGet();
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.createContext("/health", exchange -> {
            exchange.sendResponseHeaders(503, -1);
            exchange.close();
        });
        server.start();
    }

    String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    void answers(int status, String body) {
        this.status = status;
        this.body = body;
        predictCalls.set(0);
    }

    int predictCalls() {
        return predictCalls.get();
    }

    void stop() {
        server.stop(0);
    }
}
