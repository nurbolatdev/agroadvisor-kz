package kz.agroadvisor.diagnosis.web;

import java.util.Set;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.diagnosis.service.PhotoStorage;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The region saved with a diagnosis is a snapshot of the profile at that time: the test reads the
 * {@code diagnoses.region_id} column itself, after profile changes and idempotent replays.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class DiagnosisRegionIntegrationTest {

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xDB, 0, 2, (byte) 0xFF,
        (byte) 0xD9};

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private JwtService jwt;
    @MockitoBean
    private PhotoStorage photos;

    private Long regionId(String code) {
        return jdbc.queryForObject("SELECT id FROM regions WHERE code = ?", Long.class, code);
    }

    private User farmer(Long regionId) {
        String phone = "+7705" + (1_000_000 + (int) (Math.random() * 8_999_999));
        User user = new User(Login.parse(phone), "x", "Farmer", "ru", Set.of(Role.FARMER));
        user.assignRegion(regionId);
        return users.saveAndFlush(user);
    }

    private MockMultipartHttpServletRequestBuilder request(User user, String key) {
        MockMultipartHttpServletRequestBuilder request = multipart("/api/diagnoses")
                .file(new MockMultipartFile("image", "leaf", "image/jpeg", JPEG))
                .param("crop", "tomato")
                .header("Authorization", "Bearer " + jwt.issueAccessToken(user.getId()));
        if (key != null) {
            request.header("Idempotency-Key", key);
        }
        return request;
    }

    private String diagnose(User user, String key, int expectedStatus) throws Exception {
        when(photos.store(any(UUID.class), anyString(), any(byte[].class), anyString()))
                .thenReturn("diagnoses/test/photo.jpg");
        String body = mvc.perform(request(user, key)).andExpect(status().is(expectedStatus)).andReturn()
                .getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    private Long storedRegion(String diagnosisId) {
        return jdbc.queryForObject("SELECT region_id FROM diagnoses WHERE id = ?", Long.class,
                UUID.fromString(diagnosisId));
    }

    @Test
    void aDiagnosisKeepsTheRegionOfTheFarmer() throws Exception {
        User user = farmer(regionId("akmola"));
        when(photos.store(any(UUID.class), anyString(), any(byte[].class), anyString()))
                .thenReturn("diagnoses/test/photo.jpg");

        String body = mvc.perform(request(user, null))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.regionId").doesNotExist())
                .andReturn().getResponse().getContentAsString();

        assertThat(storedRegion(JsonPath.read(body, "$.id"))).isEqualTo(regionId("akmola"));
    }

    @Test
    void aFarmerWithoutARegionGetsADiagnosisWithoutOne() throws Exception {
        String id = diagnose(farmer(null), null, 201);

        assertThat(storedRegion(id)).isNull();
    }

    @Test
    void aLaterRegionChangeOrAReplayDoesNotRewriteAnOldDiagnosis() throws Exception {
        User user = farmer(regionId("akmola"));
        String key = UUID.randomUUID().toString();
        String first = diagnose(user, key, 201);

        User stored = users.findById(user.getId()).orElseThrow();
        stored.assignRegion(regionId("kostanay"));
        users.saveAndFlush(stored);

        mvc.perform(request(user, key))
                .andExpect(status().isCreated())
                .andExpect(header().string("Idempotent-Replayed", "true"))
                .andExpect(jsonPath("$.id").value(first));

        assertThat(storedRegion(first)).isEqualTo(regionId("akmola"));
        assertThat(storedRegion(diagnose(user, null, 201))).isEqualTo(regionId("kostanay"));
    }
}
