package kz.agroadvisor.consultations.service;

import java.time.Duration;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.common.ratelimit.RateLimitProperties;
import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;
import kz.agroadvisor.consultations.repository.ConsultationRepository;
import kz.agroadvisor.consultations.repository.ConsultationRepository.Item;
import kz.agroadvisor.diagnosis.service.DiagnosisService;
import kz.agroadvisor.verification.service.AgrochemistDirectoryService;

/**
 * Consultations between a farmer and a verified agrochemist. Another user's consultation is "not found",
 * the same as a missing one.
 */
@Service
public class ConsultationService {

    /** The most requests of one farmer that may wait for an answer at the same time. */
    public static final int MAX_PENDING_REQUESTS = 5;
    /** The longest text of a request or a message. */
    public static final int MAX_TEXT_LENGTH = 2000;

    private final ConsultationRepository consultations;
    private final AgrochemistDirectoryService directory;
    private final DiagnosisService diagnoses;
    private final RateLimiter rateLimiter;
    private final RateLimitProperties limits;
    private final JdbcTemplate jdbc;

    public ConsultationService(ConsultationRepository consultations, AgrochemistDirectoryService directory,
            DiagnosisService diagnoses, RateLimiter rateLimiter, RateLimitProperties limits, JdbcTemplate jdbc) {
        this.consultations = consultations;
        this.directory = directory;
        this.diagnoses = diagnoses;
        this.rateLimiter = rateLimiter;
        this.limits = limits;
        this.jdbc = jdbc;
    }

    /**
     * A farmer asks a listed agrochemist for a consultation. The text becomes the first message of the chat;
     * {@code diagnosisId} (optional) must be one of the farmer's own diagnoses. The attempt counts against the
     * hourly limit before anything is written, and is not given back.
     */
    @Transactional
    public Item request(UUID farmer, UUID agrochemistId, String text, UUID diagnosisId) {
        String body = text == null ? "" : text.strip();
        if (body.isEmpty() || body.length() > MAX_TEXT_LENGTH) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
                    "The text must have 1 to " + MAX_TEXT_LENGTH + " characters");
        }
        rateLimiter.check("consultation-requests", farmer.toString(), limits.consultationRequestsPerHour(),
                Duration.ofHours(1));
        directory.requireListed(agrochemistId);
        if (diagnosisId != null) {
            diagnoses.get(farmer, diagnosisId); // a foreign or missing diagnosis is a 404 of its own
        }

        // One farmer asks one agrochemist at a time, so two requests cannot both pass the checks below
        lock(farmer);
        consultations.findOpenId(farmer, agrochemistId).ifPresent(id -> {
            throw alreadyOpen(id);
        });
        if (consultations.countPending(farmer) >= MAX_PENDING_REQUESTS) {
            throw new ApiException(HttpStatus.CONFLICT, ConsultationErrors.CONSULTATION_REQUEST_LIMIT,
                    "You can have at most " + MAX_PENDING_REQUESTS + " requests waiting for an answer");
        }

        ConsultationRepository.Consultation created;
        try {
            created = consultations.insert(farmer, agrochemistId, diagnosisId);
        } catch (DuplicateKeyException e) {
            // The advisory lock makes this unreachable for one farmer; the unique index is the last guard
            throw new ApiException(HttpStatus.CONFLICT, ConsultationErrors.CONSULTATION_ALREADY_OPEN,
                    "There is already an open consultation with this agrochemist");
        }
        consultations.insertMessage(created.id(), farmer, body);
        return consultations.findForParticipant(created.id(), farmer).orElseThrow();
    }

    private static ApiException alreadyOpen(UUID id) {
        return new ApiException(HttpStatus.CONFLICT, ConsultationErrors.CONSULTATION_ALREADY_OPEN,
                "There is already an open consultation with this agrochemist")
                .withHeader(HttpHeaders.LOCATION, "/api/consultations/" + id);
    }

    private void lock(UUID farmer) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", (RowCallbackHandler) rs -> { },
                "consultations:" + farmer);
    }
}
