package kz.agroadvisor.diagnosis.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.catalog.model.Disease;
import kz.agroadvisor.catalog.repository.DiseaseRepository;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.diagnosis.model.ClassScore;
import kz.agroadvisor.diagnosis.model.Diagnosis;
import kz.agroadvisor.diagnosis.repository.DiagnosisRepository;

/**
 * Photo diagnosis: validates the request, keeps the photo, asks the AI service and records the result.
 * Storage and the model call happen outside a database transaction; only the history queries and the
 * final save use one.
 */
@Service
public class DiagnosisService {

    private static final int MAX_PHOTO_BYTES = 10 * 1024 * 1024;
    private static final Set<String> IMAGE_TYPES = Set.of("image/jpeg", "image/png");

    private final AiClient ai;
    private final PhotoStorage photos;
    private final DiagnosisRepository diagnoses;
    private final DiseaseRepository diseases;

    public DiagnosisService(AiClient ai, PhotoStorage photos, DiagnosisRepository diagnoses,
            DiseaseRepository diseases) {
        this.ai = ai;
        this.photos = photos;
        this.diagnoses = diagnoses;
        this.diseases = diseases;
    }

    /**
     * A result as the app sees it. {@code placeholder} marks an answer of the stand-in model, which must
     * not be shown as a diagnosis; {@code descriptionReady} is false when the model knows a class the
     * reference does not describe yet ("description is being prepared").
     */
    public record DiagnosisView(UUID id, String crop, String status, ClassScore top1, List<ClassScore> top3,
            String detectedCrop, String modelVersion, int classesVersion, boolean placeholder,
            boolean descriptionReady, Instant createdAt) {
    }

    public DiagnosisView create(UUID userId, String crop, byte[] photo, String contentType) {
        if (!ai.crops().contains(crop)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, DiagnosisErrors.UNKNOWN_CROP, "Unsupported crop: " + crop);
        }
        // Set.of(...).contains(null) throws, and a part may arrive without a content type
        if (photo.length == 0 || photo.length > MAX_PHOTO_BYTES
                || contentType == null || !IMAGE_TYPES.contains(contentType)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, DiagnosisErrors.INVALID_IMAGE,
                    "Send a JPEG or PNG photo of up to 10 MB");
        }
        String photoKey = photos.store(userId, photo, contentType);
        Prediction prediction = ai.predict(crop, photo);
        Diagnosis saved = diagnoses.save(new Diagnosis(userId, crop, photoKey, prediction.status(),
                prediction.top1().code(), BigDecimal.valueOf(prediction.top1().confidence()).setScale(4, RoundingMode.HALF_UP),
                prediction.top3(), prediction.detectedCrop(), prediction.modelVersion(),
                prediction.classesVersion(), prediction.inferenceMs()));
        return views(List.of(saved)).get(0);
    }

    @Transactional(readOnly = true)
    public List<DiagnosisView> history(UUID userId, int page, int size) {
        return views(diagnoses.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(page, size)));
    }

    private List<DiagnosisView> views(List<Diagnosis> rows) {
        Set<String> described = diseases.findAllById(rows.stream().map(Diagnosis::getTop1Code).distinct().toList())
                .stream().map(Disease::getCode).collect(Collectors.toSet());
        return rows.stream().map(d -> new DiagnosisView(d.getId(), d.getCropCode(), d.getStatus(),
                new ClassScore(d.getTop1Code(), d.getTop1Confidence().doubleValue()), d.getTop3(),
                d.getDetectedCrop(), d.getModelVersion(), d.getClassesVersion(),
                Prediction.isPlaceholderVersion(d.getModelVersion()), described.contains(d.getTop1Code()),
                d.getCreatedAt())).toList();
    }
}
