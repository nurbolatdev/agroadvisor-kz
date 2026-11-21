package kz.agroadvisor.community.service;

import static kz.agroadvisor.community.service.CommunityQuestionService.hasControlChars;
import static kz.agroadvisor.community.service.CommunityQuestionService.normalize;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;
import kz.agroadvisor.community.repository.CommunityAnswerRepository;
import kz.agroadvisor.community.repository.CommunityQuestionRepository;
import kz.agroadvisor.users.service.UserAdminService;
import kz.agroadvisor.community.repository.CommunityComplaintRepository;
import kz.agroadvisor.community.repository.CommunityComplaintRepository.ReasonCount;
import kz.agroadvisor.community.repository.CommunityComplaintRepository.ReportComment;
import kz.agroadvisor.community.repository.CommunityComplaintRepository.Row;

/** The admin side of moderation: the list of cases, one case and the numbers of the page. */
@Service
public class CommunityModerationService {

    public static final int MAX_PAGE_SIZE = 100;
    public static final int MAX_COMMENTS = 5;
    private static final Set<String> STATUSES = Set.of("new", "in_progress", "resolved");
    private static final Set<String> TARGET_TYPES = Set.of(CommunityReportService.QUESTION,
            CommunityReportService.ANSWER);

    /** What the admin sees about a case. */
    public record ComplaintView(UUID id, String status, String reason, List<ReasonCount> reports,
            List<String> comments, Instant createdAt, Resolution resolution, Target target, Author author) {
    }

    /** The decision; null in the view while the case is not resolved. */
    public record Resolution(String action, String comment, Instant resolvedAt) {
    }

    /** The question or answer the case is about, shown even when hidden. */
    public record Target(String type, UUID questionId, UUID answerId, String questionTitle, String body,
            String cropCode, long regionId, int photoCount, List<String> photoUrls, boolean hidden,
            Instant createdAt) {
    }

    /** The author of the target; {@code hiddenCount} is the history of the author. */
    public record Author(UUID id, String name, String role, boolean expert, String status, int hiddenCount,
            Instant registeredAt) {
    }

    /** The numbers of the moderation page; the mean is null when nothing was decided this week. */
    public record Stats(int complaintsToday, Double avgResolutionMinutes, int resolvedThisWeek, int newComplaints) {
    }

    public static final Set<String> ACTIONS = Set.of("keep", "hide", "block");

    private final CommunityComplaintRepository complaints;
    private final CommunityQuestionRepository questions;
    private final CommunityAnswerRepository answers;
    private final UserAdminService users;
    private final Clock clock;

    public CommunityModerationService(CommunityComplaintRepository complaints, CommunityQuestionRepository questions,
            CommunityAnswerRepository answers, UserAdminService users, Clock clock) {
        this.complaints = complaints;
        this.questions = questions;
        this.answers = answers;
        this.users = users;
        this.clock = clock;
    }

    /**
     * Takes a new case into work. A case already in work stays as it is, a resolved one is a conflict.
     */
    @Transactional
    public ComplaintView start(UUID adminId, UUID id) {
        var locked = complaints.lock(id).orElseThrow(CommunityModerationService::complaintNotFound);
        if ("resolved".equals(locked.status())) {
            throw resolved();
        }
        if ("new".equals(locked.status())) {
            complaints.markInProgress(id);
        }
        return get(id);
    }

    /**
     * Decides the case. {@code keep} leaves the target, {@code hide} hides it, {@code block} hides it and blocks
     * its author by the rules of the users module (an admin or oneself cannot be blocked); everything happens in
     * one transaction, so a refused block leaves the target visible and the case open.
     */
    @Transactional
    public ComplaintView resolve(UUID adminId, UUID id, String action, String comment, String lang) {
        if (action == null || !ACTIONS.contains(action)) {
            throw validation("The action must be one of keep, hide, block");
        }
        String note = comment == null ? null : normalize(comment);
        if (note != null && (note.length() > CommunityReportService.MAX_COMMENT || hasControlChars(note, true))) {
            throw validation("The comment must have up to " + CommunityReportService.MAX_COMMENT
                    + " characters, without control characters");
        }
        if (note != null && note.isEmpty()) {
            note = null;
        }
        var locked = complaints.lock(id).orElseThrow(CommunityModerationService::complaintNotFound);
        if ("resolved".equals(locked.status())) {
            throw resolved();
        }
        if (!"keep".equals(action)) {
            if (locked.answerId() == null) {
                questions.setHidden(locked.questionId(), adminId, true);
            } else {
                answers.setHidden(locked.answerId(), adminId, true);
            }
        }
        if ("block".equals(action)) {
            UUID author = complaints.find(id).orElseThrow(CommunityModerationService::complaintNotFound).authorId();
            users.changeStatus(adminId, author, "blocked", lang);
        }
        complaints.markResolved(id, adminId, action, note);
        return get(id);
    }

