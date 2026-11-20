package kz.agroadvisor.community.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.community.repository.CommunityAnswerRepository.Answer;
import kz.agroadvisor.community.repository.CommunityQuestionRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class CommunityAnswerServiceTest {

    @Autowired
    private CommunityAnswerService service;
    @Autowired
    private CommunityQuestionRepository questions;
    @Autowired
    private JdbcTemplate jdbc;

    private UUID author;
    private UUID helper;
    private UUID other;
    private UUID question;
    private int seq;

    @BeforeEach
    void setUp() {
        long region = jdbc.queryForObject("SELECT id FROM regions ORDER BY id LIMIT 1", Long.class);
        author = user(region);
        helper = user(region);
        other = user(region);
        question = UUID.randomUUID();
        assertThat(questions.insert(question, author, "tomato", null, "Title", "Body")).isTrue();
    }

    @Test
    void answersAreOrderedBestFirstThenByScoreAndTime() {
        Answer first = service.answer(helper, question, "  First \r\n answer ");
        Answer second = service.answer(other, question, "Second");
        Answer third = service.answer(helper, question, "Third");
        jdbc.update("INSERT INTO community_votes (answer_id, user_id, value) VALUES (?, ?, 1)", third.id(), author);
        jdbc.update("INSERT INTO community_votes (answer_id, user_id, value) VALUES (?, ?, -1)", second.id(),
                author);

        assertThat(first.body()).isEqualTo("First \n answer");
        assertThat(ids(service.list(author, question))).containsExactly(third.id(), first.id(), second.id());

        service.accept(author, question, second.id());

        List<Answer> list = service.list(author, question);
        assertThat(ids(list)).containsExactly(second.id(), third.id(), first.id());
        assertThat(list.get(0).accepted()).isTrue();
        assertThat(list.get(0).score()).isEqualTo(-1);
        assertThat(list.get(0).myVote()).isEqualTo(-1);
        assertThat(list.get(1).accepted()).isFalse();
        assertThat(list.get(1).score()).isEqualTo(1);
        assertThat(service.list(helper, question).get(1).myVote()).isZero();
    }

    @Test
    void theAuthorCanAnswerHisOwnQuestion() {
        assertThat(service.answer(author, question, "Update").authorId()).isEqualTo(author);
    }

    @Test
    void theBestAnswerCanBeChangedAndCleared() {
        UUID a = service.answer(helper, question, "A").id();
        UUID b = service.answer(other, question, "B").id();

        service.accept(author, question, a);
        service.accept(author, question, a);
        assertThat(questions.findVisible(question).orElseThrow().acceptedAnswerId()).isEqualTo(a);
        assertThat(questions.findVisible(question).orElseThrow().status()).isEqualTo("solved");

        service.accept(author, question, b);
        assertThat(questions.findVisible(question).orElseThrow().acceptedAnswerId()).isEqualTo(b);

        service.unaccept(author, question);
        service.unaccept(author, question);
        assertThat(questions.findVisible(question).orElseThrow().acceptedAnswerId()).isNull();
        assertThat(questions.findVisible(question).orElseThrow().status()).isEqualTo("open");
    }

    @Test
    void onlyTheAuthorPicksTheBestAnswer() {
        UUID a = service.answer(helper, question, "A").id();

        assertApi(() -> service.accept(other, question, a), 403, CommunityErrors.NOT_QUESTION_AUTHOR);
        assertApi(() -> service.unaccept(other, question), 403, CommunityErrors.NOT_QUESTION_AUTHOR);
    }

    @Test
    void ownAnswerCannotBeTheBest() {
        UUID own = service.answer(author, question, "Own").id();

        assertApi(() -> service.accept(author, question, own), 409, CommunityErrors.OWN_ANSWER);
    }

    @Test
    void answerOfAnotherOrHiddenQuestionIsNotFound() {
        UUID otherQuestion = UUID.randomUUID();
        assertThat(questions.insert(otherQuestion, author, "corn", null, "Title", "Body")).isTrue();
        UUID foreign = service.answer(helper, otherQuestion, "Foreign").id();
        UUID hidden = service.answer(helper, question, "Hidden").id();
        jdbc.update("UPDATE community_answers SET hidden_at = now(), hidden_by = ? WHERE id = ?", author, hidden);

        assertApi(() -> service.accept(author, question, foreign), 404, CommunityErrors.ANSWER_NOT_FOUND);
        assertApi(() -> service.accept(author, question, hidden), 404, CommunityErrors.ANSWER_NOT_FOUND);
        assertApi(() -> service.accept(author, question, UUID.randomUUID()), 404,
                CommunityErrors.ANSWER_NOT_FOUND);
        assertThat(service.list(author, question)).isEmpty();
    }

    @Test
    void hiddenOrMissingQuestionIsNotFound() {
        jdbc.update("UPDATE community_questions SET hidden_at = now(), hidden_by = ? WHERE id = ?", other, question);

        assertApi(() -> service.answer(helper, question, "Late"), 404, CommunityErrors.QUESTION_NOT_FOUND);
        assertApi(() -> service.list(helper, question), 404, CommunityErrors.QUESTION_NOT_FOUND);
        assertApi(() -> service.accept(author, question, UUID.randomUUID()), 404,
                CommunityErrors.QUESTION_NOT_FOUND);
        assertApi(() -> service.unaccept(author, UUID.randomUUID()), 404, CommunityErrors.QUESTION_NOT_FOUND);
    }

    @Test
    void theTwoHundredAndFirstAnswerIsRejected() {
        jdbc.update("""
                INSERT INTO community_answers (question_id, author_id, body)
                SELECT ?, ?, 'Answer' FROM generate_series(1, 200)""", question, other);

        assertApi(() -> service.answer(helper, question, "One more"), 409, CommunityErrors.ANSWER_LIMIT);
    }

    @Test
    void badTextIsRejected() {
        assertApi(() -> service.answer(helper, question, "   "), 400, "validation_failed");
        assertApi(() -> service.answer(helper, question, null), 400, "validation_failed");
        assertApi(() -> service.answer(helper, question, "a".repeat(2001)), 400, "validation_failed");
        assertApi(() -> service.answer(helper, question, "bad\u0000text"), 400, "validation_failed");
    }

    @Test
    void changingTheVoteMovesTheScoreByTwo() {
        UUID a = service.answer(helper, question, "A").id();

        assertThat(service.vote(author, a, 1)).isEqualTo(new CommunityAnswerService.VoteResult(1, 1));
        assertThat(service.vote(other, a, 1)).isEqualTo(new CommunityAnswerService.VoteResult(2, 1));
        assertThat(service.vote(author, a, -1)).isEqualTo(new CommunityAnswerService.VoteResult(0, -1));
        assertThat(service.vote(author, a, -1)).isEqualTo(new CommunityAnswerService.VoteResult(0, -1));
        assertThat(service.unvote(author, a)).isEqualTo(new CommunityAnswerService.VoteResult(1, 0));
        assertThat(service.unvote(author, a)).isEqualTo(new CommunityAnswerService.VoteResult(1, 0));
    }

    @Test
    void ownAnswerCannotBeVotedAndBadValuesAreRejected() {
        UUID own = service.answer(helper, question, "Own").id();

        assertApi(() -> service.vote(helper, own, 1), 409, CommunityErrors.OWN_ANSWER);
        assertApi(() -> service.unvote(helper, own), 409, CommunityErrors.OWN_ANSWER);
        assertApi(() -> service.vote(author, own, 0), 400, "validation_failed");
        assertApi(() -> service.vote(author, own, 2), 400, "validation_failed");
    }

    @Test
    void hiddenOrMissingAnswerCannotBeVoted() {
        UUID hiddenAnswer = service.answer(helper, question, "Hidden").id();
        UUID visible = service.answer(helper, question, "Visible").id();
        jdbc.update("UPDATE community_answers SET hidden_at = now(), hidden_by = ? WHERE id = ?", author,
                hiddenAnswer);

        assertApi(() -> service.vote(author, hiddenAnswer, 1), 404, CommunityErrors.ANSWER_NOT_FOUND);
        assertApi(() -> service.vote(author, UUID.randomUUID(), 1), 404, CommunityErrors.ANSWER_NOT_FOUND);

        jdbc.update("UPDATE community_questions SET hidden_at = now(), hidden_by = ? WHERE id = ?", other, question);
        assertApi(() -> service.vote(author, visible, 1), 404, CommunityErrors.ANSWER_NOT_FOUND);
    }

    private static List<UUID> ids(List<Answer> list) {
        return list.stream().map(Answer::id).toList();
    }

    private static void assertApi(Runnable call, int status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus().value()).isEqualTo(status);
            assertThat(e.getCode()).isEqualTo(code);
        });
    }

    private UUID user(long regionId) {
        seq++;
        return jdbc.queryForObject("""
                INSERT INTO users (phone, password_hash, full_name, region_id) VALUES (?, 'x', 'Test', ?)
                RETURNING id""", UUID.class, "+7705300%04d".formatted(seq), regionId);
    }
}
