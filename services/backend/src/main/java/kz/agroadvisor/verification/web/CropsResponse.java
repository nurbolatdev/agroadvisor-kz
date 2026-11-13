package kz.agroadvisor.verification.web;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/** The crops of the agrochemist, by code in alphabetical order. */
@Schema(name = "AgrochemistCropsResponse")
public record CropsResponse(List<String> crops) {
}
