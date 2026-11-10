package kz.agroadvisor.common.config;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.EnvironmentAware;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Stops the start of the {@code prod} profile when a required setting is empty or a dangerous switch is on.
 *
 * <p>It is a {@link BeanFactoryPostProcessor}: it runs before any singleton (DataSource, Flyway, Redis) is
 * created, so the operator gets one message listing every missing variable instead of the first random
 * connection error.
 *
 * <p>It checks Spring keys, not environment variables: {@code SPRING_DATASOURCE_URL} counts as {@code DB_URL}.
 * That also means an environment variable such as {@code APP_AI_ALLOWPLACEHOLDER=true} that overrides the yml
 * is caught. {@code AI_CLIENT} has no effect in {@code prod}; any override of {@code app.ai.client} (such as
 * {@code APP_AI_CLIENT}) to a value other than {@code http} aborts the start. The message holds names only,
 * never values.
 */
@Component
@Profile("prod")
class ProdSettingsCheck implements BeanFactoryPostProcessor, EnvironmentAware {

    private static final Map<String, String> REQUIRED = new LinkedHashMap<>();

    static {
        REQUIRED.put("spring.datasource.url", "DB_URL");
        REQUIRED.put("spring.datasource.username", "DB_USERNAME");
        REQUIRED.put("spring.datasource.password", "DB_PASSWORD");
        REQUIRED.put("spring.data.redis.host", "REDIS_HOST");
        REQUIRED.put("spring.data.redis.password", "REDIS_PASSWORD");
        REQUIRED.put("app.photos.endpoint", "S3_ENDPOINT");
        REQUIRED.put("app.photos.access-key", "S3_ACCESS_KEY");
        REQUIRED.put("app.photos.secret-key", "S3_SECRET_KEY");
        REQUIRED.put("app.security.jwt.secret", "JWT_SECRET");
        REQUIRED.put("app.ai.url", "AI_SERVICE_URL");
    }

    private Environment environment;

    @Override
    public void setEnvironment(Environment environment) {
        this.environment = environment;
    }

    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
        check(environment);
    }

    static void check(Environment env) {
        List<String> problems = new ArrayList<>();

        List<String> missing = new ArrayList<>();
        REQUIRED.forEach((key, variable) -> {
            if (!StringUtils.hasText(env.getProperty(key))) {
                missing.add(variable);
            }
        });
        if (!missing.isEmpty()) {
            problems.add("missing environment variables: " + String.join(", ", missing));
        }
        if (env.getProperty("app.ai.allow-placeholder", Boolean.class, false)) {
            problems.add("app.ai.allow-placeholder must not be true");
        }
        if (!"http".equals(env.getProperty("app.ai.client"))) {
            problems.add("app.ai.client must be http");
        }
        if (env.getProperty("springdoc.api-docs.enabled", Boolean.class, false)
                || env.getProperty("springdoc.swagger-ui.enabled", Boolean.class, false)) {
            problems.add("API docs (springdoc) must stay off");
        }

        if (!problems.isEmpty()) {
            throw new IllegalStateException("The prod profile cannot start: " + String.join("; ", problems));
        }
    }
}
