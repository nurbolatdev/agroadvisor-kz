package kz.agroadvisor.community.service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import kz.agroadvisor.common.image.ImageFormat;
import kz.agroadvisor.common.image.ImageMetadataStripper;
import kz.agroadvisor.common.image.InvalidImageException;
import kz.agroadvisor.common.ratelimit.RateLimitProperties;
import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;
import kz.agroadvisor.community.repository.CommunityQuestionRepository;
import kz.agroadvisor.community.repository.CommunityQuestionRepository.Cursor;
import kz.agroadvisor.community.repository.CommunityQuestionRepository.Filter;
import kz.agroadvisor.community.repository.CommunityQuestionRepository.Photo;
import kz.agroadvisor.community.repository.CommunityQuestionRepository.Question;
import kz.agroadvisor.diagnosis.service.DiagnosisErrors;
import kz.agroadvisor.diagnosis.service.DiagnosisService;

/**
 * Questions of the community: asking (with up to three photos and an own diagnosis), the feed and the card.
 * A hidden question is 404 for everyone.
 */
@Service
public class CommunityQuestionService {

    public static final int MAX_PHOTOS = 3;
    public static final int MIN_TITLE = 3;
    public static final int MAX_TITLE = 120;
    public static final int MAX_TEXT = 2000;
    public static final int DEFAULT_LIMIT = 20;
    public static final int MAX_LIMIT = 50;
    public static final int MAX_CROP_FILTERS = 4;

    private static final Set<String> STATUSES = Set.of("open", "solved", "unanswered");

    private final CommunityQuestionRepository questions;
    private final DiagnosisService diagnoses;
    private final CommunityPhotoStorage storage;
    private final ImageMetadataStripper stripper;
    private final RateLimiter rateLimiter;
    private final RateLimitProperties limits;
    private final TransactionTemplate tx;

    public CommunityQuestionService(CommunityQuestionRepository questions, DiagnosisService diagnoses,
            CommunityPhotoStorage storage, ImageMetadataStripper stripper, RateLimiter rateLimiter,
            RateLimitProperties limits, TransactionTemplate tx) {
        this.questions = questions;
        this.diagnoses = diagnoses;
        this.storage = storage;
        this.stripper = stripper;
        this.rateLimiter = rateLimiter;
        this.limits = limits;
        this.tx = tx;
    }

    /** A question with the relative paths of its photos and of the attached diagnosis (null when none). */
    public record QuestionView(Question question, List<String> photoUrls, String diagnosisUrl) {
    }

    /** Feed filters of the API: {@code status} is open, solved or unanswered; {@code mine} keeps own questions. */
    public record FeedFilter(List<String> crops, Long regionId, String status, boolean mine) {
    }

    /** A photo of a question with its type and the object key as a stable ETag source. */
    public record PhotoContent(byte[] bytes, String contentType, String key) {
    }

    /**
     * Asks a question. Text, crop, photo count and types and the diagnosis are checked first, then the rate
     * limit, and only then the photos are cleaned and stored. If the insert fails the stored objects are
     * removed again.
     */
    public QuestionView ask(UUID author, String title, String text, String cropCode, UUID diagnosisId,
            List<byte[]> photos) {
        String heading = title == null ? "" : normalize(title);
        String body = text == null ? "" : normalize(text);
        if (heading.length() < MIN_TITLE || heading.length() > MAX_TITLE || hasControlChars(heading, false)) {
            throw validation("The title must have " + MIN_TITLE + " to " + MAX_TITLE
                    + " characters, in one line");
        }
        if (body.isEmpty() || body.length() > MAX_TEXT || hasControlChars(body, true)) {
            throw validation("The text must have 1 to " + MAX_TEXT + " characters, without control characters");
        }
        if (cropCode == null || !questions.cropExists(cropCode)) {
            throw validation("Unknown crop: " + cropCode);
        }
        List<byte[]> files = photos == null ? List.of() : photos;
        if (files.size() > MAX_PHOTOS) {
            throw invalidImage("Attach at most " + MAX_PHOTOS + " photos");
        }
        List<String> types = files.stream().map(f -> ImageFormat.detect(f)
                .orElseThrow(() -> invalidImage("Send JPEG or PNG photos of up to 10 MB"))).toList();
        if (diagnosisId != null && !diagnoses.get(author, diagnosisId).crop().equals(cropCode)) {
            throw validation("The diagnosis belongs to another crop than the question");
        }
        // Cheap early check, so a user without a region uses no attempt and uploads nothing; the insert below
        // checks again for the case when the region disappears in between
        if (!questions.userHasRegion(author)) {
            throw regionRequired();
        }
        rateLimiter.check("community-questions", author.toString(), limits.communityQuestionsPerHour(),
                Duration.ofHours(1));
        List<byte[]> cleaned = files.stream().map(this::clean).toList();
        UUID id = UUID.randomUUID();
        List<String> keys = new ArrayList<>();
        try {
            for (int i = 0; i < cleaned.size(); i++) {
                keys.add(storage.store(id, cleaned.get(i), types.get(i)));
            }
            tx.executeWithoutResult(status -> {
                if (!questions.insert(id, author, cropCode, diagnosisId, heading, body)) {
                    throw regionRequired();
                }
                for (int i = 0; i < keys.size(); i++) {
                    questions.insertPhoto(id, keys.get(i), types.get(i), cleaned.get(i).length, i);
                }
            });
        } catch (RuntimeException e) {
            keys.forEach(key -> discard(key, e));
            throw e;
        }
        // After the commit: the objects belong to saved rows and are never removed again
        return views(List.of(questions.findVisible(id).orElseThrow())).get(0);
    }

