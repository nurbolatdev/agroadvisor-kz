package kz.agroadvisor.users.service;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    public static final String LOGIN_TAKEN = "login_taken";

    private final UserRepository users;

    public UserService(UserRepository users) {
        this.users = users;
    }

    @Transactional(readOnly = true)
    public Optional<User> findById(UUID id) {
        return users.findById(id);
    }

    @Transactional(readOnly = true)
    public Optional<User> findByLogin(Login login) {
        return login.type() == Login.Type.PHONE
                ? users.findByPhone(login.value())
                : users.findByEmail(login.value());
    }

    @Transactional
    public User create(Login login, String passwordHash, String fullName, String language, Set<Role> roles) {
        return create(login, passwordHash, fullName, language, roles, null);
    }

    /** {@code regionId} is the region picked at registration, or null; the caller checks that it exists. */
    @Transactional
    public User create(Login login, String passwordHash, String fullName, String language, Set<Role> roles,
            Long regionId) {
        if (findByLogin(login).isPresent()) {
            throw loginTaken();
        }
        try {
            User user = new User(login, passwordHash, fullName, language, roles);
            user.assignRegion(regionId);
            return users.saveAndFlush(user);
        } catch (DataIntegrityViolationException e) {
            // Lost a race with a parallel registration of the same login. (The region was checked by the caller;
            // regions are never deleted, so its foreign key cannot be what failed here.)
            throw loginTaken();
        }
    }

    /**
     * Saves the language the person picked; the last explicit choice wins, on the phone or here. The caller
     * checks the value (ru, kk or en). An unknown user is a 401, as for {@code GET /api/users/me}.
     */
    @Transactional
    public User changeLanguage(UUID id, String language) {
        User user = users.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "Authentication required"));
        user.changeLanguage(language);
        return users.saveAndFlush(user);
    }

    private static ApiException loginTaken() {
        return new ApiException(HttpStatus.CONFLICT, LOGIN_TAKEN, "This login is already registered");
    }
}
