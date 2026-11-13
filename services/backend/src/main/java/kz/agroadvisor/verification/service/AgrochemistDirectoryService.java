package kz.agroadvisor.verification.service;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.catalog.service.RegionService;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.verification.repository.AgrochemistCropRepository;
import kz.agroadvisor.verification.repository.AgrochemistDirectoryRepository;
import kz.agroadvisor.verification.repository.AgrochemistDirectoryRepository.Card;

/** The directory of verified agrochemists for farmers. Anyone not listed is "not found", whatever the reason. */
@Service
@Transactional(readOnly = true)
public class AgrochemistDirectoryService {

    private final AgrochemistDirectoryRepository directory;
    private final AgrochemistCropRepository crops;
    private final RegionService regions;

    public AgrochemistDirectoryService(AgrochemistDirectoryRepository directory, AgrochemistCropRepository crops,
            RegionService regions) {
        this.directory = directory;
        this.crops = crops;
        this.regions = regions;
    }

    /** {@code crop} and {@code regionId} are optional; unknown values are 400, not an empty page. */
    public List<Card> list(String crop, Long regionId, int page, int size) {
        if (crop != null && crops.countKnown(List.of(crop)) != 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, VerificationErrors.UNKNOWN_CROP, "Unknown crop");
        }
        if (regionId != null && !regions.exists(regionId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, VerificationErrors.INVALID_REGION,
                    "Unknown region: " + regionId);
        }
        return directory.list(crop, regionId, size, (long) page * size);
    }

    /** A pending, rejected or blocked agrochemist, a farmer and a missing id all answer the same 404. */
    public Card get(UUID id) {
        return directory.find(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
                VerificationErrors.AGROCHEMIST_NOT_FOUND, "Agrochemist not found"));
    }

    /** For other modules (consultations): the agrochemist must be listed. */
    public void requireListed(UUID id) {
        get(id);
    }
}