    /** A page of the feed, newest first; {@code before} is the id of the last question of the previous page. */
    public List<QuestionView> feed(UUID me, FeedFilter filter, UUID before, int limit) {
        if (limit < 1 || limit > MAX_LIMIT) {
            throw validation("limit must be from 1 to " + MAX_LIMIT);
        }
        List<String> crops = filter.crops() == null ? List.of() : filter.crops();
        if (crops.size() > MAX_CROP_FILTERS) {
            throw validation("At most " + MAX_CROP_FILTERS + " crops can be combined");
        }
        String status = filter.status();
        if (status != null && !STATUSES.contains(status)) {
            throw validation("status must be open, solved or unanswered");
        }
        Cursor cursor = before == null ? null
                : questions.cursorOf(before).orElseThrow(CommunityQuestionService::notFound);
        Filter repoFilter = new Filter(crops, filter.regionId(),
                status == null || status.equals("unanswered") ? null : status, "unanswered".equals(status),
                filter.mine() ? me : null);
        return views(questions.feed(repoFilter, cursor, limit));
    }

    /** The question card; a hidden or missing question is 404. */
    public QuestionView get(UUID id) {
        return views(List.of(visible(id))).get(0);
    }

    /** The bytes of one photo of a visible question. */
    public PhotoContent photo(UUID questionId, UUID photoId) {
        visible(questionId);
        return loadPhoto(questionId, photoId);
    }

    /** The bytes of one photo of a question for the admin; a hidden question is shown too. */
    public PhotoContent photoForAdmin(UUID questionId, UUID photoId) {
        questions.find(questionId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
                CommunityErrors.QUESTION_NOT_FOUND, "Question not found"));
        return loadPhoto(questionId, photoId);
    }

    private PhotoContent loadPhoto(UUID questionId, UUID photoId) {
        Photo photo = questions.photos(List.of(questionId)).stream().filter(p -> p.id().equals(photoId))
                .findFirst().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
                        CommunityErrors.PHOTO_NOT_FOUND, "Photo not found"));
        return new PhotoContent(storage.load(photo.key()), photo.contentType(), photo.key());
    }

    /**
     * The diagnosis the author attached, for any reader of the question. The photo path points to the
     * question, because the diagnosis' own path answers 404 to anyone but its owner.
     */
    public DiagnosisService.DiagnosisView attachedDiagnosis(UUID questionId) {
        Question question = visible(questionId);
        return diagnoses.get(question.authorId(), attachedId(question))
                .withPhotoUrl("/api/community/questions/" + questionId + "/diagnosis/photo");
    }

    /** The photo of the attached diagnosis; 404 as in {@link #attachedDiagnosis}. */
    public DiagnosisService.PhotoContent attachedDiagnosisPhoto(UUID questionId) {
        Question question = visible(questionId);
        UUID diagnosisId = attachedId(question);
        String key = diagnoses.photoKey(question.authorId(), diagnosisId);
        return diagnoses.loadPhoto(diagnosisId, key);
    }

    private List<QuestionView> views(List<Question> rows) {
        Map<UUID, List<Photo>> photos = questions.photos(rows.stream().map(Question::id).toList()).stream()
                .collect(Collectors.groupingBy(Photo::questionId));
        return rows.stream().map(q -> new QuestionView(q,
                photos.getOrDefault(q.id(), List.of()).stream()
                        .map(p -> "/api/community/questions/" + q.id() + "/photos/" + p.id()).toList(),
                q.diagnosisId() == null ? null : "/api/community/questions/" + q.id() + "/diagnosis")).toList();
    }

    private Question visible(UUID id) {
        return questions.findVisible(id).orElseThrow(CommunityQuestionService::notFound);
    }

    private static UUID attachedId(Question question) {
        if (question.diagnosisId() == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, DiagnosisErrors.DIAGNOSIS_NOT_FOUND,
                    "The question has no diagnosis");
        }
        return question.diagnosisId();
    }

    private byte[] clean(byte[] photo) {
        try {
            return stripper.strip(photo);
        } catch (InvalidImageException e) {
            throw invalidImage("The photo cannot be read, send another JPEG or PNG");
        }
    }

    private void discard(String key, RuntimeException cause) {
        try {
            storage.delete(key);
        } catch (RuntimeException cleanup) {
            cause.addSuppressed(cleanup);
        }
    }

    static String normalize(String text) {
        return text.strip().replace("\r\n", "\n").replace('\r', '\n');
    }

    /**
     * Whether the text has a control character other than a line break and a tab (PostgreSQL rejects NUL).
     * The title is one line, so it allows neither.
     */
    static boolean hasControlChars(String text, boolean multiline) {
        return text.chars().anyMatch(c -> Character.isISOControl(c) && !(multiline && (c == '\n' || c == '\t')));
    }

    private static ApiException regionRequired() {
        return new ApiException(HttpStatus.BAD_REQUEST, CommunityErrors.REGION_REQUIRED,
                "Set the region in the profile before asking a question");
    }

    private static ApiException validation(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED, detail);
    }

    private static ApiException invalidImage(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, CommunityErrors.INVALID_IMAGE, detail);
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, CommunityErrors.QUESTION_NOT_FOUND, "Question not found");
    }
}
