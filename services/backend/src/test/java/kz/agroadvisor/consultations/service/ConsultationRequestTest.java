package kz.agroadvisor.consultations.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.consultations.model.ConsultationStatus;
import kz.agroadvisor.consultations.repository.ConsultationRepository;
import kz.agroadvisor.consultations.repository.ConsultationRepository.Item;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** Not transactional: the service commits, and the parallel test needs real commits. Users are removed after. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ConsultationRequestTest {

    @Autowired
    private ConsultationService service;
    @Autowired
    private ConsultationRepository repository;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> users = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        // Consultations, messages and diagnoses of these users go with them (ON DELETE CASCADE)
        users.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    @Test
    void requestCreatesARequestedConsultationWithOneMessage() {
        UUID farmer = farmer();
        UUID agrochemist = listedAgrochemist();

        Item item = service.request(farmer, agrochemist, "  My potatoes have spots  ", null);

        assertThat(item.consultation().status()).isEqualTo(ConsultationStatus.REQUESTED);
        assertThat(item.consultation().farmerId()).isEqualTo(farmer);
        assertThat(item.consultation().agrochemistId()).isEqualTo(agrochemist);
        assertThat(item.consultation().diagnosisId()).isNull();
        assertThat(item.lastMessage().text()).isEqualTo("My potatoes have spots");
        assertThat(item.lastMessage().senderId()).isEqualTo(farmer);
        assertThat(item.unreadCount()).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM consultation_messages WHERE consultation_id = ?",
                Integer.class, item.consultation().id())).isEqualTo(1);
    }

    @Test
    void agrochemistSeesTheRequestAsUnread() {
        UUID farmer = farmer();
        UUID agrochemist = listedAgrochemist();

        Item item = service.request(farmer, agrochemist, "Help", null);

        assertThat(repository.findForParticipant(item.consultation().id(), agrochemist).orElseThrow()
                .unreadCount()).isEqualTo(1);
    }

    @Test
    void requestWithOwnDiagnosisKeepsIt() {
        UUID farmer = farmer();
        UUID agrochemist = listedAgrochemist();
        UUID diagnosis = diagnosis(farmer);

        Item item = service.request(farmer, agrochemist, "See the photo", diagnosis);

        assertThat(item.consultation().diagnosisId()).isEqualTo(diagnosis);
    }

    @Test
    void someoneElsesDiagnosisIsNotFound() {
        UUID farmer = farmer();
        UUID agrochemist = listedAgrochemist();
        UUID foreign = diagnosis(farmer());

        assertThatThrownBy(() -> service.request(farmer, agrochemist, "Help", foreign))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                    assertThat(e.getCode()).isEqualTo("diagnosis_not_found");
                });
        assertThat(jdbc.queryForObject("SELECT count(*) FROM consultations WHERE farmer_id = ?",
                Integer.class, farmer)).isZero();
    }

    @Test
    void anAgrochemistWhoIsNotListedIsNotFound() {
        UUID farmer = farmer();
        UUID pending = agrochemist("pending");

        assertThatThrownBy(() -> service.request(farmer, pending, "Help", null))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                    assertThat(e.getCode()).isEqualTo("agrochemist_not_found");
                });
        assertThatThrownBy(() -> service.request(farmer, UUID.randomUUID(), "Help", null))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void textMustHaveOneToTwoThousandCharacters() {
        UUID farmer = farmer();
        UUID agrochemist = listedAgrochemist();

        for (String bad : new String[] {null, "", "   ", "x".repeat(2001)}) {
            assertThatThrownBy(() -> service.request(farmer, agrochemist, bad, null))
                    .isInstanceOfSatisfying(ApiException.class, e -> {
                        assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                        assertThat(e.getCode()).isEqualTo("validation_failed");
                    });
        }
        assertThat(service.request(farmer, agrochemist, "x".repeat(2000), null)).isNotNull();
    }

    @Test
    void textWithControlCharactersIsRejectedButLineBreaksAndTabsAreKept() {
        UUID farmer = farmer();
        UUID agrochemist = listedAgrochemist();

        for (String bad : new String[] {"a\u0000b", "bell\u0007", "esc\u001b[0m", "del\u007f"}) {
            assertThatThrownBy(() -> service.request(farmer, agrochemist, bad, null))
                    .isInstanceOfSatisfying(ApiException.class, e -> {
                        assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                        assertThat(e.getCode()).isEqualTo("validation_failed");
                    });
        }
        assertThat(service.request(farmer, agrochemist, "line one\n\tline two", null).lastMessage().text())
                .isEqualTo("line one\n\tline two");
    }

    @Test
    void secondOpenRequestToTheSameAgrochemistIsRefusedWithALocation() {
        UUID farmer = farmer();
        UUID agrochemist = listedAgrochemist();
        Item first = service.request(farmer, agrochemist, "First", null);

        assertThatThrownBy(() -> service.request(farmer, agrochemist, "Second", null))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(e.getCode()).isEqualTo("consultation_already_open");
                    assertThat(e.getHeaders()).containsEntry(HttpHeaders.LOCATION,
                            "/api/consultations/" + first.consultation().id());
                });
    }

    @Test
    void aClosedConsultationDoesNotBlockANewRequest() {
        UUID farmer = farmer();
        UUID agrochemist = listedAgrochemist();
        Item first = service.request(farmer, agrochemist, "First", null);
        jdbc.update("UPDATE consultations SET status = 'declined', closed_at = now() WHERE id = ?",
                first.consultation().id());

        Item second = service.request(farmer, agrochemist, "Again", null);

        assertThat(second.consultation().id()).isNotEqualTo(first.consultation().id());
    }

    @Test
    void theSixthWaitingRequestIsRefused() {
        UUID farmer = farmer();
        for (int i = 0; i < ConsultationService.MAX_PENDING_REQUESTS; i++) {
            service.request(farmer, listedAgrochemist(), "Help " + i, null);
        }
        UUID another = listedAgrochemist();

        assertThatThrownBy(() -> service.request(farmer, another, "One more", null))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(e.getCode()).isEqualTo("consultation_request_limit");
                });
    }

    @Test
    void requestsAnsweredByTheAgrochemistDoNotCountAsWaiting() {
        UUID farmer = farmer();
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < ConsultationService.MAX_PENDING_REQUESTS; i++) {
            ids.add(service.request(farmer, listedAgrochemist(), "Help " + i, null).consultation().id());
        }
        jdbc.update("UPDATE consultations SET status = 'active', accepted_at = now() WHERE id = ?", ids.get(0));

        assertThat(service.request(farmer, listedAgrochemist(), "One more", null)).isNotNull();
    }

    @Test
    void theEleventhRequestInAnHourIsRateLimited() {
        UUID farmer = farmer();
        UUID agrochemist = listedAgrochemist();
        service.request(farmer, agrochemist, "First", null);
        // The next nine are refused as duplicates, but every attempt counts against the limit
        for (int i = 0; i < 9; i++) {
            assertThatThrownBy(() -> service.request(farmer, agrochemist, "Again", null))
                    .isInstanceOfSatisfying(ApiException.class,
                            e -> assertThat(e.getCode()).isEqualTo("consultation_already_open"));
        }

        assertThatThrownBy(() -> service.request(farmer, agrochemist, "Too many", null))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                    assertThat(e.getCode()).isEqualTo("rate_limited");
                });
    }

    @Test
    void twoParallelRequestsToTheSameAgrochemistMakeOneConsultation() throws Exception {
        UUID farmer = farmer();
        UUID agrochemist = listedAgrochemist();
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Callable<Object> attempt = () -> {
                start.await();
                try {
                    return service.request(farmer, agrochemist, "Parallel", null);
                } catch (ApiException e) {
                    return e;
                }
            };
            Future<Object> a = pool.submit(attempt);
            Future<Object> b = pool.submit(attempt);
            start.countDown();
            List<Object> results = List.of(a.get(), b.get());

            assertThat(results).filteredOn(r -> r instanceof Item).hasSize(1);
            assertThat(results).filteredOn(r -> r instanceof ApiException)
                    .extracting(r -> ((ApiException) r).getCode()).containsExactly("consultation_already_open");
        } finally {
            pool.shutdownNow();
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM consultations WHERE farmer_id = ?",
                Integer.class, farmer)).isEqualTo(1);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM consultation_messages m JOIN consultations c ON c.id = m.consultation_id
                WHERE c.farmer_id = ?""", Integer.class, farmer)).isEqualTo(1);
    }

    private UUID farmer() {
        UUID id = user("farmer");
        jdbc.update("INSERT INTO user_roles (user_id, role_code) VALUES (?, 'farmer')", id);
        return id;
    }

    private UUID listedAgrochemist() {
        return agrochemist("approved");
    }

    private UUID agrochemist(String verification) {
        UUID id = user("agrochemist");
        jdbc.update("INSERT INTO user_roles (user_id, role_code) VALUES (?, 'agrochemist')", id);
        jdbc.update("""
                INSERT INTO agrochemist_profiles (user_id, specialization, experience_years, verification_status)
                VALUES (?, 'plant_protection', 5, ?)""", id, verification);
        return id;
    }

    private UUID user(String name) {
        UUID id = jdbc.queryForObject(
                "INSERT INTO users (phone, password_hash, full_name) VALUES (?, 'x', ?) RETURNING id",
                UUID.class, "+7" + (7_000_000_000L + Math.floorMod(UUID.randomUUID().getLeastSignificantBits(),
                        1_000_000_000L)), "Test " + name);
        users.add(id);
        return id;
    }

    private UUID diagnosis(UUID owner) {
        return jdbc.queryForObject("""
                INSERT INTO diagnoses (user_id, crop_code, photo_key, status, top1_code, top1_confidence,
                                       model_version, classes_version)
                VALUES (?, 'potato', 'diagnoses/test.jpg', 'ok', 'potato__late_blight', 0.9, 'effnet-b0-v1', 1)
                RETURNING id""", UUID.class, owner);
    }
}
