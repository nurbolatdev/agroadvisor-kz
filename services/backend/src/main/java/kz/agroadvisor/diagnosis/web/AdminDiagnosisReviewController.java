package kz.agroadvisor.diagnosis.web;

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

import kz.agroadvisor.diagnosis.service.DiagnosisReviewService;

/** An administrator checks any diagnosis (the checks feed the quality of the model and the outbreak map). */
@RestController
@RequestMapping("/api/admin/diagnoses/{id}/review")
@PreAuthorize("hasRole('ADMIN')")
public class AdminDiagnosisReviewController {

    private final DiagnosisReviewService reviews;

    public AdminDiagnosisReviewController(DiagnosisReviewService reviews) {
        this.reviews = reviews;
    }

    @GetMapping
    @Operation(operationId = "getAdminDiagnosisReview", description = "404 diagnosis_not_found.")
    public DiagnosisReviewResponse get(@PathVariable UUID id, Authentication authentication) {
        return DiagnosisReviewResponse.of(reviews.state(UUID.fromString(authentication.getName()), id));
    }

    @PutMapping
    @Operation(operationId = "putAdminDiagnosisReview",
            description = "Gives or replaces the caller's verdict. 400 invalid_verdict (confirmed without an answer "
                    + "of the model, corrected to the model's own class, a class with unclear) or unknown_class; "
                    + "404 diagnosis_not_found.")
    public DiagnosisReviewResponse put(@PathVariable UUID id, @Valid @RequestBody DiagnosisReviewRequest request,
            Authentication authentication) {
        return DiagnosisReviewResponse.of(reviews.review(UUID.fromString(authentication.getName()), id,
                request.verdict(), request.correctCode(), request.comment()));
    }
}
