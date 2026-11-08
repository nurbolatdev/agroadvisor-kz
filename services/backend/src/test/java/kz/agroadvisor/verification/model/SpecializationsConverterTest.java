package kz.agroadvisor.verification.model;

import java.util.EnumSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SpecializationsConverterTest {

    private final SpecializationsConverter converter = new SpecializationsConverter();

    @Test
    void storesTheCodesInTheOrderOfTheEnumJoinedByCommas() {
        Set<Specialization> given = EnumSet.of(Specialization.SOIL_SCIENCE, Specialization.PLANT_PROTECTION);

        assertThat(converter.convertToDatabaseColumn(given)).isEqualTo("plant_protection,soil_science");
    }

    @Test
    void readsWhatItWrote() {
        Set<Specialization> all = EnumSet.allOf(Specialization.class);

        assertThat(converter.convertToEntityAttribute(converter.convertToDatabaseColumn(all))).isEqualTo(all);
    }

    @Test
    void nothingIsStoredAsNullAndNullOrBlankReadsAsNothing() {
        assertThat(converter.convertToDatabaseColumn(Set.of())).isNull();
        assertThat(converter.convertToDatabaseColumn(null)).isNull();
        assertThat(converter.convertToEntityAttribute(null)).isEmpty();
        assertThat(converter.convertToEntityAttribute("  ")).isEmpty();
    }

    @Test
    void anUnknownCodeInTheColumnIsSkippedSoTheProfileStillLoads() {
        assertThat(converter.convertToEntityAttribute("agrochemistry, astrology ,plant_protection"))
                .containsExactlyInAnyOrder(Specialization.AGROCHEMISTRY, Specialization.PLANT_PROTECTION);
    }

    @Test
    void allFourColumnValuesFitTheColumn() {
        // varchar(160) in V3: the longest possible value is every code once
        assertThat(converter.convertToDatabaseColumn(EnumSet.allOf(Specialization.class)).length())
                .isLessThanOrEqualTo(160);
    }
}
