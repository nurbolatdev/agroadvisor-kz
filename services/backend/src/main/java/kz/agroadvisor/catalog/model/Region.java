package kz.agroadvisor.catalog.model;

import java.util.Map;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** A region of Kazakhstan a person can pick at registration (the table is filled by migrations only). */
@Entity
@Table(name = "regions")
public class Region {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Stable lower-case code, e.g. {@code akmola}. */
    @Column(updatable = false)
    private String code;

    /** Translations keyed by language: {@code ru}, {@code kk}, {@code en}. */
    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, String> names;

    protected Region() {
    }

    public Long getId() {
        return id;
    }

    public String getCode() {
        return code;
    }

    public Map<String, String> getNames() {
        return names;
    }
}
