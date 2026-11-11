package kz.agroadvisor.users.service;

import static org.assertj.core.api.Assertions.assertThat;

import kz.agroadvisor.TestcontainersConfiguration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** The switch really wires the runner: with it on, the application starts and an administrator exists. */
@SpringBootTest(properties = {
        "app.bootstrap-admin.enabled=true",
        "app.bootstrap-admin.login=bootstrap-enabled@example.kz",
        "app.bootstrap-admin.password=correct horse battery"})
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class AdminBootstrapEnabledTest {

    @Autowired
    private ApplicationContext context;

    @Autowired
    private UserService users;

    @Autowired
    private JdbcTemplate jdbc;

    @org.junit.jupiter.api.AfterEach
    void cleanUp() {
        jdbc.update("DELETE FROM users WHERE email = 'bootstrap-enabled@example.kz'");
    }

    @Test
    void theRunnerIsWiredAndAnAdminExists() {
        assertThat(context.getBeansOfType(AdminBootstrapRunner.class)).hasSize(1);
        assertThat(users.hasAdmin()).isTrue();
        // the hash is BCrypt, never the plain password
        jdbc.queryForList("SELECT password_hash FROM users WHERE email = 'bootstrap-enabled@example.kz'",
                String.class).forEach(h -> assertThat(h).startsWith("$2"));
    }
}
