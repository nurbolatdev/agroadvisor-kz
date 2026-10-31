package kz.agroadvisor.diagnosis.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;

import kz.agroadvisor.catalog.model.Disease;
import kz.agroadvisor.catalog.repository.DiseaseRepository;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.diagnosis.model.ClassScore;
import kz.agroadvisor.diagnosis.model.Diagnosis;
import kz.agroadvisor.diagnosis.repository.DiagnosisRepository;
import kz.agroadvisor.diagnosis.service.DiagnosisService.DiagnosisView;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DiagnosisServiceTest {

    private static final byte[] PHOTO = {1, 2, 3};

    private final AiClient ai = mock(AiClient.class);
    private final PhotoStorage photos = mock(PhotoStorage.class);
    private final DiagnosisRepository diagnoses = mock(DiagnosisRepository.class);
    private final DiseaseRepository diseases = mock(DiseaseRepository.class);
    private final DiagnosisService service = new DiagnosisService(ai, photos, diagnoses, diseases);
    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void wire() {
        when(ai.crops()).thenReturn(List.of("tomato", "potato"));
        when(photos.store(any(), any(), anyString())).thenReturn("diagnoses/key.jpg");
        when(diagnoses.save(any(Diagnosis.class))).thenAnswer(call -> call.getArgument(0));
    }

    private Prediction prediction(String topCode, String modelVersion) {
        ClassScore top = new ClassScore(topCode, 0.8);
        return new Prediction("ok", "tomato", top, List.of(top, new ClassScore("tomato__healthy", 0.1)), null,
                modelVersion, 3, 25);
    }

    @Test
    void storesThePhotoAsksTheModelAndSavesTheResult() {
        when(ai.predict("tomato", PHOTO)).thenReturn(prediction("tomato__late_blight", "efficientnet-b0-v3"));

        DiagnosisView view = service.create(userId, "tomato", PHOTO, "image/jpeg");

        ArgumentCaptor<Diagnosis> saved = ArgumentCaptor.forClass(Diagnosis.class);
        verify(diagnoses).save(saved.capture());
        assertThat(saved.getValue().getUserId()).isEqualTo(userId);
        assertThat(saved.getValue().getPhotoKey()).isEqualTo("diagnoses/key.jpg");
        assertThat(saved.getValue().getTop1Code()).isEqualTo("tomato__late_blight");
        assertThat(saved.getValue().getTop1Confidence()).isEqualByComparingTo(new BigDecimal("0.8"));
        assertThat(saved.getValue().getTop3()).hasSize(2);
        assertThat(saved.getValue().getModelVersion()).isEqualTo("efficientnet-b0-v3");
        assertThat(saved.getValue().getClassesVersion()).isEqualTo(3);
        assertThat(view.top1().code()).isEqualTo("tomato__late_blight");
        assertThat(view.placeholder()).isFalse();
    }

    @Test
    void aPlaceholderModelResultIsFlaggedSoItIsNotShownAsADiagnosis() {
        when(ai.predict("tomato", PHOTO)).thenReturn(prediction("tomato__healthy", "placeholder-v0"));

        DiagnosisView view = service.create(userId, "tomato", PHOTO, "image/jpeg");

        assertThat(view.placeholder()).isTrue();
    }

    @Test
    void anUnknownClassIsSavedAndMarkedAsNotDescribedYet() {
        when(ai.predict("tomato", PHOTO)).thenReturn(prediction("tomato__brand_new", "efficientnet-b0-v3"));
        when(diseases.findAllById(any())).thenReturn(List.of());

        DiagnosisView view = service.create(userId, "tomato", PHOTO, "image/jpeg");

        verify(diagnoses).save(any(Diagnosis.class));
        assertThat(view.descriptionReady()).isFalse();
    }

    @Test
    void aClassKnownToTheReferenceHasADescription() {
        when(ai.predict("tomato", PHOTO)).thenReturn(prediction("tomato__late_blight", "efficientnet-b0-v3"));
        Disease known = new Disease("tomato__late_blight", "tomato", "fungal", "high", "Phytophthora",
                Map.of("en", "Late blight"), Map.of(), null, null);
        when(diseases.findAllById(any())).thenReturn(List.of(known));

        assertThat(service.create(userId, "tomato", PHOTO, "image/jpeg").descriptionReady()).isTrue();
    }

    @Test
    void rejectsACropTheModelDoesNotSupportBeforeTouchingStorage() {
        assertThatThrownBy(() -> service.create(userId, "banana", PHOTO, "image/jpeg"))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getCode()).isEqualTo("unknown_crop");
                });
        verify(photos, never()).store(any(), any(), anyString());
        verify(diagnoses, never()).save(any(Diagnosis.class));
    }

    @Test
    void rejectsAnEmptyOrNotAnImageFile() {
        for (var bad : List.of(new Object[] {new byte[0], "image/jpeg"}, new Object[] {PHOTO, "text/plain"},
                new Object[] {PHOTO, null})) {
            assertThatThrownBy(() -> service.create(userId, "tomato", (byte[]) bad[0], (String) bad[1]))
                    .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("invalid_image"));
        }
        verify(photos, never()).store(any(), any(), anyString());
    }

    @Test
    void rejectsAPhotoOverTenMegabytes() {
        byte[] huge = new byte[10 * 1024 * 1024 + 1];

        assertThatThrownBy(() -> service.create(userId, "tomato", huge, "image/png"))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("invalid_image"));
    }

    @Test
    void historyIsTheCallersPageNewestFirst() {
        Diagnosis stored = new Diagnosis(userId, "tomato", "k.jpg", "ok", "tomato__healthy", new BigDecimal("0.99"),
                List.of(new ClassScore("tomato__healthy", 0.99)), null, "placeholder-v0", 1, 0);
        when(diagnoses.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(1, 5))).thenReturn(List.of(stored));
        when(diseases.findAllById(any())).thenReturn(List.of());

        List<DiagnosisView> history = service.history(userId, 1, 5);

        assertThat(history).hasSize(1);
        assertThat(history.get(0).top1()).isEqualTo(new ClassScore("tomato__healthy", 0.99));
        assertThat(history.get(0).placeholder()).isTrue();
    }
}
