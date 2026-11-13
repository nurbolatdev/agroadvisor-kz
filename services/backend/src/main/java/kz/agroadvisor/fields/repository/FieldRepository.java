package kz.agroadvisor.fields.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import kz.agroadvisor.fields.model.Field;

public interface FieldRepository extends JpaRepository<Field, UUID> {

    /** Every read and change goes through the owner, so another user's id looks like a missing one. */
    Optional<Field> findByIdAndOwnerId(UUID id, UUID ownerId);

    List<Field> findByOwnerIdOrderByCreatedAtAscIdAsc(UUID ownerId);

    long countByOwnerId(UUID ownerId);
}
