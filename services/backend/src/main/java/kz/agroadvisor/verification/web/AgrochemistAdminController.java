package kz.agroadvisor.verification.web;

import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.verification.service.AgrochemistReviewService;
import kz.agroadvisor.verification.service.AgrochemistReviewService.DetailsView;
import kz.agroadvisor.verification.service.AgrochemistReviewService.File;
import kz.agroadvisor.verification.service.AgrochemistReviewService.SummaryView;

/** Admin: the queue of agrochemists to check, their documents and the decision. */
@RestController
@RequestMapping("/api/admin/agrochemists")
@PreAuthorize("hasRole('ADMIN')")
public class AgrochemistAdminController {

    public record DecisionRequest(
            @NotBlank @Pattern(regexp = "approve|reject|request_documents") String decision,
            @Size(max = 1000) String reason) {
    }

    private final AgrochemistReviewService reviews;

    public AgrochemistAdminController(AgrochemistReviewService reviews) {
        this.reviews = reviews;
    }

    @GetMapping
    @Operation(summary = "Agrochemists with the given status (pending by default), the longest waiting first")
    public List<SummaryView> queue(
            @RequestParam(defaultValue = "pending") @Pattern(regexp = "pending|approved|rejected|documents_requested")
            String status,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return reviews.queue(status, page, size);
    }

    @GetMapping("/{userId}")
    public DetailsView details(@PathVariable UUID userId) {
        return reviews.details(userId);
    }

    @PostMapping("/{userId}/decision")
    @Operation(summary = "approve (needs a document), reject or request_documents (both need a reason the "
            + "agrochemist will see). Approving makes the agrochemist visible to farmers.")
    public DetailsView decide(@PathVariable UUID userId, @Valid @RequestBody DecisionRequest request,
            Authentication authentication) {
        return reviews.decide(UUID.fromString(authentication.getName()), userId, request.decision(),
                request.reason());
    }

    @GetMapping("/{userId}/documents/{documentId}/file")
    @Operation(summary = "The document as it was sent (PDF, JPEG or PNG), as a download")
    public ResponseEntity<byte[]> file(@PathVariable UUID userId, @PathVariable UUID documentId) {
        File file = reviews.file(userId, documentId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(file.contentType()))
                // A PDF or an image from a stranger is shown by nobody's browser by itself, and not cached
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("document-" + documentId).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.noStore())
                .body(file.bytes());
    }
}
