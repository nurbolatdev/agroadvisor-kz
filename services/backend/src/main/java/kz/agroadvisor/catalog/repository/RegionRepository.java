package kz.agroadvisor.catalog.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import kz.agroadvisor.catalog.model.Region;

public interface RegionRepository extends JpaRepository<Region, Long> {
}
