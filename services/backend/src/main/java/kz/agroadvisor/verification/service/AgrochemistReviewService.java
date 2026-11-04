package kz.agroadvisor.verification.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.verification.repository.AgrochemistDocumentRepository;
import kz.agroadvisor.verification.repository.AgrochemistDocumentRepository.Document;
import kz.agroadvisor.verification.repository.AgrochemistReviewRepository;
import kz.agroadvisor.verification.repository.AgrochemistReviewRepository.Details;
import kz.agroadvisor.verification.service.AgrochemistDocumentService.DocumentView;

/**
 * The admin's side of the check: the queue, one agrochemist with the documents, the decision and the file.
 * The decision decides who is shown to farmers: {@code verified} in the database is {@code status = approved}.
 */
@Service
public class AgrochemistReviewService {

    private static final Map<String, String> STATUS_BY_DECISION = Map.of(
            "approve", "approved", "reject", "rejected", "request_documents", "documents_requested");

    private final AgrochemistReviewRepository reviews;
    private final AgrochemistDocumentRepository documents;
    private final DocumentStorage storage;

    public AgrochemistReviewService(AgrochemistReviewRepository reviews, AgrochemistDocumentRepository documents,
            DocumentStorage storage) {
        this.reviews = reviews;
        this.documents = documents;
        this.storage = storage;
    }

    public record SummaryView(
            @Schema(requiredMode = REQUIRED) UUID userId,
            @Schema(requiredMode = REQUIRED) String fullName,
            @Schema(nullable = true) String specialization,
            @Schema(requiredMode = REQUIRED,
                    allowableValues = {"pending", "approved", "rejected", "documents_requested"}) String status,
            @Schema(requiredMode = REQUIRED) Instant submittedAt,
            @Schema(requiredMode = REQUIRED) int documentCount) {
    }

    public record DetailsView(
            @Schema(requiredMode = REQUIRED) UUID userId,
            @Schema(requiredMode = REQUIRED) String fullName,
            @Schema(nullable = true) String phone,
            @Schema(nullable = true) String email,
            @Schema(nullable = true) String specialization,
            @Schema(nullable = true) Integer experienceYears,
            @Schema(requiredMode = REQUIRED,
                    allowableValues = {"pending", "approved", "rejected", "documents_requested"}) String status,
            @Schema(requiredMode = REQUIRED) Instant submittedAt,
            @Schema(nullable = true) Instant reviewedAt,
            @Schema(nullable = true) UUID reviewedBy,
            @Schema(nullable = true) String rejectionReason,
            @Schema(requiredMode = REQUIRED) List<DocumentView> documents) {
    }

    /** A document's bytes and the type it was recognised as when it was sent. */
    public record File(String contentType, byte[] bytes) {
    }

    @Transactional(readOnly = true)
    public List<SummaryView> queue(String status, int page, int size) {
        return reviews.list(status, size, page * size).stream()
                .map(s -> new SummaryView(s.userId(), s.fullName(), s.specialization(), s.status(), s.submittedAt(),
                        s.documentCount()))
                .toList();
    }

    @Transactional(readOnly = true)
    public DetailsView details(UUID userId) {
        Details d = reviews.find(userId).orElseThrow(AgrochemistReviewService::notFound);
        List<DocumentView> docs = documents.listDocuments(userId).stream().map(DocumentView::of).toList();
        return new DetailsView(d.userId(), d.fullName(), d.phone(), d.email(), d.specialization(),
                d.experienceYears(), d.status(), d.submittedAt(), d.reviewedAt(), d.reviewedBy(),
                d.rejectionReason(), docs);
    }

    /**
     * {@code decision}: {@code approve}, {@code reject} or {@code request_documents}. A rejection and a request
     * need a reason the agrochemist will see; an approval needs at least one document.
     */
    @Transactional
    public DetailsView decide(UUID adminId, UUID userId, String decision, String reason) {
        String status = STATUS_BY_DECISION.get(decision);
        if (status == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_decision",
                    "decision must be approve, reject or request_documents");
        }
        reviews.find(userId).orElseThrow(AgrochemistReviewService::notFound);
        String cleanReason = reason == null || reason.isBlank() ? null : reason.strip();
        if (!status.equals("approved") && cleanReason == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, VerificationErrors.REASON_REQUIRED,
                    "Give the agrochemist a reason");
        }
        if (status.equals("approved") && documents.countDocuments(userId) == 0) {
            throw new ApiException(HttpStatus.CONFLICT, VerificationErrors.NO_DOCUMENTS,
                    "Nothing to approve: the agrochemist has sent no documents");
        }
        reviews.decide(userId, status, status.equals("approved") ? null : cleanReason, adminId);
        return details(userId);
    }

    /** The file of one document, for the admin who checks it. */
    public File file(UUID userId, UUID documentId) {
        Document document = documents.findDocument(userId, documentId).orElseThrow(
                () -> new ApiException(HttpStatus.NOT_FOUND, VerificationErrors.DOCUMENT_NOT_FOUND,
                        "No such document"));
        return new File(document.contentType(), storage.load(document.objectKey()));
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, VerificationErrors.AGROCHEMIST_NOT_FOUND,
                "No such agrochemist");
    }
}
