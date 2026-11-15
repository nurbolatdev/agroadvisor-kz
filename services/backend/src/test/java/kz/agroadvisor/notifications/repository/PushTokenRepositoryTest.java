package kz.agroadvisor.notifications.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.notifications.repository.PushTokenRepository.PushToken;

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
class PushTokenRepositoryTest {

    @Autowired
    private PushTokenRepository repository;
    @Autowired
    private JdbcTemplate jdbc;

    private UUID alice;
    private UUID bob;
    private int seq;

    @BeforeEach
    void setUp() {
        alice = user();
        bob = user();
    }

    @Test
    void upsertingTheSameTokenKeepsTheRowAndRefreshesTheTime() {
        PushToken first = repository.upsert(alice, "token-a", "android");
        PushToken second = repository.upsert(alice, "token-a", "android");

        assertThat(second.id()).isEqualTo(first.id());
        assertThat(second.createdAt()).isEqualTo(first.createdAt());
        assertThat(second.updatedAt()).isAfter(first.updatedAt());
        assertThat(count(alice)).isEqualTo(1);
    }

    @Test
    void aTokenRegisteredByAnotherUserMovesToThem() {
        PushToken first = repository.upsert(alice, "token-a", "android");
        PushToken moved = repository.upsert(bob, "token-a", "expo");

        assertThat(moved.id()).isEqualTo(first.id());
        assertThat(moved.userId()).isEqualTo(bob);
        assertThat(moved.platform()).isEqualTo("expo");
        assertThat(count(alice)).isZero();
        assertThat(count(bob)).isEqualTo(1);
    }

    @Test
    void trimKeepsTheNewestAndLeavesOthersAlone() {
        for (int i = 0; i < 11; i++) {
            repository.upsert(alice, "alice-" + i, "android");
        }
        repository.upsert(bob, "bob-0", "ios");

        int removed = repository.trimToNewest(alice, 10);

        assertThat(removed).isEqualTo(1);
        assertThat(count(alice)).isEqualTo(10);
        assertThat(exists("alice-0")).isFalse();
        assertThat(exists("alice-10")).isTrue();
        assertThat(count(bob)).isEqualTo(1);
    }

    @Test
    void deleteRemovesOnlyTheOwnersToken() {
        PushToken token = repository.upsert(alice, "token-a", "android");

        assertThat(repository.delete(bob, token.id())).isZero();
        assertThat(count(alice)).isEqualTo(1);
        assertThat(repository.delete(alice, token.id())).isEqualTo(1);
        assertThat(repository.delete(alice, token.id())).isZero();
    }

    @Test
    void lockUserRunsInsideATransaction() {
        repository.lockUser(alice);
    }

    private int count(UUID user) {
        return jdbc.queryForObject("SELECT count(*) FROM push_tokens WHERE user_id = ?", Integer.class, user);
    }

    private boolean exists(String token) {
        return jdbc.queryForObject("SELECT count(*) FROM push_tokens WHERE token = ?", Integer.class, token) > 0;
    }

    private UUID user() {
        seq++;
        return jdbc.queryForObject(
                "INSERT INTO users (phone, password_hash, full_name) VALUES (?, 'x', 'Test') RETURNING id",
                UUID.class, "+7704200%04d".formatted(seq));
    }
}
