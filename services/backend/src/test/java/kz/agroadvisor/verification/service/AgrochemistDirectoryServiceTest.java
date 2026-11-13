package kz.agroadvisor.verification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
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
import kz.agroadvisor.verification.repository.AgrochemistDirectoryRepository.Card;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class AgrochemistDirectoryServiceTest {

    @Autowired
    private AgrochemistDirectoryService service;
    @Autowired
    private JdbcTemplate jdbc;

    private long regionA;
    private long regionB;
    private int seq;

    @BeforeEach
    void setUp() {
        List<Long> ids = jdbc.queryForList("SELECT id FROM regions ORDER BY id LIMIT 2", Long.class);
        regionA = ids.get(0);
        regionB = ids.get(1);
    }

    /** A user with the given role (null: no role), profile status and account status. */
    private UUID agrochemist(String name, String role, String verification, String accountStatus, Integer years,
            Long region) {
        UUID id = jdbc.queryForObject("""
                INSERT INTO users (phone, email, password_hash, full_name, status, region_id)
                VALUES (?, ?, 'x', ?, ?, ?) RETURNING id""", UUID.class,
                "+7799" + (1_000_000 + seq), "dir" + seq++ + "@example.com", name, accountStatus, region);
        if (role != null) {
            jdbc.update("INSERT INTO user_roles (user_id, role_code) VALUES (?, ?)", id, role);
        }
        jdbc.update("""
                INSERT INTO agrochemist_profiles (user_id, specialization, experience_years, verification_status)
                VALUES (?, 'plant_protection', ?, ?)""", id, years, verification);
        return id;
    }

    private UUID listed(String name, Integer years, Long region) {
        return agrochemist(name, "agrochemist", "approved", "active", years, region);
    }

    private void crop(UUID id, String code) {
        jdbc.update("INSERT INTO agrochemist_crops (user_id, crop_code) VALUES (?, ?)", id, code);
    }

    private List<UUID> ids(List<Card> cards) {
        return cards.stream().map(Card::id).toList();
    }

    @Test
    void listsOnlyApprovedActiveAgrochemists() {
        UUID ok = listed("Ok", 5, regionA);
        UUID pending = agrochemist("Pending", "agrochemist", "pending", "active", 5, regionA);
        UUID rejected = agrochemist("Rejected", "agrochemist", "rejected", "active", 5, regionA);
        UUID requested = agrochemist("Docs", "agrochemist", "documents_requested", "active", 5, regionA);
        UUID blocked = agrochemist("Blocked", "agrochemist", "approved", "blocked", 5, regionA);
        UUID noRole = agrochemist("Farmer", "farmer", "approved", "active", 5, regionA);

        List<UUID> all = ids(service.list(null, null, 0, 50));

        assertThat(all).contains(ok).doesNotContain(pending, rejected, requested, blocked, noRole);
        for (UUID hidden : List.of(pending, rejected, requested, blocked, noRole)) {
            assertThatThrownBy(() -> service.get(hidden)).isInstanceOfSatisfying(ApiException.class,
                    e -> {
                        assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                        assertThat(e.getCode()).isEqualTo("agrochemist_not_found");
                    });
            assertThatThrownBy(() -> service.requireListed(hidden)).isInstanceOf(ApiException.class);
        }
        assertThat(service.get(ok).fullName()).isEqualTo("Ok");
        service.requireListed(ok);
    }

    @Test
    void aCardHasTheFieldsOfTheDirectory() {
        UUID id = listed("Card", 7, regionA);
        crop(id, "wheat");
        crop(id, "potato");

        Card card = service.get(id);

        assertThat(card.specializations()).containsExactly("plant_protection");
        assertThat(card.experienceYears()).isEqualTo(7);
        assertThat(card.regionId()).isEqualTo(regionA);
        assertThat(card.crops()).containsExactly("potato", "wheat");
    }

    @Test
    void filtersByCropAndRegionAlone() {
        UUID potatoA = listed("P-A", 1, regionA);
        UUID wheatA = listed("W-A", 1, regionA);
        UUID potatoB = listed("P-B", 1, regionB);
        crop(potatoA, "potato");
        crop(wheatA, "wheat");
        crop(potatoB, "potato");

        assertThat(ids(service.list("potato", null, 0, 50))).contains(potatoA, potatoB).doesNotContain(wheatA);
        assertThat(ids(service.list(null, regionB, 0, 50))).contains(potatoB).doesNotContain(potatoA, wheatA);
        assertThat(ids(service.list("potato", regionA, 0, 50))).contains(potatoA).doesNotContain(wheatA, potatoB);
    }

    @Test
    void unknownFiltersAreRefused() {
        assertThatThrownBy(() -> service.list("banana", null, 0, 20)).isInstanceOfSatisfying(ApiException.class,
                e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getCode()).isEqualTo("unknown_crop");
                });
        assertThatThrownBy(() -> service.list(null, Long.MAX_VALUE, 0, 20)).isInstanceOfSatisfying(
                ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getCode()).isEqualTo("invalid_region");
                });
    }

    @Test
    void ordersByExperienceNullsLastThenNameThenId() {
        // One region and one crop isolate the rows from whatever else the database holds
        UUID none = listed("Aaa none", null, regionB);
        UUID ten = listed("Zed ten", 10, regionB);
        UUID twoB = listed("Bob two", 2, regionB);
        UUID twoA = listed("Ann two", 2, regionB);
        for (UUID id : List.of(none, ten, twoB, twoA)) {
            crop(id, "tomato");
        }

        List<UUID> found = ids(service.list("tomato", regionB, 0, 50)).stream()
                .filter(List.of(none, ten, twoB, twoA)::contains).toList();

        assertThat(found).containsExactly(ten, twoA, twoB, none);
    }

    @Test
    void pagesDoNotOverlap() {
        List<UUID> made = List.of(listed("P1", 3, regionA), listed("P2", 3, regionA), listed("P3", 3, regionA));
        made.forEach(id -> crop(id, "corn"));

        List<UUID> first = ids(service.list("corn", regionA, 0, 2));
        List<UUID> second = ids(service.list("corn", regionA, 1, 2));

        assertThat(first).hasSize(2);
        assertThat(second).hasSize(1);
        assertThat(first).doesNotContainAnyElementsOf(second);
        assertThat(List.of(first, second).stream().flatMap(List::stream).toList())
                .containsExactlyInAnyOrderElementsOf(made);
    }
}
