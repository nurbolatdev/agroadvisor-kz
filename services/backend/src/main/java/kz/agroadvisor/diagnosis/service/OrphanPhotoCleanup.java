package kz.agroadvisor.diagnosis.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import kz.agroadvisor.diagnosis.config.OrphanCleanupProperties;
import kz.agroadvisor.diagnosis.repository.DiagnosisRepository;

/**
 * Removes photo objects that no diagnosis points to (issue #69; the reasoning is in
 * {@code docs/adr/0002-orphan-photo-cleanup.md}). Every attempt writes an object of its own and a failed attempt
 * removes it when it knows there is no row; what is left is the objects of crashed attempts and of attempts whose
 * commit had an unknown outcome.
 *
 * <p>The deletion is irreversible, so every decision goes the safe way: only objects older than
 * {@code min-age} are looked at; a candidate is checked against the database twice (once while walking, once
 * right before the deletion); one run deletes at most {@code max-deletes-per-run}; if more than
 * {@code max-orphan-ratio} of the old objects look orphaned, something is wrong with the comparison itself and
 * the run deletes nothing; {@code dry-run} only counts. One instance works at a time (advisory lock); the limit
 * is per run, so several instances that run one after another (clock skew) can each delete up to the limit.
 *
 * <p>Invariant: "alive" means {@code diagnoses.photo_key}. A new table that refers to an object under
 * {@code diagnoses/} must be added to {@link DiagnosisRepository#findExistingPhotoKeys}.
 */
@Component
@ConditionalOnProperty(prefix = "app.photos.orphan-cleanup", name = "enabled", havingValue = "true",
        matchIfMissing = true)
public class OrphanPhotoCleanup {

    private static final Logger log = LoggerFactory.getLogger(OrphanPhotoCleanup.class);

    /** The folder of diagnosis photos in the bucket; documents of agrochemists live elsewhere and stay untouched. */
    static final String PREFIX = "diagnoses/";

    private static final String ORPHANS = "agroadvisor.photos.orphans";

    /** What one run did. All zeros and {@code ran = false} when the lock was held by another instance. */
    public record Summary(boolean ran, long scanned, long young, long found, long removed, long failed,
            boolean aborted, long durationMs) {

        static final Summary NOT_RUN = new Summary(false, 0, 0, 0, 0, 0, false, 0);
    }

    private final PhotoStorage photos;
    private final DiagnosisRepository diagnoses;
    private final ExclusiveRun lock;
    private final MeterRegistry meters;
    private final OrphanCleanupProperties props;
    private final Clock clock;
    private final AtomicLong lastSuccess = new AtomicLong();

    @Autowired
    public OrphanPhotoCleanup(PhotoStorage photos, DiagnosisRepository diagnoses, ExclusiveRun lock,
            MeterRegistry meters, OrphanCleanupProperties props) {
        this(photos, diagnoses, lock, meters, props, Clock.systemUTC());
    }

    OrphanPhotoCleanup(PhotoStorage photos, DiagnosisRepository diagnoses, ExclusiveRun lock, MeterRegistry meters,
            OrphanCleanupProperties props, Clock clock) {
        this.photos = photos;
        this.diagnoses = diagnoses;
        this.lock = lock;
        this.meters = meters;
        this.props = props;
        this.clock = clock;
        Gauge.builder("agroadvisor.photos.orphan_cleanup.last_success", lastSuccess, AtomicLong::get)
                .description("Epoch seconds of the last run of this instance that walked the whole bucket without "
                        + "aborting (a dry run counts; objects that could not be deleted are counted as outcome=failed)")
                .register(meters);
    }

    @Scheduled(cron = "${app.photos.orphan-cleanup.cron:0 30 3 * * *}", zone = "Asia/Almaty")
    void scheduled() {
        run();
    }

    /** One run; never throws, a failure is logged as ERROR and leaves the success time where it was. */
    Summary run() {
        Timer.Sample sample = Timer.start(meters);
        long started = System.nanoTime();
        try {
            AtomicReference<Summary> result = new AtomicReference<>(Summary.NOT_RUN);
            if (!lock.runExclusively(() -> result.set(sweep(started)))) {
                log.info("Orphaned photo cleanup skipped: another instance is running it");
                return Summary.NOT_RUN;
            }
            Summary summary = result.get();
            if (!summary.aborted()) {
                lastSuccess.set(clock.instant().getEpochSecond());
            }
            return summary;
        } catch (RuntimeException e) {
            log.error("Orphaned photo cleanup failed, nothing more is deleted in this run", e);
            return Summary.NOT_RUN;
        } finally {
            sample.stop(Timer.builder("agroadvisor.photos.orphan_cleanup.duration").register(meters));
        }
    }

