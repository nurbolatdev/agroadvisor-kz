package kz.agroadvisor.fields.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.fields.model.AreaUnit;
import kz.agroadvisor.fields.model.Field;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class FieldRepositoryTest {

    @Autowired
    private FieldRepository fields;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void savesAFieldWithAPointAndTheDatabaseComputesTheGeometry() {
        UUID owner = insertUser("+77010000051");
        insertCrop("potato");

        Field saved = fields.saveAndFlush(field(owner, "North", "43.2", "76.9"));

        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getCreatedAt()).isNotNull();
        assertThat(saved.getUpdatedAt()).isNotNull();
        assertThat(jdbc.queryForObject("SELECT ST_AsText(location) FROM fields WHERE id = ?", String.class,
                saved.getId())).isEqualTo("POINT(76.9 43.2)");
    }

    @Test
    void savesAFieldWithoutAPoint() {
        UUID owner = insertUser("+77010000052");
        insertCrop("potato");

        Field saved = fields.saveAndFlush(field(owner, "South", null, null));

        assertThat(jdbc.queryForObject("SELECT location IS NULL FROM fields WHERE id = ?", Boolean.class,
                saved.getId())).isTrue();
    }

    @Test
    void anotherOwnerDoesNotFindTheField() {
        UUID owner = insertUser("+77010000053");
        UUID other = insertUser("+77010000054");
        insertCrop("potato");
        Field saved = fields.saveAndFlush(field(owner, "North", null, null));

        assertThat(fields.findByIdAndOwnerId(saved.getId(), owner)).isPresent();
        assertThat(fields.findByIdAndOwnerId(saved.getId(), other)).isEmpty();
    }

    @Test
    void listsOnlyTheOwnersFieldsOldestFirstAndCountsThem() {
        UUID owner = insertUser("+77010000055");
        UUID other = insertUser("+77010000056");
        insertCrop("potato");
        Field first = fields.saveAndFlush(field(owner, "First", null, null));
        fields.saveAndFlush(field(owner, "Second", null, null));
        fields.saveAndFlush(field(other, "Other", null, null));
        // now() is the start of the transaction, so all rows of this test would share one time
        jdbc.update("UPDATE fields SET created_at = created_at - interval '1 day' WHERE id = ?", first.getId());

        assertThat(fields.findByOwnerIdOrderByCreatedAtAscIdAsc(owner)).extracting(Field::getName)
                .containsExactly("First", "Second");
        assertThat(fields.countByOwnerId(owner)).isEqualTo(2);
    }

    private static Field field(UUID owner, String name, String latitude, String longitude) {
        return new Field(owner, name, "potato", new BigDecimal("2.5"), AreaUnit.HA,
                latitude == null ? null : new BigDecimal(latitude),
                longitude == null ? null : new BigDecimal(longitude), null, null);
    }

    private UUID insertUser(String phone) {
        return jdbc.queryForObject(
                "INSERT INTO users (phone, password_hash, full_name) VALUES (?, 'x', 'Test') RETURNING id",
                UUID.class, phone);
    }

    private void insertCrop(String code) {
        jdbc.update("""
                INSERT INTO crops (code, names) VALUES (?, '{"ru": "-", "kk": "-", "en": "-"}')
                ON CONFLICT (code) DO NOTHING""", code);
    }
}
