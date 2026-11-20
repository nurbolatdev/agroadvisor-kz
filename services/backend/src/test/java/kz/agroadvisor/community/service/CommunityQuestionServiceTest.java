package kz.agroadvisor.community.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import kz.agroadvisor.common.image.ImageMetadataStripper;
import kz.agroadvisor.common.ratelimit.RateLimitProperties;
import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.community.repository.CommunityQuestionRepository;
import kz.agroadvisor.community.repository.CommunityQuestionRepository.Question;
import kz.agroadvisor.community.service.CommunityQuestionService.FeedFilter;
import kz.agroadvisor.diagnosis.model.ClassScore;
import kz.agroadvisor.diagnosis.service.DiagnosisErrors;
import kz.agroadvisor.diagnosis.service.DiagnosisService;
import kz.agroadvisor.diagnosis.service.DiagnosisService.DiagnosisView;

class CommunityQuestionServiceTest {

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 1, 2, 3};
    private static final byte[] PDF = {'%', 'P', 'D', 'F', '-', '1', '.', '7'};

    private final CommunityQuestionRepository questions = mock(CommunityQuestionRepository.class);
    private final DiagnosisService diagnoses = mock(DiagnosisService.class);
    private final CommunityPhotoStorage storage = mock(CommunityPhotoStorage.class);
    private final ImageMetadataStripper stripper = mock(ImageMetadataStripper.class);
    private final RateLimiter rateLimiter = mock(RateLimiter.class);
    private final RateLimitProperties limits = mock(RateLimitProperties.class);
    private final TransactionTemplate tx = new TransactionTemplate(mock(PlatformTransactionManager.class));
    private final CommunityQuestionService service = new CommunityQuestionService(questions, diagnoses, storage,
            stripper, rateLimiter, limits, tx);

    private final UUID me = UUID.randomUUID();

    @Test
    void theLimitIsCheckedAfterValidationAndBeforeTheUpload() {
        when(questions.cropExists("potato")).thenReturn(true);
        when(questions.userHasRegion(me)).thenReturn(true);
        when(stripper.strip(any())).thenReturn(JPEG);
        when(storage.store(any(), any(), anyString())).thenReturn("community/q/a.jpg");
        when(questions.insert(any(), eq(me), eq("potato"), any(), anyString(), anyString())).thenReturn(true);
        when(questions.findVisible(any())).thenAnswer(i -> Optional.of(question(i.getArgument(0), me, null)));

        service.ask(me, " Spots on leaves ", "Brown\tspots\nappeared", "potato", null, List.of(JPEG));

        InOrder order = inOrder(rateLimiter, storage, questions);
        order.verify(questions).userHasRegion(me);
        order.verify(rateLimiter).check("community-questions", me.toString(), 0, Duration.ofHours(1));
        order.verify(storage).store(any(), any(), eq("image/jpeg"));
        order.verify(questions).insert(any(), eq(me), eq("potato"), any(), eq("Spots on leaves"), anyString());
        order.verify(questions).insertPhoto(any(), eq("community/q/a.jpg"), eq("image/jpeg"), anyInt(), eq(0));
    }

    @Test
    void anInvalidQuestionNeverReachesTheLimitOrTheStorage() {
        when(questions.cropExists("potato")).thenReturn(true);

        assertCode(() -> service.ask(me, "ab", "text", "potato", null, List.of()), "validation_failed");
        assertCode(() -> service.ask(me, "Title", " ", "potato", null, List.of()), "validation_failed");
        assertCode(() -> service.ask(me, "Title", "bad\u0000text", "potato", null, List.of()), "validation_failed");
        assertCode(() -> service.ask(me, "Title", "text", "banana", null, List.of()), "validation_failed");
        // A title is one line: neither a line break nor a tab
        assertCode(() -> service.ask(me, "Two\nlines", "text", "potato", null, List.of()), "validation_failed");
        assertCode(() -> service.ask(me, "Tab\there", "text", "potato", null, List.of()), "validation_failed");

        verifyNoInteractions(rateLimiter, storage);
    }

    @Test
    void controlCharactersAreForbiddenInATitleAndOnlyNewlineAndTabAreAllowedInATextAndAnAnswer() {
        assertThat(CommunityQuestionService.hasControlChars("a\tb\nc", true)).isFalse();
        assertThat(CommunityQuestionService.hasControlChars("a\tb", false)).isTrue();
        assertThat(CommunityQuestionService.hasControlChars("a\nb", false)).isTrue();
        assertThat(CommunityQuestionService.hasControlChars("a\u0000b", true)).isTrue();
        assertThat(CommunityQuestionService.hasControlChars("a\u0007b", true)).isTrue();
    }

    @Test
    void aUserWithoutARegionUsesNoAttemptAndUploadsNothing() {
        when(questions.cropExists("potato")).thenReturn(true);
        when(questions.userHasRegion(me)).thenReturn(false);

        assertCode(() -> service.ask(me, "Title", "text", "potato", null, List.of(JPEG)), "region_required");

        verifyNoInteractions(rateLimiter, storage, stripper);
        verify(questions, never()).insert(any(), any(), anyString(), any(), anyString(), anyString());
    }

    @Test
    void fourPhotosAndAPdfPretendingToBeAPhotoAreRejected() {
        when(questions.cropExists("potato")).thenReturn(true);

        assertCode(() -> service.ask(me, "Title", "text", "potato", null, List.of(JPEG, JPEG, JPEG, JPEG)),
                "invalid_image");
        assertCode(() -> service.ask(me, "Title", "text", "potato", null, List.of(JPEG, PDF)), "invalid_image");

        verifyNoInteractions(rateLimiter, storage);
    }

    @Test
    void aForeignDiagnosisIsNotFoundAndAnotherCropIsRejected() {
        UUID diagnosisId = UUID.randomUUID();
        when(questions.cropExists("potato")).thenReturn(true);
        when(diagnoses.get(me, diagnosisId)).thenThrow(new ApiException(HttpStatus.NOT_FOUND,
                DiagnosisErrors.DIAGNOSIS_NOT_FOUND, "not found"));
        assertCode(() -> service.ask(me, "Title", "text", "potato", diagnosisId, List.of()),
                "diagnosis_not_found");

        UUID tomato = UUID.randomUUID();
        when(diagnoses.get(me, tomato)).thenReturn(diagnosis("tomato"));
        assertCode(() -> service.ask(me, "Title", "text", "potato", tomato, List.of()), "validation_failed");

        verifyNoInteractions(rateLimiter, storage);
    }

    @Test
    void uploadedObjectsAreRemovedWhenTheInsertFails() {
        when(questions.cropExists("potato")).thenReturn(true);
        when(questions.userHasRegion(me)).thenReturn(true);
        when(stripper.strip(any())).thenReturn(JPEG);
        when(storage.store(any(), any(), anyString())).thenReturn("community/q/a.jpg", "community/q/b.jpg");
        when(questions.insert(any(), any(), anyString(), any(), anyString(), anyString()))
                .thenThrow(new IllegalStateException("db down"));

        assertThatThrownBy(() -> service.ask(me, "Title", "text", "potato", null, List.of(JPEG, JPEG)))
                .isInstanceOf(IllegalStateException.class);

        verify(storage).delete("community/q/a.jpg");
        verify(storage).delete("community/q/b.jpg");
    }

    @Test
    void aRegionLostBetweenTheCheckAndTheInsertIsRejectedAndTheUploadsAreRemoved() {
        when(questions.cropExists("potato")).thenReturn(true);
        when(questions.userHasRegion(me)).thenReturn(true);
        when(stripper.strip(any())).thenReturn(JPEG);
        when(storage.store(any(), any(), anyString())).thenReturn("community/q/a.jpg");
        when(questions.insert(any(), any(), anyString(), any(), anyString(), anyString())).thenReturn(false);

        assertCode(() -> service.ask(me, "Title", "text", "potato", null, List.of(JPEG)), "region_required");

        verify(storage).delete("community/q/a.jpg");
        verify(questions, never()).insertPhoto(any(), anyString(), anyString(), anyInt(), anyInt());
    }

    @Test
    void feedChecksTheLimitCropsStatusAndCursor() {
        assertCode(() -> service.feed(me, new FeedFilter(null, null, null, false), null, 0), "validation_failed");
        assertCode(() -> service.feed(me, new FeedFilter(null, null, null, false), null, 51), "validation_failed");
        assertCode(() -> service.feed(me, new FeedFilter(List.of("a", "b", "c", "d", "e"), null, null, false),
                null, 20), "validation_failed");
        assertCode(() -> service.feed(me, new FeedFilter(null, null, "hidden", false), null, 20),
                "validation_failed");
        UUID unknown = UUID.randomUUID();
        when(questions.cursorOf(unknown)).thenReturn(Optional.empty());
        assertCode(() -> service.feed(me, new FeedFilter(null, null, null, false), unknown, 20),
                "question_not_found");
    }

    @Test
    void feedMapsUnansweredAndMineToTheRepositoryFilter() {
        when(questions.feed(any(), any(), anyInt())).thenReturn(List.of());

        service.feed(me, new FeedFilter(List.of("potato"), 5L, "unanswered", true), null, 20);

        verify(questions).feed(new CommunityQuestionRepository.Filter(List.of("potato"), 5L, null, true, me),
                null, 20);
    }

    @Test
    void aHiddenQuestionIsNotFoundEverywhere() {
        UUID id = UUID.randomUUID();
        when(questions.findVisible(id)).thenReturn(Optional.empty());

        assertCode(() -> service.get(id), "question_not_found");
        assertCode(() -> service.photo(id, UUID.randomUUID()), "question_not_found");
        assertCode(() -> service.attachedDiagnosis(id), "question_not_found");
        assertCode(() -> service.attachedDiagnosisPhoto(id), "question_not_found");
    }

    @Test
    void theCardHasPhotoAndDiagnosisPaths() {
        UUID id = UUID.randomUUID();
        UUID photoId = UUID.randomUUID();
        UUID diagnosisId = UUID.randomUUID();
        when(questions.findVisible(id)).thenReturn(Optional.of(question(id, me, diagnosisId)));
        when(questions.photos(List.of(id))).thenReturn(List.of(
                new CommunityQuestionRepository.Photo(photoId, id, "community/x.jpg", "image/jpeg", 3, 0)));

        var view = service.get(id);

        assertThat(view.photoUrls()).containsExactly("/api/community/questions/" + id + "/photos/" + photoId);
        assertThat(view.diagnosisUrl()).isEqualTo("/api/community/questions/" + id + "/diagnosis");
    }

    @Test
    void aQuestionWithoutADiagnosisHasNoDiagnosisPath() {
        UUID id = UUID.randomUUID();
        when(questions.findVisible(id)).thenReturn(Optional.of(question(id, me, null)));
        when(questions.photos(List.of(id))).thenReturn(List.of());

        assertThat(service.get(id).diagnosisUrl()).isNull();
        assertCode(() -> service.attachedDiagnosis(id), "diagnosis_not_found");
    }

    @Test
    void theAttachedDiagnosisIsReadAsItsAuthorAndPointsToTheQuestionPhoto() {
        UUID id = UUID.randomUUID();
        UUID author = UUID.randomUUID();
        UUID diagnosisId = UUID.randomUUID();
        when(questions.findVisible(id)).thenReturn(Optional.of(question(id, author, diagnosisId)));
        when(diagnoses.get(author, diagnosisId)).thenReturn(diagnosis("potato"));

        assertThat(service.attachedDiagnosis(id).photoUrl())
                .isEqualTo("/api/community/questions/" + id + "/diagnosis/photo");
    }

    private static DiagnosisView diagnosis(String crop) {
        return new DiagnosisView(UUID.randomUUID(), crop, "ok", new ClassScore("x", 0.9),
                List.of(new ClassScore("x", 0.9)), null, "v1", 1, false, true, "/p", Instant.now());
    }

    private static Question question(UUID id, UUID author, UUID diagnosisId) {
        return new Question(id, author, "Name", false, "potato", 1L, null, diagnosisId, "Title", "Body", null,
                "open", null, Instant.now(), 0);
    }

    private static void assertCode(Runnable call, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.getCode()).isEqualTo(code));
    }
}
