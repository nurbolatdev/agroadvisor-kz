package kz.agroadvisor.diagnosis.config;

import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.diagnosis.service.PhotoStorage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * A storage that accepts the connection and never answers used to block a request thread for two minutes
 * (SDK defaults: 30 s read timeout, 4 attempts). The configured timeouts must cut that short.
 */
class PhotoStorageTimeoutTest {

    @Test
    void aStorageThatNeverAnswersFailsFastWithServiceUnavailable() throws Exception {
        List<Socket> accepted = new ArrayList<>();
        try (ServerSocket silent = new ServerSocket(0, 50, InetAddress.getLoopbackAddress())) {
            Thread acceptor = Thread.ofVirtual().start(() -> {
                try {
                    while (true) {
                        accepted.add(silent.accept());
                    }
                } catch (Exception closed) {
                    // the test is over
                }
            });
            PhotoStorageProperties props = new PhotoStorageProperties("http://127.0.0.1:" + silent.getLocalPort(),
                    "diagnosis-photos", "us-east-1", "key", "secret", Duration.ofMillis(300),
                    Duration.ofMillis(500), Duration.ofSeconds(2));
            PhotoStorageConfig config = new PhotoStorageConfig();
            PhotoStorage storage = config.photoStorage(config.s3Client(props), props);

            long started = System.nanoTime();
            assertThatThrownBy(() -> storage.store(UUID.randomUUID(), new byte[] {1, 2, 3}, "image/jpeg"))
                    .isInstanceOfSatisfying(ApiException.class, e -> {
                        assertThat(e.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                        assertThat(e.getCode()).isEqualTo("storage_unavailable");
                    });
            Duration took = Duration.ofNanos(System.nanoTime() - started);

            assertThat(took).isLessThan(Duration.ofSeconds(6));
            acceptor.interrupt();
        } finally {
            for (Socket socket : accepted) {
                socket.close();
            }
        }
    }
}
