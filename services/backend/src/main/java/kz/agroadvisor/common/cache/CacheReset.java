package kz.agroadvisor.common.cache;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Component;

/**
 * Empties every cache once the application has started. Redis keeps its data across restarts,
 * while Flyway seed migrations change the reference behind the cache's back, so a deploy would
 * otherwise serve the old reference until the TTL runs out.
 */
@Component
class CacheReset implements ApplicationListener<ApplicationReadyEvent> {

    private static final Logger log = LoggerFactory.getLogger(CacheReset.class);

    private final CacheManager caches;

    CacheReset(CacheManager caches) {
        this.caches = caches;
    }

    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        onReady();
    }

    void onReady() {
        for (String name : caches.getCacheNames()) {
            Cache cache = caches.getCache(name);
            try {
                if (cache != null) {
                    // invalidate() removes the entries at once; clear() is allowed to defer the removal
                    cache.invalidate();
                }
            } catch (RuntimeException e) {
                // Redis may be down at start-up; the cache simply stays cold or stale until the TTL
                log.warn("Cache '{}' was not cleared at start-up: {}", name, e.toString());
            }
        }
    }
}
