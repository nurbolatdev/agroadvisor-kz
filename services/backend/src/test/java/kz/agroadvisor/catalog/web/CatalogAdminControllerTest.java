package kz.agroadvisor.catalog.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Set;

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
