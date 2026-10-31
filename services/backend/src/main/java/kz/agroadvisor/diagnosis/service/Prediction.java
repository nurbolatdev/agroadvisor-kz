package kz.agroadvisor.diagnosis.service;

import java.util.List;

import kz.agroadvisor.diagnosis.model.ClassScore;

/**
 * Answer of the AI service to {@code POST /predict} (see {@code docs/api/ai-predict.md}).
 *
 * <p>{@code status} is one of {@code ok}, {@code low_confidence}, {@code unknown},
 * {@code crop_mismatch}; {@code detectedCrop} is set only for {@code crop_mismatch}.
 */
public record Prediction(String status, String crop, ClassScore top1, List<ClassScore> top3,
        String detectedCrop, String modelVersion, int classesVersion, Integer inferenceMs) {

    private static final String PLACEHOLDER_PREFIX = "placeholder";

    /** The stand-in model answers plausibly for any photo, so its result is not a real diagnosis. */
    public boolean isPlaceholder() {
        return modelVersion.startsWith(PLACEHOLDER_PREFIX);
    }
}
