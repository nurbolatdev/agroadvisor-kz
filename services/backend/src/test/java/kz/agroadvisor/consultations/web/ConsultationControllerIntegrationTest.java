package kz.agroadvisor.consultations.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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
class ConsultationControllerIntegrationTest {

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
        String phone = "+7724" + (1_000_000 + (int) (Math.random() * 8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Cons " + phone, "ru", Set.of(role)))
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

    private ResultActions create(String token, UUID agrochemist, String text) throws Exception {
        return mvc.perform(post("/api/consultations").header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"agrochemistId\": \"" + agrochemist + "\", \"text\": \"" + text + "\"}"));
    }

    private ResultActions act(String token, UUID id, String action) throws Exception {
        return mvc.perform(post("/api/consultations/" + id + "/" + action).header("Authorization", token));
    }

    private UUID createdId(ResultActions result) throws Exception {
        String location = result.andReturn().getResponse().getHeader("Location");
        return UUID.fromString(location.substring(location.lastIndexOf('/') + 1));
    }

    @Test
    void anonymousIsRefused() throws Exception {
        UUID id = UUID.randomUUID();
        mvc.perform(get("/api/consultations")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/consultations/" + id)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/consultations").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/consultations/" + id + "/accept")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/consultations/" + id + "/close")).andExpect(status().isUnauthorized());
    }

    @Test
    void anAdminIsRefusedEverywhere() throws Exception {
        String admin = token(newUser(Role.ADMIN, null));
        UUID id = UUID.randomUUID();

        mvc.perform(get("/api/consultations").header("Authorization", admin)).andExpect(status().isForbidden());
        mvc.perform(get("/api/consultations/" + id).header("Authorization", admin))
                .andExpect(status().isForbidden());
        create(admin, UUID.randomUUID(), "Help").andExpect(status().isForbidden());
        act(admin, id, "accept").andExpect(status().isForbidden());
        act(admin, id, "decline").andExpect(status().isForbidden());
        act(admin, id, "close").andExpect(status().isForbidden());
    }

    @Test
    void anAgrochemistCannotCreateAndAFarmerCannotAcceptOrDecline() throws Exception {
        UUID agrochemist = newUser(Role.AGROCHEMIST, "approved");
        String farmerToken = token(newUser(Role.FARMER, null));
        UUID id = createdId(create(farmerToken, agrochemist, "Help").andExpect(status().isCreated()));

        create(token(agrochemist), agrochemist, "Help").andExpect(status().isForbidden());
        act(farmerToken, id, "accept").andExpect(status().isForbidden());
        act(farmerToken, id, "decline").andExpect(status().isForbidden());
    }

    @Test
    void farmerRequestsAgrochemistSeesItInTheInboxAndAccepts() throws Exception {
        UUID agrochemist = newUser(Role.AGROCHEMIST, "approved");
        UUID farmer = newUser(Role.FARMER, null);

        ResultActions result = create(token(farmer), agrochemist, "My potatoes have spots")
                .andExpect(status().isCreated()).andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.status").value("requested"))
                .andExpect(jsonPath("$.farmer.id").value(farmer.toString()))
                .andExpect(jsonPath("$.agrochemist.id").value(agrochemist.toString()))
                .andExpect(jsonPath("$.lastMessage.text").value("My potatoes have spots"))
                .andExpect(jsonPath("$.unreadCount").value(0));
        UUID id = createdId(result);

        mvc.perform(get("/api/consultations?status=requested").header("Authorization", token(agrochemist)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(id.toString()))
                .andExpect(jsonPath("$[0].unreadCount").value(1));

        act(token(agrochemist), id, "accept").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("active")).andExpect(jsonPath("$.acceptedAt").isNotEmpty());
        mvc.perform(get("/api/consultations/" + id).header("Authorization", token(farmer)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("active"));
    }

    @Test
    void agrochemistDeclines() throws Exception {
        UUID agrochemist = newUser(Role.AGROCHEMIST, "approved");
        String farmer = token(newUser(Role.FARMER, null));
        UUID id = createdId(create(farmer, agrochemist, "Help"));

        act(token(agrochemist), id, "decline").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("declined"))
                .andExpect(jsonPath("$.closedBy").value(agrochemist.toString()));
    }

    @Test
    void wrongTransitionsAreConflictsWithTheCurrentStatus() throws Exception {
        UUID agrochemist = newUser(Role.AGROCHEMIST, "approved");
        String agrochemistToken = token(agrochemist);
        String farmer = token(newUser(Role.FARMER, null));
        UUID id = createdId(create(farmer, agrochemist, "Help"));

        act(agrochemistToken, id, "close").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("invalid_consultation_state"))
                .andExpect(jsonPath("$.reason").value("requested"));
        act(agrochemistToken, id, "accept").andExpect(status().isOk());
        act(agrochemistToken, id, "accept").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("invalid_consultation_state"))
                .andExpect(jsonPath("$.reason").value("active"));
        act(agrochemistToken, id, "decline").andExpect(status().isConflict())
                .andExpect(jsonPath("$.reason").value("active"));
        act(farmer, id, "close").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("closed"));
        act(agrochemistToken, id, "close").andExpect(status().isConflict())
                .andExpect(jsonPath("$.reason").value("closed"));
    }

    @Test
    void theFarmerWithdrawsARequestThatWaits() throws Exception {
        UUID agrochemist = newUser(Role.AGROCHEMIST, "approved");
        UUID farmer = newUser(Role.FARMER, null);
        UUID id = createdId(create(token(farmer), agrochemist, "Help"));

        act(token(farmer), id, "close").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("closed"))
                .andExpect(jsonPath("$.closedBy").value(farmer.toString()));
    }

    @Test
    void acceptNeedsTheAgrochemistToBeStillListed() throws Exception {
        UUID agrochemist = newUser(Role.AGROCHEMIST, "approved");
        String farmer = token(newUser(Role.FARMER, null));
        UUID id = createdId(create(farmer, agrochemist, "Help"));
        jdbc.update("UPDATE agrochemist_profiles SET verification_status = 'rejected' WHERE user_id = ?",
                agrochemist);

        act(token(agrochemist), id, "accept").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("agrochemist_not_listed"));
    }

    @Test
    void aNonParticipantAndAMissingIdGetTheSame404() throws Exception {
        UUID agrochemist = newUser(Role.AGROCHEMIST, "approved");
        String farmer = token(newUser(Role.FARMER, null));
        UUID id = createdId(create(farmer, agrochemist, "Help"));
        String strangerFarmer = token(newUser(Role.FARMER, null));
        String strangerAgrochemist = token(newUser(Role.AGROCHEMIST, "approved"));

        for (String stranger : List.of(strangerFarmer, strangerAgrochemist)) {
            mvc.perform(get("/api/consultations/" + id).header("Authorization", stranger))
                    .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("consultation_not_found"));
            act(stranger, id, "close").andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("consultation_not_found"));
        }
        act(token(agrochemist), UUID.randomUUID(), "accept")
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("consultation_not_found"));
        mvc.perform(get("/api/consultations/" + UUID.randomUUID()).header("Authorization", farmer))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("consultation_not_found"));
        mvc.perform(get("/api/consultations?size=50").header("Authorization", strangerFarmer))
                .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void duplicateRequestIsAConflictWithALocation() throws Exception {
        UUID agrochemist = newUser(Role.AGROCHEMIST, "approved");
        String farmer = token(newUser(Role.FARMER, null));
        UUID id = createdId(create(farmer, agrochemist, "Help"));

        create(farmer, agrochemist, "Again").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("consultation_already_open"))
                .andExpect(header().string("Location", "/api/consultations/" + id));
    }

    @Test
    void invalidInputIsRefused() throws Exception {
        UUID agrochemist = newUser(Role.AGROCHEMIST, "approved");
        String farmer = token(newUser(Role.FARMER, null));

        create(farmer, agrochemist, "x".repeat(2001)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
        create(farmer, agrochemist, " ").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
        create(farmer, newUser(Role.AGROCHEMIST, "pending"), "Help").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("agrochemist_not_found"));
        mvc.perform(get("/api/consultations?status=unknown").header("Authorization", farmer))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        mvc.perform(get("/api/consultations?size=51").header("Authorization", farmer))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
    }

    @Test
    void statusFilterAndBothSidesLists() throws Exception {
        UUID agrochemist = newUser(Role.AGROCHEMIST, "approved");
        UUID other = newUser(Role.AGROCHEMIST, "approved");
        UUID farmer = newUser(Role.FARMER, null);
        UUID first = createdId(create(token(farmer), agrochemist, "One"));
        act(token(agrochemist), first, "accept");
        UUID second = createdId(create(token(farmer), other, "Two"));

        mvc.perform(get("/api/consultations?status=active").header("Authorization", token(farmer)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(first.toString()));
        mvc.perform(get("/api/consultations?status=active&status=requested")
                .header("Authorization", token(farmer))).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[0].id").value(second.toString()));
        mvc.perform(get("/api/consultations").header("Authorization", token(other))).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(second.toString()));
    }
}
