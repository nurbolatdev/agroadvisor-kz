package kz.agroadvisor.community.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.community.repository.CommunityAnswerRepository.Answer;
import kz.agroadvisor.notifications.model.NotificationType;
import kz.agroadvisor.notifications.repository.NotificationRepository.Notification;
import kz.agroadvisor.notifications.service.NotificationService;

/** Feed notifications written by the community services; the test transaction is rolled back. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class CommunityEventsIntegrationTest {

    @Autowired
    private CommunityQuestionService questions;
    @Autowired
    private CommunityAnswerService answers;
    @Autowired
    private NotificationService notifications;
    @Autowired
    private JdbcTemplate jdbc;
    // the same beans as the other community integration tests, so all of them share one Spring context
    @MockitoBean
    private CommunityPhotoStorage storage;

    private long region;
    private int seq;
    private UUID author;
    private UUID helper;
    private UUID question;

    @BeforeEach
    void setUp() {
        region = jdbc.queryForObject("SELECT id FROM regions ORDER BY id LIMIT 1", Long.class);
        author = user();
        helper = user();
        question = ask(author);
    }

    @Test
    void anAnswerNotifiesTheAuthorOfTheQuestion() {
        Answer answer = answers.answer(helper, question, "Spray it");

        List<Notification> feed = feed(author);
        assertThat(feed).hasSize(1);
        assertThat(feed.get(0).type()).isEqualTo(NotificationType.COMMUNITY_ANSWER);
        assertThat(feed.get(0).questionId()).isEqualTo(question);
        assertThat(feed.get(0).answerId()).isEqualTo(answer.id());
        assertThat(feed(helper)).isEmpty();
    }

    @Test
    void anAnswerToOwnQuestionNotifiesNobody() {
        answers.answer(author, question, "Found it myself");

        assertThat(feed(author)).isEmpty();
    }

    @Test
    void aBestAnswerNotifiesItsAuthorAndClearingDoesNot() {
        Answer answer = answers.answer(helper, question, "Spray it");

        answers.accept(author, question, answer.id());
        answers.accept(author, question, answer.id());
        answers.unaccept(author, question);

        List<Notification> feed = feed(helper);
        assertThat(feed).hasSize(1);
        assertThat(feed.get(0).type()).isEqualTo(NotificationType.COMMUNITY_ANSWER_ACCEPTED);
        assertThat(feed.get(0).questionId()).isEqualTo(question);
        assertThat(feed.get(0).answerId()).isEqualTo(answer.id());
        assertThat(feed(author)).extracting(Notification::type).containsExactly(NotificationType.COMMUNITY_ANSWER);
    }

    @Test
    void pickingTheSameAnswerAgainAfterClearingCollapsesIntoOneRow() {
        Answer answer = answers.answer(helper, question, "Spray it");

        answers.accept(author, question, answer.id());
        answers.unaccept(author, question);
        answers.accept(author, question, answer.id());

        List<Notification> feed = feed(helper);
        assertThat(feed).hasSize(1);
        assertThat(feed.get(0).type()).isEqualTo(NotificationType.COMMUNITY_ANSWER_ACCEPTED);
        assertThat(feed.get(0).count()).isEqualTo(2);
    }

    @Test
    void aNewQuestionNotifiesActiveSubscribersOfTheCropOnly() {
        UUID subscriber = user();
        UUID blocked = user();
        UUID otherCrop = user();
        UUID authorSubscribed = user();
        subscribe(subscriber, "tomato");
        subscribe(blocked, "tomato");
        subscribe(otherCrop, "potato");
        subscribe(authorSubscribed, "tomato");
        jdbc.update("UPDATE users SET status = 'blocked' WHERE id = ?", blocked);

        UUID id = ask(authorSubscribed);

        List<Notification> feed = feed(subscriber);
        assertThat(feed).hasSize(1);
        assertThat(feed.get(0).type()).isEqualTo(NotificationType.COMMUNITY_QUESTION);
        assertThat(feed.get(0).questionId()).isEqualTo(id);
        assertThat(feed(blocked)).isEmpty();
        assertThat(feed(otherCrop)).isEmpty();
        assertThat(feed(authorSubscribed)).isEmpty();
    }

    @Test
    void threeQuestionsGiveOneUnreadRowWithACounter() {
        UUID subscriber = user();
        subscribe(subscriber, "tomato");

        ask(author);
        ask(author);
        UUID last = ask(author);

        List<Notification> feed = feed(subscriber);
        assertThat(feed).hasSize(1);
        assertThat(feed.get(0).count()).isEqualTo(3);
        assertThat(feed.get(0).questionId()).isEqualTo(last);
    }

    private UUID ask(UUID user) {
        return questions.ask(user, "Yellow leaves", "Leaves turn yellow", "tomato", null, List.of())
                .question().id();
    }

    private void subscribe(UUID user, String crop) {
        jdbc.update("INSERT INTO community_crop_subscriptions (user_id, crop_code) VALUES (?, ?)", user, crop);
    }

    private List<Notification> feed(UUID user) {
        return notifications.list(user, false, 0, 50);
    }

    private UUID user() {
        seq++;
        return jdbc.queryForObject("""
                INSERT INTO users (phone, password_hash, full_name, region_id) VALUES (?, 'x', 'Test', ?)
                RETURNING id""", UUID.class, "+7705400%04d".formatted(seq), region);
    }
}
