package kz.agroadvisor.notifications.web;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * A device push token. The token is printable ASCII without spaces, at most 512 characters; the platform tells
 * which kind of token it is: a raw FCM token, a raw APNs token or an Expo push token.
 */
public record RegisterPushTokenRequest(
        @NotNull @Pattern(regexp = "[\\x21-\\x7E]{1,512}") @Schema(maxLength = 512) String token,
        @NotNull @Pattern(regexp = "android|ios|expo")
        @Schema(allowableValues = {"android", "ios", "expo"}) String platform) {
}
