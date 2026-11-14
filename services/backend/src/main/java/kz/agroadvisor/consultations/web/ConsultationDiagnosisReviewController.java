package kz.agroadvisor.consultations.web;

import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.consultations.service.ConsultationService;
import kz.agroadvisor.diagnosis.service.DiagnosisReviewService;
import kz.agroadvisor.diagnosis.web.DiagnosisReviewRequest;
import kz.agroadvisor.diagnosis.web.DiagnosisReviewResponse;

/**
 * The agrochemist of a consultation checks the diagnosis the farmer attached. Another user's consultation, one
 * without an attached diagnosis and a missing one are all 404; the farmer is not a reviewer of their own diagnosis.
 */
@RestController
@RequestMapping("/api/consultations/{id}/diagnosis/review")
@PreAuthorize("hasRole('AGROCHEMIST') and @featureAccess.allows(authentication, 'consultations')")
public class ConsultationDiagnosisReviewController {

    private final ConsultationService consultations;
    private final DiagnosisReviewService reviews;

    public ConsultationDiagnosisReviewController(ConsultationService consultations, DiagnosisReviewService reviews) {
        this.consultations = consultations;
        this.reviews = reviews;
    }

    @GetMapping
    @Operation(operationId = "getConsultationDiagnosisReview",
            description = "404 consultation_not_found or diagnosis_not_found; 409 invalid_consultation_state "
                    + "before the consultation is accepted or after it was declined.")
    public DiagnosisReviewResponse get(@PathVariable UUID id, Authentication authentication) {
        UUID me = UUID.fromString(authentication.getName());
        return DiagnosisReviewResponse.of(reviews.state(me, consultations.reviewableDiagnosis(me, id)));
    }

    @PutMapping
    @Operation(operationId = "putConsultationDiagnosisReview",
            description = "Gives or replaces the agrochemist's verdict on the attached diagnosis, in an active or "
                    + "closed consultation. 400 invalid_verdict or unknown_class; 404 consultation_not_found or "
                    + "diagnosis_not_found; 409 invalid_consultation_state.")
    public DiagnosisReviewResponse put(@PathVariable UUID id, @Valid @RequestBody DiagnosisReviewRequest request,
            Authentication authentication) {
        UUID me = UUID.fromString(authentication.getName());
        return DiagnosisReviewResponse.of(reviews.review(me, consultations.reviewableDiagnosis(me, id),
                request.verdict(), request.correctCode(), request.comment()));
    }
}
