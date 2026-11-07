package kz.agroadvisor.diagnosis.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * The model the AI service runs, for {@code GET /api/meta}. The answer of the AI service is kept for a short
 * time ({@code app.meta.cache-ttl}, one minute by default) so that the profile screens of many phones do not
 * each call it, and a new model shows up soon after a deploy. A failure is never kept and an old answer is
 * never served after its time is over: the app shows no line rather than a version that may be wrong.
 */
@Service
public class ModelInfoService {

    private record Kept(ModelInfo info, Instant at) {
    }

    private final AiClient ai;
    private final Clock clock;
    private final Duration ttl;
    private final AtomicReference<Kept> kept = new AtomicReference<>();

    public ModelInfoService(AiClient ai, Clock clock, @Value("${app.meta.cache-ttl:60s}") Duration ttl) {
        this.ai = ai;
        this.clock = clock;
        this.ttl = ttl;
    }

    /** The model now; throws {@code 503 ai_unavailable} (from the client) when the AI service cannot say. */
    public ModelInfo current() {
        Instant now = clock.instant();
        Kept last = kept.get();
        if (last != null && now.isBefore(last.at().plus(ttl))) {
            return last.info();
        }
        ModelInfo fresh = ai.modelInfo();
        kept.set(new Kept(fresh, now));
        return fresh;
    }
}
