package kz.agroadvisor.weather.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
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
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;
import kz.agroadvisor.weather.service.StubWeatherClient;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class WeatherControllerIntegrationTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private CacheManager caches;
    @Autowired
    private StubWeatherClient stub;

    private final List<UUID> created = new ArrayList<>();
    private String farmer;

    @BeforeEach
    void setUp() {
        caches.getCache("weather").clear();
        stub.reset();
        farmer = tokenOf(Role.FARMER);
    }

    @AfterEach
    void cleanUp() {
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    @Test
    void requiresSignIn() throws Exception {
        mvc.perform(get("/api/weather").param("latitude", "43.25").param("longitude", "76.95"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void anAgrochemistHasNoWeather() throws Exception {
        mvc.perform(get("/api/weather").header("Authorization", tokenOf(Role.AGROCHEMIST))
                .param("latitude", "43.25").param("longitude", "76.95")).andExpect(status().isForbidden());
    }

    @Test
    void givesTheWeatherFromTheCurrentHourWithSprayWindows() throws Exception {
        mvc.perform(get("/api/weather").header("Authorization", farmer)
                .param("latitude", "43.25").param("longitude", "76.95"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timezone").value("Asia/Almaty"))
                .andExpect(jsonPath("$.current.temperatureC").value(18.5))
                .andExpect(jsonPath("$.current.windMs").value(2.5))
                // Two of the 120 hours are in the past; the rest start with the current hour
                .andExpect(jsonPath("$.hours.length()").value(118))
                .andExpect(jsonPath("$.hours[0].sprayOk").value(true))
                .andExpect(jsonPath("$.hours[117].sprayOk").value(false))
                .andExpect(jsonPath("$.sprayWindows.length()").value(1));
    }

    @Test
    void roundsThePointAndSharesTheForecastThroughTheCache() throws Exception {
        for (String[] point : new String[][] {{"43.254", "76.951"}, {"43.2499", "76.9501"}, {"43.25", "76.95"}}) {
            mvc.perform(get("/api/weather").header("Authorization", farmer)
                    .param("latitude", point[0]).param("longitude", point[1])).andExpect(status().isOk());
        }

        // All three round to 43.25, 76.95: one call to the source
        assertThat(stub.points()).hasSize(1);
        assertThat(stub.points().getFirst()).containsExactly(new BigDecimal("43.25"), new BigDecimal("76.95"));
    }

    @Test
    void aFailureOfTheSourceIsNotCached() throws Exception {
        stub.answer(() -> {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "weather_unavailable", "down");
        });

        mvc.perform(get("/api/weather").header("Authorization", farmer)
                .param("latitude", "43.25").param("longitude", "76.95"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("weather_unavailable"));
        stub.answer(StubWeatherClient::calmFiveDays);
        mvc.perform(get("/api/weather").header("Authorization", farmer)
                .param("latitude", "43.25").param("longitude", "76.95")).andExpect(status().isOk());
    }

    @Test
    void rejectsAPointOffTheGlobeOrMissing() throws Exception {
        mvc.perform(get("/api/weather").header("Authorization", farmer)
                .param("latitude", "91").param("longitude", "76.95"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        mvc.perform(get("/api/weather").header("Authorization", farmer)
                .param("latitude", "43").param("longitude", "-180.5"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        mvc.perform(get("/api/weather").header("Authorization", farmer).param("latitude", "43"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/weather").header("Authorization", farmer)
                .param("latitude", "north").param("longitude", "76.95")).andExpect(status().isBadRequest());
    }

    @Test
    void limitsTheRequestsOfOneUserPerMinute() throws Exception {
        for (int i = 0; i < 30; i++) {
            mvc.perform(get("/api/weather").header("Authorization", farmer)
                    .param("latitude", "43.25").param("longitude", "76.95")).andExpect(status().isOk());
        }

        mvc.perform(get("/api/weather").header("Authorization", farmer)
                .param("latitude", "43.25").param("longitude", "76.95"))
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("rate_limited"));
        // Another user has a bucket of their own
        mvc.perform(get("/api/weather").header("Authorization", tokenOf(Role.FARMER))
                .param("latitude", "43.25").param("longitude", "76.95")).andExpect(status().isOk());
    }

    private String tokenOf(Role role) {
        String phone = "+7702" + (1_000_000 + (int) (Math.random() * 8_999_999));
        User user = users.saveAndFlush(new User(Login.parse(phone), "x", "Test", "ru", Set.of(role)));
        created.add(user.getId());
        return "Bearer " + jwt.issueAccessToken(user.getId());
    }
}
