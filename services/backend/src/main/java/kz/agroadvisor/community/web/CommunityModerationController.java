package kz.agroadvisor.community.web;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.WebRequest;

import kz.agroadvisor.catalog.service.CatalogLanguage;
import kz.agroadvisor.community.service.CommunityModerationService;
import kz.agroadvisor.community.service.CommunityQuestionService;
import kz.agroadvisor.community.service.CommunityQuestionService.PhotoContent;
import kz.agroadvisor.diagnosis.service.DiagnosisService;

/** Admin: reports about community questions and answers, decisions on them, hiding and restoring posts. */
@RestController
@RequestMapping("/api/admin/community")
@PreAuthorize("hasRole('ADMIN')")
public class CommunityModerationController {

    private final CommunityModerationService moderation;
    private final CommunityQuestionService questions;

    public CommunityModerationController(CommunityModerationService moderation, CommunityQuestionService questions) {
        this.moderation = moderation;
        this.questions = questions;
    }

    @GetMapping("/complaints")
    @Operation(operationId = "listAdminCommunityComplaints", summary = "Cases newest first; every filter is "
            + "optional. reason is the most reported reason of the case.")
    public List<ComplaintResponse> complaints(
            @RequestParam(required = false) @Pattern(regexp = "new|in_progress|resolved") String status,
            @RequestParam(required = false) @Pattern(regexp = "question|answer") String targetType,
            @RequestParam(required = false) @Pattern(regexp = "ads|misinformation|spam|abuse") String reason,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return moderation.list(status, targetType, reason, page, size).stream().map(ComplaintResponse::of)
                .toList();
    }

    @GetMapping("/complaints/{id}")
    @Operation(operationId = "getAdminCommunityComplaint", summary = "One case, its target shown even when "
            + "hidden; 404 complaint_not_found.")
    public ComplaintResponse complaint(@PathVariable UUID id) {
        return ComplaintResponse.of(moderation.get(id));
    }

    @PostMapping("/complaints/{id}/start")
    @Operation(operationId = "startAdminCommunityComplaint", summary = "Takes a new case into work; a case "
            + "already in work stays as it is. 409 complaint_resolved, 404 complaint_not_found.")
    public ComplaintResponse start(@PathVariable UUID id, Authentication authentication) {
        return ComplaintResponse.of(moderation.start(admin(authentication), id));
    }

    @PostMapping("/complaints/{id}/resolve")
    @Operation(operationId = "resolveAdminCommunityComplaint", summary = "Decides a case once: keep leaves the "
            + "target, hide hides it, block hides it and blocks its author (403 admin_status_locked when the "
            + "author is an administrator, 409 for oneself; then nothing changes). 409 complaint_resolved, "
            + "404 complaint_not_found.")
    public ComplaintResponse resolve(@PathVariable UUID id, @Valid @RequestBody ResolveComplaintRequest body,
            @RequestParam(required = false) String lang,
            @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage,
            Authentication authentication) {
        return ComplaintResponse.of(moderation.resolve(admin(authentication), id, body.action(), body.comment(),
                CatalogLanguage.resolve(lang, acceptLanguage)));
    }

    @GetMapping("/moderation-stats")
    @Operation(operationId = "getAdminCommunityModerationStats",
            summary = "Cases today, mean time to decide, decided this week, cases still new.")
    public ModerationStatsResponse stats() {
        return ModerationStatsResponse.of(moderation.stats());
    }

    @PatchMapping("/questions/{id}/status")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "changeAdminCommunityQuestionStatus", summary = "Hides a question from everyone or "
            + "shows it again; repeating the status is not an error. 404 question_not_found.")
    public void questionStatus(@PathVariable UUID id, @Valid @RequestBody VisibilityRequest body,
            Authentication authentication) {
        moderation.setQuestionHidden(admin(authentication), id, "hidden".equals(body.status()));
    }

    @PatchMapping("/answers/{id}/status")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "changeAdminCommunityAnswerStatus", summary = "Hides an answer or shows it again. "
            + "Hiding the best answer makes its question open; showing it does not choose it again. "
            + "404 answer_not_found.")
    public void answerStatus(@PathVariable UUID id, @Valid @RequestBody VisibilityRequest body,
            Authentication authentication) {
        moderation.setAnswerHidden(admin(authentication), id, "hidden".equals(body.status()));
    }

    @GetMapping("/questions/{id}/photos/{photoId}")
    @Operation(operationId = "getAdminCommunityQuestionPhoto", summary = "A photo of a question, a hidden "
            + "question too; 404 question_not_found, photo_not_found.")
    @ApiResponse(responseCode = "200", description = "A JPEG or PNG photo",
            content = {@Content(mediaType = "image/jpeg", schema = @Schema(type = "string", format = "binary")),
                    @Content(mediaType = "image/png", schema = @Schema(type = "string", format = "binary"))})
    public ResponseEntity<byte[]> photo(@PathVariable UUID id, @PathVariable UUID photoId, WebRequest request) {
        PhotoContent photo = questions.photoForAdmin(id, photoId);
        String etag = DiagnosisService.photoEtag(photo.key());
        CacheControl cache = CacheControl.maxAge(Duration.ofDays(365)).cachePrivate().immutable();
        if (request.checkNotModified(etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).cacheControl(cache).build();
        }
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(photo.contentType())).cacheControl(cache)
                .eTag(etag).header("X-Content-Type-Options", "nosniff").body(photo.bytes());
    }

    private static UUID admin(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
