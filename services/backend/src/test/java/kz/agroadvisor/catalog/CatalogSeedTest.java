package kz.agroadvisor.catalog;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import kz.agroadvisor.TestcontainersConfiguration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/** The seeded reference must cover exactly the classes of the AI registry. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class CatalogSeedTest {

    // Maven runs tests from services/backend
    private static final Path CLASSES = Path.of("../ai-service/ml/classes.yaml");
    private static final Pattern CODE = Pattern.compile("^\\s+- code: (\\S+)\\s*$");
    private static final Pattern CROP = Pattern.compile("^\\s+crop: (\\S+)\\s*$");

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void everyModelClassHasADiseaseWithTheSameCrop() throws IOException {
        Map<String, String> classes = classCrops();
        assertThat(classes).hasSizeGreaterThan(10);

        Map<String, String> seeded = new LinkedHashMap<>();
        jdbc.query("SELECT code, crop_code FROM diseases",
                rs -> {
                    seeded.put(rs.getString("code"), rs.getString("crop_code"));
                });

        classes.forEach((code, crop) -> assertThat(seeded).as(code).containsEntry(code, crop));
    }

    @Test
    void everyModelCropIsInTheCatalog() throws IOException {
        List<String> crops = jdbc.queryForList("SELECT code FROM crops", String.class);

        assertThat(crops).containsAll(classCrops().values().stream().filter(c -> c != null).distinct().toList());
    }

    @Test
    void treatableDiseasesHaveChemicalAndBiologicalTreatment() {
        List<String> missing = jdbc.queryForList("""
                SELECT d.code FROM diseases d
                WHERE d.kind IN ('fungal', 'bacterial')
                  AND (SELECT count(DISTINCT t.type) FROM treatments t WHERE t.disease_code = d.code) < 2
                ORDER BY d.code""", String.class);

        assertThat(missing).isEmpty();
    }

    /** Class code to crop code (null for {@code unknown}), read from the registry's classes section. */
    private static Map<String, String> classCrops() throws IOException {
        List<String> lines = Files.readAllLines(CLASSES, StandardCharsets.UTF_8);
        int start = lines.indexOf("classes:");
        assertThat(start).as("classes: section").isPositive();

        Map<String, String> result = new LinkedHashMap<>();
        String current = null;
        for (String line : lines.subList(start + 1, lines.size())) {
            Matcher code = CODE.matcher(line);
            Matcher crop = CROP.matcher(line);
            if (code.matches()) {
                current = code.group(1);
                result.put(current, null);
            } else if (crop.matches() && current != null) {
                result.put(current, "null".equals(crop.group(1)) ? null : crop.group(1));
            }
        }
        return result;
    }
}
