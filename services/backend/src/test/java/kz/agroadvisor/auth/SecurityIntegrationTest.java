package kz.agroadvisor.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.config.JwtProperties;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.model.UserStatus;
import kz.agroadvisor.users.repository.UserRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import({TestcontainersConfiguration.class, SecurityIntegrationTest.ProbeController.class})
class SecurityIntegrationTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JwtEncoder encoder;
    @Autowired
    private JwtProperties properties;
    @Autowired
    private TransactionTemplate tx;

    private User farmer;

    @BeforeEach
    void setUp() {
        String phone = "+7701" + (1_000_000 + (int) (Math.random() * 8_999_999));
        farmer = users.saveAndFlush(new User(Login.parse(phone), "x", "Farmer", "ru", Set.of(Role.FARMER)));
    }

    @Test
    void withoutTokenIs401ProblemJson() throws Exception {
        mvc.perform(get("/api/users/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("WWW-Authenticate", "Bearer"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.code").value("unauthorized"))
                .andExpect(jsonPath("$.instance").value("/api/users/me"));
    }

    @Test
    void garbageTokenIs401WithoutDetails() throws Exception {
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer not.a.jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("unauthorized"))
                .andExpect(jsonPath("$.detail").value("Authentication required"));
    }

    @Test
    void tokenSignedWithAnotherKeyIs401() throws Exception {
        String forged = bearer(new com.nimbusds.jose.jwk.source.ImmutableSecret<>(
                new javax.crypto.spec.SecretKeySpec(new byte[32], "HmacSHA256")), farmer.getId(), Instant.now().plusSeconds(60));
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + forged))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void expiredTokenIs401() throws Exception {
        String expired = encode(farmer.getId().toString(), Instant.now().minusSeconds(120), Instant.now().minusSeconds(1));
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + expired))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("unauthorized"));
    }

    @Test
    void tokenForUnknownUserIs401() throws Exception {
        String token = jwt.issueAccessToken(UUID.randomUUID());
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void validTokenReturnsCurrentUser() throws Exception {
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + jwt.issueAccessToken(farmer.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(farmer.getId().toString()))
                .andExpect(jsonPath("$.roles[0]").value("farmer"));
    }

    @Test
    void lowerCaseRoleCodesBecomeSpringAuthorities() throws Exception {
        String token = jwt.issueAccessToken(farmer.getId());
        mvc.perform(get("/probe/farmer").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        mvc.perform(get("/probe/admin").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("forbidden"));
    }

    @Test
    void userWithSeveralRolesGetsAllAuthorities() throws Exception {
        tx.executeWithoutResult(s -> users.findById(farmer.getId()).orElseThrow().getRoles().add(Role.AGROCHEMIST));
        String token = jwt.issueAccessToken(farmer.getId());
        mvc.perform(get("/probe/farmer").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        mvc.perform(get("/probe/agrochemist").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
    }

    @Test
    void roleChangeAppliesToAlreadyIssuedToken() throws Exception {
        String token = jwt.issueAccessToken(farmer.getId());
        mvc.perform(get("/probe/admin").header("Authorization", "Bearer " + token)).andExpect(status().isForbidden());

        tx.executeWithoutResult(s -> users.findById(farmer.getId()).orElseThrow().getRoles().add(Role.ADMIN));

        mvc.perform(get("/probe/admin").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
    }

    @Test
    void blockedUserLosesAccessWithAlreadyIssuedToken() throws Exception {
        String token = jwt.issueAccessToken(farmer.getId());
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk());

        tx.executeWithoutResult(s -> users.findById(farmer.getId()).orElseThrow().setStatus(UserStatus.BLOCKED));

        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unknownEndpointsRequireAuthenticationByDefault() throws Exception {
        mvc.perform(get("/api/anything")).andExpect(status().isUnauthorized());
    }

    @Test
    void adminPathsAreClosedToOtherRolesEvenWithoutAnnotation() throws Exception {
        String token = jwt.issueAccessToken(farmer.getId());
        // No controller is mapped here: without the URL rule a signed-in farmer would get 404
        mvc.perform(get("/api/admin/unmapped").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("forbidden"));
        mvc.perform(get("/api/admin/unmapped")).andExpect(status().isUnauthorized());
    }

    @Test
    void healthAndOpenApiStayPublic() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk());
    }

    private String encode(String subject, Instant issuedAt, Instant expiresAt) {
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer(properties.issuer()).subject(subject)
                .issuedAt(issuedAt).expiresAt(expiresAt).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
    }

    private String bearer(com.nimbusds.jose.jwk.source.ImmutableSecret<com.nimbusds.jose.proc.SecurityContext> secret,
                          UUID user, Instant expiresAt) {
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer(properties.issuer()).subject(user.toString())
                .issuedAt(Instant.now()).expiresAt(expiresAt).build();
        return new org.springframework.security.oauth2.jwt.NimbusJwtEncoder(secret)
                .encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    @TestConfiguration
    @RestController
    static class ProbeController {

        @GetMapping("/probe/farmer")
        @PreAuthorize("hasRole('FARMER')")
        String farmer() {
            return "ok";
        }

        @GetMapping("/probe/agrochemist")
        @PreAuthorize("hasRole('AGROCHEMIST')")
        String agrochemist() {
            return "ok";
        }

        @GetMapping("/probe/admin")
        @PreAuthorize("hasRole('ADMIN')")
        String admin() {
            return "ok";
        }
    }
}
