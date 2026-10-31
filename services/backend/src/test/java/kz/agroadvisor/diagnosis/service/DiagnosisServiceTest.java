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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DiagnosisServiceTest {

    /** The first bytes of a real JPEG and PNG file; the service trusts these, not the client's header. */
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 1, 2, 3};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3};

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
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__late_blight", "efficientnet-b0-v3"));

        DiagnosisView view = service.create(userId, "tomato", JPEG);

        ArgumentCaptor<Diagnosis> saved = ArgumentCaptor.forClass(Diagnosis.class);
        verify(diagnoses).save(saved.capture());
        verify(photos).store(userId, JPEG, "image/jpeg");
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
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "placeholder-v0"));

        assertThat(service.create(userId, "tomato", JPEG).placeholder()).isTrue();
    }

    @Test
    void anUnknownClassIsSavedAndMarkedAsNotDescribedYet() {
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__brand_new", "efficientnet-b0-v3"));
        when(diseases.findAllById(any())).thenReturn(List.of());

        DiagnosisView view = service.create(userId, "tomato", JPEG);

        verify(diagnoses).save(any(Diagnosis.class));
        assertThat(view.descriptionReady()).isFalse();
    }

    @Test
    void aClassKnownToTheReferenceHasADescription() {
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__late_blight", "efficientnet-b0-v3"));
        Disease known = new Disease("tomato__late_blight", "tomato", "fungal", "high", "Phytophthora",
                Map.of("en", "Late blight"), Map.of(), null, null);
        when(diseases.findAllById(any())).thenReturn(List.of(known));

        assertThat(service.create(userId, "tomato", JPEG).descriptionReady()).isTrue();
    }

    @Test
    void recognizesAPngByItsBytes() {
        when(ai.predict("tomato", PNG)).thenReturn(prediction("tomato__healthy", "placeholder-v0"));

        service.create(userId, "tomato", PNG);

        verify(photos).store(userId, PNG, "image/png");
    }

    @Test
    void rejectsACropTheModelDoesNotSupportBeforeTouchingStorage() {
        assertThatThrownBy(() -> service.create(userId, "banana", JPEG))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getCode()).isEqualTo("unknown_crop");
                });
        verify(photos, never()).store(any(), any(), anyString());
        verify(diagnoses, never()).save(any(Diagnosis.class));
    }

    @Test
    void rejectsAnEmptyFileAndBytesThatAreNotAnImage() {
        for (byte[] bad : List.of(new byte[0], "not an image".getBytes(), new byte[] {(byte) 0xFF, (byte) 0xD8})) {
            assertThatThrownBy(() -> service.create(userId, "tomato", bad))
                    .isInstanceOfSatisfying(ApiException.class,
                            e -> assertThat(e.getCode()).isEqualTo("invalid_image"));
        }
        verify(photos, never()).store(any(), any(), anyString());
    }

    @Test
    void rejectsAPhotoOverTenMegabytes() {
        byte[] huge = new byte[10 * 1024 * 1024 + 1];
        System.arraycopy(JPEG, 0, huge, 0, JPEG.length);

        assertThatThrownBy(() -> service.create(userId, "tomato", huge))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("invalid_image"));
    }

    @Test
    void removesTheStoredPhotoWhenTheModelFails() {
        when(ai.predict("tomato", JPEG)).thenThrow(new IllegalStateException("model down"));

        assertThatThrownBy(() -> service.create(userId, "tomato", JPEG)).isInstanceOf(IllegalStateException.class);

        verify(photos).delete("diagnoses/key.jpg");
        verify(diagnoses, never()).save(any(Diagnosis.class));
    }

    @Test
    void removesTheStoredPhotoWhenSavingFailsAndKeepsTheOriginalError() {
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "placeholder-v0"));
        when(diagnoses.save(any(Diagnosis.class))).thenThrow(new IllegalStateException("db down"));
        doThrow(new IllegalStateException("s3 down")).when(photos).delete(eq("diagnoses/key.jpg"));

        assertThatThrownBy(() -> service.create(userId, "tomato", JPEG))
                .isInstanceOf(IllegalStateException.class).hasMessage("db down");

        verify(photos).delete("diagnoses/key.jpg");
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
