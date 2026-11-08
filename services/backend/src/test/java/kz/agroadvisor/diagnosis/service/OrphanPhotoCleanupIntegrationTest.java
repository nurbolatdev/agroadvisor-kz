package kz.agroadvisor.diagnosis.service;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.IntStream;
import javax.sql.DataSource;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.images.builder.Transferable;
import org.testcontainers.utility.DockerImageName;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.diagnosis.config.OrphanCleanupProperties;
import kz.agroadvisor.diagnosis.model.ClassScore;
import kz.agroadvisor.diagnosis.model.Diagnosis;
import kz.agroadvisor.diagnosis.repository.DiagnosisRepository;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The cleanup against what it runs on: a real SeaweedFS (same image and command as infra/docker-compose.yml) and
 * a real PostgreSQL with the real migrations, advisory lock included. The objects are made "old" by moving the
 * clock of the job forward, since the storage sets the modification time itself.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class OrphanPhotoCleanupIntegrationTest {

    private static final String BUCKET = "orphan-cleanup-test";
    private static final String ACCESS_KEY = "test-access-key";
    private static final String SECRET_KEY = "test-secret-key";
    private static final String S3_CONFIG = """
            {"identities": [{"name": "backend",
              "credentials": [{"accessKey": "%s", "secretKey": "%s"}],
              "actions": ["Admin", "Read", "Write", "List", "Tagging"]}]}
            """.formatted(ACCESS_KEY, SECRET_KEY);

    @SuppressWarnings("resource") // stopped in tearDownStorage()
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

    @Autowired
    DiagnosisRepository diagnoses;
    @Autowired
    UserRepository users;
    @Autowired
    DataSource dataSource;

    private UUID userId;
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();

    @BeforeAll
    static void startStorage() {
        SEAWEEDFS.start();
        // The same client settings as PhotoStorageConfig (path style, checksums only when required)
        s3 = S3Client.builder()
                .endpointOverride(URI.create(
                        "http://" + SEAWEEDFS.getHost() + ":" + SEAWEEDFS.getMappedPort(8333)))
                .region(Region.of("us-east-1"))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(ACCESS_KEY, SECRET_KEY)))
                .forcePathStyle(true)
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
                .httpClientBuilder(UrlConnectionHttpClient.builder())
                .build();
        storage = new S3PhotoStorage(s3, BUCKET);
        s3.createBucket(CreateBucketRequest.builder().bucket(BUCKET).build());
    }

    @AfterAll
    static void tearDownStorage() {
        if (s3 != null) {
            s3.close();
        }
        SEAWEEDFS.stop();
    }

    @BeforeEach
    void createUser() {
        String phone = "+7706" + (1_000_000 + (int) (Math.random() * 8_999_999));
        userId = users.saveAndFlush(new User(Login.parse(phone), "x", "Farmer", "ru", Set.of(Role.FARMER))).getId();
    }

    @AfterEach
    void cleanUp() {
        diagnoses.deleteAll(diagnoses.findByUserIdOrderByCreatedAtDesc(userId,
                org.springframework.data.domain.PageRequest.of(0, 100)));
        storage.list("").forEach(o -> storage.delete(o.key()));
    }

    private String photo(String name) {
        return storage.store(userId, name, new byte[] {(byte) 0xFF, (byte) 0xD8, 1, 2, 3}, "image/jpeg");
    }

    private void diagnosisPointsTo(String photoKey) {
        diagnoses.saveAndFlush(new Diagnosis(userId, "tomato", photoKey, "ok", "tomato__healthy",
                new BigDecimal("0.9100"), List.of(new ClassScore("tomato__healthy", 0.91)), null, "placeholder-v0",
                1, 12));
    }

    private OrphanPhotoCleanup job(boolean dryRun) {
        OrphanCleanupProperties props = new OrphanCleanupProperties(true, dryRun, Duration.ofHours(24),
                "0 30 3 * * *", 500, 500, 0.5);
        // A day and an hour ahead: everything in the bucket is older than the minimum age
        Clock later = Clock.fixed(Instant.now().plus(Duration.ofHours(25)), ZoneOffset.UTC);
        return new OrphanPhotoCleanup(storage, diagnoses, new PostgresAdvisoryLock(dataSource), meters, props, later);
    }

    private Set<String> keysInBucket() {
        return Set.copyOf(storage.list("").map(StoredObject::key).toList());
    }

    @Test
    void removesOnlyTheObjectNoDiagnosisPointsTo() {
        String live1 = photo(UUID.randomUUID().toString());
        String live2 = photo(UUID.randomUUID().toString());
        String orphan = photo(UUID.randomUUID().toString());
        diagnosisPointsTo(live1);
        diagnosisPointsTo(live2);
        // documents of agrochemists share the bucket and are never looked at
        s3.putObject(PutObjectRequest.builder().bucket(BUCKET).key("agrochemist-documents/x/diploma.pdf").build(),
                RequestBody.fromBytes(new byte[] {1}));

        var summary = job(false).run();

        assertThat(summary.found()).isEqualTo(1);
        assertThat(summary.removed()).isEqualTo(1);
        assertThat(keysInBucket()).containsExactlyInAnyOrder(live1, live2, "agrochemist-documents/x/diploma.pdf")
                .doesNotContain(orphan);
    }

    @Test
    void aDryRunLeavesEverythingInPlace() {
        String live = photo(UUID.randomUUID().toString());
        String orphan = photo(UUID.randomUUID().toString());
        diagnosisPointsTo(live);

        var summary = job(true).run();

        assertThat(summary.found()).isEqualTo(1);
        assertThat(keysInBucket()).containsExactlyInAnyOrder(live, orphan);
    }

    @Test
    void anObjectYoungerThanTheMinimumAgeIsKeptWithTheRealClock() {
        String live = photo(UUID.randomUUID().toString());
        String freshOrphan = photo(UUID.randomUUID().toString());
        diagnosisPointsTo(live);
        OrphanCleanupProperties props = new OrphanCleanupProperties(true, false, Duration.ofHours(24),
                "0 30 3 * * *", 500, 500, 0.5);

        var summary = new OrphanPhotoCleanup(storage, diagnoses, new PostgresAdvisoryLock(dataSource), meters, props)
                .run();

        assertThat(summary.young()).isEqualTo(2);
        assertThat(keysInBucket()).containsExactlyInAnyOrder(live, freshOrphan);
    }

    @Test
    void walksAndDeletesMoreThanOnePageOfObjects() {
        // 1005 orphans: more than one listing page and more than one DeleteObjects call
        IntStream.range(0, 1005).parallel().forEach(i -> photo(UUID.randomUUID().toString()));
        String live = photo(UUID.randomUUID().toString());
        diagnosisPointsTo(live);
        OrphanCleanupProperties props = new OrphanCleanupProperties(true, false, Duration.ofHours(24),
                "0 30 3 * * *", 500, 2000, 1.0);
        Clock later = Clock.fixed(Instant.now().plus(Duration.ofHours(25)), ZoneOffset.UTC);

        var summary = new OrphanPhotoCleanup(storage, diagnoses, new PostgresAdvisoryLock(dataSource), meters, props,
                later).run();

        assertThat(summary.scanned()).isEqualTo(1006);
        assertThat(summary.removed()).isEqualTo(1005);
        assertThat(keysInBucket()).containsExactly(live);
        assertThat(s3.listObjectsV2(ListObjectsV2Request.builder().bucket(BUCKET).build()).keyCount()).isEqualTo(1);
    }

    @Test
    void theAdvisoryLockLetsOneInstanceInAndIsFreeAgainAfterwards() throws Exception {
        PostgresAdvisoryLock first = new PostgresAdvisoryLock(dataSource);
        PostgresAdvisoryLock second = new PostgresAdvisoryLock(dataSource);
        CountDownLatch inside = new CountDownLatch(1);
        CountDownLatch leave = new CountDownLatch(1);
        AtomicBoolean secondRan = new AtomicBoolean();

        CompletableFuture<Boolean> holder = CompletableFuture.supplyAsync(() -> first.runExclusively(() -> {
            inside.countDown();
            try {
                leave.await(30, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }));
        assertThat(inside.await(30, TimeUnit.SECONDS)).isTrue();

        boolean got = second.runExclusively(() -> secondRan.set(true));

        assertThat(got).isFalse();
        assertThat(secondRan).isFalse();
        leave.countDown();
        assertThat(holder.get(30, TimeUnit.SECONDS)).isTrue();
        assertThat(second.runExclusively(() -> secondRan.set(true))).isTrue();
        assertThat(secondRan).isTrue();
    }

    @Test
    void theAdvisoryLockIsReleasedWhenTheJobThrows() {
        PostgresAdvisoryLock lock = new PostgresAdvisoryLock(dataSource);

        try {
            lock.runExclusively(() -> {
                throw new IllegalStateException("boom");
            });
        } catch (IllegalStateException expected) {
            // the job's own failure reaches the caller
        }

        assertThat(lock.runExclusively(() -> { })).isTrue();
    }
}
