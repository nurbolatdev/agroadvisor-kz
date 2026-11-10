package kz.agroadvisor.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Turns on {@code @Scheduled} processing for the whole application. Kept here so that no module's
 * configuration has to be loaded for scheduling to work.
 *
 * <p>Jobs that rely on it: the diagnosis claim cleanup, the orphan photo cleanup and the refresh token cleanup.
 */
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
