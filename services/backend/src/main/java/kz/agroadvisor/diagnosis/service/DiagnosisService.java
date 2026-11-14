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
import java.util.concurrent.atomic.AtomicBoolean;
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
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.Assert;

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
import kz.agroadvisor.users.service.UserService;

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
    private final UserService users;

    public DiagnosisService(AiClient ai, PhotoStorage photos, DiagnosisRepository diagnoses,
            DiseaseRepository diseases, MeterRegistry meters, RateLimiter rateLimiter, RateLimitProperties limits,
            ImageMetadataStripper metadata, DiagnosisClaims claims, TransactionTemplate tx,
            DiagnosisProperties props, UserService users) {
        this.users = users;
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

        /** The same result with another photo path (a consultation serves the photo to its other side). */
        public DiagnosisView withPhotoUrl(String url) {
            return new DiagnosisView(id, crop, status, top1, top3, detectedCrop, modelVersion, classesVersion,
                    placeholder, descriptionReady, url, createdAt);
        }
    }

    /** The photo bytes with their type (from the key's extension) and the key as a stable ETag source. */
    public record PhotoContent(byte[] bytes, String contentType, String key) {
    }

    /** One of the caller's diagnoses; another user's and a missing id give the same 404. */
    @Transactional(readOnly = true)
    public DiagnosisView get(UUID userId, UUID id) {
        return views(List.of(owned(userId, id))).get(0);
    }

    /**
     * The object key of one of the caller's diagnoses (another user's and a missing id are the same 404). A
     * single repository read; no transaction stays open while the photo is downloaded from the storage.
     */
    public String photoKey(UUID userId, UUID id) {
        return owned(userId, id).getPhotoKey();
    }

    /** The photo bytes by object key. A missing object is a storage fault, logged as ERROR. */
    public PhotoContent loadPhoto(UUID diagnosisId, String key) {
        byte[] bytes = photos.load(key).orElseThrow(() -> {
            log.error("Photo object '{}' of diagnosis {} is missing from the storage", key, diagnosisId);
            return new ApiException(HttpStatus.NOT_FOUND, DiagnosisErrors.PHOTO_NOT_FOUND, "The photo is not found");
        });
        return new PhotoContent(bytes, key.endsWith(".png") ? "image/png" : "image/jpeg", key);
    }

    /**
     * The ETag of a photo: a hash of its object key. The photo of a diagnosis never changes, so the key is a
     * stable validator; hashing keeps the user id inside the key off the wire.
     */
    public static String photoEtag(String key) {
        return "\"" + fingerprint(key.getBytes(StandardCharsets.UTF_8)) + "\"";
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
     * replay or a 409 found there never spends the user's diagnosis limit; the limit is checked before the
     * photo is validated, sent to the model or stored. The model is asked before the photo is stored, so a
     * model failure writes nothing.
     *
     * <p>Two limits guard the door. The attempts (20 a minute) protect the AI from a retry storm and are never
     * given back. The diagnosis token (5 a minute) counts diagnoses: it is given back when the request ends in
     * a replay, in {@code 409 request_in_progress} (also after a lost race at the start), or in a failure on
     * our side (the model or the storage is down, any 5xx); it is kept when the request is refused for its own
     * input (unknown crop, not an image, too poor for the model). Principle: refunded when the server did no
     * work or failed on its side, charged when compute was spent on, or the fault is in, the client's input.
     */
    public Created create(UUID userId, String crop, byte[] photo, String idempotencyKey) {
        // finish() must commit by itself: inside an outer transaction the commit would come later, after the
        // decision to keep or remove the photo object was already made, and the claim would not be released.
        Assert.state(!TransactionSynchronizationManager.isActualTransactionActive(),
                "DiagnosisService.create must not run inside a transaction");
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
        // Two limits at the door. Attempts (20 a minute) guard the AI from a retry storm and are never given
        // back, whatever happens; it is checked first, so a refused attempt does not spend a diagnosis token.
        rateLimiter.check("diagnosis-attempts", userId.toString(), limits.diagnosisAttemptsPerMinute(),
                Duration.ofMinutes(1));
        // The diagnosis token is spent here, before any work, so that a burst of parallel requests is cut at the
        // door and a flood of bad photos still counts. It is given back below when the server did no work or
        // failed on its side.
        RateLimiter.Ticket ticket = rateLimiter.check("diagnosis", userId.toString(), limits.diagnosisPerMinute(),
                Duration.ofMinutes(1));
        AtomicBoolean made = new AtomicBoolean();
        try {
            Created created = createCounted(userId, crop, photo, idempotencyKey, fingerprint, made);
            if (created.replayed()) {
                rateLimiter.refund(ticket); // the answer of an earlier request, nothing new was made
            }
            return created;
        } catch (RuntimeException e) {
            // a diagnosis that is already saved is a diagnosis made: building its answer failing is not a refund
            if (!made.get() && DiagnosisErrors.givesBackTheToken(e)) {
                rateLimiter.refund(ticket);
            }
            throw e;
        }
    }

    /** The work of {@link #create} after the token is spent; {@code made} is set once a new diagnosis is saved. */
    private Created createCounted(UUID userId, String crop, byte[] photo, String idempotencyKey,
            String fingerprint, AtomicBoolean made) {
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
        // Every attempt writes its own object (the name is random, see objectName), so the photo is ours alone
        // and is removed when it is certain that no row points to it (see discardIfNoRow). When that is not
        // certain, it is left to the cleanup of orphaned photos.
        String photoKey = null;
        // Set when the transaction body is done: a failure after that is raised by the commit itself
        AtomicBoolean atCommit = new AtomicBoolean();
        Diagnosis saved;
        try {
            // The fingerprint above is of the client's bytes; what is kept and sent to the model has no metadata
            byte[] clean = strip(photo);
            // The model first: when it is down nothing is written, and a keyed request leaves no object behind
            Prediction prediction = predict(crop, clean);
            photoKey = photos.store(userId, objectName(), clean, contentType);
            saved = finish(userId, crop, photoKey, prediction, idempotencyKey, fingerprint, claimId, atCommit);
            made.set(true);
        } catch (DataIntegrityViolationException e) {
            // Lost the race on (user_id, idempotency_key): the other request's row is the answer
            Optional<Diagnosis> winner = idempotencyKey == null ? Optional.empty()
                    : diagnoses.findByUserIdAndIdempotencyKey(userId, idempotencyKey);
            release(userId, idempotencyKey, claimId, e);
            // The loser's own object goes; the winner's row points to the winner's object, not to this one
            discardIfNoRow(photoKey, winner, atCommit, e);
            if (winner.isEmpty()) {
                throw e;
            }
            return replay(winner.get(), crop, fingerprint);
        } catch (RuntimeException e) {
            release(userId, idempotencyKey, claimId, e);
            discardIfNoRow(photoKey, Optional.empty(), atCommit, e);
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
                return confirmed(userId, key, claim.get());
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
                return confirmed(userId, key, taken.get());
            }
        }
        throw inProgress();
    }

    /**
     * Looks for a finished diagnosis again once the claim is ours. Without this a request that looked for the
     * diagnosis just before another request committed it (diagnosis inserted and claim deleted in one
     * transaction) could win a fresh claim right after and call the model a second time. From here the window
     * is closed: a claim can only be created after that commit, and then the diagnosis is visible.
     */
    private Acquired confirmed(UUID userId, String key, UUID claimId) {
        Optional<Diagnosis> finished = diagnoses.findByUserIdAndIdempotencyKey(userId, key);
        if (finished.isEmpty()) {
            return new Acquired(claimId, null);
        }
        claims.release(userId, key, claimId);
        return new Acquired(null, finished.get());
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
     * the unique index of V11 surfaces here) with the user's current region, and our claim is deleted. If
     * the claim was taken over, the delete touches no row, which is not an error: the diagnosis insert
     * still decides who is first.
     */
    private Diagnosis finish(UUID userId, String crop, String photoKey, Prediction prediction, String key,
            String fingerprint, UUID claimId, AtomicBoolean atCommit) {
        return tx.execute(status -> {
            // Snapshot of the region at the moment of saving, after the model has answered
            Long regionId = users.regionOf(userId).orElse(null);
            Diagnosis saved = diagnoses.saveAndFlush(new Diagnosis(userId, crop, photoKey, prediction.status(),
                    prediction.top1().code(),
                    BigDecimal.valueOf(prediction.top1().confidence()).setScale(4, RoundingMode.HALF_UP),
                    prediction.top3(), prediction.detectedCrop(), prediction.modelVersion(),
                    prediction.classesVersion(), prediction.inferenceMs(), key, fingerprint, regionId));
            if (claimId != null && claims.release(userId, key, claimId) == 0) {
                log.debug("The claim of key {} was taken over before the diagnosis was saved", key);
            }
            // Past this point only the commit can fail; whether it went through is then unknown to us
            atCommit.set(true);
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

    /**
     * Removes this attempt's own object, but only when it is certain that no row points to it: the failure came
     * from the body of the transaction (which is rolled back), not from the commit, and it is not a
     * transaction-system failure (a broken commit or rollback leaves the outcome unknown). Then, if another
     * request's row won the race, it does not point to this object. In every uncertain case the object stays and
     * the cleanup of orphaned photos decides later, against the database.
     */
    private void discardIfNoRow(String photoKey, Optional<Diagnosis> winner, AtomicBoolean atCommit,
            RuntimeException cause) {
        if (photoKey == null) {
            return;
        }
        if (atCommit.get() || cause instanceof TransactionException
                || winner.map(w -> photoKey.equals(w.getPhotoKey())).orElse(false)) {
            log.warn("Photo object '{}' is kept: it is not certain that no diagnosis points to it", photoKey);
            return;
        }
        discard(photoKey, cause);
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
     * The object name inside the user's folder: a new random UUID for every attempt, with or without an
     * Idempotency-Key. No attempt ever writes over an object another attempt wrote, so the photo of an existing
     * diagnosis can never be replaced (the "immutable" cache header of the photo endpoint stays true) and an
     * attempt that fails can remove its own object without touching anyone else's.
     */
    static String objectName() {
        return UUID.randomUUID().toString();
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
            log.warn("Photo object '{}' could not be removed, the cleanup of orphaned photos will: {}", photoKey,
                    cleanup.toString());
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
