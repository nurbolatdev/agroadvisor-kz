package kz.agroadvisor.calculations.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class CalculationControllerIntegrationTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> created = new ArrayList<>();
    private String farmer;

    @BeforeEach
    void setUp() {
        jdbc.update("""
                INSERT INTO crops (code, names) VALUES ('potato', '{"ru": "-", "kk": "-", "en": "-"}')
                ON CONFLICT (code) DO NOTHING""");
        farmer = tokenOf(Role.FARMER);
    }

    @AfterEach
    void cleanUp() {
        // The saved seasons go with their owners
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    @Test
    void requiresSignIn() throws Exception {
        mvc.perform(get("/api/calculations")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/calculations").contentType(MediaType.APPLICATION_JSON).content(body(2026)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void anAgrochemistHasNoCalculator() throws Exception {
        String agrochemist = tokenOf(Role.AGROCHEMIST);

        mvc.perform(get("/api/calculations").header("Authorization", agrochemist))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/calculations").header("Authorization", agrochemist)
                .contentType(MediaType.APPLICATION_JSON).content(body(2026))).andExpect(status().isForbidden());
    }

    @Test
    void savesASeasonAndReadsItBack() throws Exception {
        String location = mvc.perform(post("/api/calculations").header("Authorization", farmer)
                .contentType(MediaType.APPLICATION_JSON).content(body(2026)))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", Matchers.startsWith("/api/calculations/")))
                .andExpect(jsonPath("$.crop").value("potato"))
                .andExpect(jsonPath("$.season").value(2026))
                .andExpect(jsonPath("$.areaHa").value(2.5))
                .andExpect(jsonPath("$.areaUnit").value("sotka"))
                .andExpect(jsonPath("$.yieldCHa").value(250))
                .andExpect(jsonPath("$.costs.seed").value(120000))
                .andExpect(jsonPath("$.results.profit").value(-5000.5))
                .andReturn().getResponse().getHeader("Location");

        mvc.perform(get(location).header("Authorization", farmer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results.profit").value(-5000.5));
    }

    @Test
    void listsNewestFirstAndOnlyMine() throws Exception {
        save(farmer, 2025);
        save(farmer, 2026);
        save(tokenOf(Role.FARMER), 2024);

        mvc.perform(get("/api/calculations").header("Authorization", farmer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].season").value(2026))
                .andExpect(jsonPath("$[1].season").value(2025));
    }

    @Test
    void rejectsInvalidInput() throws Exception {
        assertCode(post("/api/calculations").header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content(body(1999)), 400, "validation_failed");
        assertCode(post("/api/calculations").header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content(body(2026).replace("\"sotka\"", "\"acre\"")), 400, "validation_failed");
        assertCode(post("/api/calculations").header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content(body(2026).replace("\"seed\": 120000", "\"seed\": -1")), 400, "validation_failed");
        assertCode(post("/api/calculations").header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content(body(2026).replace("\"seed\"", "\"bad key\"")), 400, "validation_failed");
        assertCode(post("/api/calculations").header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content(body(2026).replace("\"costs\": {\"seed\": 120000}", "\"costs\": {}")), 400,
                "validation_failed");
    }

    @Test
    void refusesAnAmountWithTooManyDecimalsAndKeepsTheListReadable() throws Exception {
        // 1e-1500 passes a range check, but jsonb would give it back as a 1500-digit string
        assertCode(post("/api/calculations").header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content(body(2026).replace("\"seed\": 120000", "\"seed\": 1e-1500")), 400, "validation_failed");
        assertCode(post("/api/calculations").header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content(body(2026).replace("\"profit\": -5000.5", "\"profit\": 0.00001")), 400,
                "validation_failed");

        mvc.perform(get("/api/calculations").header("Authorization", farmer)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void keepsDecimalsExactlyAndAtTheBounds() throws Exception {
        String location = mvc.perform(post("/api/calculations").header("Authorization", farmer)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body(2026).replace("\"profit\": -5000.5, \"revenue\": 5625000",
                        "\"small\": 0.0001, \"big\": 1000000000000, \"low\": -1000000000000, \"cents\": 0.1")))
                .andExpect(status().isCreated()).andReturn().getResponse().getHeader("Location");

        mvc.perform(get(location).header("Authorization", farmer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results.small").value(0.0001))
                .andExpect(jsonPath("$.results.big").value(1000000000000L))
                .andExpect(jsonPath("$.results.low").value(-1000000000000L))
                .andExpect(jsonPath("$.results.cents").value(0.1));
        assertCode(post("/api/calculations").header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content(body(2026).replace("\"profit\": -5000.5", "\"profit\": 1000000000000.01")), 400,
                "validation_failed");
    }

    @Test
    void theAnswerToThePostReadsTheSameAsALaterGet() throws Exception {
        String created = mvc.perform(post("/api/calculations").header("Authorization", farmer)
                .contentType(MediaType.APPLICATION_JSON).content(body(2026)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String location = mvc.perform(get("/api/calculations").header("Authorization", farmer)).andReturn()
                .getResponse().getContentAsString();

        // areaHa 2.5 is stored as 2.5000, yieldCHa 250 as 250.00: both answers carry the column scale
        org.assertj.core.api.Assertions.assertThat(created).contains("\"areaHa\":2.5000", "\"yieldCHa\":250.00");
        org.assertj.core.api.Assertions.assertThat(location).contains("\"areaHa\":2.5000", "\"yieldCHa\":250.00");
    }

    @Test
    void rejectsAnUnknownCrop() throws Exception {
        assertCode(post("/api/calculations").header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content(body(2026).replace("potato", "no_such_crop")), 400, "unknown_crop");
    }

    @Test
    void anotherUsersSeasonIsNotFound() throws Exception {
        String location = save(farmer, 2026);
        String other = tokenOf(Role.FARMER);

        assertCode(get(location).header("Authorization", other), 404, "calculation_not_found");
        assertCode(delete(location).header("Authorization", other), 404, "calculation_not_found");
        assertCode(get("/api/calculations/" + UUID.randomUUID()).header("Authorization", farmer), 404,
                "calculation_not_found");
        mvc.perform(get(location).header("Authorization", farmer)).andExpect(status().isOk());
    }

    @Test
    void deletesASeason() throws Exception {
        String location = save(farmer, 2026);

        mvc.perform(delete(location).header("Authorization", farmer)).andExpect(status().isNoContent());

        assertCode(get(location).header("Authorization", farmer), 404, "calculation_not_found");
    }

    @Test
    void stopsAtTheLimit() throws Exception {
        UUID owner = created.getFirst();
        jdbc.update("""
                INSERT INTO calculations (owner_id, crop_code, season, area_ha, area_unit, yield_c_ha, price_t,
                                          costs, results)
                SELECT ?, 'potato', 2026, 1, 'ha', 100, 1000, '{}'::jsonb, '{}'::jsonb FROM generate_series(1, 100)""",
                owner);

        assertCode(post("/api/calculations").header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content(body(2026)), 409, "calculation_limit_reached");
    }

    private String save(String token, int season) throws Exception {
        return mvc.perform(post("/api/calculations").header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON).content(body(season)))
                .andExpect(status().isCreated()).andReturn().getResponse().getHeader("Location");
    }

    private void assertCode(RequestBuilder request, int status, String code) throws Exception {
        mvc.perform(request).andExpect(status().is(status)).andExpect(jsonPath("$.code").value(code));
    }

    private static String body(int season) {
        return """
                {"crop": "potato", "season": %d, "areaHa": 2.5, "areaUnit": "sotka", "yieldCHa": 250,
                 "priceT": 90000, "costs": {"seed": 120000},
                 "results": {"profit": -5000.5, "revenue": 5625000}}""".formatted(season);
    }

    private String tokenOf(Role role) {
        String phone = "+7702" + (1_000_000 + (int) (Math.random() * 8_999_999));
        User user = users.saveAndFlush(new User(Login.parse(phone), "x", "Test", "ru", Set.of(role)));
        created.add(user.getId());
        return "Bearer " + jwt.issueAccessToken(user.getId());
    }
}
