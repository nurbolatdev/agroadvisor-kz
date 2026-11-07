package kz.agroadvisor.diagnosis.service;

/**
 * The model the AI service has loaded, as its {@code GET /health} reports it. {@code calibrated} is false for
 * a model without a temperature in its card (it never answers {@code ok}).
 */
public record ModelInfo(String modelVersion, int classesVersion, boolean calibrated) {
}
