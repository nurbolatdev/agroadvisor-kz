package kz.agroadvisor.catalog.repository;

import java.util.List;
import java.util.Map;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.catalog.model.Crop;
import kz.agroadvisor.catalog.model.Disease;
import kz.agroadvisor.catalog.model.Treatment;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class CatalogRepositoryTest {

    private static final Map<String, String> NAMES = Map.of("ru", "Тест", "kk", "Тест", "en", "Test");

    @Autowired
    CropRepository crops;

    @Autowired
    DiseaseRepository diseases;

    @Autowired
    EntityManager em;

    @Test
    void savesAndReadsTranslationsAndTreatments() {
        crops.save(new Crop("testcrop", NAMES, 99));
        Disease disease = new Disease("testcrop__rot", "testcrop", "fungal", "high", "Rotus testus", NAMES,
                Map.of("ru", List.of("пятна", "налёт"), "kk", "дақ", "en", List.of("spots")),
                null, null);
        disease.addTreatment(new Treatment("chemical", "Product B", "ingredient", NAMES, NAMES, 2));
        disease.addTreatment(new Treatment("chemical", "Product A", "ingredient", NAMES, NAMES, 1));
        diseases.save(disease);
        em.flush();
        em.clear();

        Disease loaded = diseases.findById("testcrop__rot").orElseThrow();

        assertThat(loaded.getNames()).containsEntry("kk", "Тест");
        assertThat(loaded.getSymptoms().get("ru")).isEqualTo(List.of("пятна", "налёт"));
        assertThat(loaded.getSymptoms().get("kk")).isEqualTo("дақ");
        assertThat(loaded.getTreatments()).extracting(Treatment::getProduct)
                .containsExactly("Product A", "Product B");
        assertThat(diseases.findAllByCropCodeOrderByCodeAsc("testcrop")).hasSize(1);
        assertThat(crops.findAllByOrderBySortOrderAscCodeAsc()).extracting(Crop::getCode).contains("testcrop");
    }
}
