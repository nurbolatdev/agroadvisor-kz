package kz.agroadvisor.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import com.jayway.jsonpath.JsonPath;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.access.service.FeatureAccessService;
import kz.agroadvisor.verification.service.AgrochemistVerificationService;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import({TestcontainersConfiguration.class, AuthFlowIntegrationTest.GuardedController.class})
class AuthFlowIntegrationTest {

    private static final String PASSWORD = "correct horse";

    @Autowired
    private MockMvc mvc;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private AgrochemistVerificationService verification;
    @Autowired
    private FeatureAccessService features;

    // ---- registration

    @Test
    void farmerRegistersWithPhoneAndGetsTokens() throws Exception {
        String phone = newPhone();
        Session s = register(phone, "farmer");

        assertThat(s.refresh()).isNotBlank();
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + s.access()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phone").value(phone))
                .andExpect(jsonPath("$.roles[0]").value("farmer"));
    }

    @Test
    void phoneIsNormalizedAndDuplicatesAreRejected() throws Exception {
        register("8 701 555 00 01", "farmer");

        expectPost("/api/auth/register", body("+77015550001", PASSWORD, "farmer"), 409, "login_taken");
    }

    @Test
    void emailIsUniqueIgnoringCase() throws Exception {
        register("Farmer.One@Example.kz", "farmer");

        expectPost("/api/auth/register", body("farmer.one@example.KZ", PASSWORD, "farmer"), 409, "login_taken");
    }

    @Test
    void adminCannotBeRegisteredPublicly() throws Exception {
        expectPost("/api/auth/register", body(newPhone(), PASSWORD, "admin"), 400, "role_not_allowed");
        expectPost("/api/auth/register", body(newPhone(), PASSWORD, "ADMIN"), 400, "role_not_allowed");
        expectPost("/api/auth/register", body(newPhone(), PASSWORD, "superuser"), 400, "role_not_allowed");
    }

