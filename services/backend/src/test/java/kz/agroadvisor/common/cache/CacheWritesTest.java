package kz.agroadvisor.common.cache;

import java.util.ArrayList;
import java.util.List;

import kz.agroadvisor.TestcontainersConfiguration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Spring Data Redis writes to a cache asynchronously by default: put() hands the command to the
 * reactive driver and returns, so the next read (or an eviction) on the blocking connection can
 * overtake it. The cache must apply writes immediately, otherwise a stale entry can survive an
 * eviction that was issued after it.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class CacheWritesTest {

    private static final String CACHE = "catalog";
    private static final int WRITES = 300;

    @Autowired
    private CacheManager caches;

    @BeforeEach
    void emptyCache() {
        caches.getCache(CACHE).invalidate();
    }

    @Test
    void aPutIsVisibleToTheNextRead() {
        Cache cache = caches.getCache(CACHE);
        List<Integer> missed = new ArrayList<>();

        for (int i = 0; i < WRITES; i++) {
            cache.put("key-" + i, "value");
            if (cache.get("key-" + i) == null) {
                missed.add(i);
            }
        }

        assertThat(missed).as("writes that were not visible to the read right after them").isEmpty();
    }

    @Test
    void anEvictionAfterAPutLeavesNothingBehind() {
        Cache cache = caches.getCache(CACHE);

        for (int i = 0; i < WRITES; i++) {
            cache.put("key-" + i, "value");
        }
        cache.invalidate();

        List<Integer> survivors = new ArrayList<>();
        for (int i = 0; i < WRITES; i++) {
            if (cache.get("key-" + i) != null) {
                survivors.add(i);
            }
        }
        assertThat(survivors).as("entries that outlived the invalidation").isEmpty();
    }
}
