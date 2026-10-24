package kz.agroadvisor.users.model;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * A normalized login: either a phone in E.164 form or an e-mail in lower case.
 *
 * <p>The database keeps e-mails unique ignoring case, so the same normalization is applied
 * on registration and on login.
 */
public record Login(Type type, String value) {

    public enum Type { PHONE, EMAIL }

    private static final Pattern E164 = Pattern.compile("^\\+[1-9][0-9]{6,14}$");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final int EMAIL_MAX_LENGTH = 120;

    /** @throws IllegalArgumentException if the text is neither a phone nor an e-mail */
    public static Login parse(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Login is empty");
        }
        String text = raw.trim();
        if (text.contains("@")) {
            String email = text.toLowerCase(Locale.ROOT);
            if (email.length() > EMAIL_MAX_LENGTH || !EMAIL.matcher(email).matches()) {
                throw new IllegalArgumentException("Invalid e-mail");
            }
            return new Login(Type.EMAIL, email);
        }
        return new Login(Type.PHONE, normalizePhone(text));
    }

    private static String normalizePhone(String text) {
        String digits = text.replaceAll("[\\s\\-().]", "");
        // Kazakhstan numbers are often typed as 8 7xx xxx xx xx or 7 7xx xxx xx xx
        if (digits.matches("^8[0-9]{10}$")) {
            digits = "+7" + digits.substring(1);
        } else if (digits.matches("^7[0-9]{10}$")) {
            digits = "+" + digits;
        }
        if (!E164.matcher(digits).matches()) {
            throw new IllegalArgumentException("Invalid phone");
        }
        return digits;
    }
}
