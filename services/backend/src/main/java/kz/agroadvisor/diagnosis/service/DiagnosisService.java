package kz.agroadvisor.diagnosis.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.swagger.v3.oas.annotations.media.Schema;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import kz.agroadvisor.catalog.model.Disease;
import kz.agroadvisor.catalog.repository.DiseaseRepository;
import kz.agroadvisor.common.image.ImageMetadataStripper;
import kz.agroadvisor.common.image.InvalidImageException;
import kz.agroadvisor.common.ratelimit.RateLimitProperties;
import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;
import kz.agroadvisor.diagnosis.config.DiagnosisProperties;
import kz.agroadvisor.diagnosis.model.ClassScore;
import kz.agroadvisor.diagnosis.model.Diagnosis;
import kz.agroadvisor.diagnosis.repository.DiagnosisClaims;
import kz.agroadvisor.diagnosis.repository.DiagnosisRepository;

/**
 * Photo diagnosis: validates the request, keeps the photo, asks the AI service and records the result.
 * Storage and the model call happen outside a database transaction; only the history queries and the
 * final save use one.
 */
@Service
public class DiagnosisService {

    private static final Logger log = LoggerFactory.getLogger(DiagnosisService.class);

    private static final int MAX_PHOTO_BYTES = 10 * 1024 * 1024;
    private static final byte[] JPEG_SIGNATURE = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};

    /** A UUID fits; the mobile app sends one per attempt group. */
    private static final Pattern IDEMPOTENCY_KEY = Pattern.compile("[A-Za-z0-9_.:-]{8,80}");

    private final AiClient ai;
    private final PhotoStorage photos;
    private final DiagnosisRepository diagnoses;
    private final DiseaseRepository diseases;
    private final MeterRegistry meters;
    private final RateLimiter rateLimiter;
    private final RateLimitProperties limits;
    private final ImageMetadataStripper metadata;
    private final DiagnosisClaims claims;
    private final TransactionTemplate tx;
    private final DiagnosisProperties props;

    public DiagnosisService(AiClient ai, PhotoStorage photos, DiagnosisRepository diagnoses,
            DiseaseRepository diseases, MeterRegistry meters, RateLimiter rateLimiter, RateLimitProperties limits,
            ImageMetadataStripper metadata, DiagnosisClaims claims, TransactionTemplate tx,
            DiagnosisProperties props) {
        this.metadata = metadata;
        this.claims = claims;
        this.tx = tx;
        this.props = props;
        this.ai = ai;
        this.photos = photos;
        this.diagnoses = diagnoses;
        this.diseases = diseases;
        this.meters = meters;
        this.rateLimiter = rateLimiter;
        this.limits = limits;
    }

    /**
     * A result as the app sees it. {@code placeholder} marks an answer of the stand-in model, which must
     * not be shown as a diagnosis; {@code descriptionReady} is false when the model knows a class the
     * reference does not describe yet ("description is being prepared").
     */
    public record DiagnosisView(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) String crop,
            @Schema(requiredMode = REQUIRED, allowableValues = {"ok", "low_confidence", "unknown", "crop_mismatch"})
            String status,
            @Schema(requiredMode = REQUIRED) ClassScore top1,
            @Schema(requiredMode = REQUIRED) List<ClassScore> top3,
            @Schema(nullable = true, description = "Set only when status is crop_mismatch") String detectedCrop,
            @Schema(requiredMode = REQUIRED) String modelVersion,
            @Schema(requiredMode = REQUIRED) int classesVersion,
            @Schema(requiredMode = REQUIRED) boolean placeholder,
            @Schema(requiredMode = REQUIRED) boolean descriptionReady,
            @Schema(requiredMode = REQUIRED, description = "Relative path of the photo; GET it with the same token",
                    example = "/api/diagnoses/0b1f2c3d-0000-4000-8000-000000000000/photo") String photoUrl,
            @Schema(requiredMode = REQUIRED) Instant createdAt) {
    }

    /** The photo bytes with their type (from the key's extension) and the key as a stable ETag source. */
    public record PhotoContent(byte[] bytes, String contentType, String key) {
    }

    /** One of the caller's diagnoses; another user's and a missing id give the same 404. */
    @Transactional(readOnly = true)
    public DiagnosisView get(UUID userId, UUID id) {
        return views(List.of(owned(userId, id))).get(0);
    }

    /** The photo of one of the caller's diagnoses. A missing object is a storage fault, logged as ERROR. */
    @Transactional(readOnly = true)
    public PhotoContent photo(UUID userId, UUID id) {
        String key = owned(userId, id).getPhotoKey();
        byte[] bytes = photos.load(key).orElseThrow(() -> {
            log.error("Photo object '{}' of diagnosis {} is missing from the storage", key, id);
            return new ApiException(HttpStatus.NOT_FOUND, DiagnosisErrors.PHOTO_NOT_FOUND, "The photo is not found");
        });
        return new PhotoContent(bytes, key.endsWith(".png") ? "image/png" : "image/jpeg", key);
    }

    private Diagnosis owned(UUID userId, UUID id) {
        return diagnoses.findById(id).filter(d -> d.getUserId().equals(userId))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, DiagnosisErrors.DIAGNOSIS_NOT_FOUND,
                        "Diagnosis not found"));
    }

    /** {@code replayed} is true when the diagnosis already existed for the request's Idempotency-Key. */
    public record Created(DiagnosisView view, boolean replayed) {
    }

    /**
     * With an {@code idempotencyKey} a repeated request returns the diagnosis made the first time: the
     * photo is not stored again and the model is not called. The key is matched with the crop and the
     * SHA-256 of the photo: the same key with another crop or another photo is refused (422
     * {@code idempotency_key_reused}, reason {@code crop} or {@code photo}).
     *
     * <p>One model call per key: after the checks the request claims the key in {@code diagnosis_requests};
     * a second request with the same key meanwhile gets 409 {@code request_in_progress} with
     * {@code Retry-After: 2} and does nothing else. A claim older than {@code app.diagnosis.claim-timeout} is
     * taken over (same photo and crop only) under a new fencing token, so the old owner cannot release or
     * overwrite the new one's claim. The result is protected by the unique index: if two requests still
     * finish together, one wins and the other returns its row.
     *
     * <p>Order matters: the key is looked up (and a live claim answered with 409) before the rate limit, so a
     * replay or a 409 never spends the user's diagnosis limit; the limit is checked before the photo is
     * validated, stored or sent to the model.
     */
    public Created create(UUID userId, String crop, byte[] photo, String idempotencyKey) {
        if (idempotencyKey != null && !IDEMPOTENCY_KEY.matcher(idempotencyKey).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, DiagnosisErrors.INVALID_IDEMPOTENCY_KEY,
                    "Idempotency-Key must be 8-80 characters: letters, digits, '-', '_', '.', ':'");
        }
        String fingerprint = fingerprint(photo);
        if (idempotencyKey != null) {
            Optional<Diagnosis> existing = diagnoses.findByUserIdAndIdempotencyKey(userId, idempotencyKey);
            if (existing.isPresent()) {
                return replay(existing.get(), crop, fingerprint);
            }
            // Another request with this key is working: answer before the limit is spent
            claims.find(userId, idempotencyKey, props.claimTimeout()).ifPresent(c -> refuseUnlessExpired(c, crop,
                    fingerprint));
        }
        rateLimiter.check("diagnosis", userId.toString(), limits.diagnosisPerMinute(), Duration.ofMinutes(1));
        if (!ai.crops().contains(crop)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, DiagnosisErrors.UNKNOWN_CROP, "Unsupported crop: " + crop);
        }
        String contentType = photo.length > MAX_PHOTO_BYTES ? null : imageType(photo);
        if (contentType == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, DiagnosisErrors.INVALID_IMAGE,
                    "Send a JPEG or PNG photo of up to 10 MB");
        }
        UUID claimId = null;
        if (idempotencyKey != null) {
            Acquired acquired = acquire(userId, idempotencyKey, crop, fingerprint);
            if (acquired.finished() != null) {
                return replay(acquired.finished(), crop, fingerprint);
            }
            claimId = acquired.claimId();
        }
        // Without a key the object name is random and the photo is ours alone, so it can be removed on a
        // failure. With a key the name is the same for every attempt (see objectName), so another attempt may
        // be using that very object: it is never removed here (an abandoned one is rare and harmless).
        String photoKey = null;
        Diagnosis saved;
        try {
            // The fingerprint above is of the client's bytes; what is kept and sent to the model has no metadata
            byte[] clean = strip(photo);
            photoKey = photos.store(userId, objectName(idempotencyKey, fingerprint), clean, contentType);
            Prediction prediction = predict(crop, clean);
            saved = finish(userId, crop, photoKey, prediction, idempotencyKey, fingerprint, claimId);
        } catch (DataIntegrityViolationException e) {
            // Lost the race on (user_id, idempotency_key): the other request's row is the answer
            Optional<Diagnosis> winner = idempotencyKey == null ? Optional.empty()
                    : diagnoses.findByUserIdAndIdempotencyKey(userId, idempotencyKey);
            release(userId, idempotencyKey, claimId, e);
            if (winner.isEmpty()) {
                discardUnkeyed(photoKey, idempotencyKey, e);
                throw e;
            }
            return replay(winner.get(), crop, fingerprint);
        } catch (RuntimeException e) {
            release(userId, idempotencyKey, claimId, e);
            discardUnkeyed(photoKey, idempotencyKey, e);
            throw e;
        }
        // Outside the try: the row is committed, so a failure here must not delete the photo it points to
        return new Created(views(List.of(saved)).get(0), false);
    }

    /** What {@link #acquire} found: our claim to work under, or the diagnosis that was finished meanwhile. */
    private record Acquired(UUID claimId, Diagnosis finished) {
    }

    /**
     * Gets the right to call the model for this key. The primary key of {@code diagnosis_requests} lets one
     * request in. A request that loses looks at what stands in its way: a finished diagnosis (replay), a claim
     * for other bytes or another crop (422), a working request (409 + Retry-After), or a claim older than the
     * timeout, which it takes over under a new fencing token.
     */
    private Acquired acquire(UUID userId, String key, String crop, String fingerprint) {
        for (int attempt = 0; attempt < 3; attempt++) {
            Optional<UUID> claim = claims.tryClaim(userId, key, fingerprint, crop);
            if (claim.isPresent()) {
                meters.counter("agroadvisor.diagnosis.claims", "outcome", "acquired").increment();
                return new Acquired(claim.get(), null);
            }
            Optional<Diagnosis> finished = diagnoses.findByUserIdAndIdempotencyKey(userId, key);
            if (finished.isPresent()) {
                return new Acquired(null, finished.get());
            }
            Optional<DiagnosisClaims.Existing> holder = claims.find(userId, key, props.claimTimeout());
            if (holder.isEmpty()) {
                continue; // released between our insert and our look: try again
            }
            refuseUnlessExpired(holder.get(), crop, fingerprint);
            Optional<UUID> taken = claims.takeOver(userId, key, fingerprint, crop, props.claimTimeout());
            if (taken.isPresent()) {
                meters.counter("agroadvisor.diagnosis.claims", "outcome", "taken_over").increment();
                log.warn("Took over an expired claim of key {} of user {}", key, userId);
                return new Acquired(taken.get(), null);
            }
        }
        throw inProgress();
    }

    /** A claim for other bytes or another crop is 422, a live one is 409; an expired one passes. */
    private void refuseUnlessExpired(DiagnosisClaims.Existing claim, String crop, String fingerprint) {
        if (!claim.cropCode().equals(crop)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, DiagnosisErrors.IDEMPOTENCY_KEY_REUSED,
                    "This Idempotency-Key was used for a diagnosis of another crop", "crop");
        }
        if (!claim.requestFingerprint().equals(fingerprint)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, DiagnosisErrors.IDEMPOTENCY_KEY_REUSED,
                    "This Idempotency-Key was used for another photo; make a new key for a new photo", "photo");
        }
        if (!claim.expired()) {
            throw inProgress();
        }
    }

    private ApiException inProgress() {
        meters.counter("agroadvisor.diagnosis.claims", "outcome", "in_progress").increment();
        return new ApiException(HttpStatus.CONFLICT, DiagnosisErrors.REQUEST_IN_PROGRESS,
                "The same request is already being processed, retry in a moment").withHeader("Retry-After", "2");
    }

    /**
     * The one transaction that ends a request: the diagnosis is inserted (and flushed, so that a clash with
     * the unique index of V11 surfaces here) and our claim is deleted. If the claim was taken over, the
     * delete touches no row, which is not an error: the diagnosis insert still decides who is first.
     */
    private Diagnosis finish(UUID userId, String crop, String photoKey, Prediction prediction, String key,
            String fingerprint, UUID claimId) {
        return tx.execute(status -> {
            Diagnosis saved = diagnoses.saveAndFlush(new Diagnosis(userId, crop, photoKey, prediction.status(),
                    prediction.top1().code(),
                    BigDecimal.valueOf(prediction.top1().confidence()).setScale(4, RoundingMode.HALF_UP),
                    prediction.top3(), prediction.detectedCrop(), prediction.modelVersion(),
                    prediction.classesVersion(), prediction.inferenceMs(), key, fingerprint));
            if (claimId != null && claims.release(userId, key, claimId) == 0) {
                log.debug("The claim of key {} was taken over before the diagnosis was saved", key);
            }
            return saved;
        });
    }

    /** Removes our claim, if we hold one; a failure to do so must not hide the original error. */
    private void release(UUID userId, String key, UUID claimId, RuntimeException cause) {
        if (claimId == null) {
            return;
        }
        try {
            claims.release(userId, key, claimId);
        } catch (RuntimeException cleanup) {
            cause.addSuppressed(cleanup);
        }
    }

    private void discardUnkeyed(String photoKey, String idempotencyKey, RuntimeException cause) {
        if (photoKey != null && idempotencyKey == null) {
            discard(photoKey, cause);
        }
    }

    private byte[] strip(byte[] photo) {
        try {
            return metadata.strip(photo);
        } catch (InvalidImageException e) {
            // Same code, status and text as the AI service's invalid_image (HttpAiClient)
            throw new ApiException(HttpStatus.BAD_REQUEST, DiagnosisErrors.INVALID_IMAGE,
                    "The photo cannot be read, send another JPEG or PNG");
        }
    }

    /**
     * The object name inside the user's folder. With a key it is SHA-256 of {@code key + "\n" + fingerprint}:
     * the same name always means the same Idempotency-Key <em>and</em> the same photo bytes, by construction.
     * So no later request, however old its claim is gone, can write other bytes under the name of an existing
     * diagnosis' photo, and the "immutable" cache header of the photo endpoint stays true. Without a key
     * the name is random.
     */
    static String objectName(String idempotencyKey, String fingerprint) {
        return idempotencyKey == null ? UUID.randomUUID().toString()
                : fingerprint((idempotencyKey + "\n" + fingerprint).getBytes(StandardCharsets.UTF_8));
    }

    private Created replay(Diagnosis existing, String crop, String fingerprint) {
        if (!existing.getCropCode().equals(crop)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, DiagnosisErrors.IDEMPOTENCY_KEY_REUSED,
                    "This Idempotency-Key was used for a diagnosis of another crop", "crop");
        }
        // A row with a key always has a fingerprint (CHECK in V12)
        if (!existing.getRequestFingerprint().equals(fingerprint)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, DiagnosisErrors.IDEMPOTENCY_KEY_REUSED,
                    "This Idempotency-Key was used for another photo; make a new key for a new photo", "photo");
        }
        meters.counter("agroadvisor.diagnosis.replays").increment();
        return new Created(views(List.of(existing)).get(0), true);
    }

    /** SHA-256 of the photo bytes as lower-case hex (64 characters). */
    public static String fingerprint(byte[] photo) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(photo));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required by the JDK", e);
        }
    }

    /**
     * The model call, timed: {@code agroadvisor.ai.predict} with {@code outcome} (ok or error) and
     * {@code code} (the status of the answer, or the error code the farmer gets). Tags stay few: the
     * statuses and error codes are fixed sets.
     */
    private Prediction predict(String crop, byte[] photo) {
        Timer.Sample sample = Timer.start(meters);
        String outcome = "error";
        String code = ErrorCodes.INTERNAL_ERROR;
        try {
            Prediction prediction = ai.predict(crop, photo);
            outcome = "ok";
            code = prediction.status();
            return prediction;
        } catch (ApiException e) {
            code = e.getCode();
            throw e;
        } finally {
            sample.stop(meters.timer("agroadvisor.ai.predict", "outcome", outcome, "code", code));
        }
    }

    /** A photo without a diagnosis row is garbage; a failed cleanup must not hide the original error. */
    private void discard(String photoKey, RuntimeException cause) {
        try {
            photos.delete(photoKey);
        } catch (RuntimeException cleanup) {
            cause.addSuppressed(cleanup);
        }
    }

    /**
     * The real type from the file's first bytes, not from the client's Content-Type header: the header
     * is optional, often non-standard ({@code image/jpg}) and says nothing about the content.
     */
    private static String imageType(byte[] photo) {
        if (startsWith(photo, JPEG_SIGNATURE)) {
            return "image/jpeg";
        }
        return startsWith(photo, PNG_SIGNATURE) ? "image/png" : null;
    }

    private static boolean startsWith(byte[] data, byte[] prefix) {
        return data.length > prefix.length && Arrays.equals(data, 0, prefix.length, prefix, 0, prefix.length);
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
                "/api/diagnoses/" + d.getId() + "/photo", d.getCreatedAt())).toList();
    }
}
