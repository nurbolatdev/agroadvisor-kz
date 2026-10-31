package kz.agroadvisor.diagnosis.config;

import java.time.Duration;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.images.builder.Transferable;
import org.testcontainers.utility.DockerImageName;
import software.amazon.awssdk.core.sync.ResponseTransformer;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

import kz.agroadvisor.diagnosis.service.PhotoStorage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The photo storage against a real SeaweedFS (same image and command as infra/docker-compose.yml), so an
 * SDK or server upgrade that breaks uploads (checksums, signing, path style) fails here and not in production.
 */
class PhotoStorageIntegrationTest {

    private static final String BUCKET = "diagnosis-photos";
    private static final String ACCESS_KEY = "test-access-key";
    private static final String SECRET_KEY = "test-secret-key";
    private static final String S3_CONFIG = """
            {"identities": [{"name": "backend",
              "credentials": [{"accessKey": "%s", "secretKey": "%s"}],
              "actions": ["Admin", "Read", "Write", "List", "Tagging"]}]}
            """.formatted(ACCESS_KEY, SECRET_KEY);

    @SuppressWarnings("resource") // stopped in tearDown()
    private static final GenericContainer<?> SEAWEEDFS = new GenericContainer<>(
            DockerImageName.parse("chrislusf/seaweedfs:4.48"))
            .withCommand("server", "-dir=/data", "-ip.bind=0.0.0.0", "-volume.max=0", "-s3", "-s3.port=8333",
                    "-s3.config=/etc/seaweedfs/s3.json")
            .withCopyToContainer(Transferable.of(S3_CONFIG), "/etc/seaweedfs/s3.json")
            .withExposedPorts(8333)
            .waitingFor(Wait.forHttp("/healthz").forPort(8333).forStatusCode(200))
            .withStartupTimeout(Duration.ofMinutes(2));

    private static S3Client s3;
    private static PhotoStorage storage;

    @BeforeAll
    static void startStorage() {
        SEAWEEDFS.start();
        PhotoStorageProperties props = new PhotoStorageProperties(
                "http://" + SEAWEEDFS.getHost() + ":" + SEAWEEDFS.getMappedPort(8333), BUCKET, "us-east-1",
                ACCESS_KEY, SECRET_KEY, Duration.ofSeconds(2), Duration.ofSeconds(10), Duration.ofSeconds(25));
        PhotoStorageConfig config = new PhotoStorageConfig();
        s3 = config.s3Client(props);
        storage = config.photoStorage(s3, props);
        s3.createBucket(CreateBucketRequest.builder().bucket(BUCKET).build());
    }

    @AfterAll
    static void tearDown() {
        if (s3 != null) {
            s3.close();
        }
        SEAWEEDFS.stop();
    }

    @Test
    void storesAPhotoThatCanBeReadBackAndDeletesIt() {
        byte[] photo = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 1, 2, 3, 4, 5};
        UUID userId = UUID.randomUUID();

        String key = storage.store(userId, photo, "image/jpeg");

        assertThat(key).startsWith("diagnoses/" + userId + "/").endsWith(".jpg");
        var stored = s3.getObject(GetObjectRequest.builder().bucket(BUCKET).key(key).build(),
                ResponseTransformer.toBytes());
        GetObjectResponse meta = stored.response();
        assertThat(stored.asByteArray()).isEqualTo(photo);
        assertThat(meta.contentType()).isEqualTo("image/jpeg");

        storage.delete(key);

        assertThatThrownBy(() -> s3.headObject(HeadObjectRequest.builder().bucket(BUCKET).key(key).build()))
                .isInstanceOf(NoSuchKeyException.class);
    }
}
