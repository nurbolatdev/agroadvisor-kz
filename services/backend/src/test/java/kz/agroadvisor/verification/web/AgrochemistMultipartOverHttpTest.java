package kz.agroadvisor.verification.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;
import kz.agroadvisor.verification.service.DocumentStorage;

/**
 * The same upload over a real HTTP server (Tomcat), with the multipart body written by hand the way a
 * mobile client writes it: the text fields are plain parts with no charset in their headers. MockMvc does
 * not run the servlet container's own multipart parser, which is where a wrong default encoding would
 * show up (Cyrillic in the title of a diploma turning into question marks).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class AgrochemistMultipartOverHttpTest {

    private static final byte[] PDF = "%PDF-1.7 diploma".getBytes(StandardCharsets.UTF_8);
    private static final String BOUNDARY = "----agroadvisor-test-boundary";

    @LocalServerPort
    private int port;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;
    @MockitoBean
    private DocumentStorage storage;

    private UUID agrochemistId;

    @BeforeEach
    void setUp() {
        when(storage.store(any(), any(), anyString())).thenAnswer(call -> "agrochemist-documents/x/" + UUID.randomUUID());
        String phone = "+7722" + (1_000_000 + (int) (Math.random() * 8_999_999));
        agrochemistId = users.saveAndFlush(
                new User(Login.parse(phone), "x", "Test User", "ru", Set.of(Role.AGROCHEMIST))).getId();
        jdbc.update("INSERT INTO agrochemist_profiles (user_id) VALUES (?)", agrochemistId);
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("DELETE FROM users WHERE id = ?", agrochemistId);
    }

    @Test
    void cyrillicInTheTextPartsSurvivesTheServletContainer() throws Exception {
        String title = "Диплом № 1 & тест";
        String issuer = "КазНАУ имени С. Сейфуллина";

        HttpResponse<String> response = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/agrochemist/documents"))
                        .header("Authorization", "Bearer " + jwt.issueAccessToken(agrochemistId))
                        .header("Content-Type", "multipart/form-data; boundary=" + BOUNDARY)
                        .POST(HttpRequest.BodyPublishers.ofByteArray(body(title, issuer)))
                        .build(),
                HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        assertThat(response.body()).contains(title).contains(issuer);
        String stored = jdbc.queryForObject(
                "SELECT title FROM agrochemist_documents WHERE user_id = ?", String.class, agrochemistId);
        assertThat(stored).isEqualTo(title);
    }

    /** kind, title, issuer and year as bare text parts (no Content-Type), then the file. */
    private static byte[] body(String title, String issuer) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        text(out, "kind", "diploma");
        text(out, "title", title);
        text(out, "issuer", issuer);
        text(out, "year", "2015");
        out.write(("--" + BOUNDARY + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"document.pdf\"\r\n"
                + "Content-Type: application/pdf\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        out.write(PDF);
        out.write(("\r\n--" + BOUNDARY + "--\r\n").getBytes(StandardCharsets.UTF_8));
        return out.toByteArray();
    }

    private static void text(ByteArrayOutputStream out, String name, String value) throws Exception {
        out.write(("--" + BOUNDARY + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n")
                .getBytes(StandardCharsets.UTF_8));
        out.write(value.getBytes(StandardCharsets.UTF_8));
        out.write("\r\n".getBytes(StandardCharsets.UTF_8));
    }
}
