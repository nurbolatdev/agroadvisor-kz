package kz.agroadvisor.diagnosis.service;

/** Lets a job run on one instance at a time. */
public interface ExclusiveRun {

    /**
     * Runs the job if no other instance runs it now.
     *
     * @return {@code false} when another instance holds the lock and the job was not run
     */
    boolean runExclusively(Runnable job);
}
