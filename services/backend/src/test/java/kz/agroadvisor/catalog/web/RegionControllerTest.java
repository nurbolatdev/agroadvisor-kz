package kz.agroadvisor.catalog.web;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.emptyOrNullString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.catalog.service.RegionService;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class RegionControllerTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private CacheManager caches;

    @BeforeEach
    void clearCache() {
        caches.getCache(RegionService.CACHE).clear();
    }

    @Test
    void isPublic_theRegistrationFormAsksForItBeforeThereIsAnAccount() throws Exception {
        mvc.perform(get("/api/regions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(10))));
    }

    @Test
    void listsTheSeededRegionsInRussianByDefaultWithIdCodeAndName() throws Exception {
        mvc.perform(get("/api/regions"))
                .andExpect(jsonPath("$[?(@.code=='akmola')].name").value("Акмолинская область"))
                .andExpect(jsonPath("$[?(@.code=='north_kazakhstan')].name").value("Северо-Казахстанская область"))
                .andExpect(jsonPath("$[*].id", everyItem(org.hamcrest.Matchers.isA(Integer.class))))
                .andExpect(jsonPath("$[*].code", hasItem("kostanay")))
                .andExpect(jsonPath("$[*].name", everyItem(not(emptyOrNullString()))));
    }

    @Test
    void answersInTheLanguageOfTheRequest() throws Exception {
        mvc.perform(get("/api/regions?lang=en"))
                .andExpect(jsonPath("$[?(@.code=='almaty')].name").value("Almaty Region"));
        mvc.perform(get("/api/regions").header("Accept-Language", "kk-KZ,ru;q=0.8"))
                .andExpect(jsonPath("$[?(@.code=='almaty')].name").value("Алматы облысы"));
        // lang beats the header; an unsupported language falls back to Russian
        mvc.perform(get("/api/regions?lang=en").header("Accept-Language", "kk"))
                .andExpect(jsonPath("$[?(@.code=='zhambyl')].name").value("Zhambyl Region"));
        mvc.perform(get("/api/regions?lang=de"))
                .andExpect(jsonPath("$[?(@.code=='zhambyl')].name").value("Жамбылская область"));
    }

    @Test
    void isSortedByTheNameInThatLanguage() throws Exception {
        mvc.perform(get("/api/regions?lang=en"))
                .andExpect(jsonPath("$[*].name", contains("Akmola Region", "Aktobe Region", "Almaty Region",
                        "East Kazakhstan Region", "Karaganda Region", "Kostanay Region", "North Kazakhstan Region",
                        "Pavlodar Region", "Turkistan Region", "Zhambyl Region")));
    }

    @Test
    void isSortedByTheRussianAlphabet() throws Exception {
        mvc.perform(get("/api/regions?lang=ru"))
                .andExpect(jsonPath("$[*].name", contains("Акмолинская область", "Актюбинская область",
                        "Алматинская область", "Восточно-Казахстанская область", "Жамбылская область",
                        "Карагандинская область", "Костанайская область", "Павлодарская область",
                        "Северо-Казахстанская область", "Туркестанская область")));
    }

    /** The JDK has no rules for Kazakh: without ours the letters Қ, Ө, Ү would come after Я. */
    @Test
    void isSortedByTheKazakhAlphabetWithItsOwnLetters() throws Exception {
        mvc.perform(get("/api/regions?lang=kk"))
                .andExpect(jsonPath("$[*].name", contains("Ақмола облысы", "Ақтөбе облысы", "Алматы облысы",
                        "Жамбыл облысы", "Қарағанды облысы", "Қостанай облысы", "Павлодар облысы",
                        "Солтүстік Қазақстан облысы", "Түркістан облысы", "Шығыс Қазақстан облысы")));
    }

    @Test
    void isCachedPerLanguage() throws Exception {
        mvc.perform(get("/api/regions?lang=en")).andExpect(status().isOk());
        mvc.perform(get("/api/regions?lang=kk")).andExpect(status().isOk());

        org.assertj.core.api.Assertions.assertThat(caches.getCache(RegionService.CACHE).get("en")).isNotNull();
        org.assertj.core.api.Assertions.assertThat(caches.getCache(RegionService.CACHE).get("kk")).isNotNull();
        org.assertj.core.api.Assertions.assertThat(caches.getCache(RegionService.CACHE).get("ru")).isNull();
    }

    @Test
    void onlyReadingIsAllowed() throws Exception {
        mvc.perform(post("/api/regions").contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized());
    }
}
