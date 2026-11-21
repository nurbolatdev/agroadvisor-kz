package kz.agroadvisor.notifications.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.notifications.model.NotificationType;
import kz.agroadvisor.notifications.repository.NotificationRepository.Notification;
import kz.agroadvisor.notifications.service.NotificationService.Refs;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionTemplate;

/** Not transactional: commit and rollback of the surrounding transaction are the point. Users are removed after. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class NotificationServiceTest {

    @Autowired
    private NotificationService service;
    @Autowired
    private TransactionTemplate tx;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> users = new ArrayList<>();
    private int seq;

    @AfterEach
    void cleanUp() {
        users.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    @Test
    void notifyOutsideATransactionFails() {
        UUID user = user();

        assertThatThrownBy(() -> service.notify(user, NotificationType.VERIFICATION_APPROVED, Refs.none()))
                .isInstanceOf(IllegalTransactionStateException.class);
        assertThat(service.unreadCount(user)).isZero();
    }

    @Test
    void theRowAppearsOnlyWhenTheTransactionCommits() {
        UUID user = user();

        tx.executeWithoutResult(status -> {
            service.notify(user, NotificationType.VERIFICATION_APPROVED, Refs.none());
            status.setRollbackOnly();
        });
        assertThat(service.unreadCount(user)).isZero();

        tx.executeWithoutResult(status ->
                service.notify(user, NotificationType.VERIFICATION_APPROVED, Refs.none()));
        assertThat(service.unreadCount(user)).isEqualTo(1);
        assertThat(service.list(user, false, 0, 20)).singleElement()
                .extracting(Notification::type).isEqualTo(NotificationType.VERIFICATION_APPROVED);
    }

    @Test
    void referencesMustMatchTheTypeBeforeAnySql() {
        UUID user = user();
        UUID id = UUID.randomUUID();

        assertThatThrownBy(() -> tx.executeWithoutResult(status ->
                service.notify(user, NotificationType.CONSULTATION_MESSAGE, Refs.consultation(id))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> tx.executeWithoutResult(status ->
                service.notify(user, NotificationType.VERIFICATION_APPROVED, Refs.consultation(id))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> tx.executeWithoutResult(status ->
                service.notify(user, NotificationType.DIAGNOSIS_REVIEWED, Refs.none())))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> tx.executeWithoutResult(status ->
                service.notify(user, NotificationType.CONSULTATION_REQUESTED, Refs.message(id, id))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void chatMessagesOfOneConsultationCollapseUntilRead() {
        UUID farmer = user();
        UUID agrochemist = user();
        UUID consultation = jdbc.queryForObject("""
                INSERT INTO consultations (farmer_id, agrochemist_id, status, accepted_at)
                VALUES (?, ?, 'active', now())
                RETURNING id""", UUID.class, farmer, agrochemist);
        UUID first = message(consultation, farmer);
        UUID second = message(consultation, farmer);

        tx.executeWithoutResult(status ->
                service.notify(agrochemist, NotificationType.CONSULTATION_MESSAGE,
                        Refs.message(consultation, first)));
        tx.executeWithoutResult(status ->
                service.notify(agrochemist, NotificationType.CONSULTATION_MESSAGE,
                        Refs.message(consultation, second)));

        assertThat(service.list(agrochemist, false, 0, 20)).singleElement().satisfies(n -> {
            assertThat(n.count()).isEqualTo(2);
            assertThat(n.messageId()).isEqualTo(second);
        });
    }

    @Test
    void communityTypesRejectWrongReferences() {
        UUID user = user();
        UUID id = UUID.randomUUID();

        for (NotificationType type : List.of(NotificationType.COMMUNITY_ANSWER,
                NotificationType.COMMUNITY_ANSWER_ACCEPTED)) {
            assertThatThrownBy(() -> tx.executeWithoutResult(status ->
                    service.notify(user, type, Refs.none()))).isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> tx.executeWithoutResult(status ->
                    service.notify(user, type, Refs.question(id)))).isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> tx.executeWithoutResult(status ->
                    service.notify(user, type, Refs.consultation(id))))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> tx.executeWithoutResult(status ->
                service.notify(user, NotificationType.COMMUNITY_QUESTION, Refs.none())))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> tx.executeWithoutResult(status ->
                service.notify(user, NotificationType.COMMUNITY_QUESTION, Refs.answer(id, id))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> tx.executeWithoutResult(status ->
                service.notify(user, NotificationType.COMMUNITY_QUESTION, Refs.diagnosis(id))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> tx.executeWithoutResult(status ->
                service.notify(user, NotificationType.VERIFICATION_APPROVED, Refs.question(id))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> tx.executeWithoutResult(status ->
                service.notify(user, NotificationType.CONSULTATION_MESSAGE, Refs.answer(id, id))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void answersToOneQuestionCollapseUntilRead() {
        UUID author = user();
        UUID other = user();
        UUID question = question(author);
        UUID first = answer(question, other);
        UUID second = answer(question, other);

        tx.executeWithoutResult(status ->
                service.notify(author, NotificationType.COMMUNITY_ANSWER, Refs.answer(question, first)));
        tx.executeWithoutResult(status ->
                service.notify(author, NotificationType.COMMUNITY_ANSWER, Refs.answer(question, second)));

        assertThat(service.list(author, false, 0, 20)).singleElement().satisfies(n -> {
            assertThat(n.type()).isEqualTo(NotificationType.COMMUNITY_ANSWER);
            assertThat(n.count()).isEqualTo(2);
            assertThat(n.questionId()).isEqualTo(question);
            assertThat(n.answerId()).isEqualTo(second);
        });
    }

    @Test
    void acceptedAnswersCollapsePerAnswer() {
        UUID author = user();
        UUID answerAuthor = user();
        UUID question = question(author);
        UUID first = answer(question, answerAuthor);
        UUID second = answer(question, answerAuthor);

        tx.executeWithoutResult(status ->
                service.notify(answerAuthor, NotificationType.COMMUNITY_ANSWER_ACCEPTED,
                        Refs.answer(question, first)));
        tx.executeWithoutResult(status ->
                service.notify(answerAuthor, NotificationType.COMMUNITY_ANSWER_ACCEPTED,
                        Refs.answer(question, second)));
        tx.executeWithoutResult(status ->
                service.notify(answerAuthor, NotificationType.COMMUNITY_ANSWER_ACCEPTED,
                        Refs.answer(question, first)));

        List<Notification> feed = service.list(answerAuthor, false, 0, 20);
        assertThat(feed).hasSize(2);
        assertThat(feed).filteredOn(n -> first.equals(n.answerId()))
                .singleElement().satisfies(n -> assertThat(n.count()).isEqualTo(2));
        assertThat(feed).filteredOn(n -> second.equals(n.answerId()))
                .singleElement().satisfies(n -> assertThat(n.count()).isEqualTo(1));
    }

    @Test
    void newQuestionsCollapseIntoOneRowWithTheNewestQuestion() {
        UUID author = user();
        UUID subscriber = user();
        UUID first = question(author);
        UUID second = question(author);

        tx.executeWithoutResult(status ->
                service.notify(subscriber, NotificationType.COMMUNITY_QUESTION, Refs.question(first)));
        tx.executeWithoutResult(status ->
                service.notify(subscriber, NotificationType.COMMUNITY_QUESTION, Refs.question(second)));

        assertThat(service.list(subscriber, false, 0, 20)).singleElement().satisfies(n -> {
            assertThat(n.count()).isEqualTo(2);
            assertThat(n.questionId()).isEqualTo(second);
            assertThat(n.answerId()).isNull();
        });
    }

    @Test
    void markReadOfSomeoneElsesOrMissingIdIsNotFound() {
        UUID owner = user();
        UUID stranger = user();
        tx.executeWithoutResult(status ->
                service.notify(owner, NotificationType.VERIFICATION_APPROVED, Refs.none()));
        UUID id = service.list(owner, false, 0, 20).get(0).id();

        for (UUID target : new UUID[] {id, UUID.randomUUID()}) {
            assertThatThrownBy(() -> service.markRead(stranger, target))
                    .isInstanceOfSatisfying(ApiException.class, e -> {
                        assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                        assertThat(e.getCode()).isEqualTo("notification_not_found");
                    });
        }
        assertThat(service.unreadCount(owner)).isEqualTo(1);
    }

    @Test
    void markReadReturnsTheRemainingCountAndIsIdempotent() {
        UUID user = user();
        tx.executeWithoutResult(status -> {
            service.notify(user, NotificationType.VERIFICATION_APPROVED, Refs.none());
            service.notify(user, NotificationType.VERIFICATION_REJECTED, Refs.none());
        });
        UUID id = service.list(user, false, 0, 20).get(0).id();

        assertThat(service.markRead(user, id)).isEqualTo(1);
        assertThat(service.markRead(user, id)).isEqualTo(1);
        assertThat(service.list(user, true, 0, 20)).hasSize(1);
    }

    @Test
    void markAllReadLeavesNothingUnread() {
        UUID user = user();
        tx.executeWithoutResult(status -> {
            service.notify(user, NotificationType.VERIFICATION_APPROVED, Refs.none());
            service.notify(user, NotificationType.VERIFICATION_REJECTED, Refs.none());
        });

        service.markAllRead(user);

        assertThat(service.unreadCount(user)).isZero();
        assertThat(service.list(user, false, 0, 20)).hasSize(2);
    }

    private UUID message(UUID consultation, UUID sender) {
        return jdbc.queryForObject("""
                INSERT INTO consultation_messages (consultation_id, sender_id, body) VALUES (?, ?, 'Hi')
                RETURNING id""", UUID.class, consultation, sender);
    }

    private UUID question(UUID author) {
        return jdbc.queryForObject("""
                INSERT INTO community_questions (author_id, crop_code, region_id, title, body)
                VALUES (?, 'potato', (SELECT min(id) FROM regions), 'Title', 'Body') RETURNING id""",
                UUID.class, author);
    }

    private UUID answer(UUID question, UUID author) {
        return jdbc.queryForObject(
                "INSERT INTO community_answers (question_id, author_id, body) VALUES (?, ?, 'Answer') RETURNING id",
                UUID.class, question, author);
    }

    private UUID user() {
        seq++;
        UUID id = jdbc.queryForObject(
                "INSERT INTO users (phone, password_hash, full_name) VALUES (?, 'x', 'Test') RETURNING id",
                UUID.class, "+7705200%04d".formatted(seq));
        users.add(id);
        return id;
    }
}
