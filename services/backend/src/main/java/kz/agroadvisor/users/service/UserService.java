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
        if (findByLogin(login).isPresent()) {
            throw loginTaken();
        }
        try {
            return users.saveAndFlush(new User(login, passwordHash, fullName, language, roles));
        } catch (DataIntegrityViolationException e) {
            // Lost a race with a parallel registration of the same login
            throw loginTaken();
        }
    }

    private static ApiException loginTaken() {
        return new ApiException(HttpStatus.CONFLICT, LOGIN_TAKEN, "This login is already registered");
    }
}
