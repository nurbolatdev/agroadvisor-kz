package kz.agroadvisor.users.repository;

import java.util.Optional;
import java.util.UUID;

import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByPhone(String phone);

    @Query("select u from User u where lower(u.email) = :email")
    Optional<User> findByEmail(@Param("email") String email);

    @Query("select count(u) > 0 from User u join u.roles r where r = :role")
    boolean existsWithRole(@Param("role") Role role);

    /** Reads one column, so the roles of the user are not loaded. */
    @Query("select u.regionId from User u where u.id = :id")
    Optional<Long> findRegionIdById(@Param("id") UUID id);
}
