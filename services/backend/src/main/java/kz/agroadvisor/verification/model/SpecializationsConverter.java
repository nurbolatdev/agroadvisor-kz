package kz.agroadvisor.verification.model;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Keeps a set of specializations in the one text column of {@code agrochemist_profiles}: the codes in the order of
 * the enum, joined by commas ({@code plant_protection,agrochemistry}). The comma-separated string exists only in the
 * database; the code works with {@code Set<Specialization>}.
 *
 * <p>A text column cannot be filtered by one specialization with an index. When the agrochemists are filtered by
 * it (M13) the column should become {@code text[]} or a table of its own (the tails list).
 */
@Converter
public class SpecializationsConverter implements AttributeConverter<Set<Specialization>, String> {

    private static final String SEPARATOR = ",";

    @Override
    public String convertToDatabaseColumn(Set<Specialization> specializations) {
        if (specializations == null || specializations.isEmpty()) {
            return null;
        }
        return EnumSet.copyOf(specializations).stream().map(Specialization::code)
                .collect(Collectors.joining(SEPARATOR));
    }

    /** An unknown code in the column (a row written by hand) is skipped, not an error: the profile must still load. */
    @Override
    public Set<Specialization> convertToEntityAttribute(String stored) {
        Set<Specialization> result = EnumSet.noneOf(Specialization.class);
        if (stored == null || stored.isBlank()) {
            return result;
        }
        Arrays.stream(stored.split(SEPARATOR)).map(String::trim).map(Specialization::fromCode)
                .flatMap(java.util.Optional::stream).forEach(result::add);
        return result;
    }
}
