package kz.agroadvisor.verification.service;

import java.util.HashSet;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;
import kz.agroadvisor.verification.repository.AgrochemistCropRepository;
import kz.agroadvisor.verification.repository.AgrochemistDocumentRepository;

/** The crops an agrochemist works with; they feed the crop filter of the directory. */
@Service
public class AgrochemistCropService {

    private final AgrochemistCropRepository crops;
    private final AgrochemistDocumentRepository profiles;

    public AgrochemistCropService(AgrochemistCropRepository crops, AgrochemistDocumentRepository profiles) {
        this.crops = crops;
        this.profiles = profiles;
    }

    @Transactional(readOnly = true)
    public List<String> get(UUID agrochemist) {
        return crops.findCodes(agrochemist);
    }

    /** Replaces the whole set. Works in any verification status, so a pending agrochemist can fill it in. */
    @Transactional
    public List<String> replace(UUID agrochemist, List<String> codes) {
        if (codes == null || codes.isEmpty() || codes.stream().anyMatch(c -> c == null || c.isBlank())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
                    "Give at least one crop");
        }
        if (new HashSet<>(codes).size() != codes.size()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
                    "A crop is listed twice");
        }
        if (crops.countKnown(codes) != codes.size()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, VerificationErrors.UNKNOWN_CROP, "Unknown crop");
        }
        // The profile row is the lock: two replacements of one agrochemist run one after another
        profiles.lockProfile(agrochemist).orElseThrow(() -> new ApiException(HttpStatus.CONFLICT,
                VerificationErrors.PROFILE_MISSING, "The agrochemist has no profile"));
        crops.deleteAll(agrochemist);
        crops.insert(agrochemist, codes);
        return crops.findCodes(agrochemist);
    }
}
