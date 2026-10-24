package kz.agroadvisor.auth.config;

import java.util.List;
import java.util.UUID;

import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.service.UserService;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * Builds the authentication from the database on every request: the token proves who the user
 * is, while status and roles are read fresh. A blocked user or a role change therefore takes effect
 * immediately, not when the access token expires.
 */
// Registered as a bean in SecurityConfig: a @Component Converter would be picked up by @WebMvcTest slices
class UserJwtAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    private final UserService users;

    UserJwtAuthenticationConverter(UserService users) {
        this.users = users;
    }

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        User user = parse(jwt.getSubject())
                .flatMap(users::findById)
                .filter(User::isActive)
                .orElseThrow(() -> new BadCredentialsException("Invalid token"));
        List<GrantedAuthority> authorities = user.getRoles().stream()
                .map(Role::authority)
                .<GrantedAuthority>map(SimpleGrantedAuthority::new)
                .toList();
        return new JwtAuthenticationToken(jwt, authorities, user.getId().toString());
    }

    private static java.util.Optional<UUID> parse(String subject) {
        try {
            return java.util.Optional.of(UUID.fromString(subject));
        } catch (IllegalArgumentException | NullPointerException e) {
            return java.util.Optional.empty();
        }
    }
}
