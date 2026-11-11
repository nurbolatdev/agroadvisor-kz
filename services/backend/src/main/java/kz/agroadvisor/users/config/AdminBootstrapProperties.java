package kz.agroadvisor.users.config;

import java.nio.charset.StandardCharsets;

import kz.agroadvisor.users.model.Login;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Creates the first administrator at startup (there is no way to become one through the API).
 *
 * @param enabled  off by default ({@code APP_BOOTSTRAP_ADMIN_ENABLED=true} to use it)
 * @param login    phone in E.164 form or e-mail ({@code APP_BOOTSTRAP_ADMIN_LOGIN}); required when enabled
 * @param password 12-72 bytes ({@code APP_BOOTSTRAP_ADMIN_PASSWORD}); required when enabled; never logged
 * @param fullName name shown in the admin web
 * @param language ru, kk or en
 */
@Validated
@ConfigurationProperties("app.bootstrap-admin")
public record AdminBootstrapProperties(
        @DefaultValue("false") boolean enabled,
        String login,
        String password,
        @DefaultValue("Administrator") String fullName,
        @DefaultValue("ru") String language) {

    static final int MIN_PASSWORD = 12;
    static final int MAX_PASSWORD_BYTES = 72;
    static final int MAX_NAME = 120;

    /** The password is masked so that dumping the bean never reveals it. */
    @Override
    public String toString() {
        return "AdminBootstrapProperties[enabled=" + enabled + ", login=" + login + ", password=****, fullName="
                + fullName + ", language=" + language + "]";
    }

    public AdminBootstrapProperties {
        if (enabled) {
            check(login, password, fullName, language);
        }
    }

    private static void check(String login, String password, String fullName, String language) {
        if (login == null || login.isBlank()) {
            throw new IllegalArgumentException("app.bootstrap-admin.login is required when the bootstrap is enabled");
        }
        try {
            Login.parse(login);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("app.bootstrap-admin.login must be a phone (+7...) or an e-mail");
        }
        if (password == null || password.length() < MIN_PASSWORD
                || password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw new IllegalArgumentException("app.bootstrap-admin.password must be " + MIN_PASSWORD + " to "
                    + MAX_PASSWORD_BYTES + " bytes long");
        }
        if (fullName == null || fullName.isBlank() || fullName.trim().length() > MAX_NAME) {
            throw new IllegalArgumentException(
                    "app.bootstrap-admin.full-name must be 1 to " + MAX_NAME + " characters");
        }
        if (!"ru".equals(language) && !"kk".equals(language) && !"en".equals(language)) {
            throw new IllegalArgumentException("app.bootstrap-admin.language must be ru, kk or en");
        }
    }
}
