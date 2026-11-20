package kz.agroadvisor.community.service;

import java.util.UUID;

/** Object storage for the photos attached to community questions. */
public interface CommunityPhotoStorage {

    /** Stores the photo under a new random key {@code community/<questionId>/<random>.<ext>}. */
    String store(UUID questionId, byte[] photo, String contentType);

    byte[] load(String key);

    void delete(String key);
}
