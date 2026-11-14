package kz.agroadvisor.consultations.service;

import java.util.List;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import kz.agroadvisor.consultations.repository.ConsultationRepository.Consultation;

/**
 * What happened in a consultation, for the people who must hear about it. The services publish these inside
 * their transaction; the relay sends them over the WebSocket only after the commit, so a rolled-back change is
 * never announced. An event carries ids only: the client reads the data again over REST.
 */
@Component
public class ConsultationEvents {

    public static final String MESSAGE_CREATED = "message_created";
    public static final String MESSAGES_READ = "messages_read";
    public static final String CONSULTATION_UPDATED = "consultation_updated";

    /** {@code messageId} is the new message for {@code message_created} and the read cursor for {@code messages_read}. */
    public record ConsultationEvent(String type, UUID consultationId, UUID messageId, List<UUID> recipients) {
    }

    private final ApplicationEventPublisher publisher;

    ConsultationEvents(ApplicationEventPublisher publisher) {
        this.publisher = publisher;
    }

    /** A new message goes to the other side only; the sender already has it from the response. */
    void messageCreated(Consultation row, UUID sender, UUID messageId) {
        publisher.publishEvent(new ConsultationEvent(MESSAGE_CREATED, row.id(), messageId,
                List.of(other(row, sender))));
    }

    /** The reader's marks go to the people whose messages were read. */
    void messagesRead(Consultation row, UUID reader, UUID upTo) {
        publisher.publishEvent(new ConsultationEvent(MESSAGES_READ, row.id(), upTo, List.of(other(row, reader))));
    }

    /** A new request or a status change goes to both sides (the actor's other devices too). */
    void updated(Consultation row) {
        publisher.publishEvent(new ConsultationEvent(CONSULTATION_UPDATED, row.id(), null,
                List.of(row.farmerId(), row.agrochemistId())));
    }

    private static UUID other(Consultation row, UUID me) {
        return row.farmerId().equals(me) ? row.agrochemistId() : row.farmerId();
    }
}
