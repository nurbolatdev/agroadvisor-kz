package kz.agroadvisor.verification.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import kz.agroadvisor.common.image.ImageMetadataStripper;
import kz.agroadvisor.common.image.InvalidImageException;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.verification.repository.AgrochemistDocumentRepository;
import kz.agroadvisor.verification.repository.AgrochemistDocumentRepository.Document;
import kz.agroadvisor.verification.repository.AgrochemistDocumentRepository.Profile;

/**
 * What an agrochemist does with the documents that prove the qualification: send, list, remove, and see
 * the state of the check. A document is a PDF, JPEG or PNG of up to 10 MB, recognised by its first bytes.
 * Sending a document puts the profile (back) in the queue of the admins; an approved profile is locked.
 */
@Service
public class AgrochemistDocumentService {

    public static final int MAX_BYTES = 10 * 1024 * 1024;
    public static final int MAX_DOCUMENTS = 5;
    private static final Set<String> KINDS = Set.of("diploma", "certificate");
    private static final int MIN_YEAR = 1950;
    private static final int MAX_YEAR = 2100;
    private static final int MAX_TEXT = 200;

    private static final byte[] PDF = {'%', 'P', 'D', 'F', '-'};
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};

    private static final Logger log = LoggerFactory.getLogger(AgrochemistDocumentService.class);

    private final AgrochemistDocumentRepository repository;
    private final DocumentStorage storage;
    private final TransactionTemplate tx;
    private final ImageMetadataStripper stripper;

    public AgrochemistDocumentService(AgrochemistDocumentRepository repository, DocumentStorage storage,
            TransactionTemplate tx, ImageMetadataStripper stripper) {
        this.repository = repository;
        this.storage = storage;
        this.tx = tx;
        this.stripper = stripper;
    }

    public record DocumentView(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED, allowableValues = {"diploma", "certificate"}) String kind,
            @Schema(nullable = true) String title,
            @Schema(nullable = true) String issuer,
            @Schema(nullable = true) Integer year,
            @Schema(requiredMode = REQUIRED, allowableValues = {"application/pdf", "image/jpeg", "image/png"})
            String contentType,
            @Schema(requiredMode = REQUIRED) int sizeBytes,
            @Schema(requiredMode = REQUIRED) Instant uploadedAt) {

        static DocumentView of(Document d) {
            return new DocumentView(d.id(), d.kind(), d.title(), d.issuer(), d.year(), d.contentType(),
                    d.sizeBytes(), d.uploadedAt());
        }
    }

    public record VerificationView(
            @Schema(requiredMode = REQUIRED,
                    allowableValues = {"pending", "approved", "rejected", "documents_requested"}) String status,
            @Schema(requiredMode = REQUIRED, description = "When the profile entered the admins' queue: at "
                    + "registration, and again when a document is sent after a rejection or a request for documents")
            Instant submittedAt,
            @Schema(nullable = true) Instant reviewedAt,
            @Schema(nullable = true, description = "Why the admin rejected or asked for more documents") String rejectionReason,
            @Schema(requiredMode = REQUIRED) List<DocumentView> documents) {
    }

    /** Validates, stores the file, records it and queues the profile. Nothing stays behind if a step fails. */
    public DocumentView upload(UUID userId, String kind, String title, String issuer, Integer year, byte[] file) {
        validateFields(kind, title, issuer, year);
        // A first look, before the slow upload to the storage; the checks that count are repeated under the lock
        requireNotApproved(profile(userId));
        requireRoom(userId);
        String contentType = contentType(file);
        byte[] stored = clean(file, contentType);
        String key = storage.store(userId, stored, contentType);
        try {
            Document saved = tx.execute(status -> {
                requireNotApproved(lockedProfile(userId));
                requireRoom(userId);
                Document document = repository.insertDocument(userId, kind, key, blankToNull(title),
                        blankToNull(issuer), year, contentType, stored.length);
                repository.markSubmitted(userId);
                return document;
            });
            return DocumentView.of(saved);
        } catch (RuntimeException e) {
            discard(key, e);
            throw e;
        }
    }

    public List<DocumentView> documents(UUID userId) {
        return repository.listDocuments(userId).stream().map(DocumentView::of).toList();
    }

    public void delete(UUID userId, UUID documentId) {
        Document document = tx.execute(status -> {
            requireNotApproved(lockedProfile(userId));
            Document found = repository.findDocument(userId, documentId).orElseThrow(
                    () -> new ApiException(HttpStatus.NOT_FOUND, VerificationErrors.DOCUMENT_NOT_FOUND,
                            "No such document"));
            repository.deleteDocument(documentId);
            return found;
        });
        try {
            storage.delete(document.objectKey());
        } catch (RuntimeException e) {
            // The row is gone, so the object is unreachable garbage; report it, do not fail the request
            log.warn("Could not delete document object {}: {}", document.objectKey(), e.toString());
        }
    }

    public VerificationView verification(UUID userId) {
        Profile profile = profile(userId);
        return new VerificationView(profile.status(), profile.submittedAt(), profile.reviewedAt(),
                profile.rejectionReason(), documents(userId));
    }

    private Profile profile(UUID userId) {
        return repository.findProfile(userId).orElseThrow(() -> new ApiException(HttpStatus.CONFLICT,
                VerificationErrors.PROFILE_MISSING, "This account has no agrochemist profile"));
    }

    private Profile lockedProfile(UUID userId) {
        return repository.lockProfile(userId).orElseThrow(() -> new ApiException(HttpStatus.CONFLICT,
                VerificationErrors.PROFILE_MISSING, "This account has no agrochemist profile"));
    }

    private void requireRoom(UUID userId) {
        if (repository.countDocuments(userId) >= MAX_DOCUMENTS) {
            throw new ApiException(HttpStatus.CONFLICT, VerificationErrors.DOCUMENT_LIMIT,
                    "At most " + MAX_DOCUMENTS + " documents; remove one first");
        }
    }

    private static void requireNotApproved(Profile profile) {
        if ("approved".equals(profile.status())) {
            throw new ApiException(HttpStatus.CONFLICT, VerificationErrors.ALREADY_APPROVED,
                    "The documents were approved and can no longer be changed");
        }
    }

    private static void validateFields(String kind, String title, String issuer, Integer year) {
        if (kind == null || !KINDS.contains(kind)) {
            throw fields("kind", "kind must be diploma or certificate");
        }
        if (year != null && (year < MIN_YEAR || year > MAX_YEAR)) {
            throw fields("year", "year must be between " + MIN_YEAR + " and " + MAX_YEAR);
        }
        if (title != null && title.length() > MAX_TEXT) {
            throw fields("title", "title is longer than " + MAX_TEXT + " characters");
        }
        if (issuer != null && issuer.length() > MAX_TEXT) {
            throw fields("issuer", "issuer is longer than " + MAX_TEXT + " characters");
        }
    }

    private static ApiException fields(String reason, String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, VerificationErrors.INVALID_DOCUMENT_FIELDS, detail, reason);
    }

    /** The real type from the file's first bytes; the client's Content-Type header is not trusted. */
    static String contentType(byte[] file) {
        if (file.length == 0) {
            throw invalid("empty", "The file is empty");
        }
        if (file.length > MAX_BYTES) {
            throw invalid("too_large", "The file is larger than 10 MB");
        }
        if (startsWith(file, PDF)) {
            return "application/pdf";
        }
        if (startsWith(file, JPEG)) {
            return "image/jpeg";
        }
        if (startsWith(file, PNG)) {
            return "image/png";
        }
        throw invalid("unsupported_format", "Send a PDF, JPEG or PNG file");
    }

    /**
     * A scan or a photo of a diploma can carry GPS and camera data like any photo, so JPEG and PNG get the same
     * cleaning as a diagnosis photo (the orientation is kept). A PDF is stored as it was sent: its metadata
     * (author, producer, dates, XMP) and any embedded content stay in it.
     */
    private byte[] clean(byte[] file, String contentType) {
        if (contentType.equals("application/pdf")) {
            return file;
        }
        try {
            return stripper.strip(file);
        } catch (InvalidImageException e) {
            throw invalid("corrupted", "The image cannot be read, send another PDF, JPEG or PNG");
        }
    }

    private static ApiException invalid(String reason, String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, VerificationErrors.INVALID_DOCUMENT, detail, reason);
    }

    private static boolean startsWith(byte[] data, byte[] prefix) {
        return data.length > prefix.length && Arrays.equals(data, 0, prefix.length, prefix, 0, prefix.length);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private void discard(String key, RuntimeException cause) {
        try {
            storage.delete(key);
        } catch (RuntimeException cleanup) {
            cause.addSuppressed(cleanup);
        }
    }
}
