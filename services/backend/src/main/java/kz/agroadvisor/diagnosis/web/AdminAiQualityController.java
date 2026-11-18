package kz.agroadvisor.diagnosis.web;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.constraints.Pattern;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.catalog.service.CatalogLanguage;
import kz.agroadvisor.diagnosis.service.AiQualityService;
import kz.agroadvisor.diagnosis.service.AiQualityService.AiQualityView;
import kz.agroadvisor.diagnosis.service.AiQualityService.Period;

/** Admin: quality of the model's answers against the experts' checks. */
@RestController
@RequestMapping("/api/admin/ai-quality")
@PreAuthorize("hasRole('ADMIN')")
public class AdminAiQualityController {

    private final AiQualityService service;

    public AdminAiQualityController(AiQualityService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(operationId = "getAdminAiQuality", summary = "How the model performs over a period: the confidence "
            + "of its answers, the classes it names most, the photos experts have decided (for retraining) and "
            + "where the experts disagreed with the model. Class names are in the asked language. A diagnosis "
            + "counts as decided when experts agree on one class; disputed and unclear ones do not count.")
    public AiQualityView stats(
            @RequestParam(defaultValue = "30d") @Pattern(regexp = "7d|30d|season") String period,
            @RequestParam(required = false) String lang,
            @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage) {
        return service.stats(Period.parse(period), CatalogLanguage.resolve(lang, acceptLanguage));
    }
}
