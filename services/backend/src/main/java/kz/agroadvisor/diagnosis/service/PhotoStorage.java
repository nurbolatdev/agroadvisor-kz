package kz.agroadvisor.diagnosis.service;

import java.util.Optional;
import java.util.UUID;

/** Stores diagnosis photos outside the database; the database keeps only the returned key. */
public interface PhotoStorage {

    /**
     * Saves a photo of the given user and returns its object key (not a URL). The key is
     * {@code diagnoses/<userId>/<name>.<ext>}: the same {@code name} for the same user gives the same key,
     * so the caller chooses what "the same photo" means. A request with an Idempotency-Key passes a name
     * derived from the key and the photo's fingerprint, so one name always means the same bytes and a
     * repeated or taken-over request writes identical content; a request without a key passes a random one.
     * {@code name} is 1-64 letters, digits or hyphens.
     */
    String store(UUID userId, String name, byte[] photo, String contentType);

    /** The stored bytes, or empty when there is no object under the key. */
    Optional<byte[]> load(String key);

    /** Removes a stored photo, e.g. when the diagnosis it belongs to could not be recorded. */
    void delete(String key);
}
