package kz.agroadvisor.catalog.service;

import java.io.Serializable;
import java.util.List;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.catalog.model.Crop;
import kz.agroadvisor.catalog.model.Disease;
import kz.agroadvisor.catalog.model.Treatment;
import kz.agroadvisor.catalog.repository.CropRepository;
import kz.agroadvisor.catalog.repository.DiseaseRepository;
import kz.agroadvisor.common.web.ApiException;

/**
 * Read side of the reference: everything is returned in a single language.
 *
 * <p>Results are cached in Redis (the views are {@link Serializable}); errors such as
 * "unknown code" are not cached. {@link CatalogAdminService} evicts the whole cache on every change.
 */
@Service
@Transactional(readOnly = true)
public class CatalogService {

    /** Name of the cache shared with {@link CatalogAdminService}. */
    public static final String CACHE = "catalog";

    private final CropRepository crops;
    private final DiseaseRepository diseases;

    public CatalogService(CropRepository crops, DiseaseRepository diseases) {
        this.crops = crops;
        this.diseases = diseases;
    }

    @Cacheable(cacheNames = CACHE, key = "'crops:' + #lang")
    public List<CropView> crops(String lang) {
        return crops.findAllByOrderBySortOrderAscCodeAsc().stream()
                .map(crop -> cropView(crop, lang))
                .toList();
    }

    /**
     * All diseases, or only those of one crop; an unknown crop is a 404. The
     * "healthy" and "unknown" classes are not diseases and are left out of the list;
     * they are still available by code for a diagnosis result.
     */
    @Cacheable(cacheNames = CACHE, key = "'diseases:' + (#cropCode ?: '*') + ':' + #lang")
    public List<DiseaseSummary> diseases(String cropCode, String lang) {
        List<Disease> found;
        if (cropCode == null) {
            found = diseases.findAllByOrderByCodeAsc();
        } else {
            if (!crops.existsById(cropCode)) {
                throw new ApiException(HttpStatus.NOT_FOUND, CatalogErrors.CROP_NOT_FOUND,
                        "Unknown crop: " + cropCode);
            }
            found = diseases.findAllByCropCodeOrderByCodeAsc(cropCode);
        }
        return found.stream()
                .filter(CatalogService::isDisease)
                .map(disease -> summary(disease, lang))
                .toList();
    }

    @Cacheable(cacheNames = CACHE, key = "'disease:' + #code + ':' + #lang")
    public DiseaseDetail disease(String code, String lang) {
        Disease disease = diseases.findById(code)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, CatalogErrors.DISEASE_NOT_FOUND,
                        "Unknown disease: " + code));
        return new DiseaseDetail(
                summary(disease, lang),
                CatalogLanguage.pick(disease.getSymptoms(), lang),
                CatalogLanguage.pick(disease.getConditions(), lang),
                CatalogLanguage.pick(disease.getPrevention(), lang),
                disease.getTreatments().stream().map(treatment -> treatmentView(treatment, lang)).toList());
    }

    /** Healthy classes and {@code unknown} (the only one without a crop) are results, not diseases. */
    private static boolean isDisease(Disease disease) {
        return disease.getCropCode() != null && !"healthy".equals(disease.getKind());
    }

    private static CropView cropView(Crop crop, String lang) {
        return new CropView(crop.getCode(), CatalogLanguage.pick(crop.getNames(), lang));
    }

    private static DiseaseSummary summary(Disease disease, String lang) {
        return new DiseaseSummary(disease.getCode(), disease.getCropCode(), disease.getKind(),
                disease.getSeverity(), disease.getLatinName(), CatalogLanguage.pick(disease.getNames(), lang));
    }

    private static TreatmentView treatmentView(Treatment treatment, String lang) {
        return new TreatmentView(treatment.getType(), treatment.getProduct(), treatment.getActiveIngredient(),
                CatalogLanguage.pick(treatment.getDosage(), lang), CatalogLanguage.pick(treatment.getMethod(), lang));
    }

    public record CropView(String code, String name) implements Serializable {
    }

    public record DiseaseSummary(String code, String cropCode, String kind, String severity, String latinName,
            String name) implements Serializable {
    }

    /** {@code symptoms}, {@code conditions} and {@code prevention} are a string or a list of strings. */
    public record DiseaseDetail(DiseaseSummary disease, Object symptoms, Object conditions, Object prevention,
            List<TreatmentView> treatments) implements Serializable {
    }

    public record TreatmentView(String type, String product, String activeIngredient, String dosage,
            String method) implements Serializable {
    }
}
