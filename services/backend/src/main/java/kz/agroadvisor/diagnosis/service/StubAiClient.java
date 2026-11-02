package kz.agroadvisor.diagnosis.service;

import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import kz.agroadvisor.catalog.service.CatalogService;
import kz.agroadvisor.catalog.service.CatalogService.CropView;
import kz.agroadvisor.diagnosis.model.ClassScore;

/**
 * Fake AI service: always answers "healthy" with a placeholder model version. It exists only when
 * {@code app.ai.client=stub} (the test profile, or {@code AI_CLIENT=stub} for local experiments); the
 * default is the real {@link HttpAiClient}, so a deployment never records invented diagnoses by accident.
 * Crops come from the cached reference, which mirrors the AI class registry.
 */
@Component
@ConditionalOnProperty(name = "app.ai.client", havingValue = "stub")
class StubAiClient implements AiClient {

    static final String MODEL_VERSION = "placeholder-v0";
    private static final int CLASSES_VERSION = 1;

    private final CatalogService catalog;

    StubAiClient(CatalogService catalog) {
        this.catalog = catalog;
    }

    @Override
    public Prediction predict(String crop, byte[] image) {
        ClassScore top = new ClassScore(crop + "__healthy", 0.99);
        return new Prediction("ok", crop, top, List.of(top), null, MODEL_VERSION, CLASSES_VERSION, 0);
    }

    @Override
    public List<String> crops() {
        // Codes do not depend on the language; any one hits the same cache entry
        return catalog.crops("en").stream().map(CropView::code).toList();
    }
}
