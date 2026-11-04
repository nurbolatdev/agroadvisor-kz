package kz.agroadvisor.diagnosis.config;

import java.time.Duration;

/**
 * The longest time one diagnosis request can hold its claim, from the claim to the end of the finalizing
 * transaction. The parts are the worst cases of the steps that run inside the claim, in order:
 *
 * <ol>
 *   <li>metadata stripping: a byte-level scan of at most 10 MB without decoding the pixels; budgeted at
 *       {@link #STRIP}, far above what it takes;</li>
 *   <li>the photo upload: {@code app.photos.total-timeout} (all tries and the connect of one call);</li>
 *   <li>the model call: {@code (connect-timeout + read-timeout) × (retries + 1) + retry-delay × retries}.
 *       A read timeout is never retried, so this is a safe upper bound;</li>
 *   <li>the finalizing transaction: waiting for a pool connection ({@code hikari.connection-timeout},
 *       30 s by default) plus {@link #FINALIZE_STATEMENTS} for the two statements.</li>
 * </ol>
 *
 * <p>Not counted because they run before the claim: the rate limiter (Redis, 0.5 s read timeout, fails
 * open), the lookup of an existing diagnosis and the claim statements themselves.
 */
public final class RequestDeadline {

    static final Duration STRIP = Duration.ofSeconds(2);
    static final Duration FINALIZE_STATEMENTS = Duration.ofSeconds(1);

    private RequestDeadline() {
    }

    /** Worst case of the model call including the retries and the pauses between them. */
    public static Duration aiCall(AiProperties ai) {
        return ai.connectTimeout().plus(ai.readTimeout()).multipliedBy(ai.retries() + 1L)
                .plus(ai.retryDelay().multipliedBy(ai.retries()));
    }

    public static Duration of(AiProperties ai, PhotoStorageProperties photos, Duration poolConnectionTimeout) {
        return STRIP.plus(photos.totalTimeout()).plus(aiCall(ai)).plus(poolConnectionTimeout)
                .plus(FINALIZE_STATEMENTS);
    }
}
