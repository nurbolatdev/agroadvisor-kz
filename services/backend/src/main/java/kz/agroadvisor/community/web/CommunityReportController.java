package kz.agroadvisor.community.web;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.community.service.CommunityReportService;

/** Reports about questions and answers; the admin decides them in {@code /api/admin/community}. */
@RestController
@RequestMapping("/api/community/reports")
@PreAuthorize("(hasRole('FARMER') or hasRole('AGROCHEMIST')) and @featureAccess.allows(authentication, 'community')")
public class CommunityReportController {

    private final CommunityReportService reports;

    public CommunityReportController(CommunityReportService reports) {
        this.reports = reports;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "reportCommunityContent",
            description = "Reports a visible question or answer of someone else; a repeat from the same user "
                    + "changes nothing. 400 validation_failed; 404 question_not_found or answer_not_found; 409 "
                    + "own_content; 409 complaint_resolved when the case was resolved again and again during the attempts "
                    + "to add the report (rare, send it once more); 429 rate_limited after 20 reports an hour.")
    @ApiResponse(responseCode = "204", description = "The report is accepted")
    public void report(@Valid @RequestBody CreateReportRequest request, Authentication authentication) {
        reports.report(UUID.fromString(authentication.getName()), request.targetType(), request.targetId(),
                request.reason(), request.comment());
    }
}
