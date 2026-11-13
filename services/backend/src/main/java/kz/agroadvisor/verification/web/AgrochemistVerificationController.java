package kz.agroadvisor.verification.web;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import kz.agroadvisor.verification.service.AgrochemistCropService;
import kz.agroadvisor.verification.service.AgrochemistDocumentService;
import kz.agroadvisor.verification.service.AgrochemistDocumentService.DocumentView;
import kz.agroadvisor.verification.service.AgrochemistDocumentService.VerificationView;

/**
 * The agrochemist's own side of the check: send the diploma or a certificate, see the state. Open to
 * every agrochemist whatever the status: a pending agrochemist must be able to send the documents.
 */
@RestController
@RequestMapping("/api/agrochemist")
@PreAuthorize("hasRole('AGROCHEMIST')")
public class AgrochemistVerificationController {

    private final AgrochemistDocumentService documents;
    private final AgrochemistCropService cropService;

    public AgrochemistVerificationController(AgrochemistDocumentService documents,
            AgrochemistCropService cropService) {
        this.documents = documents;
        this.cropService = cropService;
    }

    @GetMapping("/verification")
    @Operation(summary = "State of the check: status, the admin's reason and the documents sent")
    public VerificationView verification(Authentication authentication) {
        return documents.verification(user(authentication));
    }

    @PostMapping(value = "/documents", consumes = "multipart/form-data")
    @Operation(summary = "Send a diploma or certificate (PDF, JPEG or PNG, up to 10 MB, at most 5 documents). "
            + "The profile goes (back) to the admins' queue; an approved profile is locked (409).")
    public ResponseEntity<DocumentView> upload(@RequestParam("file") MultipartFile file, @RequestParam String kind,
            @RequestParam(required = false) String title, @RequestParam(required = false) String issuer,
            @RequestParam(required = false) Integer year, Authentication authentication) throws IOException {
        DocumentView created = documents.upload(user(authentication), kind, title, issuer, year, file.getBytes());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/documents")
    public List<DocumentView> list(Authentication authentication) {
        return documents.documents(user(authentication));
    }

    @GetMapping("/crops")
    @Operation(operationId = "getAgrochemistCrops", summary = "The crops the agrochemist works with")
    public CropsResponse crops(Authentication authentication) {
        return new CropsResponse(cropService.get(user(authentication)));
    }

    @PutMapping("/crops")
    @Operation(operationId = "setAgrochemistCrops",
            summary = "Replace the set of crops (codes from GET /api/crops, at least one, no repeats); "
                    + "open in any verification status")
    public CropsResponse setCrops(@Valid @RequestBody CropsRequest request, Authentication authentication) {
        return new CropsResponse(cropService.replace(user(authentication), request.crops()));
    }

    @DeleteMapping("/documents/{id}")
    @Operation(summary = "Remove one's own document; not possible once the profile is approved (409)")
    public ResponseEntity<Void> delete(@PathVariable UUID id, Authentication authentication) {
        documents.delete(user(authentication), id);
        return ResponseEntity.noContent().build();
    }

    private static UUID user(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
