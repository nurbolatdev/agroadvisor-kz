package kz.agroadvisor.consultations.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.consultations.repository.ConsultationMessageRepository.Message;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** Not transactional, so the row locks are real; users (and with them chats) are removed after. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ConsultationMessageServiceTest {

    @Autowired
    private ConsultationMessageService service;
    @Autowired
    private ConsultationService consultationService;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> users = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        users.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    @Test
    void participantsSendAndTheLastActivityMoves() {
        Chat chat = activeChat();
        Instant before = lastMessageAt(chat.id);

        Message sent = service.send(chat.agrochemist, chat.id, "  Spray in the evening  ");

        assertThat(sent.text()).isEqualTo("Spray in the evening");
        assertThat(sent.senderId()).isEqualTo(chat.agrochemist);
        assertThat(sent.readAt()).isNull();
        assertThat(lastMessageAt(chat.id)).isAfter(before).isEqualTo(sent.createdAt());
        assertThat(service.send(chat.farmer, chat.id, "Thanks").senderId()).isEqualTo(chat.farmer);
    }

    @Test
    void aStrangerCannotReadOrSend() {
        Chat chat = activeChat();
        UUID stranger = farmer();
        UUID otherAgrochemist = agrochemist();
        UUID message = service.send(chat.farmer, chat.id, "Hi").id();

        for (UUID me : List.of(stranger, otherAgrochemist)) {
            assertNotFound(() -> service.send(me, chat.id, "Hello"));
            assertNotFound(() -> service.history(me, chat.id, null, null, 30));
            assertNotFound(() -> service.markRead(me, chat.id, message));
        }
        assertNotFound(() -> service.send(chat.farmer, UUID.randomUUID(), "Hello"));
        assertNotFound(() -> service.history(chat.farmer, UUID.randomUUID(), null, null, 30));
    }

    @Test
    void messagesAreAcceptedOnlyInAnActiveConsultation() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist();
        UUID requested = consultationService.request(farmer, agrochemist, "Help", null).consultation().id();
        assertInvalidState(() -> service.send(farmer, requested, "More"), "requested");
        assertInvalidState(() -> service.send(agrochemist, requested, "More"), "requested");

        consultationService.decline(agrochemist, requested);
        assertInvalidState(() -> service.send(agrochemist, requested, "More"), "declined");

        UUID active = consultationService.request(farmer, agrochemist, "Help again", null).consultation().id();
        consultationService.accept(agrochemist, active);
        service.send(farmer, active, "Works");
        consultationService.close(farmer, active);
        assertInvalidState(() -> service.send(farmer, active, "More"), "closed");
        assertInvalidState(() -> service.send(agrochemist, active, "More"), "closed");
        // The history of a closed chat stays readable
        assertThat(service.history(farmer, active, null, null, 30)).hasSize(2);
    }

    @Test
    void theTextIsTrimmedAndMustHaveBetweenOneAndTwoThousandCharacters() {
        Chat chat = activeChat();

        for (String bad : new String[] { null, "", "   ", "\t\n", " 　 ", "x".repeat(2001),
                " " + "x".repeat(2001) }) {
            assertThatThrownBy(() -> service.send(chat.farmer, chat.id, bad)).isInstanceOfSatisfying(
                    ApiException.class, e -> {
                        assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                        assertThat(e.getCode()).isEqualTo("validation_failed");
                    });
        }
        assertThat(service.send(chat.farmer, chat.id, " " + "x".repeat(2000) + "　").text())
                .hasSize(2000);
    }

    @Test
    void historyPagesBackwardAndForwardWithoutGapsEvenWithEqualTimes() {
        Chat chat = activeChat();
        // The request message is the first of the chat; five more share one instant
        Instant same = Instant.parse("2030-01-01T10:00:00Z");
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            ids.add(jdbc.queryForObject("""
                    INSERT INTO consultation_messages (consultation_id, sender_id, body, created_at)
                    VALUES (?, ?, ?, ?) RETURNING id""", UUID.class, chat.id, chat.farmer, "m" + i,
                    java.sql.Timestamp.from(same)));
        }

        List<UUID> backward = new ArrayList<>();
        UUID cursor = null;
        while (true) {
            List<Message> page = service.history(chat.agrochemist, chat.id, cursor, null, 2);
            if (page.isEmpty()) {
                break;
            }
            page.forEach(m -> backward.add(m.id()));
            cursor = page.get(page.size() - 1).id();
        }
        assertThat(backward).hasSize(6).doesNotHaveDuplicates().containsAll(ids);
        assertThat(service.history(chat.agrochemist, chat.id, null, null, 3)).extracting(Message::id)
                .containsExactlyElementsOf(backward.subList(0, 3));

        List<UUID> forward = new ArrayList<>();
        UUID oldest = backward.get(backward.size() - 1);
        forward.add(oldest);
        cursor = oldest;
        while (true) {
            List<Message> page = service.history(chat.agrochemist, chat.id, null, cursor, 2);
            if (page.isEmpty()) {
                break;
            }
            page.forEach(m -> forward.add(m.id()));
            cursor = page.get(page.size() - 1).id();
        }
        assertThat(forward).containsExactlyElementsOf(backward.reversed());
    }

    @Test
    void historyHasDefaultsBoundsAndRejectsBothCursors() {
        Chat chat = activeChat();
        UUID first = service.history(chat.farmer, chat.id, null, null, 30).get(0).id();

        for (int bad : new int[] { 0, -1, 101 }) {
            assertThatThrownBy(() -> service.history(chat.farmer, chat.id, null, null, bad))
                    .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode())
                            .isEqualTo("validation_failed"));
        }
        assertThat(service.history(chat.farmer, chat.id, null, null, 1)).hasSize(1);
        assertThat(service.history(chat.farmer, chat.id, null, null, 100)).hasSize(1);
        assertThatThrownBy(() -> service.history(chat.farmer, chat.id, first, first, 30))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode())
                        .isEqualTo("validation_failed"));
        assertThat(service.history(chat.farmer, chat.id, first, null, 30)).isEmpty();
        assertThat(service.history(chat.farmer, chat.id, null, first, 30)).isEmpty();
    }

    @Test
    void aCursorOfAnotherConsultationOrAMissingOneIsNotFound() {
        Chat chat = activeChat();
        Chat other = activeChat();
        UUID foreign = service.history(other.farmer, other.id, null, null, 30).get(0).id();

        for (UUID cursor : List.of(foreign, UUID.randomUUID())) {
            assertMessageNotFound(() -> service.history(chat.farmer, chat.id, cursor, null, 30));
            assertMessageNotFound(() -> service.history(chat.farmer, chat.id, null, cursor, 30));
            assertMessageNotFound(() -> service.markRead(chat.farmer, chat.id, cursor));
        }
    }

    @Test
    void markReadMarksOnlyIncomingMessagesUpToTheCursorAndIsIdempotent() {
        Chat chat = activeChat();
        UUID incoming1 = service.send(chat.agrochemist, chat.id, "one").id();
        UUID incoming2 = service.send(chat.agrochemist, chat.id, "two").id();
        UUID mine = service.send(chat.farmer, chat.id, "mine").id();
        UUID incoming3 = service.send(chat.agrochemist, chat.id, "three").id();
        assertThat(service.unreadTotal(chat.farmer)).isEqualTo(3);

        assertThat(service.markRead(chat.farmer, chat.id, incoming2)).isEqualTo(1);
        Instant firstReadAt = readAt(incoming1);
        assertThat(firstReadAt).isNotNull();
        assertThat(readAt(incoming2)).isNotNull();
        assertThat(readAt(incoming3)).isNull();
        assertThat(readAt(mine)).isNull();

        assertThat(service.markRead(chat.farmer, chat.id, incoming2)).isEqualTo(1);
        assertThat(readAt(incoming1)).isEqualTo(firstReadAt);
        // Marking up to one's own message reads the incoming ones before it, never the own
        assertThat(service.markRead(chat.farmer, chat.id, incoming3)).isZero();
        assertThat(readAt(mine)).isNull();
        // The agrochemist's unread: the request text of the farmer and "mine"
        assertThat(service.unreadTotal(chat.agrochemist)).isEqualTo(2);
    }

    @Test
    void unreadTotalAddsUpAllConsultationsOfTheUser() {
        UUID farmer = farmer();
        UUID first = agrochemist();
        UUID second = agrochemist();
        UUID one = consultationService.request(farmer, first, "Q1", null).consultation().id();
        consultationService.accept(first, one);
        UUID two = consultationService.request(farmer, second, "Q2", null).consultation().id();
        consultationService.accept(second, two);
        service.send(first, one, "A1");
        service.send(first, one, "A1b");
        service.send(second, two, "A2");

        assertThat(service.unreadTotal(farmer)).isEqualTo(3);
        assertThat(service.unreadTotal(first)).isEqualTo(1);
        assertThat(service.unreadTotal(farmer())).isZero();

        UUID last = service.history(farmer, one, null, null, 1).get(0).id();
        service.markRead(farmer, one, last);
        assertThat(service.unreadTotal(farmer)).isEqualTo(1);
    }

    @Test
    void theThirtyFirstMessageInAMinuteIsRateLimited() {
        Chat chat = activeChat();
        for (int i = 0; i < 30; i++) {
            service.send(chat.farmer, chat.id, "m" + i);
        }

        assertThatThrownBy(() -> service.send(chat.farmer, chat.id, "one more")).isInstanceOfSatisfying(
                ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                    assertThat(e.getCode()).isEqualTo("rate_limited");
                });
        // The other side has its own limit
        assertThat(service.send(chat.agrochemist, chat.id, "still fine")).isNotNull();
    }

    private record Chat(UUID id, UUID farmer, UUID agrochemist) {
    }

    private Chat activeChat() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist();
        UUID id = consultationService.request(farmer, agrochemist, "Help", null).consultation().id();
        consultationService.accept(agrochemist, id);
        return new Chat(id, farmer, agrochemist);
    }

    private Instant lastMessageAt(UUID consultation) {
        return jdbc.queryForObject("SELECT last_message_at FROM consultations WHERE id = ?",
                java.time.OffsetDateTime.class, consultation).toInstant();
    }

    private Instant readAt(UUID message) {
        java.time.OffsetDateTime value = jdbc.queryForObject(
                "SELECT read_at FROM consultation_messages WHERE id = ?", java.time.OffsetDateTime.class, message);
        return value == null ? null : value.toInstant();
    }

    private void assertNotFound(Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(e.getCode()).isEqualTo("consultation_not_found");
        });
    }

    private void assertMessageNotFound(Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(e.getCode()).isEqualTo("message_not_found");
        });
    }

    private void assertInvalidState(Runnable action, String current) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT);
            assertThat(e.getCode()).isEqualTo("invalid_consultation_state");
            assertThat(e.getReason()).isEqualTo(current);
        });
    }

    private UUID farmer() {
        UUID id = user("farmer");
        jdbc.update("INSERT INTO user_roles (user_id, role_code) VALUES (?, 'farmer')", id);
        return id;
    }

    private UUID agrochemist() {
        UUID id = user("agrochemist");
        jdbc.update("INSERT INTO user_roles (user_id, role_code) VALUES (?, 'agrochemist')", id);
        jdbc.update("""
                INSERT INTO agrochemist_profiles (user_id, specialization, experience_years, verification_status)
                VALUES (?, 'plant_protection', 5, 'approved')""", id);
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
