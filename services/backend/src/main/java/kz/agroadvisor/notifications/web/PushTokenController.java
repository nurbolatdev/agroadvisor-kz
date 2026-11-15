package kz.agroadvisor.notifications.web;

import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.notifications.service.PushTokenService;

/**
 * Push tokens of the signed-in user's devices. Open to every authenticated user. Another user's token and a
 * missing one both answer 404 push_token_not_found.
 */
@RestController
@RequestMapping("/api/push-tokens")
public class PushTokenController {

    private final PushTokenService tokens;

    public PushTokenController(PushTokenService tokens) {
        this.tokens = tokens;
    }

    @PutMapping
    @Operation(operationId = "registerPushToken",
            description = "Idempotent upsert by token. A token of another account moves to the caller. "
                    + "At most 10 devices per user: the least recently registered one is dropped.")
    public PushTokenResponse register(@Valid @RequestBody RegisterPushTokenRequest request,
            Authentication authentication) {
        return PushTokenResponse.of(tokens.register(me(authentication), request.token(), request.platform()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "deletePushToken")
    public void delete(@PathVariable UUID id, Authentication authentication) {
        tokens.delete(me(authentication), id);
    }

    private static UUID me(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
