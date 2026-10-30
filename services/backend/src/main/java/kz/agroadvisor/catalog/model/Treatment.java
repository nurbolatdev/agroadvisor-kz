package kz.agroadvisor.catalog.model;

import java.time.Instant;
import java.util.Map;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "treatments")
public class Treatment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "disease_code")
    private Disease disease;

    /** chemical or biological. */
    private String type;

    private String product;

    @Column(name = "active_ingredient")
    private String activeIngredient;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, String> dosage;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, String> method;

    @Column(name = "sort_order")
    private int sortOrder;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    protected Treatment() {
    }

    public Treatment(String type, String product, String activeIngredient, Map<String, String> dosage,
            Map<String, String> method, int sortOrder) {
        this.type = type;
        this.product = product;
        this.activeIngredient = activeIngredient;
        this.dosage = dosage;
        this.method = method;
        this.sortOrder = sortOrder;
    }

    public void update(String type, String product, String activeIngredient, Map<String, String> dosage,
            Map<String, String> method, int sortOrder) {
        this.type = type;
        this.product = product;
        this.activeIngredient = activeIngredient;
        this.dosage = dosage;
        this.method = method;
        this.sortOrder = sortOrder;
    }

    void attachTo(Disease disease) {
        this.disease = disease;
    }

    public Long getId() {
        return id;
    }

    public String getType() {
        return type;
    }

    public String getProduct() {
        return product;
    }

    public String getActiveIngredient() {
        return activeIngredient;
    }

    public Map<String, String> getDosage() {
        return dosage;
    }

    public Map<String, String> getMethod() {
        return method;
    }

    public int getSortOrder() {
        return sortOrder;
    }
}
