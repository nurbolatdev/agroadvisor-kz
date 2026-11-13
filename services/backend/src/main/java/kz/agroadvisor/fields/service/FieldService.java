package kz.agroadvisor.fields.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;
import kz.agroadvisor.fields.model.AreaUnit;
import kz.agroadvisor.fields.model.Field;
import kz.agroadvisor.fields.repository.FieldRepository;
import kz.agroadvisor.fields.service.FieldPlacement.Place;

/** A farmer's fields. Every method works on the fields of one owner: another user's id is just "not found". */
@Service
public class FieldService {

    /** The most fields one farmer may have. */
    public static final int MAX_FIELDS_PER_OWNER = 100;

    private static final BigDecimal MIN_AREA_HA = new BigDecimal("0.0001");
    private static final BigDecimal MAX_AREA_HA = new BigDecimal("10000");
    private static final int AREA_HA_SCALE = 4;

    /**
     * A field as the API shows it: {@code area} in the unit the farmer chose, {@code areaHa} the same area in
     * hectares.
     */
    public record FieldView(UUID id, String name, String cropCode, BigDecimal area, String areaUnit,
            BigDecimal areaHa, BigDecimal latitude, BigDecimal longitude, Long regionId, Long districtId,
            Instant createdAt, Instant updatedAt) {

        static FieldView of(Field field) {
            AreaUnit unit = field.getAreaUnit();
            return new FieldView(field.getId(), field.getName(), field.getCropCode(),
                    unit.fromHectares(field.getAreaHa()), unit.code(), field.getAreaHa().stripTrailingZeros(),
                    field.getLatitude(), field.getLongitude(), field.getRegionId(), field.getDistrictId(),
                    field.getCreatedAt(), field.getUpdatedAt());
        }
    }

    private final FieldRepository fields;
    private final FieldPlacement placement;
    private final JdbcTemplate jdbc;

    public FieldService(FieldRepository fields, FieldPlacement placement, JdbcTemplate jdbc) {
        this.fields = fields;
        this.placement = placement;
        this.jdbc = jdbc;
    }

    /**
     * Creates a field. {@code latitude} and {@code longitude} are both set or both null; the region and the
     * district come from the point, or from the profile of the owner when there is none.
     */
    @Transactional
    public FieldView create(UUID owner, String name, String cropCode, BigDecimal area, AreaUnit unit,
            BigDecimal latitude, BigDecimal longitude) {
        requireCoordinatesTogether(latitude, longitude);
        requireKnownCrop(cropCode);
        BigDecimal areaHa = toHectares(area, unit);

        // One owner creates one field at a time, so two requests cannot both pass the limit
        lock(owner);
        if (fields.countByOwnerId(owner) >= MAX_FIELDS_PER_OWNER) {
            throw new ApiException(HttpStatus.CONFLICT, FieldErrors.FIELD_LIMIT_REACHED,
                    "You can have at most " + MAX_FIELDS_PER_OWNER + " fields");
        }

        Place place = placement.place(owner, latitude, longitude);
        Field field = new Field(owner, name.strip(), cropCode, areaHa, unit, latitude, longitude,
                place.regionId(), place.districtId());
        return FieldView.of(fields.saveAndFlush(field));
    }

    @Transactional(readOnly = true)
    public List<FieldView> list(UUID owner) {
        return fields.findByOwnerIdOrderByCreatedAtAscIdAsc(owner).stream().map(FieldView::of).toList();
    }

    @Transactional(readOnly = true)
    public FieldView get(UUID owner, UUID id) {
        return FieldView.of(find(owner, id));
    }

    Field find(UUID owner, UUID id) {
        return fields.findByIdAndOwnerId(id, owner)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, FieldErrors.FIELD_NOT_FOUND,
                        "Field not found"));
    }

    static void requireCoordinatesTogether(BigDecimal latitude, BigDecimal longitude) {
        if ((latitude == null) != (longitude == null)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
                    "Latitude and longitude are set together or not at all");
        }
    }

    void requireKnownCrop(String cropCode) {
        Boolean exists = jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM crops WHERE code = ?)", Boolean.class,
                cropCode);
        if (!Boolean.TRUE.equals(exists)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, FieldErrors.UNKNOWN_CROP, "Unknown crop: " + cropCode);
        }
    }

    /** The area in hectares with the scale of the column; a result outside 0.0001-10000 ha is refused. */
    static BigDecimal toHectares(BigDecimal area, AreaUnit unit) {
        BigDecimal hectares = unit.toHectares(area);
        if (hectares.compareTo(MIN_AREA_HA) < 0 || hectares.compareTo(MAX_AREA_HA) > 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, FieldErrors.AREA_OUT_OF_RANGE,
                    "The area must be from 0.0001 to 10000 hectares");
        }
        return hectares.setScale(AREA_HA_SCALE);
    }

    private void lock(UUID owner) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", (RowCallbackHandler) rs -> { },
                "fields:" + owner);
    }
}
