package kz.agroadvisor.diagnosis.model;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;

/** A disease class code with the model's confidence, as stored in {@code diagnoses.top3}. */
public record ClassScore(@Schema(requiredMode = REQUIRED) String code, @Schema(requiredMode = REQUIRED) double confidence) {
}
