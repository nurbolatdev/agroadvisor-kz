package kz.agroadvisor.fields.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.fields.service.FieldPlacement.Place;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class FieldPlacementTest {

    @Autowired
    private FieldPlacement placement;

    @Autowired
    private JdbcTemplate jdbc;

    private long districtRegion;
    private long district;
    private long profileRegion;

    @BeforeEach
    void setUp() {
        districtRegion = insertRegion("placement_district_region");
        profileRegion = insertRegion("placement_profile_region");
        // A square from 76-77 east and 43-44 north
        district = jdbc.queryForObject("""
                INSERT INTO districts (region_id, code, names, boundary)
                VALUES (?, 'placement_district', '{"ru": "-", "kk": "-", "en": "-"}',
                        ST_GeomFromText('MULTIPOLYGON(((76 43, 77 43, 77 44, 76 44, 76 43)))', 4326))
                RETURNING id""", Long.class, districtRegion);
    }

    @Test
    void aPointInsideADistrictGivesItsDistrictAndRegion() {
        UUID owner = insertUser("+77010000061", profileRegion);

        Place place = placement.place(owner, new BigDecimal("43.5"), new BigDecimal("76.5"));

        assertThat(place).isEqualTo(new Place(districtRegion, district));
    }

    @Test
    void aPointOutsideEveryDistrictGivesTheProfileRegion() {
        UUID owner = insertUser("+77010000062", profileRegion);

        Place place = placement.place(owner, new BigDecimal("50.0"), new BigDecimal("60.0"));

        assertThat(place).isEqualTo(new Place(profileRegion, null));
    }

    @Test
    void noPointGivesTheProfileRegion() {
        UUID owner = insertUser("+77010000063", profileRegion);

        assertThat(placement.place(owner, null, null)).isEqualTo(new Place(profileRegion, null));
    }

    @Test
    void noPointAndNoProfileRegionGivesNothing() {
        UUID owner = insertUser("+77010000064", null);

        assertThat(placement.place(owner, null, null)).isEqualTo(new Place(null, null));
    }

    private long insertRegion(String code) {
        return jdbc.queryForObject(
                "INSERT INTO regions (code, names) VALUES (?, '{\"ru\": \"-\", \"kk\": \"-\", \"en\": \"-\"}') "
                        + "RETURNING id", Long.class, code);
    }

    private UUID insertUser(String phone, Long regionId) {
        return jdbc.queryForObject(
                "INSERT INTO users (phone, password_hash, full_name, region_id) VALUES (?, 'x', 'Test', ?) "
                        + "RETURNING id", UUID.class, phone, regionId);
    }
}
