package kz.agroadvisor.diagnosis.service;

import java.time.Instant;

/** An object in the photo storage: its key and the time it was last written. */
public record StoredObject(String key, Instant lastModified) {
}
