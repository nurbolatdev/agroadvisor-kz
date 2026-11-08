package kz.agroadvisor.diagnosis.service;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import javax.sql.DataSource;

import com.zaxxer.hikari.HikariDataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * A session-level PostgreSQL advisory lock taken on a connection of its own for as long as the job runs. The
 * lock belongs to the session, so it is released explicitly in {@code finally}; if that fails the connection is
 * closed for real (aborted) instead of going back to the pool with the lock still held.
 */
@Component
public class PostgresAdvisoryLock implements ExclusiveRun {

    private static final Logger log = LoggerFactory.getLogger(PostgresAdvisoryLock.class);

    /** Arbitrary constant that identifies the orphaned photo cleanup among the advisory locks of the database. */
    static final long ORPHAN_PHOTO_CLEANUP = 0x4147_524F_5048_4F54L;

    private final DataSource dataSource;
    private final long lockId;

    @Autowired
    public PostgresAdvisoryLock(DataSource dataSource) {
        this(dataSource, ORPHAN_PHOTO_CLEANUP);
    }

    PostgresAdvisoryLock(DataSource dataSource, long lockId) {
        this.dataSource = dataSource;
        this.lockId = lockId;
    }

    @Override
    public boolean runExclusively(Runnable job) {
        try (Connection connection = dataSource.getConnection()) {
            if (!tryLock(connection)) {
                return false;
            }
            try {
                job.run();
            } finally {
                unlock(connection);
            }
            return true;
        } catch (SQLException e) {
            throw new IllegalStateException("The advisory lock could not be taken: " + e.getMessage(), e);
        }
    }

    private boolean tryLock(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("select pg_try_advisory_lock(?)")) {
            statement.setLong(1, lockId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() && result.getBoolean(1);
            }
        }
    }

    private void unlock(Connection connection) {
        try (PreparedStatement statement = connection.prepareStatement("select pg_advisory_unlock(?)")) {
            statement.setLong(1, lockId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next() || !result.getBoolean(1)) {
                    log.error("The advisory lock {} was not held when it was released", lockId);
                }
            }
        } catch (SQLException e) {
            // Closing a pooled connection returns it with the session (and the lock) alive: drop the session
            log.error("Releasing the advisory lock {} failed, the connection is discarded: {}", lockId, e.toString());
            try {
                if (dataSource.isWrapperFor(HikariDataSource.class)) {
                    // Marks the connection as broken, so the pool closes it and never hands it out again
                    dataSource.unwrap(HikariDataSource.class).evictConnection(connection);
                } else {
                    connection.unwrap(Connection.class).abort(Runnable::run);
                }
            } catch (SQLException | RuntimeException abortFailure) {
                log.error("The connection could not be discarded: {}", abortFailure.toString());
            }
        }
    }
}
