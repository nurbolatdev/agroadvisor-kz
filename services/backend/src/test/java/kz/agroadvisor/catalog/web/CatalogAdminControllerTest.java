package kz.agroadvisor.catalog.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.catalog.repository.CropRepository;
import kz.agroadvisor.catalog.repository.DiseaseRepository;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

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

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class CatalogAdminControllerTest {

    private static final String CROP_BODY = """
            {"code":"admcrop","names":{"ru":"Культура","kk":"Дақыл","en":"Crop"},"sortOrder":901}""";
    private static final String DISEASE_BODY = """
            {"code":"admcrop__rot","cropCode":"admcrop","kind":"fungal","severity":"high","latinName":"Rotus",
             "names":{"ru":"Гниль","kk":"Шірік","en":"Rot"},"symptoms":{"ru":["пятна"],"kk":"дақ"}}""";

    @Autowired
    private MockMvc mvc;
    @Autowired
    private CropRepository crops;
    @Autowired
    private DiseaseRepository diseases;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;

    private String admin;
    private String farmer;

    @BeforeEach
    void setUp() {
        admin = tokenFor(Role.ADMIN, "+7703");
        farmer = tokenFor(Role.FARMER, "+7704");
    }

    @AfterEach
    void cleanUp() {
        diseases.deleteAllById(java.util.List.of("admcrop__rot"));
        crops.deleteAllById(java.util.List.of("admcrop"));
    }

    private String tokenFor(Role role, String prefix) {
        String phone = prefix + (1_000_000 + (int) (Math.random() * 8_999_999));
        User user = users.saveAndFlush(new User(Login.parse(phone), "x", "User", "ru", Set.of(role)));
        return "Bearer " + jwt.issueAccessToken(user.getId());
    }

    private ResultActions send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request,
            String token, String body) throws Exception {
        if (body != null) {
            // Explicit charset: the bodies contain Cyrillic
            request = request.contentType(MediaType.APPLICATION_JSON).characterEncoding("UTF-8").content(body);
        }
        return mvc.perform(request.header("Authorization", token));
    }

    @Test
    void nonAdminIsForbidden() throws Exception {
        send(get("/api/admin/crops"), farmer, null).andExpect(status().isForbidden());
        send(post("/api/admin/crops"), farmer, CROP_BODY).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/crops")).andExpect(status().isUnauthorized());
    }

    @Test
    void cropLifecycle() throws Exception {
        send(post("/api/admin/crops"), admin, CROP_BODY)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.names.kk").value("Дақыл"));
        send(post("/api/admin/crops"), admin, CROP_BODY)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("crop_exists"));

        send(put("/api/admin/crops/admcrop"), admin,
                "{\"names\":{\"ru\":\"Новая\",\"kk\":\"Жаңа\",\"en\":\"New\"},\"sortOrder\":5}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.names.en").value("New"))
                .andExpect(jsonPath("$.sortOrder").value(5));

        send(delete("/api/admin/crops/admcrop"), admin, null).andExpect(status().isNoContent());
        send(delete("/api/admin/crops/admcrop"), admin, null).andExpect(status().isNotFound());
    }

    @Test
    void cropNeedsAllLanguagesAndValidCode() throws Exception {
        send(post("/api/admin/crops"), admin, "{\"code\":\"admcrop\",\"names\":{\"ru\":\"Только\"}}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
        send(post("/api/admin/crops"), admin,
                "{\"code\":\"Bad Code\",\"names\":{\"ru\":\"a\",\"kk\":\"b\",\"en\":\"c\"}}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
    }

    @Test
    void diseaseLifecycleAndCropInUse() throws Exception {
        send(post("/api/admin/crops"), admin, CROP_BODY).andExpect(status().isCreated());
        send(post("/api/admin/diseases"), admin, DISEASE_BODY)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.symptoms.kk").value("дақ"))
                .andExpect(jsonPath("$.treatmentCount").value(0));

        send(delete("/api/admin/crops/admcrop"), admin, null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("crop_in_use"));

        send(put("/api/admin/diseases/admcrop__rot"), admin, """
                {"cropCode":"admcrop","kind":"bacterial","names":{"ru":"Гниль 2","kk":"Шірік 2","en":"Rot 2"}}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.kind").value("bacterial"))
                .andExpect(jsonPath("$.data.severity").doesNotExist());
        send(get("/api/admin/diseases/admcrop__rot"), admin, null)
                .andExpect(jsonPath("$.data.names.ru").value("Гниль 2"));

        send(delete("/api/admin/diseases/admcrop__rot"), admin, null).andExpect(status().isNoContent());
        send(delete("/api/admin/crops/admcrop"), admin, null).andExpect(status().isNoContent());
    }

    @Test
    void cropAndDiseaseWithDiagnosesCannotBeDeleted() throws Exception {
        send(post("/api/admin/crops"), admin, CROP_BODY).andExpect(status().isCreated());
        send(post("/api/admin/diseases"), admin, DISEASE_BODY).andExpect(status().isCreated());
        UUID user = jdbc.queryForObject("SELECT id FROM users LIMIT 1", UUID.class);
        jdbc.update("""
                INSERT INTO diagnoses (user_id, crop_code, photo_key, status, top1_code, top1_confidence,
                                       model_version, classes_version)
                VALUES (?, 'admcrop', 'diagnoses/adm.jpg', 'ok', 'admcrop__rot', 0.9, 'effnet-b0-v1', 1)""", user);
        try {
            send(delete("/api/admin/diseases/admcrop__rot"), admin, null)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("disease_in_use"));

            // The disease is gone but the diagnosis still points at the crop: a foreign key, not a 500
            jdbc.update("DELETE FROM diseases WHERE code = 'admcrop__rot'");
            send(delete("/api/admin/crops/admcrop"), admin, null)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("crop_in_use"));
        } finally {
            jdbc.update("DELETE FROM diagnoses WHERE photo_key = 'diagnoses/adm.jpg'");
        }
    }

    @Test
    void textsKeepTheReadContract() throws Exception {
        send(post("/api/admin/crops"), admin, CROP_BODY).andExpect(status().isCreated());
        String names = "\"names\":{\"ru\":\"a\",\"kk\":\"b\",\"en\":\"c\"}";

        send(post("/api/admin/diseases"), admin,
                "{\"code\":\"admcrop__rot\",\"cropCode\":\"admcrop\",\"kind\":\"fungal\"," + names
                        + ",\"symptoms\":{\"de\":\"x\"}}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
        send(post("/api/admin/diseases"), admin,
                "{\"code\":\"admcrop__rot\",\"cropCode\":\"admcrop\",\"kind\":\"fungal\"," + names
                        + ",\"symptoms\":{\"ru\":{\"nested\":1}}}")
                .andExpect(status().isBadRequest());
        send(post("/api/admin/diseases"), admin,
                "{\"code\":\"admcrop__rot\",\"cropCode\":\"admcrop\",\"kind\":\"fungal\"," + names
                        + ",\"prevention\":{\"ru\":[1,2]}}")
                .andExpect(status().isBadRequest());
        send(post("/api/admin/diseases"), admin,
                "{\"code\":\"admcrop__rot\",\"cropCode\":\"admcrop\",\"kind\":\"fungal\","
                        + "\"names\":{\"ru\":\"a\",\"kk\":\"b\",\"en\":\"c\",\"fr\":\"d\"}}")
                .andExpect(status().isBadRequest());
        send(post("/api/admin/diseases"), admin,
                "{\"code\":\"admcrop__rot\",\"cropCode\":\"admcrop\",\"kind\":\"fungal\"," + names
                        + ",\"symptoms\":{\"ru\":\"" + "x".repeat(2001) + "\"}}")
                .andExpect(status().isBadRequest());
    }

    @Test
    void editingADiseaseRefreshesUpdatedAt() throws Exception {
        send(post("/api/admin/crops"), admin, CROP_BODY).andExpect(status().isCreated());
        send(post("/api/admin/diseases"), admin, DISEASE_BODY).andExpect(status().isCreated());
        Instant before = jdbc.queryForObject("SELECT updated_at FROM diseases WHERE code = 'admcrop__rot'",
                Instant.class);
        Thread.sleep(20);

        send(put("/api/admin/diseases/admcrop__rot"), admin, """
                {"cropCode":"admcrop","kind":"fungal","names":{"ru":"Новое","kk":"Жаңа","en":"New"}}""")
                .andExpect(status().isOk());

        Instant after = jdbc.queryForObject("SELECT updated_at FROM diseases WHERE code = 'admcrop__rot'",
                Instant.class);
        org.assertj.core.api.Assertions.assertThat(after).isAfter(before);
    }

    @Test
    void treatmentLifecycle() throws Exception {
        send(post("/api/admin/crops"), admin, CROP_BODY).andExpect(status().isCreated());
        send(post("/api/admin/diseases"), admin, DISEASE_BODY).andExpect(status().isCreated());
        String url = "/api/admin/diseases/admcrop__rot/treatments";

        String created = send(post(url), admin, """
                {"type":"chemical","product":"Скор","activeIngredient":"дифеноконазол",
                 "dosage":{"ru":"2 мл на 10 л"},"method":{"ru":"опрыскивание"},"sortOrder":1}""")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.product").value("Скор"))
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        int id = com.jayway.jsonpath.JsonPath.read(created, "$.id");

        send(get(url), admin, null)
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].data.dosage.ru").value("2 мл на 10 л"));
        send(get("/api/admin/diseases/admcrop__rot"), admin, null)
                .andExpect(jsonPath("$.treatmentCount").value(1));

        send(put(url + "/" + id), admin, "{\"type\":\"biological\",\"product\":\"Фитоспорин\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.type").value("biological"))
                .andExpect(jsonPath("$.data.activeIngredient").doesNotExist());

        send(delete(url + "/" + id), admin, null).andExpect(status().isNoContent());
        send(delete(url + "/" + id), admin, null)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("treatment_not_found"));
        send(get(url), admin, null).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void treatmentRulesAreChecked() throws Exception {
        send(post("/api/admin/crops"), admin, CROP_BODY).andExpect(status().isCreated());
        send(post("/api/admin/diseases"), admin, DISEASE_BODY).andExpect(status().isCreated());
        String url = "/api/admin/diseases/admcrop__rot/treatments";

        send(post(url), admin, "{\"type\":\"magic\",\"product\":\"X\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
        send(post(url), admin, "{\"type\":\"chemical\",\"product\":\" \"}").andExpect(status().isBadRequest());
        send(post("/api/admin/diseases/missing__x/treatments"), admin, "{\"type\":\"chemical\",\"product\":\"X\"}")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("disease_not_found"));
        send(post(url), farmer, "{\"type\":\"chemical\",\"product\":\"X\"}").andExpect(status().isForbidden());
    }

    @Test
    void diseaseRulesAreChecked() throws Exception {
        send(post("/api/admin/diseases"), admin, DISEASE_BODY)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("crop_not_found"));

        send(post("/api/admin/crops"), admin, CROP_BODY).andExpect(status().isCreated());
        send(post("/api/admin/diseases"), admin, DISEASE_BODY.replace("admcrop__rot", "other__rot"))
                .andExpect(status().isBadRequest());
        send(post("/api/admin/diseases"), admin, DISEASE_BODY.replace("fungal", "weird"))
                .andExpect(status().isBadRequest());
        send(post("/api/admin/diseases"), admin, DISEASE_BODY.replace("high", "extreme"))
                .andExpect(status().isBadRequest());

        send(post("/api/admin/diseases"), admin, DISEASE_BODY).andExpect(status().isCreated());
        send(post("/api/admin/diseases"), admin, DISEASE_BODY)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("disease_exists"));
        send(put("/api/admin/diseases/missing__x"), admin, """
                {"cropCode":"admcrop","kind":"fungal","names":{"ru":"a","kk":"b","en":"c"}}""")
                .andExpect(status().isNotFound());
    }
}
