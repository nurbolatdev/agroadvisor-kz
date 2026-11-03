package kz.agroadvisor.diagnosis.model;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.Generated;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.generator.EventType;
import org.hibernate.type.SqlTypes;

/**
 * One recognition result in a user's history. {@code top1Code} has no foreign key to the reference on
 * purpose: the model may know a class the reference does not describe yet. Region, district and
 * location columns are not mapped until the outbreak map needs them.
 */
@Entity
@Table(name = "diagnoses")
public class Diagnosis {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "crop_code")
    private String cropCode;

    /** Object key in the photo bucket, not a URL. */
    @Column(name = "photo_key")
    private String photoKey;

    private String status;

    @Column(name = "top1_code")
    private String top1Code;

    @Column(name = "top1_confidence")
    private BigDecimal top1Confidence;

    @JdbcTypeCode(SqlTypes.JSON)
    private List<ClassScore> top3;

    @Column(name = "detected_crop")
    private String detectedCrop;

    @Column(name = "model_version")
    private String modelVersion;

    @Column(name = "classes_version")
    private int classesVersion;

    @Column(name = "inference_ms")
    private Integer inferenceMs;

    /** Set by the database default; Hibernate reads it back right after the insert. */
    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    /** The client's {@code Idempotency-Key}; null when the request had none. Unique per user. */
    @Column(name = "idempotency_key")
    private String idempotencyKey;

    /** SHA-256 (hex) of the photo bytes, to tell a resend of the same photo from a new photo under the same key. */
    @Column(name = "request_fingerprint")
    private String requestFingerprint;

    protected Diagnosis() {
    }

    public Diagnosis(UUID userId, String cropCode, String photoKey, String status, String top1Code,
            BigDecimal top1Confidence, List<ClassScore> top3, String detectedCrop, String modelVersion,
            int classesVersion, Integer inferenceMs) {
        this(userId, cropCode, photoKey, status, top1Code, top1Confidence, top3, detectedCrop, modelVersion,
                classesVersion, inferenceMs, null, null);
    }

    public Diagnosis(UUID userId, String cropCode, String photoKey, String status, String top1Code,
            BigDecimal top1Confidence, List<ClassScore> top3, String detectedCrop, String modelVersion,
            int classesVersion, Integer inferenceMs, String idempotencyKey, String requestFingerprint) {
        this.idempotencyKey = idempotencyKey;
        this.requestFingerprint = requestFingerprint;
        this.userId = userId;
        this.cropCode = cropCode;
        this.photoKey = photoKey;
        this.status = status;
        this.top1Code = top1Code;
        this.top1Confidence = top1Confidence;
        this.top3 = top3;
        this.detectedCrop = detectedCrop;
        this.modelVersion = modelVersion;
        this.classesVersion = classesVersion;
        this.inferenceMs = inferenceMs;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getCropCode() {
        return cropCode;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public String getRequestFingerprint() {
        return requestFingerprint;
    }

    public String getPhotoKey() {
        return photoKey;
    }

    public String getStatus() {
        return status;
    }

    public String getTop1Code() {
        return top1Code;
    }

    public BigDecimal getTop1Confidence() {
        return top1Confidence;
    }

    public List<ClassScore> getTop3() {
        return top3;
    }

    public String getDetectedCrop() {
        return detectedCrop;
    }

    public String getModelVersion() {
        return modelVersion;
    }

    public int getClassesVersion() {
        return classesVersion;
    }

    public Integer getInferenceMs() {
        return inferenceMs;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
