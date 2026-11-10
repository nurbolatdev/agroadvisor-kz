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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The prod profile with a full set of variables. The database and Redis addresses are replaced by
 * {@code @ServiceConnection} from the Testcontainers configuration; AI_CLIENT=stub proves that prod ignores it.
 */
@SpringBootTest(properties = {
        "DB_URL=jdbc:postgresql://replaced-by-testcontainers/agroadvisor",
        "DB_USERNAME=replaced-by-testcontainers",
        "DB_PASSWORD=replaced-by-testcontainers",
        "REDIS_HOST=replaced-by-testcontainers",
        "REDIS_PASSWORD=replaced-by-testcontainers",
        "S3_ENDPOINT=http://localhost:8333",
        "S3_ACCESS_KEY=test-access-key",
        "S3_SECRET_KEY=test-secret-key",
        "JWT_SECRET=dGVzdC1vbmx5LWp3dC1zZWNyZXQtMzItYnl0ZXMtbWluaW11bS0wMTIzNDU2Nzg5",
        "AI_SERVICE_URL=http://localhost:8000",
        "AI_CLIENT=stub",
        "APP_PHOTOS_ORPHAN_CLEANUP_ENABLED=false"})
@AutoConfigureMockMvc
@ActiveProfiles("prod")
@Import(TestcontainersConfiguration.class)
class ProdProfileTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private Environment environment;

    @Autowired
    private AiProperties ai;

    @Test
    void onlyProdIsActive() {
        assertThat(environment.getActiveProfiles()).containsExactly("prod");
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
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.components").doesNotExist());
    }

    @Test
    void infoIsNotExposed() throws Exception {
        int status = mvc.perform(get("/actuator/info")).andReturn().getResponse().getStatus();
        assertThat(status).isNotEqualTo(200);
    }

    @Test
    void placeholderModelAndStubClientAreRefused() {
        assertThat(ai.allowPlaceholder()).isFalse();
        assertThat(ai.client()).isEqualTo("http");
    }
}
