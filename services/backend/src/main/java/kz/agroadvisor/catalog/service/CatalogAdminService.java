package kz.agroadvisor.catalog.service;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.catalog.model.Crop;
import kz.agroadvisor.catalog.model.Disease;
import kz.agroadvisor.catalog.model.Treatment;
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
    private static final Set<String> TREATMENT_TYPES = Set.of("chemical", "biological");
    private static final int MAX_TEXT_LENGTH = 2000;
    private static final int MAX_ITEMS = 30;

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
            throw cropExists(code);
        }
        try {
            return view(crops.saveAndFlush(new Crop(code, names, sortOrder)));
        } catch (DataIntegrityViolationException e) {
            // A parallel request created the same code between the check and the insert
            throw cropExists(code);
        }
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
        ApiException inUse = new ApiException(HttpStatus.CONFLICT, CatalogErrors.CROP_IN_USE,
                "Crop is still in use: " + code);
        if (!diseases.findAllByCropCodeOrderByCodeAsc(code).isEmpty()) {
            throw inUse;
        }
        try {
            crops.deleteById(code);
            crops.flush();
        } catch (DataIntegrityViolationException e) {
            // Diagnoses or agrochemist profiles still reference the crop
            throw inUse;
        }
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
            throw diseaseExists(code);
        }
        Disease disease = new Disease(code, data.cropCode(), data.kind(), data.severity(), data.latinName(),
                data.names(), data.symptoms(), data.conditions(), data.prevention());
        try {
            return view(diseases.saveAndFlush(disease));
        } catch (DataIntegrityViolationException e) {
            // A parallel request created the same code between the check and the insert
            throw diseaseExists(code);
        }
    }

    /** Replaces the texts and attributes; treatments are untouched. */
    public AdminDisease updateDisease(String code, DiseaseData data) {
        Disease disease = diseases.findById(code).orElseThrow(() -> diseaseNotFound(code));
        validate(code, data);
        disease.update(data.cropCode(), data.kind(), data.severity(), data.latinName(), data.names(),
                data.symptoms(), data.conditions(), data.prevention());
        return view(disease);
    }

    /**
     * Deletes the disease with its treatments. A code that stored diagnoses refer to
     * stays: class codes are permanent (docs/ai/classes.md).
     */
    public void deleteDisease(String code) {
        if (!diseases.existsById(code)) {
            throw diseaseNotFound(code);
        }
        if (diseases.countDiagnoses(code) > 0) {
            throw new ApiException(HttpStatus.CONFLICT, CatalogErrors.DISEASE_IN_USE,
                    "Diagnoses refer to this disease: " + code);
        }
        diseases.deleteById(code);
    }

    @Transactional(readOnly = true)
    public List<AdminTreatment> treatments(String diseaseCode) {
        return findDisease(diseaseCode).getTreatments().stream().map(CatalogAdminService::view).toList();
    }

    public AdminTreatment createTreatment(String diseaseCode, TreatmentData data) {
        validate(data);
        Disease disease = findDisease(diseaseCode);
        Treatment treatment = new Treatment(data.type(), data.product(), data.activeIngredient(), data.dosage(),
                data.method(), data.sortOrder());
        disease.addTreatment(treatment);
        diseases.flush();
        return view(treatment);
    }

    public AdminTreatment updateTreatment(String diseaseCode, long treatmentId, TreatmentData data) {
        validate(data);
        Treatment treatment = findTreatment(findDisease(diseaseCode), treatmentId);
        treatment.update(data.type(), data.product(), data.activeIngredient(), data.dosage(), data.method(),
                data.sortOrder());
        return view(treatment);
    }

    public void deleteTreatment(String diseaseCode, long treatmentId) {
        Disease disease = findDisease(diseaseCode);
        findTreatment(disease, treatmentId);
        disease.removeTreatment(treatmentId);
    }

    private Disease findDisease(String code) {
        return diseases.findById(code).orElseThrow(() -> diseaseNotFound(code));
    }

    private static Treatment findTreatment(Disease disease, long treatmentId) {
        return disease.getTreatments().stream()
                .filter(treatment -> treatment.getId() == treatmentId)
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, CatalogErrors.TREATMENT_NOT_FOUND,
                        "Unknown treatment: " + treatmentId));
    }

    private static void validate(TreatmentData data) {
        if (!TREATMENT_TYPES.contains(data.type())) {
            throw invalid("type must be one of " + TREATMENT_TYPES);
        }
        if (data.product() == null || data.product().isBlank()) {
            throw invalid("product must not be blank");
        }
        requireTexts("dosage", data.dosage());
        requireTexts("method", data.method());
    }

    private static AdminTreatment view(Treatment treatment) {
        return new AdminTreatment(treatment.getId(), new TreatmentData(treatment.getType(), treatment.getProduct(),
                treatment.getActiveIngredient(), treatment.getDosage(), treatment.getMethod(),
                treatment.getSortOrder()));
    }

    private void validate(String code, DiseaseData data) {
        requireAllLanguages(data.names());
        requireTexts("symptoms", data.symptoms());
        requireTexts("conditions", data.conditions());
        requireTexts("prevention", data.prevention());
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
        requireTexts("names", names);
    }

    /**
     * Keeps the read contract: only the known languages, each a string or a list of
     * strings of bounded length.
     */
    private static void requireTexts(String field, Map<String, ?> texts) {
        if (texts == null) {
            return;
        }
        for (Map.Entry<String, ?> entry : texts.entrySet()) {
            if (!LANGUAGES.contains(entry.getKey())) {
                throw invalid(field + " has an unsupported language: " + entry.getKey());
            }
            Object value = entry.getValue();
            if (value instanceof List<?> items) {
                if (items.size() > MAX_ITEMS) {
                    throw invalid(field + " has too many items");
                }
                items.forEach(item -> requireText(field, item));
            } else {
                requireText(field, value);
            }
        }
    }

    private static void requireText(String field, Object value) {
        if (!(value instanceof String text) || text.length() > MAX_TEXT_LENGTH) {
            throw invalid(field + " must be a string or a list of strings up to " + MAX_TEXT_LENGTH
                    + " characters");
        }
    }

    private static ApiException invalid(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED, detail);
    }

    private static ApiException cropNotFound(String code) {
        return new ApiException(HttpStatus.NOT_FOUND, CatalogErrors.CROP_NOT_FOUND, "Unknown crop: " + code);
    }

    private static ApiException cropExists(String code) {
        return new ApiException(HttpStatus.CONFLICT, CatalogErrors.CROP_EXISTS, "Crop already exists: " + code);
    }

    private static ApiException diseaseNotFound(String code) {
        return new ApiException(HttpStatus.NOT_FOUND, CatalogErrors.DISEASE_NOT_FOUND, "Unknown disease: " + code);
    }

    private static ApiException diseaseExists(String code) {
        return new ApiException(HttpStatus.CONFLICT, CatalogErrors.DISEASE_EXISTS,
                "Disease already exists: " + code);
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

    /** Dosage and method are optional translations. */
    public record TreatmentData(String type, String product, String activeIngredient,
            Map<String, String> dosage, Map<String, String> method, int sortOrder) {
    }

    public record AdminTreatment(Long id, TreatmentData data) {
    }

    public record AdminDisease(String code, DiseaseData data, int treatmentCount) {
    }
}
