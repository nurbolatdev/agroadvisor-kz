package kz.agroadvisor.common.cache;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.cache.autoconfigure.RedisCacheManagerBuilderCustomizer;
import org.springframework.cache.Cache;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.data.redis.cache.RedisCacheWriter;
import org.springframework.data.redis.connection.RedisConnectionFactory;

/**
 * Redis-backed cache for read-mostly data.
 *
 * <p>The cache advice runs before the transaction advice (which is last) but after Spring Security's
 * method interceptors ({@code @PreAuthorize}, order 200): a cache hit opens no transaction and touches no
 * database, an eviction on an admin write runs after that write has been committed, and a cache hit can
 * never skip an authorization check placed on a cached method.
 */
@Configuration
@EnableCaching(order = Ordered.LOWEST_PRECEDENCE - 1)
class CacheConfig implements CachingConfigurer {

    private static final Logger log = LoggerFactory.getLogger(CacheConfig.class);

    /**
     * Spring Data Redis hands cache writes to the reactive driver and returns at once, while evictions
     * run on a blocking connection, so an eviction can overtake the write issued before it and leave a
     * stale entry until the TTL runs out. Immediate writes make every write complete before put() returns.
     */
    @Bean
    RedisCacheManagerBuilderCustomizer immediateCacheWrites(RedisConnectionFactory connectionFactory) {
        return builder -> builder.cacheWriter(RedisCacheWriter.create(connectionFactory,
                writer -> writer.immediateWrites()));
    }

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
