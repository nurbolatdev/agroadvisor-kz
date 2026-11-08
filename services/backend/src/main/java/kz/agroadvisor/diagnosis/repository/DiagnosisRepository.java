package kz.agroadvisor.diagnosis.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import kz.agroadvisor.diagnosis.model.Diagnosis;

public interface DiagnosisRepository extends JpaRepository<Diagnosis, UUID> {

    /** A user's history, newest first (index {@code (user_id, created_at DESC)}). */
    List<Diagnosis> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable page);

    /** The diagnosis a client already made with this key (unique index {@code (user_id, idempotency_key)}). */
    Optional<Diagnosis> findByUserIdAndIdempotencyKey(UUID userId, String idempotencyKey);

    @Query("select d.photoKey from Diagnosis d where d.photoKey in :keys")
    Set<String> findPhotoKeysIn(@Param("keys") Collection<String> keys);

    /**
     * Those of the given object keys that some diagnosis points to (index {@code diagnoses_photo_key_idx}). The
     * keys are compared as they are: {@code photo_key} holds the full storage key, exactly the string the storage
     * lists ({@code diagnoses/<userId>/<name>.<ext>}), so no conversion is needed and a key that differs in
     * any character is another key. The caller sends batches (hundreds, not the whole bucket).
     */
    default Set<String> findExistingPhotoKeys(Collection<String> keys) {
        return keys.isEmpty() ? Set.of() : findPhotoKeysIn(keys);
    }
}
