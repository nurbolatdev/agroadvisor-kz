package kz.agroadvisor.users.model;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class RoleConverter implements AttributeConverter<Role, String> {

    @Override
    public String convertToDatabaseColumn(Role role) {
        return role == null ? null : role.code();
    }

    @Override
    public Role convertToEntityAttribute(String code) {
        return code == null ? null : Role.fromCode(code);
    }
}
