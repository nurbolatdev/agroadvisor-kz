package kz.agroadvisor.catalog.service;

import java.util.List;
import java.util.Map;

/** Picks one language out of the {@code jsonb {ru,kk,en}} translations. */
public final class CatalogLanguage {

    public static final String DEFAULT = "ru";

    private static final List<String> SUPPORTED = List.of("ru", "kk", "en");

    private CatalogLanguage() {
    }

    /**
     * Resolves the explicit {@code lang} parameter first, then the first tag of
     * {@code Accept-Language}; anything unsupported falls back to {@link #DEFAULT}.
     */
    public static String resolve(String lang, String acceptLanguage) {
        String fromParam = normalize(lang);
        if (fromParam != null) {
            return fromParam;
        }
        if (acceptLanguage != null) {
            for (String part : acceptLanguage.split(",")) {
                String fromHeader = normalize(part.split(";")[0]);
                if (fromHeader != null) {
                    return fromHeader;
                }
            }
        }
        return DEFAULT;
    }

    /** The text in {@code lang}, else Russian, else English, else null. */
    public static <T> T pick(Map<String, T> translations, String lang) {
        if (translations == null) {
            return null;
        }
        for (String candidate : List.of(lang, DEFAULT, "en")) {
            T value = translations.get(candidate);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static String normalize(String tag) {
        if (tag == null) {
            return null;
        }
        String language = tag.trim().toLowerCase();
        int dash = language.indexOf('-');
        if (dash > 0) {
            language = language.substring(0, dash);
        }
        return SUPPORTED.contains(language) ? language : null;
    }
}
