package kz.agroadvisor.common.config;

import org.springframework.boot.task.ThreadPoolTaskSchedulerBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * Turns on {@code @Scheduled} processing for the whole application. Kept here so that no module's
 * configuration has to be loaded for scheduling to work.
 *
 * <p>Jobs that rely on it: the diagnosis claim cleanup, the orphan photo cleanup and the refresh token cleanup.
 */
@Configuration
@EnableScheduling
public class SchedulingConfig {

    /**
     * The scheduler of {@code @Scheduled}. It is declared here because the WebSocket support registers its own
     * {@code messageBrokerTaskScheduler}, and Spring Boot then no longer creates one: the jobs would share the
     * pool of the heartbeats and ignore {@code spring.task.scheduling.*}. A bean called {@code taskScheduler} is
     * the one {@code @Scheduled} picks when there are several.
     */
    @Bean(name = "taskScheduler")
    ThreadPoolTaskScheduler taskScheduler(ThreadPoolTaskSchedulerBuilder builder) {
        return builder.build();
    }
}
