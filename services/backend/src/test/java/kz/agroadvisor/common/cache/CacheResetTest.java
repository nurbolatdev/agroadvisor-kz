package kz.agroadvisor.common.cache;

import java.time.Duration;

import kz.agroadvisor.TestcontainersConfiguration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cache.CacheManager;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/** Redis outlives a restart, while Flyway seed migrations change the reference behind the cache. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class CacheResetTest {

    private static final String CACHE = "catalog";

    @Autowired
    private CacheManager caches;
    @Autowired
    private CacheReset reset;
    @Autowired
    private ConfigurableApplicationContext context;

    /**
     * A Redis cache write may still be on its way when put() returns, and a removal sent right after
     * it can overtake it (seen in about 1 of 8 runs); a read is a round trip that settles the write.
     */
    private void putAndConfirm(String key, String value) {
        caches.getCache(CACHE).put(key, value);
        assertThat(caches.getCache(CACHE).get(key)).isNotNull();
    }

    @Test
    void everyConfiguredCacheIsKnownAtStartUp() {
        assertThat(caches.getCacheNames()).contains(CACHE);
    }

    @Test
    void onReadyEmptiesTheCaches() {
        putAndConfirm("probe", "stale");

        reset.onReady();

        assertThat(caches.getCache(CACHE).get("probe")).isNull();
    }

    @Test
    void theApplicationReadyEventTriggersIt() {
        putAndConfirm("probe", "stale");

        context.publishEvent(new ApplicationReadyEvent(new SpringApplication(), new String[0], context,
                Duration.ZERO));

        assertThat(caches.getCache(CACHE).get("probe")).isNull();
    }
}
