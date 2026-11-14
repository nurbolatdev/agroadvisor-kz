package kz.agroadvisor.consultations.config;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;

import kz.agroadvisor.access.service.FeatureAccessService;

/**
 * Server push for consultations over STOMP on a plain WebSocket ({@code /ws}). The handshake itself is open (a
 * browser cannot add a header to it); the token travels in the CONNECT frame and is checked by
 * {@link JwtStompInterceptor}. The broker is in memory and delivers only to {@code /user/queue/**}, which is
 * one instance only (docs/adr/0009).
 */
@Configuration
@EnableWebSocketMessageBroker
class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    /** A client that connects but never sends CONNECT is dropped after this long. */
    private static final int TIME_TO_FIRST_MESSAGE_MS = 10_000;
    /** The client only sends CONNECT, SUBSCRIBE and heartbeats; 8 KB is far more than that needs. */
    private static final int MESSAGE_SIZE_LIMIT = 8 * 1024;
    private static final long HEARTBEAT_MS = 25_000;

    private final JwtDecoder decoder;
    private final Converter<Jwt, AbstractAuthenticationToken> converter;
    private final FeatureAccessService access;
    private final StompSessionExpiry expiry;
    private final ObjectProvider<TaskScheduler> scheduler;

    WebSocketConfig(JwtDecoder decoder, Converter<Jwt, AbstractAuthenticationToken> converter,
            FeatureAccessService access, StompSessionExpiry expiry, ObjectProvider<TaskScheduler> scheduler) {
        this.decoder = decoder;
        this.converter = converter;
        this.access = access;
        this.expiry = expiry;
        this.scheduler = scheduler;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // No allowed origins: a browser page of another site is refused, a native app sends no Origin
        registry.addEndpoint("/ws");
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/queue")
                .setHeartbeatValue(new long[] {HEARTBEAT_MS, HEARTBEAT_MS})
                .setTaskScheduler(scheduler.getObject());
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new JwtStompInterceptor(decoder, converter, access, expiry));
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registry) {
        registry.setTimeToFirstMessage(TIME_TO_FIRST_MESSAGE_MS);
        registry.setMessageSizeLimit(MESSAGE_SIZE_LIMIT);
        registry.addDecoratorFactory(handler -> new WebSocketHandlerDecorator(handler) {
            @Override
            public void afterConnectionEstablished(org.springframework.web.socket.WebSocketSession session)
                    throws Exception {
                expiry.opened(session);
                super.afterConnectionEstablished(session);
            }

            @Override
            public void afterConnectionClosed(org.springframework.web.socket.WebSocketSession session,
                    org.springframework.web.socket.CloseStatus closeStatus) throws Exception {
                expiry.closed(session.getId());
                super.afterConnectionClosed(session, closeStatus);
            }
        });
    }
}
