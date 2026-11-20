package kz.agroadvisor.dashboard.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class DashboardServiceTest {

    @Test
    void changeIsAPercentOfThePreviousWindow() {
        assertThat(DashboardService.percentChange(150, 100)).isEqualTo(50);
        assertThat(DashboardService.percentChange(80, 100)).isEqualTo(-20);
    }

    @Test
    void changeIsZeroWhenThePreviousWindowHadNothing() {
        assertThat(DashboardService.percentChange(10, 0)).isZero();
        assertThat(DashboardService.percentChange(0, 0)).isZero();
    }
}
