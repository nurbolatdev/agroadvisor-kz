package kz.agroadvisor.diagnosis.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.diagnosis.model.ClassScore;
import kz.agroadvisor.diagnosis.model.Diagnosis;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class DiagnosisRepositoryTest {

    @Autowired
    DiagnosisRepository diagnoses;
    @Autowired
    UserRepository users;
    @Autowired
    EntityManager em;

    private UUID userId;

    @BeforeEach
    void createUser() {
        String phone = "+7703" + (1_000_000 + (int) (Math.random() * 8_999_999));
        userId = users.saveAndFlush(new User(Login.parse(phone), "x", "Farmer", "ru", Set.of(Role.FARMER))).getId();
    }

    private Diagnosis diagnosis(UUID owner, String code) {
        return new Diagnosis(owner, "tomato", "photos/" + code + ".jpg", "ok", code, new BigDecimal("0.9100"),
                List.of(new ClassScore(code, 0.91), new ClassScore("tomato__healthy", 0.05)), null,
                "placeholder-v0", 1, 12);
    }

    @Test
    void savesAndReadsTheResultWithItsTopThree() {
        Diagnosis saved = diagnoses.saveAndFlush(diagnosis(userId, "tomato__late_blight"));
        em.clear();

        Diagnosis loaded = diagnoses.findById(saved.getId()).orElseThrow();

        assertThat(loaded.getUserId()).isEqualTo(userId);
        assertThat(loaded.getTop1Confidence()).isEqualByComparingTo("0.91");
        assertThat(loaded.getTop3()).containsExactly(new ClassScore("tomato__late_blight", 0.91),
                new ClassScore("tomato__healthy", 0.05));
        assertThat(loaded.getModelVersion()).isEqualTo("placeholder-v0");
        assertThat(loaded.getCreatedAt()).isBetween(Instant.now().minusSeconds(60), Instant.now().plusSeconds(60));
    }

    private Diagnosis withKey(UUID owner, String code, String key) {
        return new Diagnosis(owner, "tomato", "photos/" + code + ".jpg", "ok", code, new BigDecimal("0.9100"),
                List.of(new ClassScore(code, 0.91)), null, "placeholder-v0", 1, 12, key,
                "0".repeat(64));
    }

    @Test
    void findsTheDiagnosisByItsOwnersKey() {
        Diagnosis saved = diagnoses.saveAndFlush(withKey(userId, "tomato__healthy", "key-12345678"));
        em.clear();

        assertThat(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678"))
                .get().extracting(Diagnosis::getId).isEqualTo(saved.getId());
        assertThat(diagnoses.findByUserIdAndIdempotencyKey(UUID.randomUUID(), "key-12345678")).isEmpty();
    }

    @Test
    void aKeyIsUniquePerUserButRowsWithoutAKeyDoNotCollide() {
        diagnoses.saveAndFlush(withKey(userId, "tomato__healthy", "key-12345678"));
        diagnoses.saveAndFlush(diagnosis(userId, "tomato__late_blight"));
        diagnoses.saveAndFlush(diagnosis(userId, "tomato__early_blight"));

        assertThatThrownBy(() -> diagnoses.saveAndFlush(withKey(userId, "tomato__late_blight", "key-12345678")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aKeyWithoutAPhotoFingerprintCannotBeSaved() {
        Diagnosis keyOnly = new Diagnosis(userId, "tomato", "photos/x.jpg", "ok", "tomato__healthy",
                new BigDecimal("0.9100"), List.of(new ClassScore("tomato__healthy", 0.91)), null, "placeholder-v0",
                1, 12, "key-12345678", null);

        assertThatThrownBy(() -> diagnoses.saveAndFlush(keyOnly)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aFingerprintWithoutAKeyIsFine() {
        Diagnosis fingerprintOnly = new Diagnosis(userId, "tomato", "photos/y.jpg", "ok", "tomato__healthy",
                new BigDecimal("0.9100"), List.of(new ClassScore("tomato__healthy", 0.91)), null, "placeholder-v0",
                1, 12, null, "0".repeat(64));

        assertThat(diagnoses.saveAndFlush(fingerprintOnly).getId()).isNotNull();
    }

    @Test
    void historyIsNewestFirstAndOnlyTheOwners() {
        UUID other = users.saveAndFlush(new User(Login.parse("+77049" + (100_000 + (int) (Math.random() * 899_999))),
                "x", "Other", "ru", Set.of(Role.FARMER))).getId();
        Diagnosis first = diagnoses.saveAndFlush(diagnosis(userId, "tomato__early_blight"));
        em.createNativeQuery("update diagnoses set created_at = now() - interval '1 hour' where id = :id")
                .setParameter("id", first.getId()).executeUpdate();
        Diagnosis second = diagnoses.saveAndFlush(diagnosis(userId, "tomato__late_blight"));
        diagnoses.saveAndFlush(diagnosis(other, "tomato__healthy"));
        em.clear();

        List<Diagnosis> history = diagnoses.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, 10));

        assertThat(history).extracting(Diagnosis::getId).containsExactly(second.getId(), first.getId());
    }
}
