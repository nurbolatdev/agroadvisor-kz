package kz.agroadvisor.catalog.service;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.catalog.model.Crop;
import kz.agroadvisor.catalog.model.Disease;
import kz.agroadvisor.catalog.repository.CropRepository;
import kz.agroadvisor.catalog.repository.DiseaseRepository;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;

/** Admin side of the reference: crops and diseases with all translations. */
@Service
@Transactional
public class CatalogAdminService {

    private static final List<String> LANGUAGES = List.of("ru", "kk", "en");
    private static final Set<String> KINDS = Set.of("fungal", "bacterial", "viral", "pest", "healthy", "other");
    private static final Set<String> SEVERITIES = Set.of("low", "medium", "high");

    private final CropRepository crops;
    private final DiseaseRepository diseases;

    public CatalogAdminService(CropRepository crops, DiseaseRepository diseases) {
        this.crops = crops;
        this.diseases = diseases;
    }

    @Transactional(readOnly = true)
    public List<AdminCrop> crops() {
        return crops.findAllByOrderBySortOrderAscCodeAsc().stream().map(CatalogAdminService::view).toList();
    }

    public AdminCrop createCrop(String code, Map<String, String> names, int sortOrder) {
        requireAllLanguages(names);
        if (crops.existsById(code)) {
            throw new ApiException(HttpStatus.CONFLICT, "crop_exists", "Crop already exists: " + code);
        }
        return view(crops.save(new Crop(code, names, sortOrder)));
    }

    public AdminCrop updateCrop(String code, Map<String, String> names, int sortOrder) {
        requireAllLanguages(names);
        Crop crop = crops.findById(code).orElseThrow(() -> cropNotFound(code));
        crop.update(names, sortOrder);
        return view(crop);
    }

    public void deleteCrop(String code) {
        if (!crops.existsById(code)) {
            throw cropNotFound(code);
        }
        if (!diseases.findAllByCropCodeOrderByCodeAsc(code).isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT, "crop_in_use", "Crop still has diseases: " + code);
        }
        crops.deleteById(code);
    }

    @Transactional(readOnly = true)
    public List<AdminDisease> diseases() {
        return diseases.findAllByOrderByCodeAsc().stream().map(CatalogAdminService::view).toList();
    }

    @Transactional(readOnly = true)
    public AdminDisease disease(String code) {
        return view(diseases.findById(code).orElseThrow(() -> diseaseNotFound(code)));
    }

    public AdminDisease createDisease(String code, DiseaseData data) {
        validate(code, data);
        if (diseases.existsById(code)) {
            throw new ApiException(HttpStatus.CONFLICT, "disease_exists", "Disease already exists: " + code);
        }
        Disease disease = new Disease(code, data.cropCode(), data.kind(), data.severity(), data.latinName(),
                data.names(), data.symptoms(), data.conditions(), data.prevention());
        return view(diseases.save(disease));
    }

    /** Replaces the texts and attributes; treatments are untouched. */
    public AdminDisease updateDisease(String code, DiseaseData data) {
        Disease disease = diseases.findById(code).orElseThrow(() -> diseaseNotFound(code));
        validate(code, data);
        disease.update(data.cropCode(), data.kind(), data.severity(), data.latinName(), data.names(),
                data.symptoms(), data.conditions(), data.prevention());
        return view(disease);
    }

    /** Deletes the disease with its treatments; stored diagnoses keep the bare code. */
    public void deleteDisease(String code) {
        if (!diseases.existsById(code)) {
            throw diseaseNotFound(code);
        }
        diseases.deleteById(code);
    }

    private void validate(String code, DiseaseData data) {
        requireAllLanguages(data.names());
        if (!KINDS.contains(data.kind())) {
            throw invalid("kind must be one of " + KINDS);
        }
        if (data.severity() != null && !SEVERITIES.contains(data.severity())) {
            throw invalid("severity must be one of " + SEVERITIES);
        }
        if (data.cropCode() == null) {
            if (!"unknown".equals(code)) {
                throw invalid("cropCode is required");
            }
            return;
        }
        if (!crops.existsById(data.cropCode())) {
            throw cropNotFound(data.cropCode());
        }
        if (!code.startsWith(data.cropCode() + "__")) {
            throw invalid("code must start with '" + data.cropCode() + "__'");
        }
    }

    private static void requireAllLanguages(Map<String, String> names) {
        for (String language : LANGUAGES) {
            String value = names == null ? null : names.get(language);
            if (value == null || value.isBlank()) {
                throw invalid("names must contain a non-blank text for " + LANGUAGES);
            }
        }
    }

    private static ApiException invalid(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED, detail);
    }

    private static ApiException cropNotFound(String code) {
        return new ApiException(HttpStatus.NOT_FOUND, "crop_not_found", "Unknown crop: " + code);
    }

    private static ApiException diseaseNotFound(String code) {
        return new ApiException(HttpStatus.NOT_FOUND, "disease_not_found", "Unknown disease: " + code);
    }

    private static AdminCrop view(Crop crop) {
        return new AdminCrop(crop.getCode(), crop.getNames(), crop.getSortOrder());
    }

    private static AdminDisease view(Disease disease) {
        return new AdminDisease(disease.getCode(), new DiseaseData(disease.getCropCode(), disease.getKind(),
                disease.getSeverity(), disease.getLatinName(), disease.getNames(), disease.getSymptoms(),
                disease.getConditions(), disease.getPrevention()), disease.getTreatments().size());
    }

    public record AdminCrop(String code, Map<String, String> names, int sortOrder) {
    }

    /** Editable disease fields; the texts keep every language. */
    public record DiseaseData(String cropCode, String kind, String severity, String latinName,
            Map<String, String> names, Map<String, Object> symptoms, Map<String, Object> conditions,
            Map<String, Object> prevention) {
    }

    public record AdminDisease(String code, DiseaseData data, int treatmentCount) {
    }
}
