package kz.agroadvisor.dashboard.web;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.dashboard.service.DashboardService;
import kz.agroadvisor.dashboard.service.DashboardService.OverviewView;
import kz.agroadvisor.diagnosis.service.AiQualityService.Period;

/** Admin: the overview screen. */
@RestController
@RequestMapping("/api/admin/dashboard")
@PreAuthorize("hasRole('ADMIN')")
public class AdminDashboardController {

    private final DashboardService service;

    public AdminDashboardController(DashboardService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(operationId = "getAdminDashboard", summary = "Overview of the service over a period: diagnoses, "
            + "active users, the model's confidence, agrochemist applications waiting, diagnoses per day and new "
            + "accounts. Changes are against the previous period of the same length. Complaints, the funnel and "
            + "time to first advice have no source yet and are not here.")
    public OverviewView overview(
            @RequestParam(defaultValue = "30d") @Pattern(regexp = "7d|30d|season") String period,
            @RequestParam(defaultValue = "70") @Min(0) @Max(100) int confidenceThreshold) {
        return service.overview(Period.parse(period), confidenceThreshold);
    }
}
