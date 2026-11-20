package kz.agroadvisor.community.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.community.repository.CommunityQuestionRepository.Cursor;
import kz.agroadvisor.community.repository.CommunityQuestionRepository.Filter;
import kz.agroadvisor.community.repository.CommunityQuestionRepository.Photo;
import kz.agroadvisor.community.repository.CommunityQuestionRepository.Question;

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
class CommunityQuestionRepositoryTest {

    @Autowired
    private CommunityQuestionRepository repository;
    @Autowired
    private JdbcTemplate jdbc;

    private long regionA;
    private long regionB;
    private UUID farmerA;
    private UUID farmerB;
    private int seq;

    @BeforeEach
    void setUp() {
        List<Long> regions = jdbc.queryForList("SELECT id FROM regions ORDER BY id LIMIT 2", Long.class);
        regionA = regions.get(0);
        regionB = regions.get(1);
        farmerA = user(regionA);
        farmerB = user(regionB);
    }

    @Test
    void insertCopiesRegionFromTheAuthorProfile() {
        UUID id = ask(farmerB, "tomato");

        Question q = repository.findVisible(id).orElseThrow();

        assertThat(q.regionId()).isEqualTo(regionB);
        assertThat(q.authorId()).isEqualTo(farmerB);
        assertThat(q.authorName()).isEqualTo("Test");
        assertThat(q.authorExpert()).isFalse();
        assertThat(q.cropCode()).isEqualTo("tomato");
        assertThat(q.status()).isEqualTo("open");
        assertThat(q.answerCount()).isZero();
        assertThat(q.hiddenAt()).isNull();
    }

    @Test
    void insertAddsNothingForAnAuthorWithoutRegionOrUnknown() {
        UUID noRegion = user(null);

        assertThat(repository.insert(UUID.randomUUID(), noRegion, "tomato", null, "Title", "Body")).isFalse();
        assertThat(repository.insert(UUID.randomUUID(), UUID.randomUUID(), "tomato", null, "Title", "Body"))
                .isFalse();
    }

    @Test
    void authorIsAnExpertOnlyWithApprovedDocuments() {
        UUID expert = user(regionA);
        UUID pending = user(regionA);
        jdbc.update("INSERT INTO agrochemist_profiles (user_id, verification_status) VALUES (?, 'approved')",
                expert);
        jdbc.update("INSERT INTO agrochemist_profiles (user_id, verification_status) VALUES (?, 'pending')",
                pending);

        assertThat(repository.findVisible(ask(expert, "corn")).orElseThrow().authorExpert()).isTrue();
        assertThat(repository.findVisible(ask(pending, "corn")).orElseThrow().authorExpert()).isFalse();
    }

    @Test
    void hiddenQuestionIsFoundOnlyByFind() {
        UUID id = ask(farmerA, "tomato");
        hide("community_questions", id);

        assertThat(repository.findVisible(id)).isEmpty();
        assertThat(repository.find(id)).hasValueSatisfying(q -> assertThat(q.hiddenAt()).isNotNull());
        assertThat(repository.find(UUID.randomUUID())).isEmpty();
        assertThat(repository.feed(Filter.NONE, null, 10)).isEmpty();
        assertThat(repository.cursorOf(id)).isPresent();
        assertThat(repository.cursorOf(UUID.randomUUID())).isEmpty();
    }

    @Test
    void answerCountSkipsHiddenAnswers() {
        UUID id = ask(farmerA, "tomato");
        answer(id, farmerB);
        UUID hidden = answer(id, farmerB);
        hide("community_answers", hidden);

        assertThat(repository.findVisible(id).orElseThrow().answerCount()).isEqualTo(1);
        assertThat(repository.feed(Filter.NONE, null, 10)).extracting(Question::answerCount).containsExactly(1);
    }

    @Test
    void filtersWorkAloneAndTogether() {
        UUID tomatoA = ask(farmerA, "tomato");
        UUID cornA = ask(farmerA, "corn");
        UUID tomatoB = ask(farmerB, "tomato");
        UUID wheatB = ask(farmerB, "wheat");
        UUID solved = tomatoA;
        UUID best = answer(solved, farmerB);
        jdbc.update("UPDATE community_questions SET accepted_answer_id = ? WHERE id = ?", best, solved);
        answer(cornA, farmerB);
        UUID hiddenOnly = ask(farmerA, "potato");
        hide("community_answers", answer(hiddenOnly, farmerB));

        assertThat(ids(new Filter(List.of("tomato"), null, null, false, null)))
                .containsExactlyInAnyOrder(tomatoA, tomatoB);
        assertThat(ids(new Filter(List.of("tomato", "wheat"), null, null, false, null)))
                .containsExactlyInAnyOrder(tomatoA, tomatoB, wheatB);
        assertThat(ids(new Filter(List.of(), regionB, null, false, null)))
                .containsExactlyInAnyOrder(tomatoB, wheatB);
        assertThat(ids(new Filter(List.of(), null, "solved", false, null))).containsExactly(solved);
        assertThat(ids(new Filter(List.of(), null, "open", false, null)))
                .containsExactlyInAnyOrder(cornA, tomatoB, wheatB, hiddenOnly);
        assertThat(ids(new Filter(List.of(), null, null, true, null)))
                .containsExactlyInAnyOrder(tomatoB, wheatB, hiddenOnly);
        assertThat(ids(new Filter(List.of(), null, null, false, farmerA)))
                .containsExactlyInAnyOrder(tomatoA, cornA, hiddenOnly);
        assertThat(ids(new Filter(List.of("tomato", "corn"), regionA, "open", false, farmerA)))
                .containsExactly(cornA);
        assertThat(ids(new Filter(List.of("tomato"), regionB, null, true, farmerB))).containsExactly(tomatoB);
        assertThat(ids(Filter.NONE)).hasSize(5);
    }

