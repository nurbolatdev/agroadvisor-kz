package kz.agroadvisor.diagnosis.repository;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Claims on Idempotency-Keys ({@code diagnosis_requests}, V14). Every method is one SQL statement and
 * joins the caller's transaction if there is one; none of them holds a lock after it returns. Time is the
 * database's ({@code now()}), so that all backend instances compare against one clock.
 *
 * <p>{@code claimId} is a fencing token: a claim is released or finished only by the request that holds
 * the current {@code claimId}, so a slow request whose claim was taken over cannot touch the new owner's row.
 */
@Repository
public class DiagnosisClaims {

    /** A claim as another request sees it. {@code expired} is decided by the database clock. */
    public record Existing(String requestFingerprint, String cropCode, boolean expired) {
    }

    private final JdbcTemplate jdbc;

    public DiagnosisClaims(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Claims the key if nobody has; the primary key lets exactly one concurrent caller in. */
    public Optional<UUID> tryClaim(UUID userId, String key, String fingerprint, String cropCode) {
        UUID claimId = UUID.randomUUID();
        int inserted = jdbc.update("INSERT INTO diagnosis_requests "
                + "(user_id, idempotency_key, request_fingerprint, crop_code, claim_id) VALUES (?, ?, ?, ?, ?) "
                + "ON CONFLICT (user_id, idempotency_key) DO NOTHING", userId, key, fingerprint, cropCode, claimId);
        return inserted == 1 ? Optional.of(claimId) : Optional.empty();
    }

    public Optional<Existing> find(UUID userId, String key, Duration timeout) {
        return jdbc.query("SELECT request_fingerprint, crop_code, started_at < now() - make_interval(secs => ?) "
                + "FROM diagnosis_requests WHERE user_id = ? AND idempotency_key = ?",
                (rs, i) -> new Existing(rs.getString(1), rs.getString(2), rs.getBoolean(3)),
                seconds(timeout), userId, key).stream().findFirst();
    }

    /**
     * Takes over a claim whose owner has been silent for longer than {@code timeout}. Only a claim for the
     * same photo and crop is taken: the fingerprint and the crop are part of the condition, so a request
     * with other bytes can never inherit (and then write over) a claim made for different ones.
     */
    public Optional<UUID> takeOver(UUID userId, String key, String fingerprint, String cropCode, Duration timeout) {
        UUID claimId = UUID.randomUUID();
        int updated = jdbc.update("UPDATE diagnosis_requests SET claim_id = ?, started_at = now() "
                + "WHERE user_id = ? AND idempotency_key = ? AND request_fingerprint = ? AND crop_code = ? "
                + "AND started_at < now() - make_interval(secs => ?)",
                claimId, userId, key, fingerprint, cropCode, seconds(timeout));
        return updated == 1 ? Optional.of(claimId) : Optional.empty();
    }

    /** Removes the claim if it is still ours; 0 means it was taken over or already removed, which is fine. */
    public int release(UUID userId, String key, UUID claimId) {
        return jdbc.update("DELETE FROM diagnosis_requests WHERE user_id = ? AND idempotency_key = ? "
                + "AND claim_id = ?", userId, key, claimId);
    }

    /** Housekeeping: claims nobody released (a crashed instance). */
    public int deleteOlderThan(Duration age) {
        return jdbc.update("DELETE FROM diagnosis_requests WHERE started_at < now() - make_interval(secs => ?)",
                seconds(age));
    }

    private static double seconds(Duration duration) {
        return duration.toMillis() / 1000.0;
    }
}
