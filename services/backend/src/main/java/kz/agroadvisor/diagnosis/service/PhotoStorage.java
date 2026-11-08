package kz.agroadvisor.diagnosis.service;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

/** Stores diagnosis photos outside the database; the database keeps only the returned key. */
public interface PhotoStorage {

    /**
     * Saves a photo of the given user and returns its object key (not a URL). The key is
     * {@code diagnoses/<userId>/<name>.<ext>}: the same {@code name} for the same user gives the same key and
     * overwrites the object. The diagnosis flow therefore passes a new random name for every attempt, so an
     * object belongs to exactly one attempt. {@code name} is 1-64 letters, digits or hyphens.
     */
    String store(UUID userId, String name, byte[] photo, String contentType);

    /** The stored bytes, or empty when there is no object under the key. */
    Optional<byte[]> load(String key);

    /** Removes a stored photo, e.g. when the diagnosis it belongs to could not be recorded. */
    void delete(String key);

    /**
     * The objects whose key starts with the prefix, read page by page as the stream is consumed, so a
     * large bucket is never held in memory. A storage fault surfaces as an exception while iterating.
     */
    Stream<StoredObject> list(String prefix);

    /** The key and last-modified time of one object, or empty when there is none. */
    Optional<StoredObject> head(String key);

    /**
     * Removes the objects in batches of at most 1000 and returns the keys that could not be removed (empty
     * when all went). A failed call counts all keys of its batch as failed; it never throws for a storage fault.
     */
    List<String> deleteAll(Collection<String> keys);
}
