package kz.agroadvisor.community.web;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.multipart.MultipartFile;

import kz.agroadvisor.community.service.CommunityQuestionService;
import kz.agroadvisor.community.service.CommunityQuestionService.FeedFilter;
import kz.agroadvisor.community.service.CommunityQuestionService.PhotoContent;
import kz.agroadvisor.diagnosis.service.DiagnosisService;
import kz.agroadvisor.diagnosis.service.DiagnosisService.DiagnosisView;

/**
 * Questions of the community and the feed. A hidden or missing question is 404 question_not_found for
 * everyone, the author included.
 */
@RestController
@RequestMapping("/api/community/questions")
@PreAuthorize("(hasRole('FARMER') or hasRole('AGROCHEMIST')) and @featureAccess.allows(authentication, 'community')")
public class CommunityQuestionController {

    private static final String IMAGE_OK = "A JPEG or PNG photo";

    private final CommunityQuestionService questions;

    public CommunityQuestionController(CommunityQuestionService questions) {
        this.questions = questions;
    }

    @PostMapping(consumes = "multipart/form-data")
    @PreAuthorize("hasRole('FARMER') and @featureAccess.allows(authentication, 'community')")
    @Operation(operationId = "askCommunityQuestion",
            description = "Farmers only. Fields: title (3-120), text (1-2000), cropCode, optional diagnosisId (an "
                    + "own diagnosis of the same crop; 404 diagnosis_not_found, otherwise 400), photos (0-3 JPEG "
                    + "or PNG, up to 10 MB each, 11 MB in all; the metadata is removed). The region comes from "
                    + "the profile: 400 region_required without one. 400 validation_failed or invalid_image; 413 "
                    + "payload_too_large; 429 rate_limited after 10 questions an hour; 503 storage_unavailable.")
    @ApiResponse(responseCode = "201", description = "The new question")
    public ResponseEntity<QuestionResponse> ask(@RequestParam(required = false) String title,
            @RequestParam(required = false) String text, @RequestParam(required = false) String cropCode,
            @RequestParam(required = false) UUID diagnosisId,
            @RequestParam(value = "photos", required = false) List<MultipartFile> photos,
            Authentication authentication) throws IOException {
        List<byte[]> files = new ArrayList<>();
        if (photos != null) {
            for (MultipartFile photo : photos) {
                files.add(photo.getBytes());
            }
        }
        UUID me = me(authentication);
        QuestionResponse asked = QuestionResponse.of(
                questions.ask(me, title, text, cropCode, diagnosisId, files), me);
        return ResponseEntity.created(URI.create("/api/community/questions/" + asked.id())).body(asked);
    }

    @GetMapping
    @Operation(operationId = "listCommunityQuestions",
            description = "The feed, newest first, without hidden questions. Filters (all optional): crop (up to "
                    + "4, repeat the parameter), regionId, status open|solved|unanswered, mine. Pages: before = "
                    + "id of the last question of the previous page; an unknown id is 404 question_not_found.")
    public List<QuestionResponse> feed(@RequestParam(required = false) List<String> crop,
            @RequestParam(required = false) Long regionId, @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "false") boolean mine, @RequestParam(required = false) UUID before,
            @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit, Authentication authentication) {
        UUID me = me(authentication);
        return questions.feed(me, new FeedFilter(crop, regionId, status, mine), before, limit).stream()
                .map(view -> QuestionResponse.of(view, me)).toList();
    }

    @GetMapping("/{id}")
    @Operation(operationId = "getCommunityQuestion")
    public QuestionResponse get(@PathVariable UUID id, Authentication authentication) {
        return QuestionResponse.of(questions.get(id), me(authentication));
    }

    /** A photo never changes, so it is cached for a year. */
    @GetMapping("/{id}/photos/{photoId}")
    @Operation(operationId = "getCommunityQuestionPhoto")
    @ApiResponse(responseCode = "200", description = IMAGE_OK,
            content = {@Content(mediaType = "image/jpeg", schema = @Schema(type = "string", format = "binary")),
                    @Content(mediaType = "image/png", schema = @Schema(type = "string", format = "binary"))})
    public ResponseEntity<byte[]> photo(@PathVariable UUID id, @PathVariable UUID photoId, WebRequest request) {
        PhotoContent photo = questions.photo(id, photoId);
        return image(photo.key(), photo.contentType(), photo.bytes(), request);
    }

    @GetMapping("/{id}/diagnosis")
    @Operation(operationId = "getCommunityQuestionDiagnosis",
            description = "The diagnosis the author attached, for every reader; its photoUrl points to "
                    + "/api/community/questions/{id}/diagnosis/photo. 404 diagnosis_not_found without one.")
    public DiagnosisView diagnosis(@PathVariable UUID id) {
        return questions.attachedDiagnosis(id);
    }

    @GetMapping("/{id}/diagnosis/photo")
    @Operation(operationId = "getCommunityQuestionDiagnosisPhoto")
    @ApiResponse(responseCode = "200", description = IMAGE_OK,
            content = {@Content(mediaType = "image/jpeg", schema = @Schema(type = "string", format = "binary")),
                    @Content(mediaType = "image/png", schema = @Schema(type = "string", format = "binary"))})
    public ResponseEntity<byte[]> diagnosisPhoto(@PathVariable UUID id, WebRequest request) {
        DiagnosisService.PhotoContent photo = questions.attachedDiagnosisPhoto(id);
        return image(photo.key(), photo.contentType(), photo.bytes(), request);
    }

    private static ResponseEntity<byte[]> image(String key, String contentType, byte[] bytes, WebRequest request) {
        String etag = DiagnosisService.photoEtag(key);
        CacheControl cache = CacheControl.maxAge(Duration.ofDays(365)).cachePrivate().immutable();
        if (request.checkNotModified(etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).cacheControl(cache).build();
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .cacheControl(cache)
                .eTag(etag)
                .header("X-Content-Type-Options", "nosniff")
                .body(bytes);
    }

    private static UUID me(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
