package kz.agroadvisor.consultations.config;

import org.springframework.core.convert.converter.Converter;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.authentication.AbstractAuthenticationToken;

import kz.agroadvisor.access.service.FeatureAccessService;

/**
 * The only gate of the STOMP channel. CONNECT must carry {@code Authorization: Bearer <access token>} (the token
 * is never put in the URL, so it stays out of access logs); the user is built from the database like for REST,
 * and must be a farmer or an agrochemist with the feature {@code consultations}. After that the client may only
 * SUBSCRIBE to its own queue ({@code /user/queue/**}); it may not SEND anything, because the server is the only
 * publisher, and anything else without a connected user is refused.
 */
class JwtStompInterceptor implements ChannelInterceptor {

    static final String USER_QUEUE_PREFIX = "/user/queue/";

    private final JwtDecoder decoder;
    private final Converter<Jwt, AbstractAuthenticationToken> converter;
    private final FeatureAccessService access;
    private final StompSessionExpiry expiry;

    JwtStompInterceptor(JwtDecoder decoder, Converter<Jwt, AbstractAuthenticationToken> converter,
            FeatureAccessService access, StompSessionExpiry expiry) {
        this.decoder = decoder;
        this.converter = converter;
        this.access = access;
        this.expiry = expiry;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        StompCommand command = accessor == null ? null : accessor.getCommand();
        if (command == null) {
            return message; // a heartbeat or a frame of the broker itself
        }
        switch (command) {
            case CONNECT, STOMP -> connect(accessor);
            case SUBSCRIBE -> subscribe(accessor);
            case SEND -> throw refused("Clients cannot send messages");
            case DISCONNECT -> { }
            default -> requireUser(accessor);
        }
        return message;
    }

    private void connect(StompHeaderAccessor accessor) {
        String header = accessor.getFirstNativeHeader("Authorization");
        if (header == null || !header.regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw refused("A bearer token is required");
        }
        Authentication authentication;
        Jwt jwt;
        try {
            jwt = decoder.decode(header.substring(7).trim());
            authentication = converter.convert(jwt);
        } catch (JwtException | AuthenticationException e) {
            throw refused("The token is invalid or expired");
        }
        boolean role = authentication.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_FARMER") || a.getAuthority().equals("ROLE_AGROCHEMIST"));
        if (!role || !access.allows(authentication, "consultations")) {
            throw refused("Consultations are not available to this account");
        }
        accessor.setUser(authentication);
        if (jwt.getExpiresAt() != null) {
            expiry.expiresAt(accessor.getSessionId(), jwt.getExpiresAt());
        }
    }

    private void subscribe(StompHeaderAccessor accessor) {
        requireUser(accessor);
        String destination = accessor.getDestination();
        if (destination == null || !destination.startsWith(USER_QUEUE_PREFIX) || destination.contains("..")) {
            throw refused("Only " + USER_QUEUE_PREFIX + "** can be subscribed to");
        }
    }

    private static void requireUser(StompHeaderAccessor accessor) {
        if (accessor.getUser() == null) {
            throw refused("Connect first");
        }
    }

    private static MessageDeliveryException refused(String reason) {
        return new MessageDeliveryException(reason);
    }
}
