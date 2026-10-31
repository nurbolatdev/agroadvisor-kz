package kz.agroadvisor.diagnosis.web;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import kz.agroadvisor.common.ratelimit.RateLimitProperties;
import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.diagnosis.service.DiagnosisService;
import kz.agroadvisor.diagnosis.service.DiagnosisService.DiagnosisView;

/** Photo diagnosis and the caller's history. The user is always the one in the token. */
@RestController
@RequestMapping("/api/diagnoses")
public class DiagnosisController {

    private static final String FEATURE = "@featureAccess.allows(authentication, 'diagnosis')";

    private final DiagnosisService diagnoses;
    private final RateLimiter rateLimiter;
    private final RateLimitProperties limits;

    public DiagnosisController(DiagnosisService diagnoses, RateLimiter rateLimiter, RateLimitProperties limits) {
        this.diagnoses = diagnoses;
        this.rateLimiter = rateLimiter;
        this.limits = limits;
    }

    /** The limit is checked before the photo is read, stored or sent to the model. */
    @PostMapping(consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(FEATURE)
    public DiagnosisView create(@RequestParam String crop, @RequestParam("image") MultipartFile image,
            Authentication authentication) throws IOException {
        rateLimiter.check("diagnosis", authentication.getName(), limits.diagnosisPerMinute(), Duration.ofMinutes(1));
        return diagnoses.create(UUID.fromString(authentication.getName()), crop, image.getBytes(),
                image.getContentType());
    }

    @GetMapping
    @PreAuthorize(FEATURE)
    public List<DiagnosisView> history(@RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size, Authentication authentication) {
        return diagnoses.history(UUID.fromString(authentication.getName()), page, size);
    }
}
