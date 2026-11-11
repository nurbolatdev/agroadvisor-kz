package kz.agroadvisor.users.service;

import java.util.Set;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.users.config.AdminBootstrapProperties;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Creates the first administrator from the environment when none exists. Off by default. Idempotent: once any
 * administrator exists it does nothing, so the password can be removed from the environment after the first
 * start. A login that already belongs to a non-administrator is never promoted; the start fails instead.
 */
@Component
@EnableConfigurationProperties(AdminBootstrapProperties.class)
@ConditionalOnProperty(name = "app.bootstrap-admin.enabled", havingValue = "true")
class AdminBootstrapRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrapRunner.class);

    private final AdminBootstrapProperties properties;
    private final UserService users;
    private final PasswordEncoder passwordEncoder;

    AdminBootstrapRunner(AdminBootstrapProperties properties, UserService users, PasswordEncoder passwordEncoder) {
        this.properties = properties;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (users.hasAdmin()) {
            log.info("Admin bootstrap skipped: an administrator already exists");
            return;
        }
        Login login = Login.parse(properties.login());
        if (users.findByLogin(login).isPresent()) {
            throw new IllegalStateException(
                    "app.bootstrap-admin.login belongs to an existing non-admin account; use another login");
        }
        try {
            users.create(login, passwordEncoder.encode(properties.password()), properties.fullName().trim(),
                    properties.language(), Set.of(Role.ADMIN));
        } catch (ApiException e) {
            // Another instance starting at the same moment created the account first
            if (UserService.LOGIN_TAKEN.equals(e.getCode()) && users.hasAdmin()) {
                log.info("Admin bootstrap skipped: another instance created the administrator");
                return;
            }
            throw new IllegalStateException("The first administrator could not be created: " + e.getCode(), e);
        }
        log.info("First administrator created");
    }
}
