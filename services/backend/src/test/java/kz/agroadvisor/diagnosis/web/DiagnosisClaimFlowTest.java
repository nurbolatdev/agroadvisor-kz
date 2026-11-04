package kz.agroadvisor.diagnosis.web;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.diagnosis.model.Diagnosis;
import kz.agroadvisor.diagnosis.repository.DiagnosisClaims;
import kz.agroadvisor.diagnosis.repository.DiagnosisRepository;
import kz.agroadvisor.diagnosis.service.AiClient;
import kz.agroadvisor.diagnosis.service.DiagnosisService;
import kz.agroadvisor.diagnosis.service.PhotoStorage;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Concurrent requests with one Idempotency-Key against the real database: one model call per key, a
 * fencing claim that a slow request cannot overwrite, and photo objects that cannot be replaced. The model
 * call is held on a latch to keep two requests in flight at once; the photo storage is an in-memory map.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class DiagnosisClaimFlowTest {

    private static final long WAIT_SECONDS = 30;
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xDB, 0, 2, (byte) 0xFF,
        (byte) 0xD9};
    /** Another valid JPEG, so another SHA-256. */
    private static final byte[] OTHER_JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xDB, 0, 3, 0,
        (byte) 0xFF, (byte) 0xD9};

    @TestConfiguration
    static class FixedClockConfig {

        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(Instant.now(), ZoneOffset.UTC);
        }
    }

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private DiagnosisRepository diagnoses;
    @Autowired
    private DiagnosisClaims claims;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;
    @MockitoBean
    private PhotoStorage photos;
    @MockitoSpyBean
    private AiClient ai;

    private final Map<String, byte[]> objects = new ConcurrentHashMap<>();
    private final ExecutorService pool = Executors.newFixedThreadPool(4);
    private User farmer;
    private String token;
    private String key;

    @BeforeEach
    void setUp() {
        String phone = "+7705" + (1_000_000 + (int) (Math.random() * 8_999_999));
        farmer = users.saveAndFlush(new User(Login.parse(phone), "x", "Farmer", "ru", Set.of(Role.FARMER)));
        token = "Bearer " + jwt.issueAccessToken(farmer.getId());
        key = UUID.randomUUID().toString();
        when(photos.store(any(UUID.class), anyString(), any(byte[].class), anyString())).thenAnswer(call -> {
            String objectKey = "diagnoses/" + call.getArgument(0) + "/" + call.getArgument(1) + ".jpg";
            objects.put(objectKey, call.<byte[]>getArgument(2).clone());
            return objectKey;
        });
        when(photos.load(anyString())).thenAnswer(call -> Optional.ofNullable(objects.get(call.<String>getArgument(0))));
    }

    @AfterEach
    void shutDown() {
        pool.shutdownNow();
    }

    private ResultActions post(byte[] bytes) throws Exception {
        return mvc.perform(multipart("/api/diagnoses")
                .file(new MockMultipartFile("image", "leaf", "image/jpeg", bytes))
                .param("crop", "tomato").header("Authorization", token).header("Idempotency-Key", key));
    }

    private long count(String table) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE user_id = ?", Long.class,
                farmer.getId());
    }

    /** Makes the claim of the key look as if its owner had been silent for the given time. */
    private void ageClaim(Duration age) {
        jdbc.update("UPDATE diagnosis_requests SET started_at = now() - make_interval(secs => ?) "
                + "WHERE user_id = ? AND idempotency_key = ?", age.toSeconds(), farmer.getId(), key);
    }

    /** The first call to the model waits on {@code release}; later calls go straight through. */
    private CountDownLatch holdFirstModelCall(CountDownLatch entered, CountDownLatch release) {
        AtomicInteger calls = new AtomicInteger();
        doAnswer(call -> {
            if (calls.getAndIncrement() == 0) {
                entered.countDown();
                assertThat(release.await(WAIT_SECONDS, TimeUnit.SECONDS)).isTrue();
            }
            return call.callRealMethod();
        }).when(ai).predict(eq("tomato"), any(byte[].class));
        return release;
    }

    private static String idOf(MvcResult result) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(), "$.id");
    }

    @Test
    void twoParallelRequestsWithOneKeyCallTheModelOnce() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = holdFirstModelCall(entered, new CountDownLatch(1));
        Future<MvcResult> first = pool.submit(() -> post(JPEG).andReturn());
        assertThat(entered.await(WAIT_SECONDS, TimeUnit.SECONDS)).isTrue();

        post(JPEG).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("request_in_progress"))
                .andExpect(header().string("Retry-After", "2"));
        release.countDown();

        assertThat(first.get(WAIT_SECONDS, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(201);
        verify(ai, times(1)).predict(eq("tomato"), any(byte[].class));
        assertThat(count("diagnoses")).isEqualTo(1);
        assertThat(count("diagnosis_requests")).isZero();
        // The retry after the 409 is an ordinary replay of the finished diagnosis
        post(JPEG).andExpect(status().isCreated()).andExpect(header().string("Idempotent-Replayed", "true"));
        verify(ai, times(1)).predict(eq("tomato"), any(byte[].class));
    }

    @Test
    void aFailedModelCallFreesTheKeySoTheRetryWorks() throws Exception {
        doThrow(new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "ai_unavailable", "down"))
                .doCallRealMethod().when(ai).predict(eq("tomato"), any(byte[].class));

        post(JPEG).andExpect(status().isServiceUnavailable());
        assertThat(count("diagnosis_requests")).isZero();

        post(JPEG).andExpect(status().isCreated());
        assertThat(count("diagnoses")).isEqualTo(1);
    }

    @Test
    void anExpiredClaimIsTakenOver() throws Exception {
        jdbc.update("INSERT INTO diagnosis_requests (user_id, idempotency_key, request_fingerprint, crop_code, "
                + "claim_id, started_at) VALUES (?, ?, ?, 'tomato', ?, now() - interval '5 minutes')",
                farmer.getId(), key, DiagnosisService.fingerprint(JPEG), UUID.randomUUID());

        post(JPEG).andExpect(status().isCreated());

        assertThat(count("diagnoses")).isEqualTo(1);
        assertThat(count("diagnosis_requests")).isZero();
    }

    @Test
    void aFreshClaimIsNotTakenOver() throws Exception {
        UUID owner = UUID.randomUUID();
        jdbc.update("INSERT INTO diagnosis_requests (user_id, idempotency_key, request_fingerprint, crop_code, "
                + "claim_id) VALUES (?, ?, ?, 'tomato', ?)", farmer.getId(), key, DiagnosisService.fingerprint(JPEG),
                owner);

        post(JPEG).andExpect(status().isConflict()).andExpect(header().string("Retry-After", "2"));

        assertThat(jdbc.queryForObject("SELECT claim_id FROM diagnosis_requests WHERE user_id = ?", UUID.class,
                farmer.getId())).isEqualTo(owner);
    }

    @Test
    void anExpiredClaimForOtherBytesIsNeverInherited() throws Exception {
        UUID owner = UUID.randomUUID();
        jdbc.update("INSERT INTO diagnosis_requests (user_id, idempotency_key, request_fingerprint, crop_code, "
                + "claim_id, started_at) VALUES (?, ?, ?, 'tomato', ?, now() - interval '5 minutes')",
                farmer.getId(), key, DiagnosisService.fingerprint(OTHER_JPEG), owner);

        post(JPEG).andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("idempotency_key_reused"))
                .andExpect(jsonPath("$.reason").value("photo"));

        assertThat(jdbc.queryForObject("SELECT claim_id FROM diagnosis_requests WHERE user_id = ?", UUID.class,
                farmer.getId())).isEqualTo(owner);
        assertThat(objects).isEmpty();
    }

    @Test
    void otherBytesWhileTheFirstRequestIsRunningAreRefusedNotQueued() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = holdFirstModelCall(entered, new CountDownLatch(1));
        Future<MvcResult> first = pool.submit(() -> post(JPEG).andReturn());
        assertThat(entered.await(WAIT_SECONDS, TimeUnit.SECONDS)).isTrue();

        post(OTHER_JPEG).andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.reason").value("photo"));
        release.countDown();

        assertThat(first.get(WAIT_SECONDS, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(201);
        verify(ai, times(1)).predict(eq("tomato"), any(byte[].class));
    }

    /** A is slow, its claim expires, B takes over and finishes; then A finishes. One diagnosis, one photo object. */
    @Test
    void aSlowOwnerAfterATakeoverEndsWithTheSameSingleDiagnosis() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = holdFirstModelCall(entered, new CountDownLatch(1));
        Future<MvcResult> a = pool.submit(() -> post(JPEG).andReturn());
        assertThat(entered.await(WAIT_SECONDS, TimeUnit.SECONDS)).isTrue();
        ageClaim(Duration.ofMinutes(5));

        MvcResult b = post(JPEG).andExpect(status().isCreated()).andReturn();
        release.countDown();
        MvcResult slow = a.get(WAIT_SECONDS, TimeUnit.SECONDS);

        assertThat(slow.getResponse().getStatus()).isEqualTo(201);
        assertThat(slow.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(idOf(slow)).isEqualTo(idOf(b));
        assertThat(count("diagnoses")).isEqualTo(1);
        assertThat(count("diagnosis_requests")).isZero();
        verify(ai, times(2)).predict(eq("tomato"), any(byte[].class));
        assertThat(objects).hasSize(1); // both wrote the same name with the same bytes
    }

    /** The owner's claim must survive the slow request of an older owner: its release deletes nothing. */
    @Test
    void aSlowOwnerCannotReleaseTheClaimOfTheRequestThatTookOver() throws Exception {
        CountDownLatch enteredA = new CountDownLatch(1);
        CountDownLatch releaseA = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        CountDownLatch enteredB = new CountDownLatch(1);
        CountDownLatch releaseB = new CountDownLatch(1);
        doAnswer(call -> {
            int n = calls.getAndIncrement();
            if (n == 0) {
                enteredA.countDown();
                assertThat(releaseA.await(WAIT_SECONDS, TimeUnit.SECONDS)).isTrue();
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "ai_unavailable", "late failure of A");
            }
            enteredB.countDown();
            assertThat(releaseB.await(WAIT_SECONDS, TimeUnit.SECONDS)).isTrue();
            return call.callRealMethod();
        }).when(ai).predict(eq("tomato"), any(byte[].class));

        Future<MvcResult> a = pool.submit(() -> post(JPEG).andReturn());
        assertThat(enteredA.await(WAIT_SECONDS, TimeUnit.SECONDS)).isTrue();
        ageClaim(Duration.ofMinutes(5));
        Future<MvcResult> b = pool.submit(() -> post(JPEG).andReturn());
        assertThat(enteredB.await(WAIT_SECONDS, TimeUnit.SECONDS)).isTrue();

        releaseA.countDown(); // A fails now and releases "its" claim, which is B's by now
        assertThat(a.get(WAIT_SECONDS, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(503);
        assertThat(count("diagnosis_requests")).isEqualTo(1); // B's claim is still there
        post(JPEG).andExpect(status().isConflict()); // and still blocks a third request

        releaseB.countDown();
        assertThat(b.get(WAIT_SECONDS, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(201);
        assertThat(count("diagnosis_requests")).isZero();
    }

    /**
     * The overwrite the object name exists to prevent: a diagnosis exists for (key, photo 1); later the same
     * key arrives with photo 2. The first photo must stay as it was.
     */
    @Test
    void theSameKeyWithOtherBytesAfterTheClaimRowsAreSweptLeavesTheFirstPhotoAlone() throws Exception {
        post(JPEG).andExpect(status().isCreated());
        Map<String, byte[]> before = snapshot();

        claims.deleteOlderThan(Duration.ZERO); // the hourly cleanup of claim rows has run

        post(OTHER_JPEG).andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("idempotency_key_reused"))
                .andExpect(jsonPath("$.reason").value("photo"));

        assertThat(snapshot()).containsOnlyKeys(before.keySet());
        before.forEach((objectKey, bytes) -> assertThat(objects.get(objectKey)).isEqualTo(bytes));
        assertThat(count("diagnoses")).isEqualTo(1);
    }

    /**
     * The same overwrite through a real race: request A with photo 2 is still running when its claim row is
     * swept; request B with photo 1 gets the key and finishes first. A must not write over B's photo, and its
     * insert loses to B's diagnosis. (A's own object stays behind as an orphan under another name.)
     */
    @Test
    void aSweptClaimOfOtherBytesCannotWriteOverTheFinishedDiagnosisPhoto() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = holdFirstModelCall(entered, new CountDownLatch(1));
        Future<MvcResult> a = pool.submit(() -> post(OTHER_JPEG).andReturn());
        assertThat(entered.await(WAIT_SECONDS, TimeUnit.SECONDS)).isTrue();
        ageClaim(Duration.ofHours(2));
        claims.deleteOlderThan(Duration.ofHours(1)); // the cleanup removes A's claim row while A still works

        post(JPEG).andExpect(status().isCreated());
        Diagnosis finished = diagnoses.findByUserIdAndIdempotencyKey(farmer.getId(), key).orElseThrow();
        byte[] firstPhoto = objects.get(finished.getPhotoKey()).clone();
        release.countDown();

        MvcResult late = a.get(WAIT_SECONDS, TimeUnit.SECONDS);
        assertThat(late.getResponse().getStatus()).isEqualTo(422);
        assertThat(JsonPath.<String>read(late.getResponse().getContentAsString(), "$.reason")).isEqualTo("photo");
        assertThat(count("diagnoses")).isEqualTo(1);
        assertThat(objects.get(finished.getPhotoKey())).isEqualTo(firstPhoto).isEqualTo(JPEG);
        assertThat(objects).hasSize(2).containsKey(finished.getPhotoKey());
    }

    private Map<String, byte[]> snapshot() {
        Map<String, byte[]> copy = new HashMap<>();
        objects.forEach((k, v) -> copy.put(k, Arrays.copyOf(v, v.length)));
        return copy;
    }
}
