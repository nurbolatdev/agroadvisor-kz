package kz.agroadvisor.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;

import com.jayway.jsonpath.JsonPath;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.common.ratelimit.RateLimiter;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * The limits of the public auth endpoints, with small values. The limiter's clock is fixed at the start of an
 * hour, so no minute or hour boundary can fall inside a test and Retry-After is exactly 60 or 3600. The class
 * shares one Redis, so each test uses its own client addresses and logins.
 */
@SpringBootTest(properties = {
    "app.rate-limit.login-per-ip-per-minute=5",
    "app.rate-limit.login-per-account-per-minute=3",
    "app.rate-limit.register-per-ip-per-hour=2",
    "app.rate-limit.refresh-per-ip-per-minute=3"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import({TestcontainersConfiguration.class, AuthRateLimitIntegrationTest.FixedWindowClock.class})
class AuthRateLimitIntegrationTest {

    private static final String PASSWORD = "correct horse";

    @TestConfiguration
    static class FixedWindowClock {

        @Bean
        @Primary
        RateLimiter fixedWindowRateLimiter(StringRedisTemplate redis) {
            Clock fixed = Clock.fixed(Instant.now().truncatedTo(ChronoUnit.HOURS), ZoneOffset.UTC);
            return new RateLimiter(redis, fixed);
        }
    }

    @Autowired
    private MockMvc mvc;
    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void loginIsLimitedPerClientAddress() throws Exception {
        String ip = ipv4();
        for (int i = 0; i < 5; i++) {
            login(newPhone(), ip).andExpect(status().isUnauthorized());
        }

        login(newPhone(), ip)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"))
                .andExpect(header().string("Retry-After", "60"))
                .andExpect(header().string("Content-Type", "application/problem+json"));

        login(newPhone(), ipv4()).andExpect(status().isUnauthorized());
    }

    @Test
    void loginIsLimitedPerAccountWhateverTheSpellingOrTheAddress() throws Exception {
        String digits = "701" + (1_000_000 + ThreadLocalRandom.current().nextInt(8_999_999));
        login("8 " + digits, ipv6()).andExpect(status().isUnauthorized());
        login("+7 (" + digits.substring(0, 3) + ") " + digits.substring(3), ipv6()).andExpect(status().isUnauthorized());
        login("7" + digits, ipv6()).andExpect(status().isUnauthorized());

        String freshIp = ipv6();
        login("+7" + digits, freshIp)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"));
        login(newPhone(), freshIp).andExpect(status().isUnauthorized());
    }

    @Test
    void theLimitIsCheckedBeforeTheCredentialsAndRevealsNothingAboutTheAccount() throws Exception {
        String known = newPhone();
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(registerBody(known)).with(from(ipv4()))).andExpect(status().isCreated());
        String unknown = newPhone();

        for (int i = 0; i < 3; i++) {
            login(known, ipv4(), "wrong password").andExpect(status().isUnauthorized());
            login(unknown, ipv4(), "wrong password").andExpect(status().isUnauthorized());
        }

        String forKnown = login(known, ipv4()).andExpect(status().isTooManyRequests())
                .andReturn().getResponse().getContentAsString();
        String forUnknown = login(unknown, ipv4()).andExpect(status().isTooManyRequests())
                .andReturn().getResponse().getContentAsString();

        assertThat(withoutInstance(forKnown)).isEqualTo(withoutInstance(forUnknown));
    }

    @Test
    void aRotatingForwardedForHeaderDoesNotEscapeTheAddressLimit() throws Exception {
        String ip = ipv4();
        for (int i = 0; i < 5; i++) {
            mvc.perform(loginRequest(newPhone(), ip, PASSWORD).header("X-Forwarded-For", "192.0.2." + (i + 1)))
                    .andExpect(status().isUnauthorized());
        }

        mvc.perform(loginRequest(newPhone(), ip, PASSWORD).header("X-Forwarded-For", "192.0.2.200"))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void registerIsLimitedPerClientAddress() throws Exception {
        String ip = ipv4();
        for (int i = 0; i < 2; i++) {
            register(newPhone(), ip).andExpect(status().isCreated());
        }

        String refused = newPhone();
        register(refused, ip)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"))
                .andExpect(header().string("Retry-After", "3600"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE phone = ?", Integer.class, refused))
                .isZero();

        register(newPhone(), ipv4()).andExpect(status().isCreated());
    }

    @Test
    void refreshIsLimitedPerClientAddress() throws Exception {
        String ip = ipv4();
        for (int i = 0; i < 3; i++) {
            refresh(ip).andExpect(status().isUnauthorized());
        }

        refresh(ip)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"))
                .andExpect(header().string("Retry-After", "60"));

        refresh(ipv4()).andExpect(status().isUnauthorized());
    }

    @Test
    void logoutIsLimitedPerClientAddressInItsOwnBucket() throws Exception {
        String ip = ipv4();
        for (int i = 0; i < 3; i++) {
            logout(ip).andExpect(status().isNoContent());
        }

        logout(ip)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"))
                .andExpect(header().string("Retry-After", "60"));

        // another address is not affected, and the refresh bucket of this one is untouched
        logout(ipv4()).andExpect(status().isNoContent());
        refresh(ip).andExpect(status().isUnauthorized());
    }

    // ---- helpers

    private ResultActions logout(String ip) throws Exception {
        return mvc.perform(post("/api/auth/logout").contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"unknown-" + ThreadLocalRandom.current().nextLong() + "\"}")
                .with(from(ip)));
    }

    private ResultActions login(String login, String ip) throws Exception {
        return login(login, ip, PASSWORD);
    }

    private ResultActions login(String login, String ip, String password) throws Exception {
        return mvc.perform(loginRequest(login, ip, password));
    }

    private MockHttpServletRequestBuilder loginRequest(String login, String ip, String password) {
        return post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"login\":\"" + login + "\",\"password\":\"" + password + "\"}").with(from(ip));
    }

    private ResultActions register(String phone, String ip) throws Exception {
        return mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(registerBody(phone)).with(from(ip)));
    }

    private ResultActions refresh(String ip) throws Exception {
        return mvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"unknown-" + ThreadLocalRandom.current().nextLong() + "\"}")
                .with(from(ip)));
    }

    private static String registerBody(String phone) {
        return "{\"login\":\"" + phone + "\",\"password\":\"" + PASSWORD + "\",\"fullName\":\"Aigul\"}";
    }

    private static Map<String, Object> withoutInstance(String body) {
        Map<String, Object> parsed = JsonPath.parse(body).read("$");
        parsed.remove("instance");
        return parsed;
    }

    private static RequestPostProcessor from(String address) {
        return request -> {
            request.setRemoteAddr(address);
            return request;
        };
    }

    // the class shares one Redis and a fixed clock, so every address must be used by one test only:
    // a counter makes them unique by construction
    private static final AtomicInteger ADDRESSES = new AtomicInteger();

    private static String ipv4() {
        int n = ADDRESSES.getAndIncrement();
        return "198.51." + (n / 254) + "." + (n % 254 + 1);
    }

    private static String ipv6() {
        return "2001:db8::" + Integer.toHexString(ADDRESSES.getAndIncrement() + 1);
    }

    private static String newPhone() {
        return "+7705" + (1_000_000 + ThreadLocalRandom.current().nextInt(8_999_999));
    }
}
