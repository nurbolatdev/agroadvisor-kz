package kz.agroadvisor.calculations.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import kz.agroadvisor.calculations.model.Calculation;

public interface CalculationRepository extends JpaRepository<Calculation, UUID> {

    /** Every read and delete goes through the owner, so another user's id looks like a missing one. */
    Optional<Calculation> findByIdAndOwnerId(UUID id, UUID ownerId);

    List<Calculation> findByOwnerIdOrderByCreatedAtDescIdDesc(UUID ownerId);

    long countByOwnerId(UUID ownerId);
}
