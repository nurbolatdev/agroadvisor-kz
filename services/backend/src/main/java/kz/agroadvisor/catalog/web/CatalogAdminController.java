package kz.agroadvisor.catalog.web;

import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.catalog.service.CatalogAdminService;
import kz.agroadvisor.catalog.service.CatalogAdminService.AdminCrop;
import kz.agroadvisor.catalog.service.CatalogAdminService.AdminDisease;
import kz.agroadvisor.catalog.service.CatalogAdminService.DiseaseData;

/** Editing of the reference; ADMIN only. Texts are returned with all languages. */
@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class CatalogAdminController {

    private static final String CODE = "^[a-z][a-z0-9_]*$";

    private final CatalogAdminService admin;

    public CatalogAdminController(CatalogAdminService admin) {
        this.admin = admin;
    }

    @GetMapping("/crops")
    public List<AdminCrop> crops() {
        return admin.crops();
    }

    @PostMapping("/crops")
    @ResponseStatus(HttpStatus.CREATED)
    public AdminCrop createCrop(@Valid @RequestBody CreateCrop request) {
        return admin.createCrop(request.code(), request.names(), request.order());
    }

    @PutMapping("/crops/{code}")
    public AdminCrop updateCrop(@PathVariable String code, @Valid @RequestBody CropBody request) {
        return admin.updateCrop(code, request.names(), request.order());
    }

    @DeleteMapping("/crops/{code}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCrop(@PathVariable String code) {
        admin.deleteCrop(code);
    }

    @GetMapping("/diseases")
    public List<AdminDisease> diseases() {
        return admin.diseases();
    }

    @GetMapping("/diseases/{code}")
    public AdminDisease disease(@PathVariable String code) {
        return admin.disease(code);
    }

    @PostMapping("/diseases")
    @ResponseStatus(HttpStatus.CREATED)
    public AdminDisease createDisease(@Valid @RequestBody CreateDisease request) {
        return admin.createDisease(request.code(), request.data());
    }

    @PutMapping("/diseases/{code}")
    public AdminDisease updateDisease(@PathVariable String code, @Valid @RequestBody DiseaseBody request) {
        return admin.updateDisease(code, request.data());
    }

    @DeleteMapping("/diseases/{code}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteDisease(@PathVariable String code) {
        admin.deleteDisease(code);
    }

    /** {@code sortOrder} is optional (0), hence Integer: Jackson rejects a missing primitive. */
    public record CreateCrop(@NotNull @Size(max = 40) @Pattern(regexp = CODE) String code,
            @NotNull Map<String, String> names, Integer sortOrder) {

        int order() {
            return sortOrder == null ? 0 : sortOrder;
        }
    }

    public record CropBody(@NotNull Map<String, String> names, Integer sortOrder) {

        int order() {
            return sortOrder == null ? 0 : sortOrder;
        }
    }

    public record CreateDisease(@NotNull @Size(max = 80) @Pattern(regexp = CODE) String code,
            String cropCode, @NotNull String kind, String severity, @Size(max = 160) String latinName,
            @NotNull Map<String, String> names, Map<String, Object> symptoms, Map<String, Object> conditions,
            Map<String, Object> prevention) {

        DiseaseData data() {
            return new DiseaseData(cropCode, kind, severity, latinName, names, symptoms, conditions, prevention);
        }
    }

    public record DiseaseBody(String cropCode, @NotNull String kind, String severity,
            @Size(max = 160) String latinName, @NotNull Map<String, String> names,
            Map<String, Object> symptoms, Map<String, Object> conditions, Map<String, Object> prevention) {

        DiseaseData data() {
            return new DiseaseData(cropCode, kind, severity, latinName, names, symptoms, conditions, prevention);
        }
    }
}