    @Test
    void pagesByCursorWithoutRepeatsOrGapsWhenCreationTimesAreEqual() {
        List<UUID> all = new ArrayList<>();
        for (int i = 0; i < 7; i++) {
            all.add(ask(farmerA, "tomato"));
        }
        // four questions share one creation time, so only the id breaks the tie
        jdbc.update("UPDATE community_questions SET created_at = '2026-01-01T10:00:00Z' WHERE id = ANY(?)",
                (Object) all.subList(0, 4).toArray(UUID[]::new));
        jdbc.update("UPDATE community_questions SET created_at = '2026-01-02T10:00:00Z' WHERE id = ANY(?)",
                (Object) all.subList(4, 7).toArray(UUID[]::new));

        List<UUID> seen = new ArrayList<>();
        Cursor cursor = null;
        while (true) {
            List<Question> page = repository.feed(Filter.NONE, cursor, 2);
            page.forEach(q -> seen.add(q.id()));
            if (page.size() < 2) {
                break;
            }
            cursor = repository.cursorOf(page.get(page.size() - 1).id()).orElseThrow();
        }

        assertThat(seen).hasSize(7).doesNotHaveDuplicates().containsExactlyInAnyOrderElementsOf(all);
        assertThat(seen).isEqualTo(repository.feed(Filter.NONE, null, 50).stream().map(Question::id).toList());
        assertThat(repository.feed(Filter.NONE, null, 50).get(0).createdAt())
                .isAfterOrEqualTo(repository.feed(Filter.NONE, null, 50).get(6).createdAt());
    }

    @Test
    void cursorOnAHiddenQuestionStillPages() {
        UUID older = ask(farmerA, "tomato");
        UUID middle = ask(farmerA, "tomato");
        UUID newest = ask(farmerA, "tomato");
        hide("community_questions", middle);

        Cursor cursor = repository.cursorOf(middle).orElseThrow();

        assertThat(repository.feed(Filter.NONE, cursor, 10)).extracting(Question::id).containsExactly(older);
        assertThat(repository.feed(Filter.NONE, null, 10)).extracting(Question::id)
                .containsExactly(newest, older);
    }

    @Test
    void photosComeInPositionOrderForEveryQuestionInOneQuery() {
        UUID first = ask(farmerA, "tomato");
        UUID second = ask(farmerA, "tomato");
        UUID none = ask(farmerA, "tomato");
        UUID p1 = repository.insertPhoto(first, "community/a/1.jpg", "image/jpeg", 100, 1);
        UUID p0 = repository.insertPhoto(first, "community/a/0.png", "image/png", 50, 0);
        UUID q0 = repository.insertPhoto(second, "community/b/0.jpg", "image/jpeg", 70, 0);

        List<Photo> photos = repository.photos(List.of(first, second, none));

        assertThat(photos).extracting(Photo::id).containsExactly(p0, p1, q0).hasSize(3);
        assertThat(photos.get(0).key()).isEqualTo("community/a/0.png");
        assertThat(photos.get(0).contentType()).isEqualTo("image/png");
        assertThat(photos.get(0).sizeBytes()).isEqualTo(50);
        assertThat(photos.get(1).position()).isEqualTo(1);
        assertThat(repository.photos(List.of())).isEmpty();
    }

    @Test
    void lockReportsWhetherTheQuestionExists() {
        UUID id = ask(farmerA, "tomato");

        assertThat(repository.lock(id)).isTrue();
        assertThat(repository.lock(UUID.randomUUID())).isFalse();
    }

    private List<UUID> ids(Filter filter) {
        return repository.feed(filter, null, 50).stream().map(Question::id).toList();
    }

    private UUID ask(UUID author, String crop) {
        UUID id = UUID.randomUUID();
        assertThat(repository.insert(id, author, crop, null, "Title", "Body")).isTrue();
        return id;
    }

    private UUID answer(UUID question, UUID author) {
        return jdbc.queryForObject("""
                INSERT INTO community_answers (question_id, author_id, body) VALUES (?, ?, 'Answer')
                RETURNING id""", UUID.class, question, author);
    }

    private void hide(String table, UUID id) {
        jdbc.update("UPDATE " + table + " SET hidden_at = now(), hidden_by = ? WHERE id = ?", farmerA, id);
    }

    private UUID user(Long regionId) {
        seq++;
        return jdbc.queryForObject("""
                INSERT INTO users (phone, password_hash, full_name, region_id) VALUES (?, 'x', 'Test', ?)
                RETURNING id""", UUID.class, "+7704200%04d".formatted(seq), regionId);
    }
}
