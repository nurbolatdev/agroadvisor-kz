package kz.agroadvisor.analytics.web;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.constraints.Pattern;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.analytics.service.CommunityStatsService;
import kz.agroadvisor.analytics.service.CommunityStatsService.CommunityStats;
import kz.agroadvisor.diagnosis.service.AiQualityService.Period;

/** Admin: the statistics screen of the community. */
@RestController
@RequestMapping("/api/admin/community/stats")
@PreAuthorize("hasRole('ADMIN')")
public class AdminCommunityStatsController {

    private final CommunityStatsService service;

    public AdminCommunityStatsController(CommunityStatsService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(operationId = "getAdminCommunityStats", summary = "Statistics of the community over a period: "
            + "questions, time to the first answer, share of solved questions, questions without an answer for "
            + "more than 24 hours (a count and a list), activity by bucket, the most active members and "
            + "consultations. Changes are against the previous period of the same length.")
    public CommunityStats stats(@RequestParam(defaultValue = "30d") @Pattern(regexp = "7d|30d|season") String period) {
        return service.stats(Period.parse(period));
    }
}
