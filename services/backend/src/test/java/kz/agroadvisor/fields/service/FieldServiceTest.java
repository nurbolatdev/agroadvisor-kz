package kz.agroadvisor.fields.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;
import kz.agroadvisor.fields.model.AreaUnit;
import kz.agroadvisor.fields.service.FieldService.FieldView;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class FieldServiceTest {

    @Autowired
    private FieldService service;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID owner;

    @BeforeEach
    void setUp() {
        jdbc.update("""
                INSERT INTO crops (code, names) VALUES ('potato', '{"ru": "-", "kk": "-", "en": "-"}')
                ON CONFLICT (code) DO NOTHING""");
        owner = insertUser("+77010000071");
    }

    @Test
    void createsAFieldInSotkiAndKeepsTheAreaInHectares() {
        FieldView view = service.create(owner, "  North  ", "potato", new BigDecimal("250"), AreaUnit.SOTKA,
                new BigDecimal("43.2"), new BigDecimal("76.9"));

        assertThat(view.name()).isEqualTo("North");
        assertThat(view.area()).isEqualTo(new BigDecimal("250"));
        assertThat(view.areaUnit()).isEqualTo("sotka");
        assertThat(view.areaHa()).isEqualByComparingTo("2.5");
        assertThat(view.latitude()).isEqualByComparingTo("43.2");
        assertThat(view.id()).isNotNull();
        assertThat(view.createdAt()).isNotNull();
    }

    @Test
    void takesTheRegionFromTheProfileWhenThereIsNoDistrict() {
        long region = jdbc.queryForObject(
                "INSERT INTO regions (code, names) VALUES ('field_service_region', "
                        + "'{\"ru\": \"-\", \"kk\": \"-\", \"en\": \"-\"}') RETURNING id", Long.class);
        jdbc.update("UPDATE users SET region_id = ? WHERE id = ?", region, owner);

        FieldView view = service.create(owner, "North", "potato", BigDecimal.ONE, AreaUnit.HA, null, null);

        assertThat(view.regionId()).isEqualTo(region);
        assertThat(view.districtId()).isNull();
    }

    @Test
    void wholeHectaresAreShownWithoutAnExponent() {
        FieldView ten = service.create(owner, "Ten", "potato", new BigDecimal("10"), AreaUnit.HA, null, null);
        FieldView thousandSotki = service.create(owner, "Thousand", "potato", new BigDecimal("1000"),
                AreaUnit.SOTKA, null, null);

        assertThat(ten.areaHa().toString()).isEqualTo("10");
        assertThat(thousandSotki.areaHa().toString()).isEqualTo("10");
        assertThat(thousandSotki.area().toString()).isEqualTo("1000");
    }

    @Test
    void updatingToANameOfUnicodeBlanksIsRefused() {
        FieldView created = service.create(owner, "North", "potato", BigDecimal.ONE, AreaUnit.HA, null, null);

        assertThatThrownBy(() -> service.update(owner, created.id(), "　", null, null, null, false, null,
                null))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getCode()).isEqualTo(ErrorCodes.VALIDATION_FAILED));
    }

    @Test
    void refusesAnUnknownCrop() {
        assertThatThrownBy(() -> service.create(owner, "North", "no_such_crop", BigDecimal.ONE, AreaUnit.HA,
                null, null))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getCode()).isEqualTo(FieldErrors.UNKNOWN_CROP);
                });
    }

    @Test
    void refusesAnAreaOutsideTheRangeAfterConversion() {
        // 0.001 sotka is 0.00001 ha, 1000001 sotki is 10000.01 ha
        assertAreaRefused(new BigDecimal("0.001"), AreaUnit.SOTKA);
        assertAreaRefused(new BigDecimal("1000001"), AreaUnit.SOTKA);
        assertAreaRefused(new BigDecimal("10000.01"), AreaUnit.HA);
    }

    @Test
    void acceptsTheEdgesOfTheAreaRange() {
        assertThat(service.create(owner, "Tiny", "potato", new BigDecimal("0.01"), AreaUnit.SOTKA, null, null)
                .areaHa()).isEqualByComparingTo("0.0001");
        assertThat(service.create(owner, "Huge", "potato", new BigDecimal("10000"), AreaUnit.HA, null, null)
                .areaHa()).isEqualByComparingTo("10000");
    }

    @Test
    void refusesOneCoordinateWithoutTheOther() {
        assertThatThrownBy(() -> service.create(owner, "North", "potato", BigDecimal.ONE, AreaUnit.HA,
                new BigDecimal("43.2"), null))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getCode()).isEqualTo(ErrorCodes.VALIDATION_FAILED));
    }

    @Test
    void refusesTheHundredAndFirstField() {
        for (int i = 0; i < FieldService.MAX_FIELDS_PER_OWNER; i++) {
            service.create(owner, "Field " + i, "potato", BigDecimal.ONE, AreaUnit.HA, null, null);
        }

        assertThatThrownBy(() -> service.create(owner, "One more", "potato", BigDecimal.ONE, AreaUnit.HA, null,
                null))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(e.getCode()).isEqualTo(FieldErrors.FIELD_LIMIT_REACHED);
                });
    }

    @Test
    void anotherOwnersLimitDoesNotCount() {
        UUID other = insertUser("+77010000072");
        service.create(other, "Theirs", "potato", BigDecimal.ONE, AreaUnit.HA, null, null);

        assertThat(service.list(owner)).isEmpty();
        assertThat(service.create(owner, "Mine", "potato", BigDecimal.ONE, AreaUnit.HA, null, null)).isNotNull();
    }

    @Test
    void getAnotherOwnersFieldIsNotFoundLikeAMissingOne() {
        UUID other = insertUser("+77010000073");
        FieldView theirs = service.create(other, "Theirs", "potato", BigDecimal.ONE, AreaUnit.HA, null, null);

        assertThatThrownBy(() -> service.get(owner, theirs.id())).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(e.getCode()).isEqualTo(FieldErrors.FIELD_NOT_FOUND);
        });
        assertThatThrownBy(() -> service.get(owner, UUID.randomUUID())).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.getCode()).isEqualTo(FieldErrors.FIELD_NOT_FOUND));
    }

    @Test
    void readsTheOwnersFieldBack() {
        FieldView created = service.create(owner, "North", "potato", new BigDecimal("2.5"), AreaUnit.HA, null,
                null);

        assertThat(service.get(owner, created.id())).isEqualTo(created);
        assertThat(service.list(owner)).containsExactly(created);
    }

    @Test
    void updatingTheNameKeepsEverythingElse() {
        FieldView created = service.create(owner, "North", "potato", new BigDecimal("250"), AreaUnit.SOTKA,
                new BigDecimal("43.2"), new BigDecimal("76.9"));

        FieldView updated = service.update(owner, created.id(), " East ", null, null, null, false, null, null);

        assertThat(updated.name()).isEqualTo("East");
        assertThat(updated.area()).isEqualTo(created.area());
        assertThat(updated.areaUnit()).isEqualTo("sotka");
        assertThat(updated.latitude()).isEqualByComparingTo("43.2");
        assertThat(updated.updatedAt()).isAfterOrEqualTo(created.updatedAt());
    }

    @Test
    void updatingTheAreaNeedsItsUnitAndRecalculatesHectares() {
        FieldView created = service.create(owner, "North", "potato", BigDecimal.ONE, AreaUnit.HA, null, null);

        FieldView updated = service.update(owner, created.id(), null, null, new BigDecimal("50"), AreaUnit.SOTKA,
                false, null, null);

        assertThat(updated.areaHa()).isEqualByComparingTo("0.5");
        assertThat(updated.areaUnit()).isEqualTo("sotka");
        assertThatThrownBy(() -> service.update(owner, created.id(), null, null, new BigDecimal("5"), null, false,
                null, null))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getCode()).isEqualTo(ErrorCodes.VALIDATION_FAILED));
        assertThatThrownBy(() -> service.update(owner, created.id(), null, null, null, AreaUnit.HA, false, null,
                null))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getCode()).isEqualTo(ErrorCodes.VALIDATION_FAILED));
    }

    @Test
    void updatingToAnUnknownCropOrAnAreaOutOfRangeIsRefused() {
        FieldView created = service.create(owner, "North", "potato", BigDecimal.ONE, AreaUnit.HA, null, null);

        assertThatThrownBy(() -> service.update(owner, created.id(), null, "no_such_crop", null, null, false,
                null, null))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getCode()).isEqualTo(FieldErrors.UNKNOWN_CROP));
        assertThatThrownBy(() -> service.update(owner, created.id(), null, null, new BigDecimal("20000"),
                AreaUnit.HA, false, null, null))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getCode()).isEqualTo(FieldErrors.AREA_OUT_OF_RANGE));
    }

    @Test
    void aNewPointInsideADistrictGivesTheNewDistrict() {
        long region = jdbc.queryForObject("INSERT INTO regions (code, names) VALUES ('field_update_region', "
                + "'{\"ru\": \"-\", \"kk\": \"-\", \"en\": \"-\"}') RETURNING id", Long.class);
        long district = jdbc.queryForObject("""
                INSERT INTO districts (region_id, code, names, boundary)
                VALUES (?, 'field_update_district', '{"ru": "-", "kk": "-", "en": "-"}',
                        ST_GeomFromText('MULTIPOLYGON(((76 43, 77 43, 77 44, 76 44, 76 43)))', 4326))
                RETURNING id""", Long.class, region);
        FieldView created = service.create(owner, "North", "potato", BigDecimal.ONE, AreaUnit.HA, null, null);
        assertThat(created.districtId()).isNull();

        FieldView moved = service.update(owner, created.id(), null, null, null, null, true,
                new BigDecimal("43.5"), new BigDecimal("76.5"));

        assertThat(moved.districtId()).isEqualTo(district);
        assertThat(moved.regionId()).isEqualTo(region);
    }

    @Test
    void anExplicitNullLocationRemovesThePointAndALeftOutOneKeepsIt() {
        FieldView created = service.create(owner, "North", "potato", BigDecimal.ONE, AreaUnit.HA,
                new BigDecimal("43.2"), new BigDecimal("76.9"));

        FieldView kept = service.update(owner, created.id(), "Renamed", null, null, null, false, null, null);
        assertThat(kept.latitude()).isEqualByComparingTo("43.2");

        FieldView removed = service.update(owner, created.id(), null, null, null, null, true, null, null);
        assertThat(removed.latitude()).isNull();
        assertThat(removed.longitude()).isNull();
        assertThat(jdbc.queryForObject("SELECT location IS NULL FROM fields WHERE id = ?", Boolean.class,
                created.id())).isTrue();
    }

    @Test
    void updateAndDeleteOfAnotherOwnersFieldAreNotFound() {
        UUID other = insertUser("+77010000074");
        FieldView theirs = service.create(other, "Theirs", "potato", BigDecimal.ONE, AreaUnit.HA, null, null);

        assertThatThrownBy(() -> service.update(owner, theirs.id(), "Mine now", null, null, null, false, null,
                null))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getCode()).isEqualTo(FieldErrors.FIELD_NOT_FOUND));
        assertThatThrownBy(() -> service.delete(owner, theirs.id()))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getCode()).isEqualTo(FieldErrors.FIELD_NOT_FOUND));
        assertThat(service.get(other, theirs.id()).name()).isEqualTo("Theirs");
    }

    @Test
    void deletesAFieldAndASecondDeleteIsNotFound() {
        FieldView created = service.create(owner, "North", "potato", BigDecimal.ONE, AreaUnit.HA, null, null);

        service.delete(owner, created.id());

        assertThat(service.list(owner)).isEmpty();
        assertThatThrownBy(() -> service.delete(owner, created.id()))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getCode()).isEqualTo(FieldErrors.FIELD_NOT_FOUND));
    }

    private void assertAreaRefused(BigDecimal area, AreaUnit unit) {
        assertThatThrownBy(() -> service.create(owner, "North", "potato", area, unit, null, null))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getCode()).isEqualTo(FieldErrors.AREA_OUT_OF_RANGE);
                });
    }

    private UUID insertUser(String phone) {
        return jdbc.queryForObject(
                "INSERT INTO users (phone, password_hash, full_name) VALUES (?, 'x', 'Test') RETURNING id",
                UUID.class, phone);
    }
}
