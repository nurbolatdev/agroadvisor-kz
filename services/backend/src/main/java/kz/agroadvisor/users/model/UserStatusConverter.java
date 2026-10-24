package kz.agroadvisor.users.model;

import java.util.Locale;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class UserStatusConverter implements AttributeConverter<UserStatus, String> {

    @Override
    public String convertToDatabaseColumn(UserStatus status) {
        return status == null ? null : status.code();
    }

    @Override
    public UserStatus convertToEntityAttribute(String code) {
        return code == null ? null : UserStatus.valueOf(code.toUpperCase(Locale.ROOT));
    }
}
