package kz.agroadvisor.community.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

import kz.agroadvisor.community.repository.CommunitySubscriptionRepository;
import kz.agroadvisor.notifications.model.NotificationType;
import kz.agroadvisor.notifications.service.NotificationService;
import kz.agroadvisor.notifications.service.NotificationService.Refs;

/**
 * What happened in the community, for the people who must hear about it. The services call these inside their
 * transaction, so a feed row exists exactly when the event is committed.
 */
@Component
public class CommunityEvents {

    private final NotificationService notifications;
    private final CommunitySubscriptionRepository subscriptions;

    CommunityEvents(NotificationService notifications, CommunitySubscriptionRepository subscriptions) {
        this.notifications = notifications;
        this.subscriptions = subscriptions;
    }

    /** A new answer goes to the author of the question, unless they answered themselves. */
    void answered(UUID questionId, UUID answerId, UUID questionAuthor, UUID answerAuthor) {
        if (!questionAuthor.equals(answerAuthor)) {
            notifications.notify(questionAuthor, NotificationType.COMMUNITY_ANSWER,
                    Refs.answer(questionId, answerId));
        }
    }

    /** A picked best answer goes to its author; clearing the choice and picking the same answer again do not. */
    void accepted(UUID questionId, UUID answerId, UUID answerAuthor, UUID questionAuthor) {
        if (!answerAuthor.equals(questionAuthor)) {
            notifications.notify(answerAuthor, NotificationType.COMMUNITY_ANSWER_ACCEPTED,
                    Refs.answer(questionId, answerId));
        }
    }

    /**
     * A new question goes to the active subscribers of its crop, except the author. All rows are written in
     * the transaction of the question; with many thousands of subscribers this should move to a batch insert
     * or an outbox.
     */
    void asked(UUID questionId, String cropCode, UUID author) {
        for (UUID subscriber : subscriptions.activeSubscribers(cropCode, author)) {
            notifications.notify(subscriber, NotificationType.COMMUNITY_QUESTION, Refs.question(questionId));
        }
    }
}
