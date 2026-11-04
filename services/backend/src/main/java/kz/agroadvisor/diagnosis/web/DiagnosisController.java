package kz.agroadvisor.diagnosis.web;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
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
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.multipart.MultipartFile;

import kz.agroadvisor.diagnosis.service.DiagnosisService;
import kz.agroadvisor.diagnosis.service.DiagnosisService.Created;
import kz.agroadvisor.diagnosis.service.DiagnosisService.DiagnosisView;
import kz.agroadvisor.diagnosis.service.DiagnosisService.PhotoContent;

/** Photo diagnosis and the caller's history. The user is always the one in the token. */
@RestController
@RequestMapping("/api/diagnoses")
public class DiagnosisController {

    private static final String FEATURE = "@featureAccess.allows(authentication, 'diagnosis')";
    private static final String REPLAYED_HEADER = "Idempotent-Replayed";

    private final DiagnosisService diagnoses;

    public DiagnosisController(DiagnosisService diagnoses) {
        this.diagnoses = diagnoses;
    }

    /**
     * A repeated request with the same {@code Idempotency-Key} returns the diagnosis made the first time
     * (same 201 body) and the header {@code Idempotent-Replayed: true}; the photo is not stored again, the
     * model is not called and the diagnosis rate limit is not spent. The limit itself is checked in
     * {@link DiagnosisService#create} before the photo is stored or sent to the model.
     */
    @PostMapping(consumes = "multipart/form-data")
    @PreAuthorize(FEATURE)
    @ApiResponse(responseCode = "201", description = "The diagnosis; for a repeated Idempotency-Key the one made "
            + "the first time, with the header Idempotent-Replayed: true",
            headers = @Header(name = REPLAYED_HEADER, description = "\"true\" when the diagnosis already existed",
                    schema = @Schema(type = "string", allowableValues = "true")))
    @ApiResponse(responseCode = "409", description = "request_in_progress: a request with the same Idempotency-Key is "
            + "still being processed; repeat after the seconds in Retry-After",
            headers = @Header(name = "Retry-After", description = "Seconds to wait before repeating the request",
                    schema = @Schema(type = "string", example = "2")))
    public ResponseEntity<DiagnosisView> create(@RequestParam String crop, @RequestParam("image") MultipartFile image,
            @Parameter(description = "One key per diagnosis attempt (a UUID fits); resend the same request with it "
                    + "when the answer was lost. The key is tied to the crop and to the exact photo bytes (SHA-256): "
                    + "another crop or another photo under the same key is 422 idempotency_key_reused with reason "
                    + "crop or photo, so a retry must send the same file. A malformed key is 400 "
                    + "invalid_idempotency_key. A repeat does not spend the diagnosis rate limit. While the first "
                    + "request with the key is still being processed, another one gets 409 request_in_progress with "
                    + "Retry-After: 2 (seconds); the model is not called again and the limit is not spent.",
                    schema = @Schema(pattern = "[A-Za-z0-9_.:-]{8,80}", minLength = 8, maxLength = 80))
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            Authentication authentication) throws IOException {
        Created created = diagnoses.create(UUID.fromString(authentication.getName()), crop, image.getBytes(),
                idempotencyKey);
        ResponseEntity.BodyBuilder response = ResponseEntity.status(HttpStatus.CREATED);
        if (created.replayed()) {
            response.header(REPLAYED_HEADER, "true");
        }
        return response.body(created.view());
    }

    /** The same body as the 201 of POST. Another user's and a missing id are the same 404 diagnosis_not_found. */
    @GetMapping("/{id}")
    @PreAuthorize(FEATURE)
    public DiagnosisView get(@PathVariable UUID id, Authentication authentication) {
        return diagnoses.get(UUID.fromString(authentication.getName()), id);
    }

    /**
     * The photo bytes for the owner only (the bucket is private, there are no public or presigned links).
     * The photo of a diagnosis never changes, so it is cached for a year; the ETag is a hash of the object key.
     */
    @GetMapping("/{id}/photo")
    @PreAuthorize(FEATURE)
    @ApiResponse(responseCode = "200", description = "A JPEG or PNG photo",
            content = {@Content(mediaType = "image/jpeg", schema = @Schema(type = "string", format = "binary")),
                    @Content(mediaType = "image/png", schema = @Schema(type = "string", format = "binary"))})
    public ResponseEntity<byte[]> photo(@PathVariable UUID id, Authentication authentication, WebRequest request) {
        String key = diagnoses.photoKey(UUID.fromString(authentication.getName()), id);
        String etag = DiagnosisService.photoEtag(key);
        CacheControl cache = CacheControl.maxAge(Duration.ofDays(365)).cachePrivate().immutable();
        // A revalidation (If-None-Match) is answered 304 from the database row alone, without the download
        if (request.checkNotModified(etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).cacheControl(cache).build();
        }
        PhotoContent photo = diagnoses.loadPhoto(id, key);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(photo.contentType()))
                .cacheControl(cache)
                .eTag(etag)
                .header("X-Content-Type-Options", "nosniff")
                .body(photo.bytes());
    }

    @GetMapping
    @PreAuthorize(FEATURE)
    public List<DiagnosisView> history(@RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size, Authentication authentication) {
        return diagnoses.history(UUID.fromString(authentication.getName()), page, size);
    }
}
