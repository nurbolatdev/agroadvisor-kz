package kz.agroadvisor.common.cache;

import java.time.Duration;

import kz.agroadvisor.TestcontainersConfiguration;

import org.junit.jupiter.api.BeforeEach;
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

    /** Arrange: a stale entry that survived the restart. Cache writes are immediate (CacheWritesTest). */
    @BeforeEach
    void seedStaleEntry() {
        caches.getCache(CACHE).put("probe", "stale");
        assertThat(caches.getCache(CACHE).get("probe")).as("seeded entry").isNotNull();
    }

    @Test
    void everyConfiguredCacheIsKnownAtStartUp() {
        assertThat(caches.getCacheNames()).contains(CACHE);
    }

    @Test
    void onReadyEmptiesTheCaches() {
        reset.onReady();

        assertThat(caches.getCache(CACHE).get("probe")).isNull();
    }

    @Test
    void theApplicationReadyEventTriggersIt() {
        context.publishEvent(new ApplicationReadyEvent(new SpringApplication(), new String[0], context,
                Duration.ZERO));

        assertThat(caches.getCache(CACHE).get("probe")).isNull();
    }
}
