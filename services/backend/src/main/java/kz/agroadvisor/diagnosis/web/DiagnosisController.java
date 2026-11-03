package kz.agroadvisor.diagnosis.web;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import kz.agroadvisor.common.ratelimit.RateLimitProperties;
import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.diagnosis.service.DiagnosisService;
import kz.agroadvisor.diagnosis.service.DiagnosisService.Created;
import kz.agroadvisor.diagnosis.service.DiagnosisService.DiagnosisView;

/** Photo diagnosis and the caller's history. The user is always the one in the token. */
@RestController
@RequestMapping("/api/diagnoses")
public class DiagnosisController {

    private static final String FEATURE = "@featureAccess.allows(authentication, 'diagnosis')";
    private static final String REPLAYED_HEADER = "Idempotent-Replayed";

    private final DiagnosisService diagnoses;
    private final RateLimiter rateLimiter;
    private final RateLimitProperties limits;

    public DiagnosisController(DiagnosisService diagnoses, RateLimiter rateLimiter, RateLimitProperties limits) {
        this.diagnoses = diagnoses;
        this.rateLimiter = rateLimiter;
        this.limits = limits;
    }

    /**
     * The limit is checked before the photo is read, stored or sent to the model. A repeated request with
     * the same {@code Idempotency-Key} returns the diagnosis made the first time (same 201 body) and the
     * header {@code Idempotent-Replayed: true}; the photo is not stored again and the model is not called.
     */
    @PostMapping(consumes = "multipart/form-data")
    @PreAuthorize(FEATURE)
    @ApiResponse(responseCode = "201", description = "The diagnosis; for a repeated Idempotency-Key the one made "
            + "the first time, with the header Idempotent-Replayed: true",
            headers = @Header(name = REPLAYED_HEADER, description = "\"true\" when the diagnosis already existed",
                    schema = @Schema(type = "string", allowableValues = "true")))
    public ResponseEntity<DiagnosisView> create(@RequestParam String crop, @RequestParam("image") MultipartFile image,
            @Parameter(description = "One key per diagnosis attempt (a UUID fits); resend the same request with it "
                    + "when the answer was lost. The key is tied to the crop and to the exact photo bytes (SHA-256): "
                    + "another crop or another photo under the same key is 422 idempotency_key_reused with reason "
                    + "crop or photo, so a retry must send the same file. A malformed key is 400 "
                    + "invalid_idempotency_key.",
                    schema = @Schema(pattern = "[A-Za-z0-9_.:-]{8,80}", minLength = 8, maxLength = 80))
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            Authentication authentication) throws IOException {
        rateLimiter.check("diagnosis", authentication.getName(), limits.diagnosisPerMinute(), Duration.ofMinutes(1));
        Created created = diagnoses.create(UUID.fromString(authentication.getName()), crop, image.getBytes(),
                idempotencyKey);
        ResponseEntity.BodyBuilder response = ResponseEntity.status(HttpStatus.CREATED);
        if (created.replayed()) {
            response.header(REPLAYED_HEADER, "true");
        }
        return response.body(created.view());
    }

    @GetMapping
    @PreAuthorize(FEATURE)
    public List<DiagnosisView> history(@RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size, Authentication authentication) {
        return diagnoses.history(UUID.fromString(authentication.getName()), page, size);
    }
}
