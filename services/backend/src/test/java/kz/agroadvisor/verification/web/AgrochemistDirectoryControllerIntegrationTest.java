package kz.agroadvisor.verification.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
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
class AgrochemistDirectoryControllerIntegrationTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> created = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    private UUID newUser(Role role, String verification) {
        String phone = "+7723" + (1_000_000 + (int) (Math.random() * 8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Dir " + phone, "ru", Set.of(role)))
                .getId();
        created.add(id);
        if (verification != null) {
            jdbc.update("""
                    INSERT INTO agrochemist_profiles (user_id, specialization, experience_years,
                                                      verification_status)
                    VALUES (?, 'plant_protection', 4, ?)""", id, verification);
        }
        return id;
    }

    private String token(UUID id) {
        return "Bearer " + jwt.issueAccessToken(id);
    }

    private ResultActions list(String token, String query) throws Exception {
        return mvc.perform(get("/api/agrochemists" + query).header("Authorization", token));
    }

    @Test
    void anonymousIsRefused() throws Exception {
        mvc.perform(get("/api/agrochemists")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/agrochemists/" + UUID.randomUUID())).andExpect(status().isUnauthorized());
    }

    @Test
    void anAgrochemistAndAnAdminAreRefused() throws Exception {
        UUID listed = newUser(Role.AGROCHEMIST, "approved");
        String agrochemist = token(listed);
        String admin = token(newUser(Role.ADMIN, null));

        for (String t : List.of(agrochemist, admin)) {
            list(t, "").andExpect(status().isForbidden());
            mvc.perform(get("/api/agrochemists/" + listed).header("Authorization", t))
                    .andExpect(status().isForbidden());
        }
    }

    @Test
    void aFarmerSeesOnlyApprovedAgrochemistsWithoutContacts() throws Exception {
        UUID approved = newUser(Role.AGROCHEMIST, "approved");
        UUID pending = newUser(Role.AGROCHEMIST, "pending");
        UUID rejected = newUser(Role.AGROCHEMIST, "rejected");
        UUID blocked = newUser(Role.AGROCHEMIST, "approved");
        jdbc.update("UPDATE users SET status = 'blocked' WHERE id = ?", blocked);
        jdbc.update("INSERT INTO agrochemist_crops (user_id, crop_code) VALUES (?, 'potato')", approved);
        String farmer = token(newUser(Role.FARMER, null));

        list(farmer, "?crop=potato&size=50").andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '" + approved + "')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.id == '" + approved + "')].fullName").isNotEmpty())
                .andExpect(jsonPath("$[?(@.id == '" + approved + "')].crops[0]").value("potato"))
                .andExpect(jsonPath("$[?(@.id == '" + approved + "')].specializations[0]")
                        .value("plant_protection"))
                .andExpect(jsonPath("$[?(@.id == '" + approved + "')].experienceYears").value(4))
                .andExpect(jsonPath("$[0].phone").doesNotExist())
                .andExpect(jsonPath("$[0].email").doesNotExist());
        list(farmer, "?size=50")
                .andExpect(jsonPath("$[?(@.id == '" + pending + "')]").isEmpty())
                .andExpect(jsonPath("$[?(@.id == '" + rejected + "')]").isEmpty())
                .andExpect(jsonPath("$[?(@.id == '" + blocked + "')]").isEmpty());

        mvc.perform(get("/api/agrochemists/" + approved).header("Authorization", farmer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(approved.toString()))
                .andExpect(jsonPath("$.phone").doesNotExist())
                .andExpect(jsonPath("$.email").doesNotExist());
        for (UUID hidden : List.of(pending, rejected, blocked, UUID.randomUUID())) {
            mvc.perform(get("/api/agrochemists/" + hidden).header("Authorization", farmer))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("agrochemist_not_found"));
        }
    }

    @Test
    void filtersAreChecked() throws Exception {
        String farmer = token(newUser(Role.FARMER, null));
        list(farmer, "?regionId=999999").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_region"));
        list(farmer, "?crop=banana").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("unknown_crop"));
    }

    @Test
    void pagingBoundsAreChecked() throws Exception {
        String farmer = token(newUser(Role.FARMER, null));
        list(farmer, "?size=50").andExpect(status().isOk());
        list(farmer, "?size=51").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
        list(farmer, "?size=0").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
        list(farmer, "?page=-1").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
    }

    @Test
    void theDefaultPageHasTwentyAtMost() throws Exception {
        for (int i = 0; i < 21; i++) {
            newUser(Role.AGROCHEMIST, "approved");
        }
        String farmer = token(newUser(Role.FARMER, null));
        list(farmer, "").andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(20));
    }

    @Test
    void aNotUuidIdIsBadRequest() throws Exception {
        String farmer = token(newUser(Role.FARMER, null));
        mvc.perform(get("/api/agrochemists/not-a-uuid").header("Authorization", farmer))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("bad_request"));
    }

    @Test
    void aBlankCropIsNoFilter() throws Exception {
        newUser(Role.AGROCHEMIST, "approved");
        String farmer = token(newUser(Role.FARMER, null));
        list(farmer, "?crop=").andExpect(status().isOk());
        mvc.perform(get("/api/agrochemists").param("crop", "  ").header("Authorization", farmer))
                .andExpect(status().isOk());
    }

    @Test
    void aPageOverTenThousandIsRefused() throws Exception {
        String farmer = token(newUser(Role.FARMER, null));
        list(farmer, "?page=10001").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
    }
}
