package kz.agroadvisor.diagnosis.service;

import java.util.List;

import org.springframework.stereotype.Component;

import kz.agroadvisor.catalog.model.Crop;
import kz.agroadvisor.catalog.repository.CropRepository;
import kz.agroadvisor.diagnosis.service.Prediction.ClassScore;

/**
 * Stand-in for the AI service until B9: always answers "healthy" with a placeholder model version.
 * Crops come from the reference table, which mirrors the AI class registry.
 */
@Component
class StubAiClient implements AiClient {

    static final String MODEL_VERSION = "placeholder-v0";
    private static final int CLASSES_VERSION = 1;

    private final CropRepository crops;

    StubAiClient(CropRepository crops) {
        this.crops = crops;
    }

    @Override
    public Prediction predict(String crop, byte[] image) {
        ClassScore top = new ClassScore(crop + "__healthy", 0.99);
        return new Prediction("ok", crop, top, List.of(top), null, MODEL_VERSION, CLASSES_VERSION, 0);
    }

    @Override
    public List<String> crops() {
        return crops.findAllByOrderBySortOrderAscCodeAsc().stream().map(Crop::getCode).toList();
    }
}
