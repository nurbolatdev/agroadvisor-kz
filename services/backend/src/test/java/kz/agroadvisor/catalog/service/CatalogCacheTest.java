package kz.agroadvisor.catalog.service;

import java.util.Map;

import jakarta.persistence.EntityManagerFactory;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.catalog.service.CatalogService.CropView;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The catalog is read from Redis after the first request: the database sees nothing. */
@SpringBootTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class CatalogCacheTest {

    private static final Map<String, String> NAMES = Map.of("ru", "Кэш", "kk", "Кэш", "en", "Cache");

    @Autowired
    private CatalogService catalog;
    @Autowired
    private CatalogAdminService admin;
    @Autowired
    private CacheManager caches;
    @Autowired
    private EntityManagerFactory entityManagerFactory;

    private Statistics statistics;

    @BeforeEach
    void setUp() {
        statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        caches.getCache(CatalogService.CACHE).clear();
    }

    @AfterEach
    void cleanUp() {
        try {
            admin.deleteCrop("cachecrop");
        } catch (RuntimeException e) {
            // not created by this test
        }
    }

    @Test
    void repeatedReadsDoNotReachTheDatabase() {
        statistics.clear();
        var diseases = catalog.diseases("tomato", "ru");
        var detail = catalog.disease("tomato__late_blight", "ru");
        var crops = catalog.crops("ru");
        assertThat(statistics.getPrepareStatementCount()).as("cold reads hit the database").isPositive();

        statistics.clear();
        assertThat(catalog.diseases("tomato", "ru")).isEqualTo(diseases);
        assertThat(catalog.disease("tomato__late_blight", "ru")).isEqualTo(detail);
        assertThat(catalog.crops("ru")).isEqualTo(crops);
        assertThat(statistics.getPrepareStatementCount()).as("warm reads").isZero();

        assertThat(detail.treatments()).isNotEmpty();
        assertThat(crops).extracting(CropView::code).contains("tomato");
    }

    @Test
    void languagesAreCachedSeparately() {
        assertThat(catalog.crops("ru")).extracting(CropView::name).contains("Томат");
        assertThat(catalog.crops("en")).extracting(CropView::name).contains("Tomato");
        assertThat(catalog.crops("ru")).extracting(CropView::name).contains("Томат");
    }

    @Test
    void adminChangeEvictsTheCache() {
        assertThat(catalog.crops("ru")).extracting(CropView::code).doesNotContain("cachecrop");

        admin.createCrop("cachecrop", NAMES, 999);

        assertThat(catalog.crops("ru")).extracting(CropView::code).contains("cachecrop");
    }

    @Test
    void failedLookupsAreNotCached() {
        assertThatThrownBy(() -> catalog.disease("nope__x", "ru")).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> catalog.disease("nope__x", "ru")).isInstanceOf(RuntimeException.class);
        assertThat(caches.getCache(CatalogService.CACHE).get("disease:nope__x:ru")).isNull();
    }
}
