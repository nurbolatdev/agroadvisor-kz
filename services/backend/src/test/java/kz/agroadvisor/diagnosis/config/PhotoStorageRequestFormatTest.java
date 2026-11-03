package kz.agroadvisor.diagnosis.config;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import kz.agroadvisor.diagnosis.service.PhotoStorage;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The upload must not carry a trailing checksum. With the SDK default (aws-chunked body plus a CRC32 trailer)
 * SeaweedFS intermittently rejects it with 400 "Content-Md5 ... not valid" (see PhotoStorageConfig).
 */
class PhotoStorageRequestFormatTest {

    @Test
    void uploadsThePhotoWithoutATrailingChecksum() throws Exception {
        AtomicReference<String> trailer = new AtomicReference<>();
        AtomicReference<byte[]> body = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            trailer.set(exchange.getRequestHeaders().getFirst("x-amz-trailer"));
            body.set(exchange.getRequestBody().readAllBytes());
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        server.start();
        try {
            PhotoStorageProperties props = new PhotoStorageProperties(
                    "http://127.0.0.1:" + server.getAddress().getPort(), "diagnosis-photos", "us-east-1",
                    "test-access-key", "test-secret-key", Duration.ofSeconds(2), Duration.ofSeconds(10),
                    Duration.ofSeconds(25));
            PhotoStorageConfig config = new PhotoStorageConfig();
            byte[] photo = {1, 2, 3, 4, 5, 6, 7, 8, 9};
            try (var s3 = config.s3Client(props)) {
                PhotoStorage storage = config.photoStorage(s3, props);
                storage.store(UUID.randomUUID(), photo, "image/jpeg");
            }

            assertThat(trailer.get()).isNull();
            assertThat(new String(body.get(), StandardCharsets.ISO_8859_1)).doesNotContain("x-amz-checksum");
        } finally {
            server.stop(0);
        }
    }
}
