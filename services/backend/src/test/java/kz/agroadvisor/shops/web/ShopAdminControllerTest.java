package kz.agroadvisor.shops.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

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
class ShopAdminControllerTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private JsonMapper json;

    private final List<UUID> createdUsers = new ArrayList<>();
    private String marker;
    private Long regionId;
    private Long districtId;
    private UUID farmerId;
    private String adminToken;
    private String farmerToken;

    @BeforeEach
    void setUp() {
        StringBuilder letters = new StringBuilder("Zs");
        for (int i = 0; i < 8; i++) {
            letters.append((char) ('a' + ThreadLocalRandom.current().nextInt(26)));
        }
        marker = letters.toString();
        regionId = jdbc.queryForObject("""
                INSERT INTO regions (code, names)
                VALUES (?, '{"ru": "Область", "kk": "Облыс", "en": "Oblast"}') RETURNING id""", Long.class,
                "sac_" + marker);
        districtId = jdbc.queryForObject("""
                INSERT INTO districts (region_id, code, names)
                VALUES (?, ?, '{"ru": "Район", "kk": "Аудан", "en": "District"}') RETURNING id""", Long.class,
                regionId, "sad_" + marker);
        farmerId = user(Role.FARMER);
        adminToken = "Bearer " + jwt.issueAccessToken(user(Role.ADMIN));
        farmerToken = "Bearer " + jwt.issueAccessToken(farmerId);
    }

    /** Shops of this class go first (their reports go with them), then the users, the district, the region. */
    @AfterEach
    void cleanUp() {
        jdbc.update("DELETE FROM shops WHERE name LIKE ?", "%" + marker + "%");
        createdUsers.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
        jdbc.update("DELETE FROM districts WHERE id = ?", districtId);
        jdbc.update("DELETE FROM regions WHERE id = ?", regionId);
    }

    private UUID user(Role role) {
        String phone = "+7705" + (1_000_000 + ThreadLocalRandom.current().nextInt(8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", role + " " + marker, "ru", Set.of(role)))
                .getId();
        createdUsers.add(id);
        return id;
    }

    private static String body(String name, String extra) {
        return """
                {"name": "%s", "address": "ул. Абая 1", "latitude": 43.25, "longitude": 76.9 %s}"""
                .formatted(name, extra);
    }

    private ResultActions send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request,
            String token, String content) throws Exception {
        request.header("Authorization", token);
        if (content != null) {
            request.contentType(MediaType.APPLICATION_JSON).content(content);
        }
        return mvc.perform(request);
    }

    private JsonNode createShop(String name, String extra) throws Exception {
        String result = send(post("/api/admin/shops"), adminToken, body(name, extra)).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(result);
    }

    private UUID report(String type, UUID shopId, String comment) {
        boolean isNew = type.equals("new_shop");
        return jdbc.queryForObject("""
                INSERT INTO shop_requests (author_id, type, shop_id, comment, latitude, longitude)
                VALUES (?, ?, ?, ?, ?, ?) RETURNING id""", UUID.class, farmerId, type, shopId, comment,
                isNew ? 43.1 : null, isNew ? 76.8 : null);
    }

    @Test
    void requiresAnAdministrator() throws Exception {
        mvc.perform(get("/api/admin/shops")).andExpect(status().isUnauthorized());
        send(get("/api/admin/shops"), farmerToken, null).andExpect(status().isForbidden());
        send(post("/api/admin/shops"), farmerToken, body("X " + marker, "")).andExpect(status().isForbidden());
        send(get("/api/admin/shops/requests"), farmerToken, null).andExpect(status().isForbidden());
    }

    @Test
    void addsAShopAndReadsItBack() throws Exception {
        JsonNode shop = createShop("Агро " + marker,
                ", \"phone\": \" +7 701 000 \", \"hours\": \"Пн–Сб 08:00–19:00\", "
                        + "\"categories\": [\"seeds\", \"seeds\", \"fungicides\"], \"regionId\": " + regionId
                        + ", \"districtId\": " + districtId);

        assertThat(shop.get("status").asString()).isEqualTo("active");
        assertThat(shop.get("phone").asString()).isEqualTo("+7 701 000");
        assertThat(shop.get("categories")).hasSize(2);
        assertThat(shop.get("region").asString()).isEqualTo("Область");
        assertThat(shop.get("district").asString()).isEqualTo("Район");
        assertThat(shop.get("latitude").asDouble()).isEqualTo(43.25);
        send(get("/api/admin/shops/" + shop.get("id").asString() + "?lang=en"), adminToken, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.region").value("Oblast"))
                .andExpect(jsonPath("$.district").value("District"));
    }

    @Test
    void rejectsWhatIsNotAShop() throws Exception {
        send(post("/api/admin/shops"), adminToken, body("Агро " + marker, ", \"categories\": [\"cars\"]"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        // a point outside Kazakhstan
        send(post("/api/admin/shops"), adminToken, """
                {"name": "Агро %s", "address": "x", "latitude": 10, "longitude": 76.9}""".formatted(marker))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        send(post("/api/admin/shops"), adminToken, """
                {"name": "  ", "address": "x", "latitude": 43, "longitude": 76}""")
                .andExpect(status().isBadRequest());
        // a district without its region, and a district of another region
        send(post("/api/admin/shops"), adminToken, body("Агро " + marker, ", \"districtId\": " + districtId))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("unknown_region"));
        send(post("/api/admin/shops"), adminToken, body("Агро " + marker, ", \"regionId\": 999999999"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("unknown_region"));
    }

    @Test
    void changesAShopButNotItsStatus() throws Exception {
        String id = createShop("Агро " + marker, "").get("id").asString();
        send(patch("/api/admin/shops/" + id + "/status"), adminToken, "{\"status\": \"hidden\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("hidden"));

        send(put("/api/admin/shops/" + id), adminToken, body("Агро новый " + marker, ", \"hours\": \"24/7\""))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Агро новый " + marker))
                .andExpect(jsonPath("$.hours").value("24/7")).andExpect(jsonPath("$.phone").value((Object) null))
                .andExpect(jsonPath("$.status").value("hidden"));
        send(put("/api/admin/shops/" + UUID.randomUUID()), adminToken, body("X " + marker, ""))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("shop_not_found"));
    }

    @Test
    void hidesAndShowsAShopAndKeepsHiddenOnesInTheList() throws Exception {
        String id = createShop("Агро " + marker, "").get("id").asString();

        send(patch("/api/admin/shops/" + id + "/status"), adminToken, "{\"status\": \"hidden\"}")
                .andExpect(status().isOk());
        send(patch("/api/admin/shops/" + id + "/status"), adminToken, "{\"status\": \"hidden\"}")
                .andExpect(status().isOk());
        send(get("/api/admin/shops?search=" + marker), adminToken, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].status").value("hidden"));
        send(get("/api/admin/shops?search=" + marker + "&status=active"), adminToken, null)
                .andExpect(jsonPath("$.length()").value(0));

        send(patch("/api/admin/shops/" + id + "/status"), adminToken, "{\"status\": \"deleted\"}")
                .andExpect(status().isBadRequest());
        send(patch("/api/admin/shops/" + UUID.randomUUID() + "/status"), adminToken, "{\"status\": \"active\"}")
                .andExpect(status().isNotFound());
    }

    @Test
    void searchesByNameOrAddressAndRegion() throws Exception {
        createShop("Альфа " + marker, ", \"regionId\": " + regionId);
        createShop("Бета " + marker, "");

        send(get("/api/admin/shops?search=" + marker), adminToken, null).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("Альфа " + marker));
        send(get("/api/admin/shops?search=" + marker + "&regionId=" + regionId), adminToken, null)
                .andExpect(jsonPath("$.length()").value(1));
        send(get("/api/admin/shops?search=" + marker + "&size=1&page=1"), adminToken, null)
                .andExpect(jsonPath("$[0].name").value("Бета " + marker));
        send(get("/api/admin/shops?search=%25"), adminToken, null).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void listsReportsAndDecidesEachOnce() throws Exception {
        String shopId = createShop("Агро " + marker, "").get("id").asString();
        UUID closed = report("closed", UUID.fromString(shopId), "закрыт");
        UUID added = report("new_shop", null, "Новый магазин " + marker);

        String list = send(get("/api/admin/shops/requests?status=new&size=100"), adminToken, null)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode mine = null;
        for (JsonNode r : json.readTree(list)) {
            if (r.get("id").asString().equals(closed.toString())) {
                mine = r;
            }
        }
        assertThat(mine).isNotNull();
        assertThat(mine.get("shopName").asString()).isEqualTo("Агро " + marker);
        assertThat(mine.get("author").get("id").asString()).isEqualTo(farmerId.toString());
        assertThat(mine.get("latitude").isNull()).isTrue();

        send(patch("/api/admin/shops/requests/" + closed + "/status"), adminToken, "{\"status\": \"done\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("done"));
        send(patch("/api/admin/shops/requests/" + closed + "/status"), adminToken, "{\"status\": \"rejected\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("shop_request_resolved"));
        send(patch("/api/admin/shops/requests/" + added + "/status"), adminToken, "{\"status\": \"new\"}")
                .andExpect(status().isBadRequest());
        send(patch("/api/admin/shops/requests/" + UUID.randomUUID() + "/status"), adminToken,
                "{\"status\": \"done\"}").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("shop_request_not_found"));
        send(get("/api/admin/shops/requests?status=done&size=100"), adminToken, null)
                .andExpect(jsonPath("$[?(@.id == '" + closed + "')]").exists());
    }

    @Test
    void countsShopsAndPendingReports() throws Exception {
        JsonNode before = json.readTree(send(get("/api/admin/shops/stats"), adminToken, null)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        String id = createShop("Агро " + marker, "").get("id").asString();
        createShop("Агро два " + marker, "");
        send(patch("/api/admin/shops/" + id + "/status"), adminToken, "{\"status\": \"hidden\"}");
        report("closed", UUID.fromString(id), "закрыт");

        JsonNode after = json.readTree(send(get("/api/admin/shops/stats"), adminToken, null)
                .andReturn().getResponse().getContentAsString());

        assertThat(after.get("total").asInt() - before.get("total").asInt()).isEqualTo(2);
        assertThat(after.get("active").asInt() - before.get("active").asInt()).isEqualTo(1);
        assertThat(after.get("addedThisMonth").asInt() - before.get("addedThisMonth").asInt()).isEqualTo(2);
        assertThat(after.get("pendingRequests").asInt() - before.get("pendingRequests").asInt()).isEqualTo(1);
    }
}
