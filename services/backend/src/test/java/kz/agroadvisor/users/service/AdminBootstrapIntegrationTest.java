package kz.agroadvisor.users.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** The query behind the idempotence of the bootstrap, against the real schema. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class AdminBootstrapIntegrationTest {

    @Autowired
    private UserService users;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void anAdminRoleRowIsFound() {
        UUID id = jdbc.queryForObject("INSERT INTO users (email, password_hash, full_name) "
                + "VALUES ('bootstrap-it@example.kz', 'x', 'Root') RETURNING id", UUID.class);
        jdbc.update("INSERT INTO user_roles (user_id, role_code) VALUES (?, 'admin')", id);
        try {
            assertThat(users.hasAdmin()).isTrue();
        } finally {
            jdbc.update("DELETE FROM users WHERE id = ?", id);
        }
    }
}
