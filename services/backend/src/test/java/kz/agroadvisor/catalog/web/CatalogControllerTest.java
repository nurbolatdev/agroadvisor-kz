package kz.agroadvisor.catalog.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.Set;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.catalog.model.Crop;
import kz.agroadvisor.catalog.model.Disease;
import kz.agroadvisor.catalog.model.Treatment;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class CatalogControllerTest {

    private static final String CROP = "ctlcrop";
    private static final String DISEASE = "ctlcrop__rot";
    private static final Map<String, String> NAMES = Map.of("ru", "Гниль", "kk", "Шірік", "en", "Rot");

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
    private TransactionTemplate tx;

    private String token;

    @BeforeEach
    void setUp() {
        tx.executeWithoutResult(s -> {
            crops.save(new Crop(CROP, Map.of("ru", "Культура", "kk", "Дақыл", "en", "Crop"), 900));
            Disease disease = new Disease(DISEASE, CROP, "fungal", "high", "Rotus", NAMES,
                    Map.of("ru", List.of("пятна"), "en", List.of("spots")), null, Map.of("ru", "севооборот"));
            disease.addTreatment(new Treatment("biological", "Bio", null, Map.of("ru", "1 л"), Map.of("ru", "опрыскивание"), 1));
            disease.addTreatment(new Treatment("chemical", "Chem", "ingredient", Map.of("ru", "2 л"), Map.of("ru", "полив"), 1));
            diseases.save(disease);
        });
        String phone = "+7702" + (1_000_000 + (int) (Math.random() * 8_999_999));
        User farmer = users.saveAndFlush(new User(Login.parse(phone), "x", "Farmer", "ru", Set.of(Role.FARMER)));
        token = "Bearer " + jwt.issueAccessToken(farmer.getId());
    }

    @AfterEach
    void cleanUp() {
        tx.executeWithoutResult(s -> {
            diseases.deleteById(DISEASE);
            crops.deleteById(CROP);
        });
    }

    @Test
    void requiresSignIn() throws Exception {
        mvc.perform(get("/api/crops")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/diseases")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/diseases/" + DISEASE)).andExpect(status().isUnauthorized());
    }

    @Test
    void listsCropsInRussianByDefault() throws Exception {
        mvc.perform(get("/api/crops").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code=='" + CROP + "')].name").value("Культура"));
    }

    @Test
    void langParameterBeatsAcceptLanguage() throws Exception {
        mvc.perform(get("/api/crops?lang=en").header("Authorization", token).header("Accept-Language", "kk"))
                .andExpect(jsonPath("$[?(@.code=='" + CROP + "')].name").value("Crop"));
        mvc.perform(get("/api/crops").header("Authorization", token).header("Accept-Language", "kk-KZ,ru;q=0.8"))
                .andExpect(jsonPath("$[?(@.code=='" + CROP + "')].name").value("Дақыл"));
        mvc.perform(get("/api/crops?lang=de").header("Authorization", token))
                .andExpect(jsonPath("$[?(@.code=='" + CROP + "')].name").value("Культура"));
    }

    @Test
    void filtersDiseasesByCrop() throws Exception {
        mvc.perform(get("/api/diseases?crop=" + CROP).header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].code").value(DISEASE))
                .andExpect(jsonPath("$[0].cropCode").value(CROP))
                .andExpect(jsonPath("$[0].name").value("Гниль"));
    }

    @Test
    void listLeavesOutHealthyAndUnknownButDetailKeepsThem() throws Exception {
        mvc.perform(get("/api/diseases?crop=tomato").header("Authorization", token))
                .andExpect(jsonPath("$[?(@.code=='tomato__late_blight')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.code=='tomato__healthy')]").isEmpty());
        mvc.perform(get("/api/diseases").header("Authorization", token))
                .andExpect(jsonPath("$[?(@.code=='unknown')]").isEmpty());

        mvc.perform(get("/api/diseases/tomato__healthy?lang=en").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.disease.name").value("Healthy"));
        mvc.perform(get("/api/diseases/unknown?lang=en").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.disease.name").value("Not recognized"));
    }

    @Test
    void unknownCropIs404() throws Exception {
        mvc.perform(get("/api/diseases?crop=nope").header("Authorization", token))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("crop_not_found"));
    }

    @Test
    void diseaseDetailFallsBackToRussianAndOrdersTreatments() throws Exception {
        mvc.perform(get("/api/diseases/" + DISEASE + "?lang=kk").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.disease.name").value("Шірік"))
                .andExpect(jsonPath("$.symptoms[0]").value("пятна"))
                .andExpect(jsonPath("$.conditions").doesNotExist())
                .andExpect(jsonPath("$.prevention").value("севооборот"))
                .andExpect(jsonPath("$.treatments[0].type").value("biological"))
                .andExpect(jsonPath("$.treatments[1].product").value("Chem"))
                .andExpect(jsonPath("$.treatments[1].dosage").value("2 л"));
    }

    @Test
    void unknownDiseaseIs404() throws Exception {
        mvc.perform(get("/api/diseases/nope").header("Authorization", token))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("disease_not_found"));
    }
}
