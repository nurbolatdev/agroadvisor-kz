package kz.agroadvisor.calculations.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import kz.agroadvisor.calculations.model.Calculation;

public interface CalculationRepository extends JpaRepository<Calculation, UUID> {

    /** Every read and delete goes through the owner, so another user's id looks like a missing one. */
    Optional<Calculation> findByIdAndOwnerId(UUID id, UUID ownerId);

    List<Calculation> findByOwnerIdOrderByCreatedAtDescIdDesc(UUID ownerId);

    long countByOwnerId(UUID ownerId);

    /** Deletes in one statement and returns how many rows went: 0 means not found (or not the caller's). */
    @Modifying
    @Query("delete from Calculation c where c.id = :id and c.ownerId = :ownerId")
    int deleteOwned(@Param("id") UUID id, @Param("ownerId") UUID ownerId);
}
