package kz.agroadvisor.catalog.web;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.catalog.service.CatalogLanguage;
import kz.agroadvisor.catalog.service.CatalogService;
import kz.agroadvisor.catalog.service.CatalogService.CropView;
import kz.agroadvisor.catalog.service.CatalogService.DiseaseDetail;
import kz.agroadvisor.catalog.service.CatalogService.DiseaseSummary;

/**
 * Read-only reference for signed-in users. The language is the {@code lang}
 * parameter, else {@code Accept-Language}, else Russian.
 */
@RestController
@RequestMapping("/api")
public class CatalogController {

    private final CatalogService catalog;

    public CatalogController(CatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/crops")
    public List<CropView> crops(@RequestParam(required = false) String lang,
            @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage) {
        return catalog.crops(CatalogLanguage.resolve(lang, acceptLanguage));
    }

    @GetMapping("/diseases")
    public List<DiseaseSummary> diseases(@RequestParam(required = false) String crop,
            @RequestParam(required = false) String lang,
            @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage) {
        return catalog.diseases(crop, CatalogLanguage.resolve(lang, acceptLanguage));
    }

    @GetMapping("/diseases/{code}")
    public DiseaseDetail disease(@PathVariable String code, @RequestParam(required = false) String lang,
            @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage) {
        return catalog.disease(code, CatalogLanguage.resolve(lang, acceptLanguage));
    }
}
