package kz.agroadvisor.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import kz.agroadvisor.TestcontainersConfiguration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** With no origins configured (the default outside the local profile) no CORS header is ever added. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class CorsDisabledByDefaultTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void noOriginIsAllowedByDefault() throws Exception {
        mvc.perform(get("/api/regions").header("Origin", "http://localhost:5173"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void theCallItselfStillWorksForNonBrowserClients() throws Exception {
        mvc.perform(get("/api/regions")).andExpect(status().isOk());
    }
}
