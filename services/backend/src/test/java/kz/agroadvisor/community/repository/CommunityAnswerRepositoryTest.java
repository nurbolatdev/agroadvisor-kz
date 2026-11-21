package kz.agroadvisor.community.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

import kz.agroadvisor.TestcontainersConfiguration;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class CommunityAnswerRepositoryTest {

    @Autowired
    private CommunityAnswerRepository answers;
    @Autowired
    private CommunityQuestionRepository questions;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private TransactionTemplate tx;

    private UUID author;

    @AfterEach
    void cleanUp() {
        if (author != null) {
            jdbc.update("DELETE FROM community_questions WHERE author_id = ?", author);
            jdbc.update("DELETE FROM users WHERE id = ?", author);
        }
    }

    @Test
    void hidingTheBestAnswerWaitsForAConcurrentChoiceAndThenClearsIt() throws Exception {
        author = jdbc.queryForObject("""
                INSERT INTO users (phone, password_hash, full_name, region_id)
                VALUES (?, 'x', 'Test', (SELECT min(id) FROM regions)) RETURNING id""", UUID.class,
                "+7704300" + (1000 + Math.abs(UUID.randomUUID().hashCode() % 9000)));
        UUID question = UUID.randomUUID();
        assertThat(questions.insert(question, author, "potato", null, "Title", "Body")).isTrue();
        UUID answer = answers.insert(question, author, "Answer");
        UUID admin = author;

        CountDownLatch locked = new CountDownLatch(1);
        CompletableFuture<Void> chooser = CompletableFuture.runAsync(() -> tx.executeWithoutResult(status -> {
            questions.lock(question);
            locked.countDown();
            pause(500);
            answers.setAccepted(question, answer);
        }));
        assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();

        // the hide starts while the choice holds the question: it has to wait and then see the choice
        tx.executeWithoutResult(status -> answers.setHidden(answer, admin, true));
        chooser.get(10, TimeUnit.SECONDS);

        assertThat(jdbc.queryForObject("SELECT accepted_answer_id FROM community_questions WHERE id = ?",
                UUID.class, question)).isNull();
        assertThat(jdbc.queryForObject("SELECT hidden_at IS NOT NULL FROM community_answers WHERE id = ?",
                Boolean.class, answer)).isTrue();
    }

    private static void pause(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
