package kz.agroadvisor.notifications.web;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
class NotificationControllerIntegrationTest {

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

    private UUID newUser(Role role) {
        String phone = "+7735" + (1_000_000 + (int) (Math.random() * 8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Feed " + phone, "ru", Set.of(role)))
                .getId();
        created.add(id);
        return id;
    }

    private String token(UUID id) {
        return "Bearer " + jwt.issueAccessToken(id);
    }

    private UUID insert(UUID recipient, String type) {
        return jdbc.queryForObject(
                "INSERT INTO notifications (recipient_id, type) VALUES (?, ?) RETURNING id",
                UUID.class, recipient, type);
    }

    @Test
    void withoutATokenItIsUnauthorized() throws Exception {
        mvc.perform(get("/api/notifications")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/notifications/unread-count")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/notifications/read-all")).andExpect(status().isUnauthorized());
    }

    @Test
    void everyRoleCanReadItsFeed() throws Exception {
        for (Role role : new Role[] {Role.FARMER, Role.AGROCHEMIST, Role.ADMIN}) {
            UUID user = newUser(role);
            mvc.perform(get("/api/notifications").header("Authorization", token(user)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
            mvc.perform(get("/api/notifications/unread-count").header("Authorization", token(user)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.count").value(0));
        }
    }

    @Test
    void theListShowsOnlyMyRowsAndCanFilterUnread() throws Exception {
        UUID me = newUser(Role.FARMER);
        UUID other = newUser(Role.FARMER);
        UUID readOne = insert(me, "verification_approved");
        insert(me, "verification_rejected");
        insert(other, "verification_approved");
        mvc.perform(post("/api/notifications/" + readOne + "/read").header("Authorization", token(me)))
                .andExpect(status().isOk());

        mvc.perform(get("/api/notifications").header("Authorization", token(me)))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(2)));
        mvc.perform(get("/api/notifications?unread=true").header("Authorization", token(me)))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].type").value("verification_rejected"))
                .andExpect(jsonPath("$[0].readAt").doesNotExist());
    }

    @Test
    void anItemHasExactlyTheDocumentedFields() throws Exception {
        UUID me = newUser(Role.FARMER);
        insert(me, "verification_approved");

        mvc.perform(get("/api/notifications").header("Authorization", token(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].*", hasSize(9)))
                .andExpect(jsonPath("$[0].keys()", containsInAnyOrder("id", "type", "consultationId",
                        "messageId", "diagnosisId", "count", "createdAt", "updatedAt", "readAt")))
                .andExpect(jsonPath("$[0].count").value(1));
    }

    @Test
    void badPagingAndIdsAreRejected() throws Exception {
        UUID me = newUser(Role.FARMER);
        String auth = token(me);

        mvc.perform(get("/api/notifications?size=51").header("Authorization", auth))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        mvc.perform(get("/api/notifications?size=0").header("Authorization", auth))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/notifications?page=-1").header("Authorization", auth))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/notifications/not-a-uuid/read").header("Authorization", auth))
                .andExpect(status().isBadRequest());
    }

    @Test
    void markingReadLowersTheCounterAndIsIdempotent() throws Exception {
        UUID me = newUser(Role.FARMER);
        String auth = token(me);
        UUID first = insert(me, "verification_approved");
        insert(me, "verification_rejected");

        mvc.perform(post("/api/notifications/" + first + "/read").header("Authorization", auth))
                .andExpect(status().isOk()).andExpect(jsonPath("$.count").value(1));
        mvc.perform(post("/api/notifications/" + first + "/read").header("Authorization", auth))
                .andExpect(status().isOk()).andExpect(jsonPath("$.count").value(1));
        mvc.perform(get("/api/notifications/unread-count").header("Authorization", auth))
                .andExpect(jsonPath("$.count").value(1));
    }

    @Test
    void anotherUsersOrMissingNotificationIsNotFound() throws Exception {
        UUID me = newUser(Role.FARMER);
        UUID other = newUser(Role.FARMER);
        UUID foreign = insert(other, "verification_approved");

        mvc.perform(post("/api/notifications/" + foreign + "/read").header("Authorization", token(me)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("notification_not_found"));
        mvc.perform(post("/api/notifications/" + UUID.randomUUID() + "/read")
                .header("Authorization", token(me)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("notification_not_found"));
        mvc.perform(get("/api/notifications/unread-count").header("Authorization", token(other)))
                .andExpect(jsonPath("$.count").value(1));
    }

    @Test
    void readAllClearsOnlyMyFeed() throws Exception {
        UUID me = newUser(Role.FARMER);
        UUID other = newUser(Role.FARMER);
        insert(me, "verification_approved");
        insert(me, "verification_rejected");
        insert(other, "verification_approved");

        mvc.perform(post("/api/notifications/read-all").header("Authorization", token(me)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.count").value(0));

        mvc.perform(get("/api/notifications/unread-count").header("Authorization", token(me)))
                .andExpect(jsonPath("$.count").value(0));
        mvc.perform(get("/api/notifications/unread-count").header("Authorization", token(other)))
                .andExpect(jsonPath("$.count").value(1));
    }
}
