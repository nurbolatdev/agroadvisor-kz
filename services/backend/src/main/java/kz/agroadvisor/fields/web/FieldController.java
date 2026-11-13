package kz.agroadvisor.fields.web;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.fields.model.AreaUnit;
import kz.agroadvisor.fields.service.FieldService;
import kz.agroadvisor.fields.service.FieldService.FieldView;

/** The fields of the signed-in farmer. The owner is always the user in the token. */
@RestController
@RequestMapping("/api/fields")
@PreAuthorize("hasRole('FARMER') and @featureAccess.allows(authentication, 'fields')")
public class FieldController {

    private final FieldService fields;

    public FieldController(FieldService fields) {
        this.fields = fields;
    }

    @PostMapping
    @Operation(operationId = "createField")
    public ResponseEntity<FieldResponse> create(@Valid @RequestBody CreateFieldRequest request,
            Authentication authentication) {
        CreateFieldRequest.Point point = request.location();
        FieldView created = fields.create(owner(authentication), request.name(), request.crop(), request.area(),
                AreaUnit.fromCode(request.areaUnit()), point == null ? null : point.latitude(),
                point == null ? null : point.longitude());
        return ResponseEntity.created(URI.create("/api/fields/" + created.id())).body(FieldResponse.of(created));
    }

    /** Oldest first; a farmer has at most 100 fields, so there is no paging. */
    @GetMapping
    @Operation(operationId = "listFields")
    public List<FieldResponse> list(Authentication authentication) {
        return fields.list(owner(authentication)).stream().map(FieldResponse::of).toList();
    }

    /** Another user's field and a missing one both answer 404 field_not_found. */
    @GetMapping("/{id}")
    @Operation(operationId = "getField")
    public FieldResponse get(@PathVariable UUID id, Authentication authentication) {
        return FieldResponse.of(fields.get(owner(authentication), id));
    }

    private static UUID owner(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
