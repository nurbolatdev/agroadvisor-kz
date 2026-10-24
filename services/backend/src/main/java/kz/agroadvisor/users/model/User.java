package kz.agroadvisor.users.model;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "users")
public class User {

    @Id
    private UUID id;

    private String phone;

    /** Stored lower-case; see {@link Login}. */
    private String email;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "full_name")
    private String fullName;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(length = 2)
    private String language;

    @Convert(converter = UserStatusConverter.class)
    private UserStatus status;

    // Loaded eagerly: roles are read on every authenticated request
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_roles", joinColumns = @JoinColumn(name = "user_id"))
    @Column(name = "role_code")
    @Convert(converter = RoleConverter.class)
    private Set<Role> roles = new HashSet<>();

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    protected User() {
    }

    public User(Login login, String passwordHash, String fullName, String language, Set<Role> roles) {
        this.id = UUID.randomUUID();
        if (login.type() == Login.Type.PHONE) {
            this.phone = login.value();
        } else {
            this.email = login.value();
        }
        this.passwordHash = passwordHash;
        this.fullName = fullName;
        this.language = language;
        this.status = UserStatus.ACTIVE;
        this.roles = new HashSet<>(roles);
    }

    public UUID getId() {
        return id;
    }

    public String getPhone() {
        return phone;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getFullName() {
        return fullName;
    }

    public String getLanguage() {
        return language;
    }

    public UserStatus getStatus() {
        return status;
    }

    public void setStatus(UserStatus status) {
        this.status = status;
    }

    public boolean isActive() {
        return status == UserStatus.ACTIVE;
    }

    public Set<Role> getRoles() {
        return roles;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
