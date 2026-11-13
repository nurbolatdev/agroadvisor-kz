package kz.agroadvisor.verification.web;

import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.verification.service.AgrochemistDirectoryService;

/** The directory of verified agrochemists for farmers. */
@RestController
@RequestMapping("/api/agrochemists")
@PreAuthorize("hasRole('FARMER') and @featureAccess.allows(authentication, 'consultations')")
public class AgrochemistDirectoryController {

    private final AgrochemistDirectoryService directory;

    public AgrochemistDirectoryController(AgrochemistDirectoryService directory) {
        this.directory = directory;
    }

    @GetMapping
    @Operation(operationId = "listAgrochemists",
            description = "Most experienced first. Unknown crop is 400 unknown_crop, unknown regionId is 400 "
                    + "invalid_region.")
    public List<AgrochemistCardResponse> list(@RequestParam(required = false) String crop,
            @RequestParam(required = false) Long regionId, @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(50) int size) {
        return directory.list(crop, regionId, page, size).stream().map(AgrochemistCardResponse::of).toList();
    }

    /** Not approved, blocked and missing agrochemists all answer 404 agrochemist_not_found. */
    @GetMapping("/{id}")
    @Operation(operationId = "getAgrochemist")
    public AgrochemistCardResponse get(@PathVariable UUID id) {
        return AgrochemistCardResponse.of(directory.get(id));
    }
}
