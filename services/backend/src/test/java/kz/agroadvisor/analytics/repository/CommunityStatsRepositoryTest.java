package kz.agroadvisor.analytics.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.analytics.repository.CommunityStatsRepository.QuestionTotals;
import kz.agroadvisor.analytics.repository.CommunityStatsRepository.UnansweredQuestion;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class CommunityStatsRepositoryTest {

    private static final Instant LONG_AGO = Instant.parse("2001-03-05T10:00:00Z");

    @Autowired
    private CommunityStatsRepository stats;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> users = new ArrayList<>();
    private final List<UUID> questions = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        questions.forEach(q -> jdbc.update("DELETE FROM community_questions WHERE id = ?", q));
        users.forEach(u -> jdbc.update("DELETE FROM users WHERE id = ?", u));
    }

    @Test
    void aWindowWithoutQuestionsHasNoFirstAnswerAverage() {
        QuestionTotals totals = stats.totals(Instant.parse("2000-01-01T00:00:00Z"), Instant.parse("2000-01-02T00:00:00Z"));

        assertThat(totals.questions()).isZero();
        assertThat(totals.solved()).isZero();
        assertThat(totals.avgFirstAnswerMinutes()).isNull();
    }

    @Test
    void aQuestionWithoutAnswersCountsButGivesNoAverage() {
        UUID author = user();
        question(author, LONG_AGO, false);

        QuestionTotals totals = window();

        assertThat(totals.questions()).isEqualTo(1);
        assertThat(totals.avgFirstAnswerMinutes()).isNull();
    }

    @Test
    void theFirstAnswerOfSomebodyElseSetsTheAverageAndHiddenOnesAreIgnored() {
        UUID author = user();
        UUID other = user();
        UUID q = question(author, LONG_AGO, false);
        answer(q, author, LONG_AGO.plus(Duration.ofMinutes(5)), false);
        answer(q, other, LONG_AGO.plus(Duration.ofMinutes(10)), true);
        UUID best = answer(q, other, LONG_AGO.plus(Duration.ofMinutes(30)), false);
        answer(q, other, LONG_AGO.plus(Duration.ofMinutes(50)), false);
        jdbc.update("UPDATE community_questions SET accepted_answer_id = ? WHERE id = ?", best, q);

        QuestionTotals totals = window();

        assertThat(totals.questions()).isEqualTo(1);
        assertThat(totals.solved()).isEqualTo(1);
        assertThat(totals.avgFirstAnswerMinutes()).isEqualTo(30.0);
    }

    @Test
    void aHiddenQuestionIsNotCounted() {
        UUID author = user();
        question(author, LONG_AGO, true);

        assertThat(window().questions()).isZero();
    }

    @Test
    void anAnswerOfTheAuthorOrAHiddenAnswerDoesNotAnswerTheQuestion() {
        Instant now = Instant.now();
        int before = stats.unansweredCount(now);
        UUID author = user();
        UUID other = user();
        UUID ownAnswered = question(author, now.minus(Duration.ofHours(48)), false);
        answer(ownAnswered, author, now.minus(Duration.ofHours(40)), false);
        UUID hiddenAnswered = question(author, now.minus(Duration.ofHours(47)), false);
        answer(hiddenAnswered, other, now.minus(Duration.ofHours(40)), true);
        UUID answered = question(author, now.minus(Duration.ofHours(46)), false);
        answer(answered, other, now.minus(Duration.ofHours(40)), false);

        assertThat(stats.unansweredCount(now)).isEqualTo(before + 2);
        assertThat(ids(stats.unanswered(now, 10_000))).contains(ownAnswered, hiddenAnswered)
                .doesNotContain(answered);
    }

    @Test
    void aHiddenOrYoungQuestionIsNotUnanswered() {
        Instant now = Instant.now();
        UUID author = user();
        UUID young = question(author, now.minus(Duration.ofHours(23)), false);
        UUID hidden = question(author, now.minus(Duration.ofHours(48)), true);
        UUID old = question(author, now.minus(Duration.ofHours(25)), false);

        assertThat(ids(stats.unanswered(now, 10_000))).contains(old).doesNotContain(young, hidden);
    }

    @Test
    void theUnansweredListStartsWithTheOldestAndHonoursTheLimit() {
        Instant now = Instant.now();
        UUID author = user();
        UUID oldest = question(author, LONG_AGO, false);
        question(author, now.minus(Duration.ofHours(30)), false);

        List<UnansweredQuestion> first = stats.unanswered(now, 1);

        assertThat(first).hasSize(1);
        assertThat(first.get(0).id()).isEqualTo(oldest);
        assertThat(first.get(0).cropCode()).isEqualTo("potato");
        assertThat(first.get(0).createdAt()).isEqualTo(LONG_AGO);
    }

    @Test
    void anAnswerGivenAfterTheMomentDoesNotCountForThatMoment() {
        Instant now = Instant.now();
        UUID author = user();
        UUID other = user();
        UUID q = question(author, now.minus(Duration.ofHours(48)), false);
        answer(q, other, now.minus(Duration.ofHours(2)), false);
        int before = stats.unansweredCount(now.minus(Duration.ofHours(10)));

        assertThat(ids(stats.unanswered(now.minus(Duration.ofHours(10)), 10_000))).contains(q);
        assertThat(ids(stats.unanswered(now, 10_000))).doesNotContain(q);
        assertThat(before).isPositive();
    }

    private QuestionTotals window() {
        return stats.totals(LONG_AGO.minus(Duration.ofDays(1)), LONG_AGO.plus(Duration.ofDays(1)));
    }

    private static List<UUID> ids(List<UnansweredQuestion> list) {
        return list.stream().map(UnansweredQuestion::id).toList();
    }

    private UUID user() {
        UUID id = jdbc.queryForObject("""
                INSERT INTO users (phone, password_hash, full_name, region_id)
                VALUES (?, 'x', 'Test', (SELECT min(id) FROM regions)) RETURNING id""", UUID.class,
                "+7705" + (1000000 + Math.abs(UUID.randomUUID().hashCode() % 9000000)));
        users.add(id);
        return id;
    }

    private UUID question(UUID author, Instant createdAt, boolean hidden) {
        UUID id = jdbc.queryForObject("""
                INSERT INTO community_questions (author_id, crop_code, region_id, title, body, created_at,
                                                 hidden_at, hidden_by)
                VALUES (?, 'potato', (SELECT min(id) FROM regions), 'Title', 'Body', ?, ?, ?) RETURNING id""",
                UUID.class, author, Timestamp.from(createdAt), hidden ? Timestamp.from(createdAt) : null,
                hidden ? author : null);
        questions.add(id);
        return id;
    }

    private UUID answer(UUID question, UUID author, Instant createdAt, boolean hidden) {
        return jdbc.queryForObject("""
                INSERT INTO community_answers (question_id, author_id, body, created_at, hidden_at, hidden_by)
                VALUES (?, ?, 'Answer', ?, ?, ?) RETURNING id""", UUID.class, question, author,
                Timestamp.from(createdAt), hidden ? Timestamp.from(createdAt) : null, hidden ? author : null);
    }
}
