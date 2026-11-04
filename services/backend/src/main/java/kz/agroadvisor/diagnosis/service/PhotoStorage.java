package kz.agroadvisor.diagnosis.service;

import java.util.Optional;
import java.util.UUID;

/** Stores diagnosis photos outside the database; the database keeps only the returned key. */
public interface PhotoStorage {

    /** Saves a photo of the given user and returns its object key (not a URL). */
    String store(UUID userId, byte[] photo, String contentType);

    /** The stored bytes, or empty when there is no object under the key. */
    Optional<byte[]> load(String key);

    /** Removes a stored photo, e.g. when the diagnosis it belongs to could not be recorded. */
    void delete(String key);
}
