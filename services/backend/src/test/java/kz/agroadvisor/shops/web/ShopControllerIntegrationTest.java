package kz.agroadvisor.shops.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

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
class ShopControllerIntegrationTest {

    // Almaty centre; the near shop is about 1 km away, the far one is in Astana
    private static final String ALMATY = "latitude=43.2567&longitude=76.9286";

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> createdUsers = new ArrayList<>();
    private String farmer;
    private UUID near;
    private UUID hidden;

    @BeforeEach
    void setUp() {
        farmer = tokenOf(Role.FARMER);
        near = shop("Near Agro", 43.2650, 76.9286, "active");
        shop("Middle Agro", 43.4000, 76.9286, "active");
        shop("Far Agro", 51.1605, 71.4704, "active");
        hidden = shop("Hidden Agro", 43.2600, 76.9286, "hidden");
    }

    @AfterEach
    void cleanUp() {
        // The reports go with their authors and their shops
        createdUsers.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
        jdbc.update("DELETE FROM shops WHERE name LIKE '% Agro'");
    }

    @Test
    void requiresSignInAndAFarmer() throws Exception {
        mvc.perform(get("/api/shops/nearby?" + ALMATY)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/shops/nearby?" + ALMATY).header("Authorization", tokenOf(Role.AGROCHEMIST)))
                .andExpect(status().isForbidden());
    }

    @Test
    void findsActiveShopsAroundAPointNearestFirst() throws Exception {
        mvc.perform(get("/api/shops/nearby?" + ALMATY + "&radiusKm=30").header("Authorization", farmer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("Near Agro"))
                .andExpect(jsonPath("$[0].distanceM").value(org.hamcrest.Matchers.allOf(
                        org.hamcrest.Matchers.greaterThan(900), org.hamcrest.Matchers.lessThan(1200))))
                .andExpect(jsonPath("$[0].categories[0]").value("seeds"))
                .andExpect(jsonPath("$[1].name").value("Middle Agro"));
    }

    @Test
    void theRadiusAndTheLimitCutTheAnswer() throws Exception {
        mvc.perform(get("/api/shops/nearby?" + ALMATY + "&radiusKm=5").header("Authorization", farmer))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Near Agro"));
        mvc.perform(get("/api/shops/nearby?" + ALMATY + "&radiusKm=30&limit=1").header("Authorization", farmer))
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void refusesAPointOrARangeThatIsNotValid() throws Exception {
        for (String query : List.of("latitude=91&longitude=76", "latitude=43&longitude=181", ALMATY + "&radiusKm=0",
                ALMATY + "&radiusKm=101", ALMATY + "&limit=0", ALMATY + "&limit=101")) {
            mvc.perform(get("/api/shops/nearby?" + query).header("Authorization", farmer))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("validation_failed"));
        }
    }

    @Test
    void readsAnActiveShopAndNotAHiddenOne() throws Exception {
        mvc.perform(get("/api/shops/" + near).header("Authorization", farmer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Near Agro"))
                .andExpect(jsonPath("$.distanceM").doesNotExist());

        assertCode(get("/api/shops/" + hidden).header("Authorization", farmer), 404, "shop_not_found");
        assertCode(get("/api/shops/" + UUID.randomUUID()).header("Authorization", farmer), 404, "shop_not_found");
    }

    @Test
    void takesAReportAboutANewShopAndAboutAnExistingOne() throws Exception {
        report(farmer, """
                {"type": "new_shop", "comment": "Seeds, Abay 1", "latitude": 43.25, "longitude": 76.95}""")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("new_shop"))
                .andExpect(jsonPath("$.status").value("new"))
                .andExpect(jsonPath("$.shopId").doesNotExist());
        report(farmer, "{\"type\": \"closed\", \"shopId\": \"" + near + "\", \"comment\": \"Closed since May\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.shopId").value(near.toString()));
    }

    @Test
    void refusesAReportThatDoesNotFitItsType() throws Exception {
        for (String body : List.of(
                "{\"type\": \"new_shop\", \"comment\": \"No point\"}",
                "{\"type\": \"new_shop\", \"shopId\": \"" + near + "\", \"comment\": \"x\", \"latitude\": 43, "
                        + "\"longitude\": 76}",
                "{\"type\": \"closed\", \"comment\": \"No shop\"}",
                "{\"type\": \"wrong_info\", \"shopId\": \"" + near + "\", \"comment\": \"x\", \"latitude\": 43, "
                        + "\"longitude\": 76}",
                "{\"type\": \"moved\", \"comment\": \"x\"}",
                "{\"type\": \"closed\", \"shopId\": \"" + near + "\", \"comment\": \"   \"}")) {
            report(farmer, body).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("validation_failed"));
        }
    }

    @Test
    void aReportAboutAHiddenShopIsNotFound() throws Exception {
        report(farmer, "{\"type\": \"closed\", \"shopId\": \"" + hidden + "\", \"comment\": \"Closed\"}")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("shop_not_found"));
    }

    @Test
    void stopsReportsAfterTenAnHour() throws Exception {
        String body = "{\"type\": \"closed\", \"shopId\": \"" + near + "\", \"comment\": \"Closed\"}";
        for (int i = 0; i < 10; i++) {
            report(farmer, body).andExpect(status().isCreated());
        }

        report(farmer, body).andExpect(status().isTooManyRequests());
    }

    private org.springframework.test.web.servlet.ResultActions report(String token, String body) throws Exception {
        return mvc.perform(post("/api/shops/requests").header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private void assertCode(MockHttpServletRequestBuilder request, int status, String code) throws Exception {
        mvc.perform(request).andExpect(status().is(status)).andExpect(jsonPath("$.code").value(code));
    }

    private UUID shop(String name, double latitude, double longitude, String status) {
        return jdbc.queryForObject("""
                INSERT INTO shops (name, address, categories, latitude, longitude, status)
                VALUES (?, 'Main street 1', ARRAY['seeds', 'fertilizers'], ?, ?, ?) RETURNING id""",
                UUID.class, name, latitude, longitude, status);
    }

    private String tokenOf(Role role) {
        String phone = "+7702" + (1_000_000 + (int) (Math.random() * 8_999_999));
        User user = users.saveAndFlush(new User(Login.parse(phone), "x", "Test", "ru", Set.of(role)));
        createdUsers.add(user.getId());
        return "Bearer " + jwt.issueAccessToken(user.getId());
    }
}
