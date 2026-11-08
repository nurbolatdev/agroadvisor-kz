package kz.agroadvisor.catalog.web;

import java.util.List;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.catalog.service.CatalogLanguage;
import kz.agroadvisor.catalog.service.RegionService;
import kz.agroadvisor.catalog.service.RegionService.RegionView;

/**
 * The regions for the registration form. Public: a person picks a region before they have an account. The
 * language is the {@code lang} parameter, else {@code Accept-Language}, else Russian.
 */
@RestController
@RequestMapping("/api")
public class RegionController {

    private final RegionService regions;

    public RegionController(RegionService regions) {
        this.regions = regions;
    }

    @SecurityRequirements
    @GetMapping("/regions")
    @Operation(summary = "The regions a person can pick at registration, sorted by name in the requested language")
    public List<RegionView> regions(@RequestParam(required = false) String lang,
            @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage) {
        return regions.list(CatalogLanguage.resolve(lang, acceptLanguage));
    }
}
