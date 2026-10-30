package kz.agroadvisor.catalog.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import kz.agroadvisor.catalog.model.Disease;

public interface DiseaseRepository extends JpaRepository<Disease, String> {

    List<Disease> findAllByOrderByCodeAsc();

    List<Disease> findAllByCropCodeOrderByCodeAsc(String cropCode);

    /** Stored diagnoses keep only the class code, so they are counted in their own table. */
    @Query(value = "SELECT count(*) FROM diagnoses WHERE top1_code = :code", nativeQuery = true)
    long countDiagnoses(@Param("code") String code);
}
