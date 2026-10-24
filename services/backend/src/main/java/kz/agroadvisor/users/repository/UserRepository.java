package kz.agroadvisor.users.repository;

import java.util.Optional;
import java.util.UUID;

import kz.agroadvisor.users.model.User;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByPhone(String phone);

    @Query("select u from User u where lower(u.email) = :email")
    Optional<User> findByEmail(@Param("email") String email);
}
