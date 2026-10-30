package kz.agroadvisor.catalog.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import kz.agroadvisor.catalog.model.Disease;

public interface DiseaseRepository extends JpaRepository<Disease, String> {

    List<Disease> findAllByOrderByCodeAsc();

    List<Disease> findAllByCropCodeOrderByCodeAsc(String cropCode);
}
