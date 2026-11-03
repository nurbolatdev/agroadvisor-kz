package kz.agroadvisor.common.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import kz.agroadvisor.TestcontainersConfiguration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Writes the OpenAPI schema to docs/api/openapi.json, the source for the generated mobile types.
 * Run: ./mvnw test -Dtest=OpenApiExportTest (from services/backend). Rewrites the file only when it changed.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class OpenApiExportTest {

    private static final Path SNAPSHOT = Path.of("..", "..", "docs", "api", "openapi.json");

    private final JsonMapper mapper = JsonMapper.builder()
            .enable(SerializationFeature.INDENT_OUTPUT)
            .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
            .build();

    @Autowired
    private MockMvc mvc;

    @Test
    void exportsSchemaSnapshot() throws Exception {
        String raw = mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        Map<?, ?> schema = mapper.readValue(raw, Map.class);
        // The server list reflects the test host, not the API
        schema.remove("servers");
        String json = mapper.writeValueAsString(schema) + "\n";

        assertThat(json).contains("\"/api/auth/login\"");
        Files.createDirectories(SNAPSHOT.getParent());
        if (!Files.exists(SNAPSHOT) || !Files.readString(SNAPSHOT, StandardCharsets.UTF_8).equals(json)) {
            Files.writeString(SNAPSHOT, json, StandardCharsets.UTF_8);
        }
    }
}
