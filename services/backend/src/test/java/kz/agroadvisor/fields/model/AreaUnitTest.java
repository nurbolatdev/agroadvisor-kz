package kz.agroadvisor.fields.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

class AreaUnitTest {

    @Test
    void hectaresStayAsTheyAre() {
        assertThat(AreaUnit.HA.toHectares(new BigDecimal("2.5"))).isEqualByComparingTo("2.5");
    }

    @Test
    void sotkiAreHundredthsOfAHectare() {
        assertThat(AreaUnit.SOTKA.toHectares(new BigDecimal("250"))).isEqualByComparingTo("2.5");
        assertThat(AreaUnit.SOTKA.toHectares(new BigDecimal("0.01"))).isEqualByComparingTo("0.0001");
    }

    @Test
    void convertsBackWithoutTrailingZeros() {
        assertThat(AreaUnit.SOTKA.fromHectares(new BigDecimal("2.5000"))).isEqualTo(new BigDecimal("250"));
        assertThat(AreaUnit.HA.fromHectares(new BigDecimal("2.5000"))).isEqualTo(new BigDecimal("2.5"));
        assertThat(AreaUnit.HA.fromHectares(new BigDecimal("10.0000"))).isEqualTo(new BigDecimal("10"));
    }

    @Test
    void codesAreHaAndSotka() {
        assertThat(AreaUnit.HA.code()).isEqualTo("ha");
        assertThat(AreaUnit.SOTKA.code()).isEqualTo("sotka");
        assertThat(AreaUnit.fromCode("sotka")).isEqualTo(AreaUnit.SOTKA);
    }

    @Test
    void unknownCodeIsRejected() {
        assertThatThrownBy(() -> AreaUnit.fromCode("acre")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AreaUnit.fromCode(null)).isInstanceOf(IllegalArgumentException.class);
    }
}
