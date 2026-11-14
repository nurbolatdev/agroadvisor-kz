package kz.agroadvisor.consultations.service;

import java.util.UUID;

/** Object storage for the photos sent in the chat of a consultation. */
public interface ConsultationPhotoStorage {

    /** Stores the photo under a new random key {@code consultations/<consultationId>/<random>.<ext>}. */
    String store(UUID consultationId, byte[] photo, String contentType);

    byte[] load(String key);

    void delete(String key);
}
