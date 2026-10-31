package kz.agroadvisor.diagnosis.model;

/** A disease class code with the model's confidence, as stored in {@code diagnoses.top3}. */
public record ClassScore(String code, double confidence) {
}
