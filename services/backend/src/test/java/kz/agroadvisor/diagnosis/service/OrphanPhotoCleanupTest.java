package kz.agroadvisor.diagnosis.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import kz.agroadvisor.diagnosis.config.OrphanCleanupProperties;
import kz.agroadvisor.diagnosis.repository.DiagnosisRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OrphanPhotoCleanupTest {

    private static final Instant NOW = Instant.parse("2026-11-08T00:00:00Z");
    private static final Instant OLD = NOW.minus(Duration.ofHours(48));
    private static final Instant YOUNG = NOW.minus(Duration.ofHours(1));

    private final PhotoStorage photos = mock(PhotoStorage.class);
    private final DiagnosisRepository diagnoses = mock(DiagnosisRepository.class);
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
    /** The keys some diagnosis points to; the repository answers with the intersection. */
    private final Set<String> live = new HashSet<>();
    private boolean lockFree = true;
    /** What the storage lists. */
    private final List<StoredObject> stored = new ArrayList<>();

    private OrphanPhotoCleanup cleanup(boolean dryRun, int batchSize, int maxDeletes, double maxRatio) {
        OrphanCleanupProperties props = new OrphanCleanupProperties(true, dryRun, Duration.ofHours(24),
                "0 30 3 * * *", batchSize, maxDeletes, maxRatio);
        when(photos.list("diagnoses/")).thenAnswer(call -> stored.stream());
        when(diagnoses.findExistingPhotoKeys(anyCollection())).thenAnswer(call -> {
            Collection<String> asked = call.getArgument(0);
            Set<String> answer = new HashSet<>(asked);
            answer.retainAll(live);
            return answer;
        });
        when(photos.deleteAll(anyCollection())).thenReturn(List.of());
        ExclusiveRun lock = job -> {
            if (!lockFree) {
                return false;
            }
            job.run();
            return true;
        };
        return new OrphanPhotoCleanup(photos, diagnoses, lock, meters, props, clock);
    }

    private OrphanPhotoCleanup cleanup(boolean dryRun) {
        return cleanup(dryRun, 500, 500, 0.2);
    }

    private String old(String name) {
        String key = "diagnoses/u/" + name + ".jpg";
        stored.add(new StoredObject(key, OLD));
        return key;
    }

    private String liveOld(String name) {
        String key = old(name);
        live.add(key);
        return key;
    }

    private double count(String outcome) {
        var counter = meters.find("agroadvisor.photos.orphans").tag("outcome", outcome).counter();
        return counter == null ? 0 : counter.count();
    }

    private double lastSuccess() {
        return meters.get("agroadvisor.photos.orphan_cleanup.last_success").gauge().value();
    }

    /** Fills the bucket with enough live old objects that a few orphans stay below the allowed share. */
    private void livePadding(int n) {
        IntStream.range(0, n).forEach(i -> liveOld("live" + i));
    }

    @Test
    void anEmptyBucketDoesNothingAndCountsAsASuccess() {
        var summary = cleanup(false).run();

        assertThat(summary.ran()).isTrue();
        assertThat(summary.scanned()).isZero();
        verify(diagnoses, never()).findExistingPhotoKeys(anyCollection());
        verify(photos, never()).deleteAll(anyCollection());
        assertThat(lastSuccess()).isEqualTo(NOW.getEpochSecond());
    }

    @Test
    void removesAnOldObjectNoDiagnosisPointsTo() {
        livePadding(9);
        String orphan = old("orphan");

        var summary = cleanup(false).run();

        assertThat(summary.found()).isEqualTo(1);
        assertThat(summary.removed()).isEqualTo(1);
        verify(photos).deleteAll(List.of(orphan));
        assertThat(count("found")).isEqualTo(1);
        assertThat(count("removed")).isEqualTo(1);
    }

    @Test
    void doesNotRemoveAnObjectADiagnosisPointsTo() {
        livePadding(10);

        var summary = cleanup(false).run();

        assertThat(summary.found()).isZero();
        verify(photos, never()).deleteAll(anyCollection());
    }

    @Test
    void doesNotTouchAnObjectYoungerThanTheMinimumAgeEvenWithoutARow() {
        livePadding(10);
        stored.add(new StoredObject("diagnoses/u/fresh.jpg", YOUNG));

        var summary = cleanup(false).run();

        assertThat(summary.young()).isEqualTo(1);
        assertThat(summary.found()).isZero();
        verify(photos, never()).deleteAll(anyCollection());
        ArgumentCaptor<Collection<String>> asked = ArgumentCaptor.forClass(Collection.class);
        verify(diagnoses, times(1)).findExistingPhotoKeys(asked.capture());
        assertThat(asked.getValue()).doesNotContain("diagnoses/u/fresh.jpg"); // not even looked up
        assertThat(count("skipped_young")).isEqualTo(1);
    }

    @Test
    void anObjectExactlyAtTheMinimumAgeIsOldEnough() {
        livePadding(9);
        stored.add(new StoredObject("diagnoses/u/edge.jpg", NOW.minus(Duration.ofHours(24))));

        assertThat(cleanup(false).run().found()).isEqualTo(1);
    }

    @Test
    void aDryRunCountsTheOrphansButDeletesNothing() {
        livePadding(9);
        old("orphan");

        var summary = cleanup(true).run();

        assertThat(summary.found()).isEqualTo(1);
        assertThat(summary.removed()).isZero();
        verify(photos, never()).deleteAll(anyCollection());
        verify(photos, never()).delete(anyString());
        assertThat(count("found")).isEqualTo(1);
        assertThat(count("removed")).isZero();
        assertThat(lastSuccess()).isEqualTo(NOW.getEpochSecond());
    }

    @Test
    void tooLargeAShareOfOrphansAbortsTheRunAndDeletesNothing() {
        // 3 of 10 old objects look orphaned: above the allowed 0.2
        livePadding(7);
        old("a");
        old("b");
        old("c");

        var summary = cleanup(false).run();

        assertThat(summary.aborted()).isTrue();
        assertThat(summary.removed()).isZero();
        verify(photos, never()).deleteAll(anyCollection());
        assertThat(count("aborted")).isEqualTo(1);
        assertThat(lastSuccess()).isZero(); // an aborted run is not a success
    }

    @Test
    void aShareExactlyAtTheLimitIsAllowed() {
        livePadding(8);
        old("a");
        old("b"); // 2 of 10 = 0.2

        var summary = cleanup(false).run();

        assertThat(summary.aborted()).isFalse();
        assertThat(summary.removed()).isEqualTo(2);
    }

    @Test
    void theLimitPerRunIsKept() {
        livePadding(90);
        List<String> orphans = IntStream.range(0, 10).mapToObj(i -> old("orphan" + i)).toList();

        var summary = cleanup(false, 500, 3, 0.2).run();

        assertThat(summary.found()).isEqualTo(10);
        assertThat(summary.removed()).isEqualTo(3);
        ArgumentCaptor<Collection<String>> deleted = ArgumentCaptor.forClass(Collection.class);
        verify(photos).deleteAll(deleted.capture());
        assertThat(deleted.getValue()).hasSize(3).isSubsetOf(orphans);
    }

    @Test
    void walksTheBucketInBatchesAndAsksTheDatabaseOnceMoreBeforeDeleting() {
        livePadding(8);
        old("o1");
        old("o2"); // 10 old objects, batches of 4: 4 + 4 + 2, then one recheck of the 2 candidates

        OrphanPhotoCleanup job = cleanup(false, 4, 500, 0.2);
        // the batch list is reused by the job, so the size is noted at the moment of each question
        List<Integer> sizes = new ArrayList<>();
        when(diagnoses.findExistingPhotoKeys(anyCollection())).thenAnswer(call -> {
            Collection<String> asked = call.getArgument(0);
            sizes.add(asked.size());
            Set<String> answer = new HashSet<>(asked);
            answer.retainAll(live);
            return answer;
        });

        job.run();

        assertThat(sizes).containsExactly(4, 4, 2, 2);
    }

    @Test
    void aCandidateThatBecameLiveBeforeTheDeletionIsKept() {
        livePadding(9);
        String late = old("late");
        // the first look (while walking) finds no row; by the second one (before deleting) a diagnosis points to it
        when(photos.list("diagnoses/")).thenAnswer(call -> stored.stream());
        OrphanPhotoCleanup job = cleanup(false);
        when(diagnoses.findExistingPhotoKeys(anyCollection())).thenAnswer(call -> {
            Collection<String> asked = call.getArgument(0);
            Set<String> answer = new HashSet<>(asked);
            answer.retainAll(live);
            if (asked.size() == 1 && asked.contains(late)) { // the recheck of the candidates
                answer.add(late);
            }
            return answer;
        });

        var summary = job.run();

        assertThat(summary.found()).isEqualTo(1);
        assertThat(summary.removed()).isZero();
        verify(photos, never()).deleteAll(anyCollection());
    }

    @Test
    void aPartiallyFailedDeletionIsCountedAndDoesNotThrow() {
        livePadding(8);
        old("a");
        String stuck = old("b");
        OrphanPhotoCleanup job = cleanup(false);
        when(photos.deleteAll(anyCollection())).thenReturn(List.of(stuck));

        var summary = job.run();

        assertThat(summary.removed()).isEqualTo(1);
        assertThat(summary.failed()).isEqualTo(1);
        assertThat(count("removed")).isEqualTo(1);
        assertThat(count("failed")).isEqualTo(1);
    }

    @Test
    void doesNothingWhenAnotherInstanceHoldsTheLock() {
        lockFree = false;
        old("orphan");

        var summary = cleanup(false).run();

        assertThat(summary.ran()).isFalse();
        verify(photos, never()).list(anyString());
        verify(photos, never()).deleteAll(anyCollection());
        assertThat(lastSuccess()).isZero();
    }

    @Test
    void aStorageFailureWhileWalkingDeletesNothingAndDoesNotThrow() {
        OrphanPhotoCleanup job = cleanup(false);
        when(photos.list("diagnoses/")).thenReturn(Stream.generate(() -> {
            throw new IllegalStateException("storage down");
        }));

        var summary = job.run();

        assertThat(summary.ran()).isFalse();
        verify(photos, never()).deleteAll(anyCollection());
        assertThat(lastSuccess()).isZero();
    }

    @Test
    void aDatabaseFailureDeletesNothingAndDoesNotThrow() {
        livePadding(9);
        old("orphan");
        OrphanPhotoCleanup job = cleanup(false);
        when(diagnoses.findExistingPhotoKeys(anyCollection())).thenThrow(new IllegalStateException("db down"));

        assertThat(job.run().ran()).isFalse();
        verify(photos, never()).deleteAll(any());
    }

    @Test
    void theRunIsTimed() {
        cleanup(true).run();

        assertThat(meters.get("agroadvisor.photos.orphan_cleanup.duration").timer().count()).isEqualTo(1);
    }
}
