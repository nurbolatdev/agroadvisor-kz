package kz.agroadvisor.diagnosis.service;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import kz.agroadvisor.catalog.model.Disease;
import kz.agroadvisor.catalog.repository.DiseaseRepository;
import kz.agroadvisor.common.image.ImageMetadataStripper;
import kz.agroadvisor.common.ratelimit.RateLimitProperties;
import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.diagnosis.config.DiagnosisProperties;
import kz.agroadvisor.diagnosis.model.ClassScore;
import kz.agroadvisor.diagnosis.model.Diagnosis;
import kz.agroadvisor.diagnosis.repository.DiagnosisClaims;
import kz.agroadvisor.diagnosis.repository.DiagnosisRepository;
import kz.agroadvisor.diagnosis.service.DiagnosisService.DiagnosisView;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DiagnosisServiceTest {

    /** The first bytes of a real JPEG and PNG file; the service trusts these, not the client's header. */
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xDB, 0, 2, (byte) 0xFF,
        (byte) 0xD9};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0, 'I', 'E',
        'N', 'D', (byte) 0xAE, 0x42, 0x60, (byte) 0x82};

    private final AiClient ai = mock(AiClient.class);
    private final PhotoStorage photos = mock(PhotoStorage.class);
    private final DiagnosisRepository diagnoses = mock(DiagnosisRepository.class);
    private final DiseaseRepository diseases = mock(DiseaseRepository.class);
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final RateLimiter limiter = mock(RateLimiter.class);
    private final DiagnosisClaims claims = mock(DiagnosisClaims.class);
    private final PlatformTransactionManager txManager = mock(PlatformTransactionManager.class);
    private final DiagnosisService service = new DiagnosisService(ai, photos, diagnoses, diseases, meters, limiter,
            new RateLimitProperties(5, 20), new ImageMetadataStripper(), claims, new TransactionTemplate(txManager),
            new DiagnosisProperties(Duration.ofSeconds(90)));
    private final UUID userId = UUID.randomUUID();
    private final UUID claimId = UUID.randomUUID();

    @BeforeEach
    void wire() {
        when(txManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(claims.tryClaim(any(), anyString(), anyString(), anyString())).thenReturn(Optional.of(claimId));
        when(claims.find(any(), anyString(), any())).thenReturn(Optional.empty());
        when(ai.crops()).thenReturn(List.of("tomato", "potato"));
        when(photos.store(any(), anyString(), any(), anyString())).thenReturn("diagnoses/key.jpg");
        when(diagnoses.saveAndFlush(any(Diagnosis.class))).thenAnswer(call -> call.getArgument(0));
    }

    /** A request without an Idempotency-Key. */
    private DiagnosisView create(String crop, byte[] photo) {
        return service.create(userId, crop, photo, null).view();
    }

    private Prediction prediction(String topCode, String modelVersion) {
        ClassScore top = new ClassScore(topCode, 0.8);
        return new Prediction("ok", "tomato", top, List.of(top, new ClassScore("tomato__healthy", 0.1)), null,
                modelVersion, 3, 25);
    }

    @Test
    void storesThePhotoAsksTheModelAndSavesTheResult() {
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__late_blight", "efficientnet-b0-v3"));

        DiagnosisView view = create("tomato", JPEG);

        ArgumentCaptor<Diagnosis> saved = ArgumentCaptor.forClass(Diagnosis.class);
        verify(diagnoses).saveAndFlush(saved.capture());
        verify(photos).store(eq(userId), anyString(), eq(JPEG), eq("image/jpeg"));
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

        assertThat(create("tomato", JPEG).placeholder()).isTrue();
    }

    @Test
    void anUnknownClassIsSavedAndMarkedAsNotDescribedYet() {
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__brand_new", "efficientnet-b0-v3"));
        when(diseases.findAllById(any())).thenReturn(List.of());

        DiagnosisView view = create("tomato", JPEG);

        verify(diagnoses).saveAndFlush(any(Diagnosis.class));
        assertThat(view.descriptionReady()).isFalse();
    }

    @Test
    void aClassKnownToTheReferenceHasADescription() {
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__late_blight", "efficientnet-b0-v3"));
        Disease known = new Disease("tomato__late_blight", "tomato", "fungal", "high", "Phytophthora",
                Map.of("en", "Late blight"), Map.of(), null, null);
        when(diseases.findAllById(any())).thenReturn(List.of(known));

        assertThat(create("tomato", JPEG).descriptionReady()).isTrue();
    }

    @Test
    void recognizesAPngByItsBytes() {
        when(ai.predict("tomato", PNG)).thenReturn(prediction("tomato__healthy", "placeholder-v0"));

        create("tomato", PNG);

        verify(photos).store(eq(userId), anyString(), eq(PNG), eq("image/png"));
    }

    @Test
    void rejectsACropTheModelDoesNotSupportBeforeTouchingStorage() {
        assertThatThrownBy(() -> create("banana", JPEG))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getCode()).isEqualTo("unknown_crop");
                });
        verify(photos, never()).store(any(), anyString(), any(), anyString());
        verify(diagnoses, never()).saveAndFlush(any(Diagnosis.class));
    }

    @Test
    void rejectsAnEmptyFileAndBytesThatAreNotAnImage() {
        for (byte[] bad : List.of(new byte[0], "not an image".getBytes(), new byte[] {(byte) 0xFF, (byte) 0xD8})) {
            assertThatThrownBy(() -> create("tomato", bad))
                    .isInstanceOfSatisfying(ApiException.class,
                            e -> assertThat(e.getCode()).isEqualTo("invalid_image"));
        }
        verify(photos, never()).store(any(), anyString(), any(), anyString());
    }

    @Test
    void rejectsAPhotoOverTenMegabytes() {
        byte[] huge = new byte[10 * 1024 * 1024 + 1];
        System.arraycopy(JPEG, 0, huge, 0, JPEG.length);

        assertThatThrownBy(() -> create("tomato", huge))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("invalid_image"));
    }

    @Test
    void storesNothingWhenTheModelFails() {
        when(ai.predict("tomato", JPEG)).thenThrow(new IllegalStateException("model down"));

        assertThatThrownBy(() -> create("tomato", JPEG)).isInstanceOf(IllegalStateException.class);

        verify(photos, never()).store(any(), anyString(), any(), anyString()); // the model is asked first
        verify(photos, never()).delete(anyString());
        verify(diagnoses, never()).saveAndFlush(any(Diagnosis.class));
    }

    @Test
    void removesTheStoredPhotoWhenSavingFailsAndKeepsTheOriginalError() {
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "placeholder-v0"));
        when(diagnoses.saveAndFlush(any(Diagnosis.class))).thenThrow(new IllegalStateException("db down"));
        doThrow(new IllegalStateException("s3 down")).when(photos).delete(eq("diagnoses/key.jpg"));

        assertThatThrownBy(() -> create("tomato", JPEG))
                .isInstanceOf(IllegalStateException.class).hasMessage("db down");

        verify(photos).delete("diagnoses/key.jpg");
    }

    @Test
    void keepsThePhotoWhenOnlyBuildingTheAnswerFailsAfterTheDiagnosisIsSaved() {
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__late_blight", "efficientnet-b0-v3"));
        when(diseases.findAllById(any())).thenThrow(new IllegalStateException("reference down"));

        assertThatThrownBy(() -> create("tomato", JPEG))
                .isInstanceOf(IllegalStateException.class).hasMessage("reference down");

        verify(diagnoses).saveAndFlush(any(Diagnosis.class)); // the row exists, so its photo must stay
        verify(photos, never()).delete(anyString());
    }

    @Test
    void removesTheUnkeyedPhotoWhenTheDiagnosisCannotBeSaved() {
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "placeholder-v0"));
        when(diagnoses.saveAndFlush(any(Diagnosis.class))).thenThrow(new IllegalStateException("db down"));

        assertThatThrownBy(() -> create("tomato", JPEG)).isInstanceOf(IllegalStateException.class);

        verify(photos).delete("diagnoses/key.jpg"); // no photo without a row (the name is random: ours alone)
    }

    @Test
    void keepsTheKeyedPhotoWhenTheDiagnosisCannotBeSaved() {
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "placeholder-v0"));
        when(diagnoses.saveAndFlush(any(Diagnosis.class))).thenThrow(new IllegalStateException("db down"));

        assertThatThrownBy(() -> service.create(userId, "tomato", JPEG, "key-12345678"))
                .isInstanceOf(IllegalStateException.class);

        verify(photos, never()).delete(anyString()); // another attempt may use the same object
        verify(claims).release(userId, "key-12345678", claimId);
    }

    private Diagnosis storedWithKey(String key) {
        return new Diagnosis(userId, "tomato", "k.jpg", "ok", "tomato__healthy", new BigDecimal("0.99"),
                List.of(new ClassScore("tomato__healthy", 0.99)), null, "efficientnet-b0-v3", 3, 25, key,
                DiagnosisService.fingerprint(JPEG));
    }

    @Test
    void aRepeatedKeyReturnsTheFirstDiagnosisWithoutStoringAPhotoOrCallingTheModel() {
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678"))
                .thenReturn(Optional.of(storedWithKey("key-12345678")));
        when(diseases.findAllById(any())).thenReturn(List.of());

        DiagnosisService.Created created = service.create(userId, "tomato", JPEG, "key-12345678");

        assertThat(created.replayed()).isTrue();
        assertThat(created.view().top1().code()).isEqualTo("tomato__healthy");
        verify(photos, never()).store(any(), anyString(), any(), anyString());
        verify(ai, never()).predict(anyString(), any());
        verify(diagnoses, never()).saveAndFlush(any(Diagnosis.class));
        assertThat(meters.counter("agroadvisor.diagnosis.replays").count()).isEqualTo(1.0);
    }

    @Test
    void aFirstRequestWithAKeySavesItWithTheKey() {
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678")).thenReturn(Optional.empty());
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__late_blight", "efficientnet-b0-v3"));

        DiagnosisService.Created created = service.create(userId, "tomato", JPEG, "key-12345678");

        ArgumentCaptor<Diagnosis> saved = ArgumentCaptor.forClass(Diagnosis.class);
        verify(diagnoses).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getIdempotencyKey()).isEqualTo("key-12345678");
        assertThat(created.replayed()).isFalse();
    }

    @Test
    void withoutAKeyNothingIsLookedUp() {
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "efficientnet-b0-v3"));

        assertThat(service.create(userId, "tomato", JPEG, null).replayed()).isFalse();

        verify(diagnoses, never()).findByUserIdAndIdempotencyKey(any(), anyString());
    }

    @Test
    void whenTwoRequestsRaceTheLoserReturnsTheWinnersRowAndLeavesThePhotoAlone() {
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678"))
                .thenReturn(Optional.empty(), Optional.of(storedWithKey("key-12345678")));
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "efficientnet-b0-v3"));
        when(diagnoses.saveAndFlush(any(Diagnosis.class))).thenThrow(new DataIntegrityViolationException("unique"));
        when(diseases.findAllById(any())).thenReturn(List.of());

        DiagnosisService.Created created = service.create(userId, "tomato", JPEG, "key-12345678");

        assertThat(created.replayed()).isTrue();
        // With a key the object has the winner's name and bytes: deleting it would delete the winner's photo
        verify(photos, never()).delete(anyString());
        verify(claims).release(userId, "key-12345678", claimId);
    }

    @Test
    void theObjectNameIsTheSameForTheSameKeyAndPhotoAndDiffersWhenEitherChanges() {
        String fingerprint = DiagnosisService.fingerprint(JPEG);
        String other = DiagnosisService.fingerprint(PNG);

        String name = DiagnosisService.objectName("key-12345678", fingerprint);

        assertThat(name).matches("[0-9a-f]{64}");
        assertThat(DiagnosisService.objectName("key-12345678", fingerprint)).isEqualTo(name);
        assertThat(DiagnosisService.objectName("key-12345678", other)).isNotEqualTo(name);
        assertThat(DiagnosisService.objectName("key-87654321", fingerprint)).isNotEqualTo(name);
    }

    @Test
    void withoutAKeyEveryObjectNameIsNew() {
        assertThat(DiagnosisService.objectName(null, "x"))
                .isNotEqualTo(DiagnosisService.objectName(null, "x"));
    }

    @Test
    void aRequestWithAKeyStoresUnderTheNameBuiltFromTheKeyAndThePhoto() {
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678")).thenReturn(Optional.empty());
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "efficientnet-b0-v3"));

        service.create(userId, "tomato", JPEG, "key-12345678");

        verify(photos).store(userId, DiagnosisService.objectName("key-12345678", DiagnosisService.fingerprint(JPEG)),
                JPEG, "image/jpeg");
    }

    @Test
    void aWorkingRequestWithTheSameKeyIs409WithRetryAfterAndSpendsNoLimitAndNoModelCall() {
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678")).thenReturn(Optional.empty());
        when(claims.find(any(), anyString(), any())).thenReturn(
                Optional.of(new DiagnosisClaims.Existing(DiagnosisService.fingerprint(JPEG), "tomato", false)));

        assertThatThrownBy(() -> service.create(userId, "tomato", JPEG, "key-12345678"))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(e.getCode()).isEqualTo("request_in_progress");
                    assertThat(e.getHeaders()).containsEntry("Retry-After", "2");
                });

        verify(limiter, never()).check(anyString(), anyString(), anyInt(), any());
        verify(photos, never()).store(any(), anyString(), any(), anyString());
        verify(ai, never()).predict(anyString(), any());
        verify(claims, never()).tryClaim(any(), anyString(), anyString(), anyString());
    }

    /** The order that would call the model twice: the first lookup misses, the other request commits, our claim wins. */
    @Test
    void aDiagnosisCommittedJustBeforeOurClaimIsReplayedWithoutCallingTheModel() {
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678"))
                .thenReturn(Optional.empty(), Optional.of(storedWithKey("key-12345678")));
        when(diseases.findAllById(any())).thenReturn(List.of());

        DiagnosisService.Created created = service.create(userId, "tomato", JPEG, "key-12345678");

        assertThat(created.replayed()).isTrue();
        verify(ai, never()).predict(anyString(), any());
        verify(photos, never()).store(any(), anyString(), any(), anyString());
        verify(claims).release(userId, "key-12345678", claimId);
    }

    @Test
    void whenTheClaimIsLostAndThenFreedTheRequestTriesAgain() {
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678")).thenReturn(Optional.empty());
        when(claims.tryClaim(any(), anyString(), anyString(), anyString()))
                .thenReturn(Optional.empty(), Optional.of(claimId));
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "efficientnet-b0-v3"));

        assertThat(service.create(userId, "tomato", JPEG, "key-12345678").replayed()).isFalse();

        verify(claims, times(2)).tryClaim(any(), anyString(), anyString(), anyString());
    }

    @Test
    void anExpiredClaimIsTakenOverForTheSamePhoto() {
        UUID taken = UUID.randomUUID();
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678")).thenReturn(Optional.empty());
        when(claims.find(any(), anyString(), any())).thenReturn(
                Optional.of(new DiagnosisClaims.Existing(DiagnosisService.fingerprint(JPEG), "tomato", true)));
        when(claims.tryClaim(any(), anyString(), anyString(), anyString())).thenReturn(Optional.empty());
        when(claims.takeOver(eq(userId), eq("key-12345678"), eq(DiagnosisService.fingerprint(JPEG)), eq("tomato"),
                any())).thenReturn(Optional.of(taken));
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "efficientnet-b0-v3"));

        service.create(userId, "tomato", JPEG, "key-12345678");

        verify(claims).release(userId, "key-12345678", taken);
        assertThat(meters.counter("agroadvisor.diagnosis.claims", "outcome", "taken_over").count()).isEqualTo(1.0);
    }

    @Test
    void aFailureOfTheModelReleasesTheClaimButKeepsTheKeyedPhoto() {
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678")).thenReturn(Optional.empty());
        when(ai.predict("tomato", JPEG)).thenThrow(new IllegalStateException("model down"));

        assertThatThrownBy(() -> service.create(userId, "tomato", JPEG, "key-12345678"))
                .isInstanceOf(IllegalStateException.class);

        verify(claims).release(userId, "key-12345678", claimId);
        verify(photos, never()).delete(anyString()); // a retry writes the same object again
    }

    @Test
    void aConstraintViolationWithoutAKeyIsNotHidden() {
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "efficientnet-b0-v3"));
        when(diagnoses.saveAndFlush(any(Diagnosis.class))).thenThrow(new DataIntegrityViolationException("other"));

        assertThatThrownBy(() -> service.create(userId, "tomato", JPEG, null))
                .isInstanceOf(DataIntegrityViolationException.class);
        verify(photos).delete("diagnoses/key.jpg");
    }

    @Test
    void aKeyUsedForAnotherCropIsRejected() {
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678"))
                .thenReturn(Optional.of(storedWithKey("key-12345678")));

        assertThatThrownBy(() -> service.create(userId, "potato", JPEG, "key-12345678"))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_CONTENT);
                    assertThat(e.getCode()).isEqualTo("idempotency_key_reused");
                    assertThat(e.getReason()).isEqualTo("crop");
                });
        verify(ai, never()).predict(anyString(), any());
    }

    @Test
    void aKeyUsedForAnotherPhotoOfTheSameCropIsRejected() {
        byte[] otherPhoto = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 9, 9, 9};
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678"))
                .thenReturn(Optional.of(storedWithKey("key-12345678")));

        assertThatThrownBy(() -> service.create(userId, "tomato", otherPhoto, "key-12345678"))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_CONTENT);
                    assertThat(e.getCode()).isEqualTo("idempotency_key_reused");
                    assertThat(e.getReason()).isEqualTo("photo");
                });
        verify(photos, never()).store(any(), anyString(), any(), anyString());
        verify(ai, never()).predict(anyString(), any());
    }

    @Test
    void theSavedRowKeepsTheFingerprintOfThePhoto() {
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "efficientnet-b0-v3"));

        service.create(userId, "tomato", JPEG, "key-12345678");

        ArgumentCaptor<Diagnosis> saved = ArgumentCaptor.forClass(Diagnosis.class);
        verify(diagnoses).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getRequestFingerprint()).hasSize(64)
                .isEqualTo(DiagnosisService.fingerprint(JPEG));
    }

    /** SOI, an APP1 segment with GPS text, then the scan: what a phone camera sends. */
    private static final byte[] JPEG_WITH_GPS = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE1, 0, 8, 'E', 'x',
        'i', 'f', 'G', 'P', (byte) 0xFF, (byte) 0xDA, 0, 2, 7, (byte) 0xFF, (byte) 0xD9};
    private static final byte[] JPEG_WITHOUT_GPS = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xDA, 0, 2, 7,
        (byte) 0xFF, (byte) 0xD9};

    @Test
    void storesAndSendsToTheModelOnlyThePhotoWithoutMetadata() {
        when(ai.predict("tomato", JPEG_WITHOUT_GPS)).thenReturn(prediction("tomato__healthy", "efficientnet-b0-v3"));

        service.create(userId, "tomato", JPEG_WITH_GPS, null);

        verify(photos).store(eq(userId), anyString(), eq(JPEG_WITHOUT_GPS), eq("image/jpeg"));
        verify(ai).predict("tomato", JPEG_WITHOUT_GPS);
    }

    @Test
    void theFingerprintIsOfTheBytesTheClientSent() {
        when(ai.predict("tomato", JPEG_WITHOUT_GPS)).thenReturn(prediction("tomato__healthy", "efficientnet-b0-v3"));

        service.create(userId, "tomato", JPEG_WITH_GPS, "key-12345678");

        ArgumentCaptor<Diagnosis> saved = ArgumentCaptor.forClass(Diagnosis.class);
        verify(diagnoses).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getRequestFingerprint()).isEqualTo(DiagnosisService.fingerprint(JPEG_WITH_GPS));
    }

    @Test
    void aRepeatWithTheSameOriginalBytesIsAReplayNotAnError() {
        Diagnosis first = new Diagnosis(userId, "tomato", "diagnoses/key.jpg", "ok", "tomato__healthy",
                BigDecimal.valueOf(0.8), List.of(), null, "efficientnet-b0-v3", 3, 25, "key-12345678",
                DiagnosisService.fingerprint(JPEG_WITH_GPS));
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678")).thenReturn(Optional.of(first));
        when(diseases.findAllById(any())).thenReturn(List.of());

        DiagnosisService.Created created = service.create(userId, "tomato", JPEG_WITH_GPS, "key-12345678");

        assertThat(created.replayed()).isTrue();
        verify(photos, never()).store(any(), anyString(), any(), anyString());
    }

    @Test
    void aBrokenJpegIsInvalidImageAndNothingIsStored() {
        byte[] broken = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE1, 0x7F, 0, 1, 2, 3};

        assertThatThrownBy(() -> create("tomato", broken)).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.getCode()).isEqualTo(DiagnosisErrors.INVALID_IMAGE));
        verify(photos, never()).store(any(), anyString(), any(), anyString());
        verify(ai, never()).predict(anyString(), any());
    }

    @Test
    void aReplaySpendsNoDiagnosisLimit() {
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678"))
                .thenReturn(Optional.of(storedWithKey("key-12345678")));
        when(diseases.findAllById(any())).thenReturn(List.of());

        assertThat(service.create(userId, "tomato", JPEG, "key-12345678").replayed()).isTrue();

        verify(limiter, never()).check(anyString(), anyString(), anyInt(), any(Duration.class));
    }

    /** The limiter counts the call and hands back what it counted; the tests watch whether it is given back. */
    private RateLimiter.Ticket spendsATicket() {
        RateLimiter.Ticket ticket = new RateLimiter.Ticket("agroadvisor:ratelimit:diagnosis:" + userId + ":1");
        when(limiter.check(anyString(), anyString(), anyInt(), any(Duration.class))).thenReturn(ticket);
        return ticket;
    }

    @Test
    void theAttemptsAreCheckedBeforeTheDiagnosisTokenIsSpentAndARefusedAttemptSpendsNone() {
        doThrow(new ApiException(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", "Too many requests")).when(limiter)
                .check(eq("diagnosis-attempts"), anyString(), eq(20), any(Duration.class));

        assertThatThrownBy(() -> create("tomato", JPEG))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("rate_limited"));

        verify(limiter).check("diagnosis-attempts", userId.toString(), 20, Duration.ofMinutes(1));
        verify(limiter, never()).check(eq("diagnosis"), anyString(), anyInt(), any(Duration.class));
        verify(limiter, never()).refund(any());
        verify(ai, never()).predict(anyString(), any());
    }

    @Test
    void theAttemptIsNeverRefundedOnlyTheDiagnosisToken() {
        RateLimiter.Ticket attempt = new RateLimiter.Ticket("attempts-key");
        RateLimiter.Ticket token = new RateLimiter.Ticket("diagnosis-key");
        when(limiter.check(eq("diagnosis-attempts"), anyString(), anyInt(), any(Duration.class))).thenReturn(attempt);
        when(limiter.check(eq("diagnosis"), anyString(), anyInt(), any(Duration.class))).thenReturn(token);
        when(ai.predict("tomato", JPEG)).thenThrow(new ApiException(HttpStatus.BAD_GATEWAY, "ai_error", "Bad"));

        assertThatThrownBy(() -> create("tomato", JPEG)).isInstanceOf(ApiException.class);

        verify(limiter).refund(token);
        verify(limiter, never()).refund(attempt);
    }

    @Test
    void aReplayAsksForTheRefundExactlyOnce() {
        RateLimiter.Ticket ticket = spendsATicket();
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678"))
                .thenReturn(Optional.empty(), Optional.of(storedWithKey("key-12345678")));
        when(diseases.findAllById(any())).thenReturn(List.of());

        service.create(userId, "tomato", JPEG, "key-12345678");

        verify(limiter, times(1)).refund(ticket);
    }

    @Test
    void aFinishedDiagnosisKeepsTheToken() {
        RateLimiter.Ticket ticket = spendsATicket();
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "efficientnet-b0-v3"));

        create("tomato", JPEG);

        verify(limiter, never()).refund(ticket);
    }

    @Test
    void aModelThatIsDownGivesTheTokenBack() {
        RateLimiter.Ticket ticket = spendsATicket();
        when(ai.predict("tomato", JPEG))
                .thenThrow(new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "ai_unavailable", "AI is down"));

        assertThatThrownBy(() -> create("tomato", JPEG)).isInstanceOf(ApiException.class);

        verify(limiter).refund(ticket);
    }

    @Test
    void anUnexpectedModelFailureGivesTheTokenBack() {
        RateLimiter.Ticket ticket = spendsATicket();
        when(ai.predict("tomato", JPEG)).thenThrow(new IllegalStateException("boom"));

        assertThatThrownBy(() -> create("tomato", JPEG)).isInstanceOf(IllegalStateException.class);

        verify(limiter).refund(ticket);
    }

    @Test
    void aStorageFailureGivesTheTokenBack() {
        RateLimiter.Ticket ticket = spendsATicket();
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "efficientnet-b0-v3"));
        when(photos.store(any(), anyString(), any(), anyString())).thenThrow(new IllegalStateException("s3 down"));

        assertThatThrownBy(() -> create("tomato", JPEG)).isInstanceOf(IllegalStateException.class);

        verify(limiter).refund(ticket);
    }

    @Test
    void aPhotoTheModelFindsTooPoorKeepsTheTokenSoAFloodOfThemIsStillLimited() {
        RateLimiter.Ticket ticket = spendsATicket();
        when(ai.predict("tomato", JPEG))
                .thenThrow(new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "low_quality", "Too blurry"));

        assertThatThrownBy(() -> create("tomato", JPEG)).isInstanceOf(ApiException.class);

        verify(limiter, never()).refund(ticket);
    }

    @Test
    void anUnknownCropAndANonImageKeepTheToken() {
        RateLimiter.Ticket ticket = spendsATicket();

        assertThatThrownBy(() -> create("banana", JPEG)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> create("tomato", new byte[] {1, 2, 3})).isInstanceOf(ApiException.class);

        verify(limiter, never()).refund(ticket);
    }

    @Test
    void aBadGatewayFromTheModelGivesTheTokenBack() {
        RateLimiter.Ticket ticket = spendsATicket();
        when(ai.predict("tomato", JPEG)).thenThrow(new ApiException(HttpStatus.BAD_GATEWAY, "ai_error", "Bad answer"));

        assertThatThrownBy(() -> create("tomato", JPEG)).isInstanceOf(ApiException.class);

        verify(limiter).refund(ticket);
    }

    @Test
    void aStorageThatIsUnavailableGivesTheTokenBack() {
        RateLimiter.Ticket ticket = spendsATicket();
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "efficientnet-b0-v3"));
        when(photos.store(any(), anyString(), any(), anyString()))
                .thenThrow(new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "storage_unavailable", "Storage is down"));

        assertThatThrownBy(() -> create("tomato", JPEG)).isInstanceOf(ApiException.class);

        verify(limiter).refund(ticket);
    }

    @Test
    void aKeyUsedForAnotherCropFoundOnlyWhenTheClaimIsTakenKeepsTheToken() {
        RateLimiter.Ticket ticket = spendsATicket();
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678")).thenReturn(Optional.empty());
        // nothing at the first look (before the limit); a claim for another crop when ours is refused
        when(claims.find(any(), anyString(), any())).thenReturn(Optional.empty(),
                Optional.of(new DiagnosisClaims.Existing(DiagnosisService.fingerprint(JPEG), "potato", false)));
        when(claims.tryClaim(any(), anyString(), anyString(), anyString())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.create(userId, "tomato", JPEG, "key-12345678"))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("idempotency_key_reused"));

        verify(limiter, never()).refund(ticket);
    }

    @Test
    void aRequestThatLosesTheInsertToTheOtherRequestAndReturnsItsRowGivesTheTokenBack() {
        RateLimiter.Ticket ticket = spendsATicket();
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678"))
                .thenReturn(Optional.empty(), Optional.empty(), Optional.of(storedWithKey("key-12345678")));
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "efficientnet-b0-v3"));
        when(diagnoses.saveAndFlush(any(Diagnosis.class))).thenThrow(new DataIntegrityViolationException("unique"));
        when(diseases.findAllById(any())).thenReturn(List.of());

        assertThat(service.create(userId, "tomato", JPEG, "key-12345678").replayed()).isTrue();

        verify(limiter).refund(ticket);
    }

    @Test
    void aDiagnosisThatIsSavedKeepsTheTokenEvenIfBuildingTheAnswerFails() {
        RateLimiter.Ticket ticket = spendsATicket();
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "efficientnet-b0-v3"));
        when(diseases.findAllById(any())).thenThrow(new IllegalStateException("reference down"));

        assertThatThrownBy(() -> create("tomato", JPEG)).isInstanceOf(IllegalStateException.class);

        verify(diagnoses).saveAndFlush(any(Diagnosis.class));
        verify(limiter, never()).refund(ticket);
    }

    @Test
    void aRequestThatLosesTheClaimInTheRaceAt409GivesTheTokenBack() {
        RateLimiter.Ticket ticket = spendsATicket();
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678")).thenReturn(Optional.empty());
        // no live claim at the first look (before the limit), a live one when ours is refused
        when(claims.find(any(), anyString(), any())).thenReturn(Optional.empty(),
                Optional.of(new DiagnosisClaims.Existing(DiagnosisService.fingerprint(JPEG), "tomato", false)));
        when(claims.tryClaim(any(), anyString(), anyString(), anyString())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.create(userId, "tomato", JPEG, "key-12345678"))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("request_in_progress"));

        verify(limiter).refund(ticket);
        verify(ai, never()).predict(anyString(), any());
    }

    @Test
    void aReplayFoundAfterTheTokenWasSpentGivesTheTokenBack() {
        RateLimiter.Ticket ticket = spendsATicket();
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678"))
                .thenReturn(Optional.empty(), Optional.of(storedWithKey("key-12345678")));
        when(diseases.findAllById(any())).thenReturn(List.of());

        assertThat(service.create(userId, "tomato", JPEG, "key-12345678").replayed()).isTrue();

        verify(limiter).refund(ticket);
    }

    @Test
    void aNewDiagnosisSpendsOneTokenOfTheCallersLimit() {
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "efficientnet-b0-v3"));

        create("tomato", JPEG);

        verify(limiter).check("diagnosis", userId.toString(), 5, Duration.ofMinutes(1));
    }

    @Test
    void theLimitIsCheckedAfterTheKeyLookupAndBeforeAnythingIsStoredOrAsked() {
        when(diagnoses.findByUserIdAndIdempotencyKey(userId, "key-12345678")).thenReturn(Optional.empty());
        doThrow(new ApiException(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", "Too many requests"))
                .when(limiter).check(anyString(), anyString(), anyInt(), any(Duration.class));

        assertThatThrownBy(() -> service.create(userId, "tomato", JPEG, "key-12345678"))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("rate_limited"));

        InOrder order = inOrder(diagnoses, limiter);
        order.verify(diagnoses).findByUserIdAndIdempotencyKey(userId, "key-12345678");
        order.verify(limiter).check(anyString(), anyString(), anyInt(), any(Duration.class));
        verify(photos, never()).store(any(), anyString(), any(), anyString());
        verify(ai, never()).predict(anyString(), any());
    }

    @Test
    void rejectsAMalformedKeyBeforeTouchingAnything() {
        for (String bad : List.of("short", "has space in it", "x".repeat(81), "кириллица-ключ-1")) {
            assertThatThrownBy(() -> service.create(userId, "tomato", JPEG, bad))
                    .isInstanceOfSatisfying(ApiException.class, e -> {
                        assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                        assertThat(e.getCode()).isEqualTo("invalid_idempotency_key");
                    });
        }
        verify(photos, never()).store(any(), anyString(), any(), anyString());
    }

    @Test
    void timesTheModelCallByOutcomeAndStatus() {
        when(ai.predict("tomato", JPEG)).thenReturn(prediction("tomato__healthy", "efficientnet-b0-v3"));

        create("tomato", JPEG);

        assertThat(meters.get("agroadvisor.ai.predict").tag("outcome", "ok").tag("code", "ok").timer().count())
                .isEqualTo(1);
    }

    @Test
    void countsModelFailuresByTheErrorCodeTheFarmerGets() {
        when(ai.predict("tomato", JPEG)).thenThrow(
                new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "ai_unavailable", "AI is down"),
                new IllegalStateException("boom"));

        assertThatThrownBy(() -> create("tomato", JPEG)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> create("tomato", JPEG)).isInstanceOf(IllegalStateException.class);

        assertThat(meters.get("agroadvisor.ai.predict").tag("outcome", "error").tag("code", "ai_unavailable")
                .timer().count()).isEqualTo(1);
        assertThat(meters.get("agroadvisor.ai.predict").tag("outcome", "error").tag("code", "internal_error")
                .timer().count()).isEqualTo(1);
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
