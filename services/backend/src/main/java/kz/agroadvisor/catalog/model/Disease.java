package kz.agroadvisor.catalog.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "diseases")
public class Disease {

    /** Model class code, e.g. {@code tomato__late_blight}; also {@code unknown}. */
    @Id
    private String code;

    /** Null only for {@code unknown}. */
    @Column(name = "crop_code")
    private String cropCode;

    /** fungal, bacterial, viral, pest, healthy or other. */
    private String kind;

    /** low, medium or high; null when not applicable. */
    private String severity;

    @Column(name = "latin_name")
    private String latinName;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, String> names;

    // Per language: a list of strings or a plain string, hence Object
    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> symptoms;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> conditions;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> prevention;

    @OneToMany(mappedBy = "disease", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("type, sortOrder, id")
    private List<Treatment> treatments = new ArrayList<>();

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private Instant updatedAt;

    protected Disease() {
    }

    public Disease(String code, String cropCode, String kind, String severity, String latinName,
            Map<String, String> names, Map<String, Object> symptoms, Map<String, Object> conditions,
            Map<String, Object> prevention) {
        this.code = code;
        update(cropCode, kind, severity, latinName, names, symptoms, conditions, prevention);
    }

    public void update(String cropCode, String kind, String severity, String latinName,
            Map<String, String> names, Map<String, Object> symptoms, Map<String, Object> conditions,
            Map<String, Object> prevention) {
        this.cropCode = cropCode;
        this.kind = kind;
        this.severity = severity;
        this.latinName = latinName;
        this.names = names;
        this.symptoms = symptoms;
        this.conditions = conditions;
        this.prevention = prevention;
    }

    public void addTreatment(Treatment treatment) {
        treatment.attachTo(this);
        treatments.add(treatment);
    }

    public boolean removeTreatment(Long treatmentId) {
        return treatments.removeIf(treatment -> treatment.getId().equals(treatmentId));
    }

    public String getCode() {
        return code;
    }

    public String getCropCode() {
        return cropCode;
    }

    public String getKind() {
        return kind;
    }

    public String getSeverity() {
        return severity;
    }

    public String getLatinName() {
        return latinName;
    }

    public Map<String, String> getNames() {
        return names;
    }

    public Map<String, Object> getSymptoms() {
        return symptoms;
    }

    public Map<String, Object> getConditions() {
        return conditions;
    }

    public Map<String, Object> getPrevention() {
        return prevention;
    }

    public List<Treatment> getTreatments() {
        return treatments;
    }
}
