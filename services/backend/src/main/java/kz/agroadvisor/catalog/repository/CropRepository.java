package kz.agroadvisor.catalog.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import kz.agroadvisor.catalog.model.Crop;

public interface CropRepository extends JpaRepository<Crop, String> {

    List<Crop> findAllByOrderBySortOrderAscCodeAsc();
}
