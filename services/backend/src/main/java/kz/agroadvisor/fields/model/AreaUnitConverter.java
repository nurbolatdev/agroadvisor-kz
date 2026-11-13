package kz.agroadvisor.fields.model;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class AreaUnitConverter implements AttributeConverter<AreaUnit, String> {

    @Override
    public String convertToDatabaseColumn(AreaUnit unit) {
        return unit == null ? null : unit.code();
    }

    @Override
    public AreaUnit convertToEntityAttribute(String code) {
        return code == null ? null : AreaUnit.fromCode(code);
    }
}
