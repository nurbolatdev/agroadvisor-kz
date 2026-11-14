package kz.agroadvisor.diagnosis.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import kz.agroadvisor.diagnosis.repository.DiagnosisReviewRepository.Review;
import kz.agroadvisor.diagnosis.service.DiagnosisReviewService.Effective;

class DiagnosisReviewEffectiveTest {

    private static Review review(String verdict, String code) {
        return new Review(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), verdict, code, null,
                Instant.now(), Instant.now());
    }

    @Test
    void noReviewsMeansNone() {
        assertThat(DiagnosisReviewService.effective(List.of())).isEqualTo(new Effective("none", null, 0));
    }

    @Test
    void oneDecisiveVerdictIsTheResult() {
        assertThat(DiagnosisReviewService.effective(List.of(review("confirmed", "potato__late_blight"))))
                .isEqualTo(new Effective("confirmed", "potato__late_blight", 1));
    }

    @Test
    void agreeingVerdictsAreTheResult() {
        assertThat(DiagnosisReviewService.effective(List.of(review("corrected", "potato__early_blight"),
                review("corrected", "potato__early_blight"))))
                .isEqualTo(new Effective("corrected", "potato__early_blight", 2));
    }

    @Test
    void unclearMarksDoNotContradictADecisiveVerdict() {
        assertThat(DiagnosisReviewService.effective(List.of(review("unclear", null),
                review("confirmed", "potato__late_blight"))))
                .isEqualTo(new Effective("confirmed", "potato__late_blight", 2));
    }

    @Test
    void onlyUnclearMarksAreUnclear() {
        assertThat(DiagnosisReviewService.effective(List.of(review("unclear", null), review("unclear", null))))
                .isEqualTo(new Effective("unclear", null, 2));
    }

    @Test
    void differentVerdictsOrClassesAreDisputed() {
        assertThat(DiagnosisReviewService.effective(List.of(review("confirmed", "potato__late_blight"),
                review("corrected", "potato__early_blight")))).isEqualTo(new Effective("disputed", null, 2));
        assertThat(DiagnosisReviewService.effective(List.of(review("corrected", "potato__early_blight"),
                review("corrected", "potato__healthy")))).isEqualTo(new Effective("disputed", null, 2));
    }
}
