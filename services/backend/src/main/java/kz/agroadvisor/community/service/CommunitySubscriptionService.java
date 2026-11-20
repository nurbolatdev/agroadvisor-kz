package kz.agroadvisor.community.service;

import java.util.HashSet;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;
import kz.agroadvisor.community.repository.CommunitySubscriptionRepository;

/** Crops whose new questions a user wants to hear about. */
@Service
public class CommunitySubscriptionService {

    public static final int MAX_CROPS = 20;

    private final CommunitySubscriptionRepository subscriptions;
    private final TransactionTemplate tx;

    public CommunitySubscriptionService(CommunitySubscriptionRepository subscriptions, TransactionTemplate tx) {
        this.subscriptions = subscriptions;
        this.tx = tx;
    }

    /** Subscribed crop codes in alphabetical order. */
    public List<String> list(UUID me) {
        return subscriptions.list(me);
    }

    /**
     * Replaces the whole set. Every code must be a known crop, without repeats, at most {@value #MAX_CROPS};
     * otherwise the previous set stays as it was.
     */
    public List<String> replace(UUID me, List<String> crops) {
        if (crops == null || crops.size() > MAX_CROPS || crops.stream().anyMatch(java.util.Objects::isNull)
                || new HashSet<>(crops).size() != crops.size()) {
            throw invalid("Send up to " + MAX_CROPS + " different crop codes");
        }
        if (!crops.isEmpty() && subscriptions.countKnownCrops(crops) != crops.size()) {
            throw invalid("Unknown crop in the list");
        }
        tx.executeWithoutResult(status -> {
            subscriptions.deleteAll(me);
            crops.forEach(code -> subscriptions.insert(me, code));
        });
        return subscriptions.list(me);
    }

    private static ApiException invalid(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED, message);
    }
}
