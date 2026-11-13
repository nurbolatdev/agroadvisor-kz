package kz.agroadvisor.fields.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

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
import org.springframework.test.web.servlet.ResultActions;

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
class FieldControllerIntegrationTest {

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
        // The fields go with their owners
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    @Test
    void requiresSignIn() throws Exception {
        mvc.perform(get("/api/fields")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/fields").contentType(MediaType.APPLICATION_JSON).content(body("North", "ha", "1")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void anAgrochemistHasNoFields() throws Exception {
        String agrochemist = tokenOf(Role.AGROCHEMIST);

        mvc.perform(get("/api/fields").header("Authorization", agrochemist)).andExpect(status().isForbidden());
        mvc.perform(post("/api/fields").header("Authorization", agrochemist)
                .contentType(MediaType.APPLICATION_JSON).content(body("North", "ha", "1")))
                .andExpect(status().isForbidden());
    }

    @Test
    void createsAFieldInSotkiAndReadsItBack() throws Exception {
        String location = mvc.perform(post("/api/fields").header("Authorization", farmer)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"name": " North ", "crop": "potato", "area": 250, "areaUnit": "sotka",
                         "location": {"latitude": 43.2, "longitude": 76.9}}"""))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", org.hamcrest.Matchers.startsWith("/api/fields/")))
                .andExpect(jsonPath("$.name").value("North"))
                .andExpect(jsonPath("$.crop").value("potato"))
                .andExpect(jsonPath("$.area").value(250))
                .andExpect(jsonPath("$.areaUnit").value("sotka"))
                .andExpect(jsonPath("$.areaHa").value(2.5))
                .andExpect(jsonPath("$.location.latitude").value(43.2))
                .andExpect(jsonPath("$.location.longitude").value(76.9))
                .andReturn().getResponse().getHeader("Location");

        mvc.perform(get(location).header("Authorization", farmer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("North"))
                .andExpect(jsonPath("$.areaHa").value(2.5));
        mvc.perform(get("/api/fields").header("Authorization", farmer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void aFieldWithoutAPointHasNullLocation() throws Exception {
        mvc.perform(post("/api/fields").header("Authorization", farmer)
                .contentType(MediaType.APPLICATION_JSON).content(body("South", "ha", "3")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.location").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.areaHa").value(3));
    }

    @Test
    void rejectsInvalidInput() throws Exception {
        assertCode(post("/api/fields").header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content(body("", "ha", "1")), 400, "validation_failed");
        assertCode(post("/api/fields").header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"name": "North", "crop": "potato", "area": 1, "areaUnit": "ha",
                         "location": {"latitude": 91, "longitude": 76.9}}"""), 400, "validation_failed");
        assertCode(post("/api/fields").header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content(body("North", "acre", "1")), 400, "validation_failed");
        assertCode(post("/api/fields").header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content(body("North", "ha", "0")), 400, "validation_failed");
    }

    @Test
    void rejectsAnAreaOutOfRangeAndAnUnknownCrop() throws Exception {
        assertCode(post("/api/fields").header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content(body("North", "ha", "10000.01")), 400, "area_out_of_range");
        assertCode(post("/api/fields").header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\": \"North\", \"crop\": \"no_such_crop\", \"area\": 1, \"areaUnit\": \"ha\"}"),
                400, "unknown_crop");
    }

    @Test
    void anotherFarmersFieldIsNotFound() throws Exception {
        String location = mvc.perform(post("/api/fields").header("Authorization", farmer)
                .contentType(MediaType.APPLICATION_JSON).content(body("North", "ha", "1")))
                .andReturn().getResponse().getHeader("Location");
        String other = tokenOf(Role.FARMER);

        assertCode(get(location).header("Authorization", other), 404, "field_not_found");
        assertCode(get("/api/fields/" + UUID.randomUUID()).header("Authorization", farmer), 404,
                "field_not_found");
        mvc.perform(get("/api/fields").header("Authorization", other))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void patchChangesOnlyTheKeysThatAreSent() throws Exception {
        String location = createWithPoint();

        mvc.perform(patch(location).header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\": \"East\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("East"))
                .andExpect(jsonPath("$.areaHa").value(2.5))
                .andExpect(jsonPath("$.location.latitude").value(43.2));
    }

    @Test
    void patchWithNullLocationRemovesThePoint() throws Exception {
        String location = createWithPoint();

        mvc.perform(patch(location).header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content("{\"location\": null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.location").value(org.hamcrest.Matchers.nullValue()));
        mvc.perform(get(location).header("Authorization", farmer))
                .andExpect(jsonPath("$.location").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void patchWithANewPointMovesIt() throws Exception {
        String location = createWithPoint();

        mvc.perform(patch(location).header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content("{\"location\": {\"latitude\": 50.5, \"longitude\": 71.4}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.location.latitude").value(50.5))
                .andExpect(jsonPath("$.location.longitude").value(71.4));
    }

    @Test
    void patchRejectsAnAreaWithoutItsUnitAndBadValues() throws Exception {
        String location = createWithPoint();

        assertCode(patch(location).header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content("{\"area\": 5}"), 400, "validation_failed");
        assertCode(patch(location).header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\": \"  \"}"), 400, "validation_failed");
        assertCode(patch(location).header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content("{\"location\": {\"latitude\": 91, \"longitude\": 1}}"), 400, "validation_failed");
        assertCode(patch(location).header("Authorization", farmer).contentType(MediaType.APPLICATION_JSON)
                .content("{\"crop\": \"no_such_crop\"}"), 400, "unknown_crop");
    }

    @Test
    void patchAndDeleteOfAnotherFarmersFieldAreNotFound() throws Exception {
        String location = createWithPoint();
        String other = tokenOf(Role.FARMER);

        assertCode(patch(location).header("Authorization", other).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\": \"Mine\"}"), 404, "field_not_found");
        assertCode(delete(location).header("Authorization", other), 404, "field_not_found");
        mvc.perform(get(location).header("Authorization", farmer)).andExpect(status().isOk());
    }

    @Test
    void deleteRemovesTheFieldAndASecondDeleteIsNotFound() throws Exception {
        String location = createWithPoint();

        mvc.perform(delete(location).header("Authorization", farmer)).andExpect(status().isNoContent());
        assertCode(get(location).header("Authorization", farmer), 404, "field_not_found");
        assertCode(delete(location).header("Authorization", farmer), 404, "field_not_found");
    }

    @Test
    void anAgrochemistCannotPatchOrDelete() throws Exception {
        String location = createWithPoint();
        String agrochemist = tokenOf(Role.AGROCHEMIST);

        mvc.perform(patch(location).header("Authorization", agrochemist).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\": \"x\"}")).andExpect(status().isForbidden());
        mvc.perform(delete(location).header("Authorization", agrochemist)).andExpect(status().isForbidden());
    }

    @Test
    void aMalformedIdIsABadRequest() throws Exception {
        mvc.perform(get("/api/fields/not-a-uuid").header("Authorization", farmer))
                .andExpect(status().isBadRequest());
    }

    /** A 2.5 ha field with a point, made by the signed-in farmer; returns its URL. */
    private String createWithPoint() throws Exception {
        return mvc.perform(post("/api/fields").header("Authorization", farmer)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"name": "North", "crop": "potato", "area": 2.5, "areaUnit": "ha",
                         "location": {"latitude": 43.2, "longitude": 76.9}}"""))
                .andExpect(status().isCreated()).andReturn().getResponse().getHeader("Location");
    }

    private void assertCode(org.springframework.test.web.servlet.RequestBuilder request, int status, String code)
            throws Exception {
        ResultActions result = mvc.perform(request).andExpect(status().is(status));
        result.andExpect(jsonPath("$.code").value(code));
    }

    private static String body(String name, String unit, String area) {
        return "{\"name\": \"" + name + "\", \"crop\": \"potato\", \"area\": " + area + ", \"areaUnit\": \"" + unit
                + "\"}";
    }

    private String tokenOf(Role role) {
        String phone = "+7702" + (1_000_000 + (int) (Math.random() * 8_999_999));
        User user = users.saveAndFlush(new User(Login.parse(phone), "x", "Test", "ru", Set.of(role)));
        created.add(user.getId());
        return "Bearer " + jwt.issueAccessToken(user.getId());
    }
}
