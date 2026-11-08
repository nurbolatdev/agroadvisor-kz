package kz.agroadvisor.diagnosis.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.diagnosis.service.ModelInfo;
import kz.agroadvisor.diagnosis.service.ModelInfoService;

/** What the app may show about the recognition model (the profile screen). Any signed-in user. */
@RestController
@RequestMapping("/api/meta")
public class MetaController {

    /** The model of the AI service; the version string is the one stored with every diagnosis. */
    public record MetaView(
            @Schema(requiredMode = REQUIRED, example = "effnet-b0-v1") String modelVersion,
            @Schema(requiredMode = REQUIRED, example = "1") int classesVersion) {
    }

    private final ModelInfoService models;

    public MetaController(ModelInfoService models) {
        this.models = models;
    }

    @GetMapping
    @Operation(summary = "The version of the recognition model, as the AI service reports it (kept for about a "
            + "minute)")
    @ApiResponse(responseCode = "503", description = "ai_unavailable: the AI service cannot be reached, is not "
            + "ready, or runs a placeholder model; the app shows no model line then")
    public MetaView meta() {
        ModelInfo model = models.current();
        return new MetaView(model.modelVersion(), model.classesVersion());
    }
}
