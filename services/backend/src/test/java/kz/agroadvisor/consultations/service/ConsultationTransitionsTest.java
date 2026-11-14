package kz.agroadvisor.consultations.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.BiFunction;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.consultations.model.ConsultationStatus;
import kz.agroadvisor.consultations.repository.ConsultationRepository.Item;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** Reads and status changes. Not transactional, so the row locks are real; users are removed after. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ConsultationTransitionsTest {

    @Autowired
    private ConsultationService service;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> users = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        users.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    @Test
    void acceptMakesItActiveWithADate() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist("approved");
        UUID id = requested(farmer, agrochemist);

        Item item = service.accept(agrochemist, id);

        assertThat(item.consultation().status()).isEqualTo(ConsultationStatus.ACTIVE);
        assertThat(item.consultation().acceptedAt()).isNotNull();
        assertThat(item.consultation().closedAt()).isNull();
    }

    @Test
    void declineClosesItAndRemembersWho() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist("approved");
        UUID id = requested(farmer, agrochemist);

        Item item = service.decline(agrochemist, id);

        assertThat(item.consultation().status()).isEqualTo(ConsultationStatus.DECLINED);
        assertThat(item.consultation().closedAt()).isNotNull();
        assertThat(item.consultation().closedBy()).isEqualTo(agrochemist);
    }

    @Test
    void eitherSideClosesAnActiveConsultation() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist("approved");
        UUID first = requested(farmer, agrochemist);
        service.accept(agrochemist, first);

        Item byFarmer = service.close(farmer, first);
        assertThat(byFarmer.consultation().status()).isEqualTo(ConsultationStatus.CLOSED);
        assertThat(byFarmer.consultation().closedBy()).isEqualTo(farmer);

        UUID second = requested(farmer, agrochemist);
        service.accept(agrochemist, second);
        Item byAgrochemist = service.close(agrochemist, second);
        assertThat(byAgrochemist.consultation().closedBy()).isEqualTo(agrochemist);
    }

    @Test
    void theFarmerWithdrawsARequestButTheAgrochemistCannotCloseIt() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist("approved");
        UUID id = requested(farmer, agrochemist);

        assertInvalidState(() -> service.close(agrochemist, id), "requested");

        Item item = service.close(farmer, id);
        assertThat(item.consultation().status()).isEqualTo(ConsultationStatus.CLOSED);
        assertThat(item.consultation().closedBy()).isEqualTo(farmer);
    }

    @Test
    void wrongTransitionsAreConflictsWithTheCurrentStatusAsReason() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist("approved");

        UUID active = requested(farmer, agrochemist);
        service.accept(agrochemist, active);
        assertInvalidState(() -> service.accept(agrochemist, active), "active");
        assertInvalidState(() -> service.decline(agrochemist, active), "active");

        service.close(farmer, active);
        assertInvalidState(() -> service.accept(agrochemist, active), "closed");
        assertInvalidState(() -> service.decline(agrochemist, active), "closed");
        assertInvalidState(() -> service.close(farmer, active), "closed");
        assertInvalidState(() -> service.close(agrochemist, active), "closed");

        UUID declined = requested(farmer, agrochemist);
        service.decline(agrochemist, declined);
        assertInvalidState(() -> service.accept(agrochemist, declined), "declined");
        assertInvalidState(() -> service.decline(agrochemist, declined), "declined");
        assertInvalidState(() -> service.close(farmer, declined), "declined");
    }

    @Test
    void acceptNeedsTheAgrochemistToBeStillListed() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist("approved");
        UUID id = requested(farmer, agrochemist);
        jdbc.update("UPDATE agrochemist_profiles SET verification_status = 'rejected' WHERE user_id = ?",
                agrochemist);

        assertThatThrownBy(() -> service.accept(agrochemist, id)).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT);
            assertThat(e.getCode()).isEqualTo("agrochemist_not_listed");
        });
        assertThat(service.get(agrochemist, id).consultation().status()).isEqualTo(ConsultationStatus.REQUESTED);
        // Turning the request down is still possible
        assertThat(service.decline(agrochemist, id).consultation().status()).isEqualTo(ConsultationStatus.DECLINED);
    }

    @Test
    void anActiveChatSurvivesTheLossOfApproval() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist("approved");
        UUID id = requested(farmer, agrochemist);
        service.accept(agrochemist, id);
        jdbc.update("UPDATE agrochemist_profiles SET verification_status = 'rejected' WHERE user_id = ?",
                agrochemist);

        assertThat(service.close(agrochemist, id).consultation().status()).isEqualTo(ConsultationStatus.CLOSED);
    }

    @Test
    void aStrangerAndAMissingIdGetTheSameNotFound() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist("approved");
        UUID stranger = agrochemist("approved");
        UUID otherFarmer = farmer();
        UUID id = requested(farmer, agrochemist);

        List<BiFunction<UUID, UUID, Item>> actions = List.of(service::get, service::accept, service::decline,
                service::close);
        for (BiFunction<UUID, UUID, Item> action : actions) {
            for (UUID me : List.of(stranger, otherFarmer)) {
                assertNotFound(() -> action.apply(me, id));
            }
            assertNotFound(() -> action.apply(farmer, UUID.randomUUID()));
        }
        // The farmer is a participant, but accepting and declining belong to the agrochemist
        assertNotFound(() -> service.accept(farmer, id));
        assertNotFound(() -> service.decline(farmer, id));
        assertThat(service.get(agrochemist, id).consultation().status()).isEqualTo(ConsultationStatus.REQUESTED);
    }

    @Test
    void listsShowOnlyMineFilterByStatusAndPage() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist("approved");
        UUID other = agrochemist("approved");
        UUID first = requested(farmer, agrochemist);
        service.accept(agrochemist, first);
        UUID second = requested(farmer, other);
        requested(farmer(), agrochemist);

        assertThat(service.list(farmer, List.of(), 0, 20)).extracting(i -> i.consultation().id())
                .containsExactly(second, first);
        assertThat(service.list(farmer, List.of(ConsultationStatus.ACTIVE), 0, 20))
                .extracting(i -> i.consultation().id()).containsExactly(first);
        assertThat(service.list(farmer, List.of(), 1, 1)).extracting(i -> i.consultation().id())
                .containsExactly(first);
        assertThat(service.list(agrochemist, List.of(ConsultationStatus.REQUESTED), 0, 20)).hasSize(1);
        assertThat(service.list(agrochemist, List.of(), 0, 20)).hasSize(2);
        assertThat(service.list(agrochemist("approved"), List.of(), 0, 20)).isEmpty();
    }

    private void assertInvalidState(Runnable action, String current) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT);
            assertThat(e.getCode()).isEqualTo("invalid_consultation_state");
            assertThat(e.getReason()).isEqualTo(current);
        });
    }

    private void assertNotFound(Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(e.getCode()).isEqualTo("consultation_not_found");
        });
    }

    private UUID requested(UUID farmer, UUID agrochemist) {
        return service.request(farmer, agrochemist, "Help", null).consultation().id();
    }

    private UUID farmer() {
        UUID id = user("farmer");
        jdbc.update("INSERT INTO user_roles (user_id, role_code) VALUES (?, 'farmer')", id);
        return id;
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
}
