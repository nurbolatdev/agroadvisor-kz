package kz.agroadvisor.community.web;

import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.community.service.CommunitySubscriptionService;

/** Crops whose new questions the caller wants to hear about. */
@RestController
@RequestMapping("/api/community/subscriptions")
@PreAuthorize("(hasRole('FARMER') or hasRole('AGROCHEMIST')) and @featureAccess.allows(authentication, 'community')")
public class CommunitySubscriptionController {

    private final CommunitySubscriptionService subscriptions;

    public CommunitySubscriptionController(CommunitySubscriptionService subscriptions) {
        this.subscriptions = subscriptions;
    }

    @GetMapping
    @Operation(operationId = "getCommunitySubscriptions")
    public SubscriptionsBody get(Authentication authentication) {
        return new SubscriptionsBody(subscriptions.list(UUID.fromString(authentication.getName())));
    }

    @PutMapping
    @Operation(operationId = "replaceCommunitySubscriptions",
            description = "Replaces the whole set. Up to 20 different known crop codes, otherwise 400 "
                    + "validation_failed and the previous set stays.")
    public SubscriptionsBody replace(@Valid @RequestBody SubscriptionsBody body, Authentication authentication) {
        return new SubscriptionsBody(subscriptions.replace(UUID.fromString(authentication.getName()), body.crops()));
    }
}
