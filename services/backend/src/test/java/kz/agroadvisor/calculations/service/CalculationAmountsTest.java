package kz.agroadvisor.calculations.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import kz.agroadvisor.common.web.ApiException;

class CalculationAmountsTest {

    @Test
    void acceptsSimpleKeysAndAmounts() {
        assertThatCode(() -> CalculationService.requireAmounts("costs",
                Map.of("seed", BigDecimal.TEN, "fuel_2", BigDecimal.ZERO), false)).doesNotThrowAnyException();
    }

    @Test
    void costsCannotBeNegativeButResultsCan() {
        Map<String, BigDecimal> loss = Map.of("profit", new BigDecimal("-100"));

        assertThatCode(() -> CalculationService.requireAmounts("results", loss, true)).doesNotThrowAnyException();
        assertThatThrownBy(() -> CalculationService.requireAmounts("costs", loss, false))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void refusesBadKeysHugeAmountsAndTooManyEntries() {
        assertThatThrownBy(() -> CalculationService.requireAmounts("costs", Map.of("1st", BigDecimal.ONE), false))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> CalculationService.requireAmounts("costs",
                Map.of("seed", new BigDecimal("1000000000001")), false)).isInstanceOf(ApiException.class);

        Map<String, BigDecimal> many = new HashMap<>();
        for (int i = 0; i <= CalculationService.MAX_ENTRIES; i++) {
            many.put("item" + i, BigDecimal.ONE);
        }
        assertThatThrownBy(() -> CalculationService.requireAmounts("costs", many, false))
                .isInstanceOf(ApiException.class);
    }
}