    private Summary sweep(long startedNanos) {
        Instant youngerThan = clock.instant().minus(props.minAge());
        long scanned = 0;
        long young = 0;
        long checkedOld = 0;
        long found = 0;
        // Only as many candidates as one run may delete are kept; the rest is only counted
        List<String> candidates = new ArrayList<>();
        List<String> batch = new ArrayList<>(props.batchSize());

        try (Stream<StoredObject> objects = photos.list(PREFIX)) {
            Iterator<StoredObject> it = objects.iterator();
            while (it.hasNext()) {
                StoredObject object = it.next();
                if (object.key().endsWith("/")) {
                    continue; // a folder marker, not a photo
                }
                scanned++;
                if (object.lastModified().isAfter(youngerThan)) {
                    young++;
                    continue;
                }
                batch.add(object.key());
                if (batch.size() >= props.batchSize()) {
                    checkedOld += batch.size();
                    found += collectOrphans(batch, candidates);
                    batch.clear();
                }
            }
        }
        if (!batch.isEmpty()) {
            checkedOld += batch.size();
            found += collectOrphans(batch, candidates);
        }

        meters.counter(ORPHANS, "outcome", "skipped_young").increment(young);
        meters.counter(ORPHANS, "outcome", "found").increment(found);

        boolean aborted = checkedOld > 0 && (double) found / checkedOld > props.maxOrphanRatio();
        long removed = 0;
        long failed = 0;
        if (aborted) {
            log.error("Orphaned photo cleanup aborted, nothing is deleted: {} of {} old objects look orphaned "
                    + "(more than the allowed share {}). Check the comparison of storage keys with diagnoses.photo_key "
                    + "before anything is deleted.", found, checkedOld, props.maxOrphanRatio());
            meters.counter(ORPHANS, "outcome", "aborted").increment();
        } else if (props.dryRun()) {
            log.info("Orphaned photo cleanup (dry run): {} orphans found, nothing is deleted", found);
        } else {
            List<String> toRemove = stillOrphans(candidates);
            List<String> notRemoved = toRemove.isEmpty() ? List.of() : photos.deleteAll(toRemove);
            failed = notRemoved.size();
            removed = toRemove.size() - failed;
            notRemoved.forEach(key -> log.warn("Orphaned photo '{}' could not be removed", key));
            if (found > candidates.size()) {
                log.info("Orphaned photo cleanup: {} orphans found, the limit of {} per run applies, the rest waits "
                        + "for the next run", found, props.maxDeletesPerRun());
            }
            meters.counter(ORPHANS, "outcome", "removed").increment(removed);
            meters.counter(ORPHANS, "outcome", "failed").increment(failed);
        }

        long durationMs = Duration.ofNanos(System.nanoTime() - startedNanos).toMillis();
        Summary summary = new Summary(true, scanned, young, found, removed, failed, aborted, durationMs);
        log.info("Orphaned photo cleanup done: scanned={} young={} found={} removed={} failed={} aborted={} "
                + "dryRun={} durationMs={}", scanned, young, found, removed, failed, aborted, props.dryRun(), durationMs);
        return summary;
    }

    /** Adds the keys of the batch that no diagnosis points to to {@code candidates} (within the limit); returns how many. */
    private long collectOrphans(List<String> batch, List<String> candidates) {
        Set<String> live = diagnoses.findExistingPhotoKeys(batch);
        long orphans = 0;
        for (String key : batch) {
            if (!live.contains(key)) {
                orphans++;
                if (candidates.size() < props.maxDeletesPerRun()) {
                    candidates.add(key);
                }
            }
        }
        return orphans;
    }

    /** The candidates minus those a diagnosis points to by now: the last look at the database before the deletion. */
    private List<String> stillOrphans(List<String> candidates) {
        List<String> result = new ArrayList<>(candidates.size());
        for (int from = 0; from < candidates.size(); from += props.batchSize()) {
            List<String> chunk = candidates.subList(from, Math.min(from + props.batchSize(), candidates.size()));
            Set<String> live = diagnoses.findExistingPhotoKeys(chunk);
            for (String key : chunk) {
                if (live.contains(key)) {
                    log.warn("Orphan candidate '{}' is referenced by a diagnosis now, it is kept", key);
                } else {
                    result.add(key);
                }
            }
        }
        return result;
    }
}
