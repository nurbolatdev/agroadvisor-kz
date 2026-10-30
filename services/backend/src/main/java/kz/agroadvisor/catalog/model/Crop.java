package kz.agroadvisor.catalog.model;

import java.time.Instant;
import java.util.Map;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "crops")
public class Crop {

    /** Same code as in the AI class registry, e.g. {@code tomato}. */
    @Id
    private String code;

    /** Translations keyed by language: {@code ru}, {@code kk}, {@code en}. */
    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, String> names;

    @Column(name = "sort_order")
    private int sortOrder;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    protected Crop() {
    }

    public Crop(String code, Map<String, String> names, int sortOrder) {
        this.code = code;
        this.names = names;
        this.sortOrder = sortOrder;
    }

    public String getCode() {
        return code;
    }

    public Map<String, String> getNames() {
        return names;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void update(Map<String, String> names, int sortOrder) {
        this.names = names;
        this.sortOrder = sortOrder;
    }
}
