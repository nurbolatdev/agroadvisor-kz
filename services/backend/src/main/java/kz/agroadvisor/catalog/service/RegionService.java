package kz.agroadvisor.catalog.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import java.io.Serializable;
import java.text.Collator;
import java.text.ParseException;
import java.text.RuleBasedCollator;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.catalog.model.Region;
import kz.agroadvisor.catalog.repository.RegionRepository;

/**
 * The regions of the registration form, in one language and sorted by name. The list changes only with a
 * migration, so the answer is cached in Redis per language (the views are {@link Serializable}); the cache is
 * cleared when the application starts ({@code CacheReset}, the name is in {@code spring.cache.cache-names}), so a
 * region added by a migration shows after the deployment, and in any case after the time to live.
 */
@Service
@Transactional(readOnly = true)
public class RegionService {

    /** Name of the cache of the region lists. */
    public static final String CACHE = "regions";

    private final RegionRepository regions;

    public RegionService(RegionRepository regions) {
        this.regions = regions;
    }

    @Cacheable(cacheNames = CACHE, key = "#lang")
    public List<RegionView> list(String lang) {
        Collator collator = collator(lang);
        return regions.findAll().stream()
                .map(region -> view(region, lang))
                .sorted(Comparator.comparing(RegionView::name, collator))
                .toList();
    }

    /**
     * The order of names in a language. The JDK has rules for Russian and English but none for Kazakh: it would
     * put the Kazakh letters (Қ, Ә, Ө, Ү, Ұ, І, ...) after Я, so "Қарағанды" would come last. The Kazakh rules
     * are the Russian ones plus the places of these letters in the Kazakh alphabet (each stands right after the
     * Cyrillic letter it is built on). No library is needed for ten names.
     */
    static Collator collator(String lang) {
        return "kk".equals(lang) ? KAZAKH : Collator.getInstance(Locale.forLanguageTag(lang));
    }

    private static final Collator KAZAKH = kazakhCollator();

    private static Collator kazakhCollator() {
        try {
            String russian = ((RuleBasedCollator) Collator.getInstance(Locale.forLanguageTag("ru"))).getRules();
            return new RuleBasedCollator(russian + "& а,А < ә,Ә & г,Г < ғ,Ғ & к,К < қ,Қ & н,Н < ң,Ң "
                    + "& о,О < ө,Ө & у,У < ұ,Ұ < ү,Ү & х,Х < һ,Һ & ы,Ы < і,І");
        } catch (ParseException e) {
            throw new IllegalStateException("The Kazakh collation rules are not valid", e);
        }
    }

    public boolean exists(long id) {
        return regions.existsById(id);
    }

    private static RegionView view(Region region, String lang) {
        return new RegionView(region.getId(), region.getCode(), CatalogLanguage.pick(region.getNames(), lang));
    }

    public record RegionView(
            @Schema(requiredMode = REQUIRED) long id,
            @Schema(requiredMode = REQUIRED) String code,
            @Schema(requiredMode = REQUIRED) String name) implements Serializable {
    }
}
