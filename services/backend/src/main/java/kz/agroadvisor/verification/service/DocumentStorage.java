package kz.agroadvisor.verification.service;

import java.util.UUID;

/** Object storage for the documents an agrochemist sends to prove the qualification. */
public interface DocumentStorage {

    /** Stores the document under a new random key and returns the key. */
    String store(UUID userId, byte[] document, String contentType);

    byte[] load(String key);

    void delete(String key);
}
