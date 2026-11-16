package kz.agroadvisor.calculations.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.calculations.model.Calculation;
import kz.agroadvisor.calculations.repository.CalculationRepository;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;

/** A farmer's saved seasons. Every method works on one owner: another user's id is just "not found". */
@Service
public class CalculationService {

    /** The most saved seasons one farmer may keep. */
    public static final int MAX_PER_OWNER = 100;
    /** The most entries in costs or results. */
    public static final int MAX_ENTRIES = 30;

    private static final Pattern KEY = Pattern.compile("[a-zA-Z][a-zA-Z0-9_]{0,39}");
    private static final BigDecimal MAX_AMOUNT = new BigDecimal("1000000000000");
    private static final int MAX_AMOUNT_SCALE = 4;

    /** A saved season as the API shows it. */
    public record CalculationView(UUID id, String cropCode, short season, BigDecimal areaHa, String areaUnit,
            BigDecimal yieldCHa, BigDecimal priceT, Map<String, BigDecimal> costs, Map<String, BigDecimal> results,
            Instant createdAt) {

        static CalculationView of(Calculation c) {
            return new CalculationView(c.getId(), c.getCropCode(), c.getSeason(), c.getAreaHa(), c.getAreaUnit(),
                    c.getYieldCHa(), c.getPriceT(), c.getCosts(), c.getResults(), c.getCreatedAt());
        }
    }

    /** What the farmer entered and what the app calculated; the server does not recalculate. */
    public record NewCalculation(String cropCode, short season, BigDecimal areaHa, String areaUnit,
            BigDecimal yieldCHa, BigDecimal priceT, Map<String, BigDecimal> costs, Map<String, BigDecimal> results) {
    }

    private final CalculationRepository calculations;
    private final JdbcTemplate jdbc;

    public CalculationService(CalculationRepository calculations, JdbcTemplate jdbc) {
        this.calculations = calculations;
        this.jdbc = jdbc;
    }

    @Transactional
    public CalculationView create(UUID owner, NewCalculation input) {
        requireKnownCrop(input.cropCode());
        requireAmounts("costs", input.costs(), false);
        requireAmounts("results", input.results(), true);

        // One owner saves one season at a time, so two requests cannot both pass the limit
        lock(owner);
        if (calculations.countByOwnerId(owner) >= MAX_PER_OWNER) {
            throw new ApiException(HttpStatus.CONFLICT, CalculationErrors.CALCULATION_LIMIT_REACHED,
                    "You can keep at most " + MAX_PER_OWNER + " saved seasons");
        }

        // The scale of the columns, so the answer to the POST reads the same as a later GET
        Calculation saved = calculations.saveAndFlush(new Calculation(owner, input.cropCode(), input.season(),
                input.areaHa().setScale(4), input.areaUnit(), input.yieldCHa().setScale(2),
                input.priceT().setScale(2), Map.copyOf(input.costs()), Map.copyOf(input.results())));
        return CalculationView.of(saved);
    }

    /** Newest first. */
    @Transactional(readOnly = true)
    public List<CalculationView> list(UUID owner) {
        return calculations.findByOwnerIdOrderByCreatedAtDescIdDesc(owner).stream().map(CalculationView::of)
                .toList();
    }

    @Transactional(readOnly = true)
    public CalculationView get(UUID owner, UUID id) {
        return CalculationView.of(find(owner, id));
    }

    @Transactional
    public void delete(UUID owner, UUID id) {
        // One statement, so two deletes of the same season cannot both pass: the second one deletes 0 rows
        if (calculations.deleteOwned(id, owner) == 0) {
            throw notFound();
        }
    }

    private Calculation find(UUID owner, UUID id) {
        return calculations.findByIdAndOwnerId(id, owner).orElseThrow(CalculationService::notFound);
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, CalculationErrors.CALCULATION_NOT_FOUND,
                "Saved season not found");
    }

    private void requireKnownCrop(String cropCode) {
        Boolean exists = jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM crops WHERE code = ?)", Boolean.class,
                cropCode);
        if (!Boolean.TRUE.equals(exists)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, CalculationErrors.UNKNOWN_CROP,
                    "Unknown crop: " + cropCode);
        }
    }

    /** At most {@value #MAX_ENTRIES} entries, simple keys, amounts within +-10^12 (costs also not negative). */
    static void requireAmounts(String name, Map<String, BigDecimal> amounts, boolean allowNegative) {
        if (amounts.size() > MAX_ENTRIES) {
            throw invalid(name + " has more than " + MAX_ENTRIES + " entries");
        }
        amounts.forEach((key, value) -> {
            if (key == null || !KEY.matcher(key).matches()) {
                throw invalid(name + " has a bad key");
            }
            if (value == null || value.abs().compareTo(MAX_AMOUNT) > 0 || (!allowNegative && value.signum() < 0)) {
                throw invalid(name + "." + key + " is out of range");
            }
            // A number like 1e-1500 is small enough, but jsonb gives it back as a 1500-digit string that
            // Jackson refuses to read, which would break every later read of the farmer's list
            if (value.stripTrailingZeros().scale() > MAX_AMOUNT_SCALE) {
                throw invalid(name + "." + key + " has more than " + MAX_AMOUNT_SCALE + " decimal places");
            }
        });
    }

    private static ApiException invalid(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED, message);
    }

    private void lock(UUID owner) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", (RowCallbackHandler) rs -> { },
                "calculations:" + owner);
    }
}
