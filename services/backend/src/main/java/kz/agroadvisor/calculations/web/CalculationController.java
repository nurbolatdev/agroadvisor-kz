package kz.agroadvisor.calculations.web;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import kz.agroadvisor.calculations.service.CalculationService;
import kz.agroadvisor.calculations.service.CalculationService.CalculationView;
import kz.agroadvisor.calculations.service.CalculationService.NewCalculation;

/** The saved seasons of the signed-in farmer. The owner is always the user in the token. */
@RestController
@RequestMapping("/api/calculations")
@PreAuthorize("hasRole('FARMER') and @featureAccess.allows(authentication, 'calculator')")
public class CalculationController {

    private final CalculationService calculations;

    public CalculationController(CalculationService calculations) {
        this.calculations = calculations;
    }

    @PostMapping
    @Operation(operationId = "createCalculation")
    public ResponseEntity<CalculationResponse> create(@Valid @RequestBody CreateCalculationRequest request,
            Authentication authentication) {
        CalculationView created = calculations.create(owner(authentication),
                new NewCalculation(request.crop(), request.season().shortValue(), request.areaHa(),
                        request.areaUnit(), request.yieldCHa(), request.priceT(), request.costs(),
                        request.results()));
        return ResponseEntity.created(URI.create("/api/calculations/" + created.id()))
                .body(CalculationResponse.of(created));
    }

    /** Newest first; a farmer keeps at most 100 seasons, so there is no paging. */
    @GetMapping
    @Operation(operationId = "listCalculations")
    public List<CalculationResponse> list(Authentication authentication) {
        return calculations.list(owner(authentication)).stream().map(CalculationResponse::of).toList();
    }

    /** Another user's season and a missing one both answer 404 calculation_not_found. */
    @GetMapping("/{id}")
    @Operation(operationId = "getCalculation")
    public CalculationResponse get(@PathVariable UUID id, Authentication authentication) {
        return CalculationResponse.of(calculations.get(owner(authentication), id));
    }

    @DeleteMapping("/{id}")
    @Operation(operationId = "deleteCalculation")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, Authentication authentication) {
        calculations.delete(owner(authentication), id);
    }

    private static UUID owner(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