    /** Hides the question for everyone or brings it back; repeating the same change does nothing. */
    @Transactional
    public void setQuestionHidden(UUID adminId, UUID questionId, boolean hidden) {
        if (!questions.setHidden(questionId, adminId, hidden)) {
            throw new ApiException(HttpStatus.NOT_FOUND, CommunityErrors.QUESTION_NOT_FOUND, "Question not found");
        }
    }

    /**
     * Hides the answer or brings it back. Hiding the best answer makes its question open again; bringing it
     * back does not choose it again.
     */
    @Transactional
    public void setAnswerHidden(UUID adminId, UUID answerId, boolean hidden) {
        if (answers.setHidden(answerId, adminId, hidden).isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, CommunityErrors.ANSWER_NOT_FOUND, "Answer not found");
        }
    }

    private static ApiException complaintNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, CommunityErrors.COMPLAINT_NOT_FOUND, "Complaint not found");
    }

    private static ApiException resolved() {
        return new ApiException(HttpStatus.CONFLICT, CommunityErrors.COMPLAINT_RESOLVED,
                "The complaint is already resolved");
    }

    /** Cases newest first; each filter is optional. The reason is the most reported one of the case. */
    public List<ComplaintView> list(String status, String targetType, String reason, int page, int size) {
        if (status != null && !STATUSES.contains(status)) {
            throw validation("The status must be one of new, in_progress, resolved");
        }
        if (targetType != null && !TARGET_TYPES.contains(targetType)) {
            throw validation("The target type must be question or answer");
        }
        if (reason != null && !CommunityReportService.REASONS.contains(reason)) {
            throw validation("The reason must be one of ads, misinformation, spam, abuse");
        }
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw validation("The page must not be negative and the size must be 1 to " + MAX_PAGE_SIZE);
        }
        return views(complaints.list(status, targetType, reason, size, page * size));
    }

    public ComplaintView get(UUID id) {
        Row row = complaints.find(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
                CommunityErrors.COMPLAINT_NOT_FOUND, "Complaint not found"));
        return views(List.of(row)).get(0);
    }

    /** Today starts at 00:00 UTC, the week is the last seven days (see ADR 0012). */
    public Stats stats() {
        Instant now = clock.instant();
        Instant dayStart = now.atZone(ZoneOffset.UTC).toLocalDate().atStartOfDay(ZoneOffset.UTC).toInstant();
        var stats = complaints.stats(dayStart, now.minus(7, ChronoUnit.DAYS));
        return new Stats(stats.complaintsToday(), stats.avgResolutionMinutes(), stats.resolvedThisWeek(),
                stats.newComplaints());
    }

    private List<ComplaintView> views(List<Row> rows) {
        List<UUID> ids = rows.stream().map(Row::id).toList();
        Map<UUID, List<ReasonCount>> reasons = complaints.reasonCounts(ids).stream()
                .collect(Collectors.groupingBy(ReasonCount::complaintId));
        Map<UUID, List<String>> comments = complaints.latestComments(ids, MAX_COMMENTS).stream()
                .collect(Collectors.groupingBy(ReportComment::complaintId,
                        Collectors.mapping(ReportComment::comment, Collectors.toList())));
        Map<UUID, List<String>> photoUrls = questions.photos(rows.stream().map(Row::questionId).distinct().toList())
                .stream().collect(Collectors.groupingBy(CommunityQuestionRepository.Photo::questionId,
                        Collectors.mapping(p -> "/api/admin/community/questions/" + p.questionId() + "/photos/"
                                + p.id(), Collectors.toList())));
        return rows.stream().map(row -> new ComplaintView(row.id(), row.status(), row.topReason(),
                reasons.getOrDefault(row.id(), List.of()), comments.getOrDefault(row.id(), List.of()),
                row.createdAt(),
                "resolved".equals(row.status())
                        ? new Resolution(row.action(), row.resolutionComment(), row.resolvedAt()) : null,
                new Target(row.targetType(), row.questionId(), row.answerId(), row.questionTitle(),
                        row.targetBody(), row.cropCode(), row.regionId(), row.photoCount(), photoUrls.getOrDefault(row.questionId(), List.of()),
                        row.targetHidden(), row.targetCreatedAt()),
                new Author(row.authorId(), row.authorName(), row.authorRole(), row.authorExpert(),
                        row.authorStatus(), row.authorHiddenCount(), row.authorRegisteredAt()))).toList();
    }

    private static ApiException validation(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED, detail);
    }
}
