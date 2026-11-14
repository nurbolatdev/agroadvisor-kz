package kz.agroadvisor.consultations.web;

import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.WebRequest;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;
import kz.agroadvisor.consultations.model.ConsultationStatus;
import kz.agroadvisor.consultations.service.ConsultationService;
import kz.agroadvisor.consultations.service.ConsultationService.DiagnosisPhotoRef;
import kz.agroadvisor.diagnosis.service.DiagnosisService;
import kz.agroadvisor.diagnosis.service.DiagnosisService.DiagnosisView;
import kz.agroadvisor.diagnosis.service.DiagnosisService.PhotoContent;

/**
 * Consultations of the signed-in farmer or agrochemist. Another user's consultation and a missing one both
 * answer 404 consultation_not_found.
 */
@RestController
@RequestMapping("/api/consultations")
@PreAuthorize("(hasRole('FARMER') or hasRole('AGROCHEMIST')) and @featureAccess.allows(authentication, 'consultations')")
public class ConsultationController {

    private final ConsultationService consultations;

    public ConsultationController(ConsultationService consultations) {
        this.consultations = consultations;
    }

    @PostMapping
    @PreAuthorize("hasRole('FARMER') and @featureAccess.allows(authentication, 'consultations')")
    @Operation(operationId = "createConsultation",
            description = "The farmer asks a verified agrochemist. 409 consultation_already_open (Location points "
                    + "to it) or consultation_request_limit; 404 agrochemist_not_found or diagnosis_not_found.")
    public ResponseEntity<ConsultationResponse> create(@Valid @RequestBody CreateConsultationRequest request,
            Authentication authentication) {
        ConsultationResponse created = ConsultationResponse.of(consultations.request(me(authentication),
                request.agrochemistId(), request.text(), request.diagnosisId()));
        return ResponseEntity.created(URI.create("/api/consultations/" + created.id())).body(created);
    }

    /** The latest activity first. */
    @GetMapping
    @Operation(operationId = "listConsultations")
    public List<ConsultationResponse> list(
            @Parameter(array = @ArraySchema(schema = @Schema(
                    allowableValues = {"requested", "active", "declined", "closed"})))
            @RequestParam(name = "status", required = false) List<String> status,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(50) int size, Authentication authentication) {
        return consultations.list(me(authentication), statuses(status), page, size).stream()
                .map(ConsultationResponse::of).toList();
    }

    @GetMapping("/{id}")
    @Operation(operationId = "getConsultation")
    public ConsultationResponse get(@PathVariable UUID id, Authentication authentication) {
        return ConsultationResponse.of(consultations.get(me(authentication), id));
    }

    @GetMapping("/{id}/diagnosis")
    @Operation(operationId = "getConsultationDiagnosis",
            description = "The diagnosis the farmer attached, for both participants; its photoUrl points to "
                    + "/api/consultations/{id}/diagnosis/photo. 404 diagnosis_not_found without one.")
    public DiagnosisView diagnosis(@PathVariable UUID id, Authentication authentication) {
        return consultations.attachedDiagnosis(me(authentication), id);
    }

    @GetMapping("/{id}/diagnosis/photo")
    @Operation(operationId = "getConsultationDiagnosisPhoto")
    @ApiResponse(responseCode = "200", description = "A JPEG or PNG photo",
            content = {@Content(mediaType = "image/jpeg", schema = @Schema(type = "string", format = "binary")),
                    @Content(mediaType = "image/png", schema = @Schema(type = "string", format = "binary"))})
    public ResponseEntity<byte[]> diagnosisPhoto(@PathVariable UUID id, Authentication authentication,
            WebRequest request) {
        DiagnosisPhotoRef ref = consultations.attachedDiagnosisPhoto(me(authentication), id);
        String etag = DiagnosisService.photoEtag(ref.key());
        CacheControl cache = CacheControl.maxAge(Duration.ofDays(365)).cachePrivate().immutable();
        if (request.checkNotModified(etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).cacheControl(cache).build();
        }
        PhotoContent photo = consultations.loadAttachedDiagnosisPhoto(ref);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(photo.contentType()))
                .cacheControl(cache)
                .eTag(etag)
                .header("X-Content-Type-Options", "nosniff")
                .body(photo.bytes());
    }

    @PostMapping("/{id}/accept")
    @PreAuthorize("hasRole('AGROCHEMIST') and @featureAccess.allows(authentication, 'consultations')")
    @Operation(operationId = "acceptConsultation",
            description = "Only from requested; 409 invalid_consultation_state (reason = current status) or "
                    + "agrochemist_not_listed.")
    public ConsultationResponse accept(@PathVariable UUID id, Authentication authentication) {
        return ConsultationResponse.of(consultations.accept(me(authentication), id));
    }

    @PostMapping("/{id}/decline")
    @PreAuthorize("hasRole('AGROCHEMIST') and @featureAccess.allows(authentication, 'consultations')")
    @Operation(operationId = "declineConsultation",
            description = "Only from requested; 409 invalid_consultation_state (reason = current status).")
    public ConsultationResponse decline(@PathVariable UUID id, Authentication authentication) {
        return ConsultationResponse.of(consultations.decline(me(authentication), id));
    }

    @PostMapping("/{id}/close")
    @Operation(operationId = "closeConsultation",
            description = "Either side from active; the farmer also from requested (withdrawal). Otherwise 409 "
                    + "invalid_consultation_state (reason = current status).")
    public ConsultationResponse close(@PathVariable UUID id, Authentication authentication) {
        return ConsultationResponse.of(consultations.close(me(authentication), id));
    }

    private static List<ConsultationStatus> statuses(List<String> codes) {
        List<ConsultationStatus> result = new ArrayList<>();
        if (codes != null) {
            for (String code : codes) {
                try {
                    result.add(ConsultationStatus.fromCode(code));
                } catch (IllegalArgumentException e) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
                            "Unknown status: " + code);
                }
            }
        }
        return result;
    }

    private static UUID me(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
