package kz.agroadvisor.users.web;

import java.util.List;
import java.util.UUID;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.service.UserService;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService users;

    public UserController(UserService users) {
        this.users = users;
    }

    @GetMapping("/me")
    public MeResponse me(Authentication authentication) {
        User user = users.findById(UUID.fromString(authentication.getName()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "Authentication required"));
        return new MeResponse(user.getId(), user.getPhone(), user.getEmail(), user.getFullName(),
                user.getLanguage(), user.getRoles().stream().map(Role::code).sorted().toList());
    }

    public record MeResponse(UUID id, String phone, String email, String fullName, String language,
                             List<String> roles) {
    }
}
