package kz.agroadvisor.common.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.diagnosis.config.AiProperties;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.test.web.servlet.MockMvc;

/**
 * A start that forgets the profile must be safe: no API docs, no health details, no placeholder model.
 * Only secrets without a default are supplied; every other setting comes from the base application.yml.
 */
@SpringBootTest(properties = {
        "JWT_SECRET=dGVzdC1vbmx5LWp3dC1zZWNyZXQtMzItYnl0ZXMtbWluaW11bS0wMTIzNDU2Nzg5",
        "S3_ACCESS_KEY=test-access-key",
        "S3_SECRET_KEY=test-secret-key",
        "APP_PHOTOS_ORPHAN_CLEANUP_ENABLED=false"})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class NoProfileDefaultsTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private Environment environment;

    @Autowired
    private AiProperties ai;

    @Test
    void noProfileIsActiveByDefault() {
        assertThat(environment.getActiveProfiles())
                .as("unset SPRING_PROFILES_ACTIVE before running tests")
                .isEmpty();
        assertThat(environment.getDefaultProfiles()).containsExactly("default");
    }

    @Test
    void apiDocsAreNotPublic() throws Exception {
        mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("unauthorized"));
        mvc.perform(get("/swagger-ui/index.html")).andExpect(status().isUnauthorized());
    }

    @Test
    void healthHasNoDetails() throws Exception {
        mvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.components").doesNotExist());
    }

    @Test
    void placeholderModelIsRefused() {
        assertThat(ai.allowPlaceholder()).isFalse();
    }
}
