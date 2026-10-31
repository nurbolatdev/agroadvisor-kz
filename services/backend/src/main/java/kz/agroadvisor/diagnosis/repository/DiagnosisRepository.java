package kz.agroadvisor.diagnosis.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import kz.agroadvisor.diagnosis.model.Diagnosis;

public interface DiagnosisRepository extends JpaRepository<Diagnosis, UUID> {

    /** A user's history, newest first (index {@code (user_id, created_at DESC)}). */
    List<Diagnosis> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable page);
}
