package kz.agroadvisor.common.cache;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.context.annotation.Configuration;

/**
 * Redis-backed cache for read-mostly data.
 *
 * <p>The cache advice is ordered before the transaction advice ({@code order = 0},
 * transactions are last): a cache hit opens no transaction and touches no database,
 * and an eviction on an admin write runs after that write has been committed.
 */
@Configuration
@EnableCaching(order = 0)
class CacheConfig implements CachingConfigurer {

    private static final Logger log = LoggerFactory.getLogger(CacheConfig.class);

    /** A Redis outage must slow requests down, not fail them: the database stays the source of truth. */
    @Override
    public CacheErrorHandler errorHandler() {
        return new CacheErrorHandler() {
            @Override
            public void handleCacheGetError(RuntimeException e, Cache cache, Object key) {
                log.warn("Cache '{}' read failed for key {}: {}", cache.getName(), key, e.toString());
            }

            @Override
            public void handleCachePutError(RuntimeException e, Cache cache, Object key, Object value) {
                log.warn("Cache '{}' write failed for key {}: {}", cache.getName(), key, e.toString());
            }

            @Override
            public void handleCacheEvictError(RuntimeException e, Cache cache, Object key) {
                // A failed eviction can leave stale data until the TTL runs out
                log.error("Cache '{}' eviction failed for key {}: {}", cache.getName(), key, e.toString());
            }

            @Override
            public void handleCacheClearError(RuntimeException e, Cache cache) {
                log.error("Cache '{}' clear failed: {}", cache.getName(), e.toString());
            }
        };
    }
}