    @Test
    void rolesAndStatusInTheRequestAreIgnored() throws Exception {
        String phone = newPhone();
        String json = "{\"login\":\"" + phone + "\",\"password\":\"" + PASSWORD + "\",\"fullName\":\"Hacker\","
                + "\"roles\":[\"admin\"],\"status\":\"active\",\"verified\":true}";
        MvcResult result = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isCreated()).andReturn();

        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + read(result, "accessToken")))
                .andExpect(jsonPath("$.roles.length()").value(1))
                .andExpect(jsonPath("$.roles[0]").value("farmer"));
    }

    @Test
    void invalidInputIsRejected() throws Exception {
        expectPost("/api/auth/register", body("not-a-login", PASSWORD, "farmer"), 400, "invalid_login");
        expectPost("/api/auth/register", body(newPhone(), "short", "farmer"), 400, "validation_failed");
        // 25 characters but 75 bytes: BCrypt would silently cut it
        expectPost("/api/auth/register", body(newPhone(), "я".repeat(37), "farmer"), 400, "password_too_long");
    }

    @Test
    void passwordIsStoredAsBcryptHash() throws Exception {
        String phone = newPhone();
        register(phone, "farmer");

        String hash = jdbc.queryForObject("SELECT password_hash FROM users WHERE phone = ?", String.class, phone);
        assertThat(hash).startsWith("$2").doesNotContain(PASSWORD);
    }

    // ---- login

    @Test
    void loginWorksByPhoneAndByEmailInAnyCase() throws Exception {
        register("Mixed@Example.kz", "farmer");
        expectPost("/api/auth/login", loginBody("mixed@example.kz", PASSWORD), 200, null);
        expectPost("/api/auth/login", loginBody("MIXED@EXAMPLE.KZ", PASSWORD), 200, null);

        String phone = newPhone();
        register(phone, "farmer");
        expectPost("/api/auth/login", loginBody(phone.replace("+7", "8"), PASSWORD), 200, null);
    }

    @Test
    void wrongPasswordAndUnknownLoginLookTheSame() throws Exception {
        String phone = newPhone();
        register(phone, "farmer");

        expectPost("/api/auth/login", loginBody(phone, "wrong password"), 401, "invalid_credentials");
        expectPost("/api/auth/login", loginBody(newPhone(), PASSWORD), 401, "invalid_credentials");
        expectPost("/api/auth/login", loginBody("garbage", PASSWORD), 401, "invalid_credentials");
    }

    @Test
    void blockedUserCannotLogInOrRefresh() throws Exception {
        String phone = newPhone();
        Session s = register(phone, "farmer");
        jdbc.update("UPDATE users SET status = 'blocked' WHERE phone = ?", phone);

        expectPost("/api/auth/login", loginBody(phone, PASSWORD), 403, "account_blocked");
        expectPost("/api/auth/refresh", "{\"refreshToken\":\"" + s.refresh() + "\"}", 403, "account_blocked");
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + s.access()))
                .andExpect(status().isUnauthorized());
        assertThat(activeRefreshTokens(phone)).isZero();
    }

    // ---- refresh tokens

    @Test
    void refreshRotatesTheToken() throws Exception {
        Session first = register(newPhone(), "farmer");

        Session second = refresh(first.refresh());

        assertThat(second.refresh()).isNotEqualTo(first.refresh());
        assertThat(second.access()).isNotBlank();
        refresh(second.refresh());
    }

    @Test
    void reusingAUsedRefreshTokenRevokesTheWholeFamily() throws Exception {
        Session first = register(newPhone(), "farmer");
        Session second = refresh(first.refresh());

        expectPost("/api/auth/refresh", "{\"refreshToken\":\"" + first.refresh() + "\"}", 401, "refresh_token_reused");

        // the legitimate holder of the newer token is cut off too
        expectPost("/api/auth/refresh", "{\"refreshToken\":\"" + second.refresh() + "\"}", 401, "invalid_refresh_token");
    }

    @Test
    void reuseRevokesOnlyItsOwnFamily() throws Exception {
        String phone = newPhone();
        Session phoneSession = register(phone, "farmer");
        Session laptopSession = login(phone);
        Session rotated = refresh(phoneSession.refresh());

        expectPost("/api/auth/refresh", "{\"refreshToken\":\"" + phoneSession.refresh() + "\"}", 401, "refresh_token_reused");

        refresh(laptopSession.refresh());
        assertThat(rotated.refresh()).isNotBlank();
    }

    @Test
    void parallelRefreshWithTheSameTokenSucceedsOnlyOnceAndEndsTheSession() throws Exception {
        String phone = newPhone();
        Session s = register(phone, "farmer");
        int threads = 6;
        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Future<Integer>> results = new java.util.ArrayList<>();
            java.util.concurrent.atomic.AtomicReference<String> winnerRefresh = new java.util.concurrent.atomic.AtomicReference<>();
            for (int i = 0; i < threads; i++) {
                Callable<Integer> call = () -> {
                    ready.countDown();
                    go.await();
                    var response = mvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"refreshToken\":\"" + s.refresh() + "\"}")).andReturn().getResponse();
                    if (response.getStatus() == 200) {
                        winnerRefresh.set(JsonPath.read(response.getContentAsString(), "$.refreshToken"));
                    }
                    return response.getStatus();
                };
                results.add(pool.submit(call));
            }
            ready.await();
            go.countDown();
            int ok = 0;
            for (Future<Integer> f : results) {
                int code = f.get();
                if (code == 200) {
                    ok++;
                } else {
                    assertThat(code).isEqualTo(401);
                }
            }
            assertThat(ok).isEqualTo(1);

            // Chosen policy (strict): a token presented a second time is treated as a replay and the whole
            // session is revoked, including the new token the winner received. The client must send one
            // refresh request at a time (single-flight); a lost race means signing in again.
            assertThat(winnerRefresh.get()).isNotBlank();
            expectPost("/api/auth/refresh", "{\"refreshToken\":\"" + winnerRefresh.get() + "\"}", 401,
                    "invalid_refresh_token");
            assertThat(activeRefreshTokens(phone)).isZero();
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void expiredRefreshTokenIsRejected() throws Exception {
        String phone = newPhone();
        Session s = register(phone, "farmer");
        jdbc.update("""
                UPDATE refresh_tokens SET created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
                WHERE user_id = (SELECT id FROM users WHERE phone = ?)
                """, phone);

        expectPost("/api/auth/refresh", "{\"refreshToken\":\"" + s.refresh() + "\"}", 401, "invalid_refresh_token");
    }

    @Test
    void unknownRefreshTokenIsRejected() throws Exception {
        expectPost("/api/auth/refresh", "{\"refreshToken\":\"" + UUID.randomUUID() + "\"}", 401, "invalid_refresh_token");
    }

    @Test
    void onlyTheHashOfTheRefreshTokenIsStored() throws Exception {
        String phone = newPhone();
        Session s = register(phone, "farmer");

        Integer plain = jdbc.queryForObject("SELECT count(*) FROM refresh_tokens WHERE token_hash = ?", Integer.class, s.refresh());
        assertThat(plain).isZero();
    }

    @Test
    void logoutRevokesThisSessionOnly() throws Exception {
        String phone = newPhone();
        Session phoneSession = register(phone, "farmer");
        Session laptopSession = login(phone);

        mvc.perform(post("/api/auth/logout").contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"" + phoneSession.refresh() + "\"}")).andExpect(status().isNoContent());

        expectPost("/api/auth/refresh", "{\"refreshToken\":\"" + phoneSession.refresh() + "\"}", 401, "invalid_refresh_token");
        refresh(laptopSession.refresh());
    }

    @Test
    void logoutWithUnknownTokenIsHarmless() throws Exception {
        mvc.perform(post("/api/auth/logout").contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"nope\"}")).andExpect(status().isNoContent());
    }

    @Test
    void logoutAllRevokesEverySessionAndNeedsAuthentication() throws Exception {
        String phone = newPhone();
        Session phoneSession = register(phone, "farmer");
        Session laptopSession = login(phone);

        mvc.perform(post("/api/auth/logout-all")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/logout-all").header("Authorization", "Bearer " + phoneSession.access()))
                .andExpect(status().isNoContent());

        expectPost("/api/auth/refresh", "{\"refreshToken\":\"" + phoneSession.refresh() + "\"}", 401, "invalid_refresh_token");
        expectPost("/api/auth/refresh", "{\"refreshToken\":\"" + laptopSession.refresh() + "\"}", 401, "invalid_refresh_token");
    }

    // ---- agrochemist verification and feature access

    @Test
    void agrochemistGetsTokensButStaysPendingUntilApproved() throws Exception {
        String phone = newPhone();
        Session s = register(phone, "agrochemist");
        UUID id = jdbc.queryForObject("SELECT id FROM users WHERE phone = ?", UUID.class, phone);

        assertThat(jdbc.queryForObject("SELECT verification_status FROM agrochemist_profiles WHERE user_id = ?",
                String.class, id)).isEqualTo("pending");
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + s.access()))
                .andExpect(jsonPath("$.roles[0]").value("agrochemist"));

        // the role alone gives nothing that needs confirmed documents
        mvc.perform(get("/guarded/verified-agrochemist").header("Authorization", "Bearer " + s.access()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("forbidden"));

        jdbc.update("UPDATE agrochemist_profiles SET verification_status = 'approved' WHERE user_id = ?", id);
        mvc.perform(get("/guarded/verified-agrochemist").header("Authorization", "Bearer " + s.access()))
                .andExpect(status().isOk());

        jdbc.update("UPDATE agrochemist_profiles SET verification_status = 'rejected' WHERE user_id = ?", id);
        mvc.perform(get("/guarded/verified-agrochemist").header("Authorization", "Bearer " + s.access()))
                .andExpect(status().isForbidden());
        assertThat(verification.isApproved(id)).isFalse();
    }

    @Test
    void farmerCannotUseVerifiedAgrochemistEndpoint() throws Exception {
        Session s = register(newPhone(), "farmer");
        mvc.perform(get("/guarded/verified-agrochemist").header("Authorization", "Bearer " + s.access()))
                .andExpect(status().isForbidden());
    }

    @Test
    void featureAccessIsDeniedByDefault() throws Exception {
        UUID user = UUID.randomUUID();
        assertThat(features.planOf(user)).isEqualTo("FREE");
        assertThat(features.isAllowed(user, "diagnosis")).isTrue();
        assertThat(features.isAllowed(user, "no_such_feature")).isFalse();
        assertThat(features.isAllowed(user, null)).isFalse();
        assertThat(features.isAllowed(null, "diagnosis")).isFalse();

        // a feature the plan does not list, and a limited one we cannot count yet
        jdbc.update("INSERT INTO feature (code, description) VALUES ('premium_only', 'x'), ('limited', 'x')");
        jdbc.update("INSERT INTO plan_feature (plan_code, feature_code, daily_limit) VALUES ('FREE', 'limited', 3)");
        try {
            assertThat(features.isAllowed(user, "premium_only")).isFalse();
            assertThat(features.isAllowed(user, "limited")).isFalse();
        } finally {
            jdbc.update("DELETE FROM feature WHERE code IN ('premium_only', 'limited')");
        }
    }

    @Test
    void featureGuardReturns403ProblemForUnlistedFeature() throws Exception {
        Session s = register(newPhone(), "farmer");
        mvc.perform(get("/guarded/diagnosis").header("Authorization", "Bearer " + s.access()))
                .andExpect(status().isOk());
        mvc.perform(get("/guarded/unlisted").header("Authorization", "Bearer " + s.access()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("forbidden"));
    }

    // ---- helpers

    record Session(String access, String refresh) {
    }

    private Session register(String login, String role) throws Exception {
        MvcResult r = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(body(login, PASSWORD, role))).andExpect(status().isCreated()).andReturn();
        return new Session(read(r, "accessToken"), read(r, "refreshToken"));
    }

    private Session login(String login) throws Exception {
        MvcResult r = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(loginBody(login, PASSWORD))).andExpect(status().isOk()).andReturn();
        return new Session(read(r, "accessToken"), read(r, "refreshToken"));
    }

    private Session refresh(String token) throws Exception {
        MvcResult r = mvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"" + token + "\"}")).andExpect(status().isOk()).andReturn();
        return new Session(read(r, "accessToken"), read(r, "refreshToken"));
    }

    private void expectPost(String url, String json, int expectedStatus, String expectedCode) throws Exception {
        var result = mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().is(expectedStatus));
        if (expectedCode != null) {
            result.andExpect(jsonPath("$.code").value(expectedCode));
        }
    }

    private int activeRefreshTokens(String phone) {
        return jdbc.queryForObject("""
                SELECT count(*) FROM refresh_tokens
                WHERE revoked_at IS NULL AND used_at IS NULL AND user_id = (SELECT id FROM users WHERE phone = ?)
                """, Integer.class, phone);
    }

    private static String read(MvcResult result, String field) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(), "$." + field);
    }

    private static String body(String login, String password, String role) {
        return "{\"login\":\"" + login + "\",\"password\":\"" + password + "\",\"fullName\":\"Test User\",\"role\":\""
                + role + "\"}";
    }

    private static String loginBody(String login, String password) {
        return "{\"login\":\"" + login + "\",\"password\":\"" + password + "\"}";
    }

    private static String newPhone() {
        return "+7702" + (1_000_000 + (int) (Math.random() * 8_999_999));
    }

    @TestConfiguration
    @RestController
    static class GuardedController {

        @GetMapping("/guarded/verified-agrochemist")
        @PreAuthorize("@agrochemistVerification.isApproved(authentication)")
        String verifiedAgrochemist() {
            return "ok";
        }

        @GetMapping("/guarded/diagnosis")
        @PreAuthorize("@featureAccess.allows(authentication, 'diagnosis')")
        String diagnosis() {
            return "ok";
        }

        @GetMapping("/guarded/unlisted")
        @PreAuthorize("@featureAccess.allows(authentication, 'unlisted')")
        String unlisted() {
            return "ok";
        }
    }
}
