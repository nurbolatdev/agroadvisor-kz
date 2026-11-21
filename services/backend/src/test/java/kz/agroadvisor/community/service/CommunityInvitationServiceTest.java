package kz.agroadvisor.community.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.community.service.CommunityInvitationService.Invitation;
import kz.agroadvisor.notifications.model.NotificationType;
import kz.agroadvisor.notifications.repository.NotificationRepository.Notification;
import kz.agroadvisor.notifications.service.NotificationService;

/** Invitations of agrochemists to questions; the test transaction is rolled back. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class CommunityInvitationServiceTest {

    @Autowired
    private CommunityInvitationService service;
    @Autowired
    private NotificationService notifications;
    @Autowired
    private JdbcTemplate jdbc;
    // the same beans as the other community integration tests, so all of them share one Spring context
    @MockitoBean
    private CommunityPhotoStorage storage;

    private int seq;
    private UUID admin;
    private UUID author;
    private UUID question;

    @BeforeEach
    void setUp() {
        admin = user();
        author = user();
        question = question(false);
    }

    @Test
    void aVerifiedAgrochemistIsInvitedAndNotified() {
        UUID agrochemist = agrochemist("approved");

        Invitation invitation = service.invite(admin, question, agrochemist);

        assertThat(invitation.questionId()).isEqualTo(question);
        assertThat(invitation.agrochemistId()).isEqualTo(agrochemist);
        assertThat(invitation.agrochemistName()).isEqualTo("Agro");
        assertThat(invitation.invitedAt()).isNotNull();
        List<Notification> feed = feed(agrochemist);
        assertThat(feed).hasSize(1);
        assertThat(feed.get(0).type()).isEqualTo(NotificationType.COMMUNITY_INVITATION);
        assertThat(feed.get(0).questionId()).isEqualTo(question);
        assertThat(feed.get(0).answerId()).isNull();
    }

    @Test
    void aRepeatedInvitationKeepsTheFirstTimeAndDoesNotNotifyAgain() {
        UUID agrochemist = agrochemist("approved");
        Invitation first = service.invite(admin, question, agrochemist);

        Invitation again = service.invite(admin, question, agrochemist);

        assertThat(again.invitedAt()).isEqualTo(first.invitedAt());
        assertThat(feed(agrochemist)).hasSize(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM community_invitations WHERE question_id = ?",
                Integer.class, question)).isEqualTo(1);
    }

    @Test
    void severalAgrochemistsCanBeInvitedToOneQuestion() {
        UUID one = agrochemist("approved");
        UUID two = agrochemist("approved");

        service.invite(admin, question, one);
        service.invite(admin, question, two);

        assertThat(feed(one)).hasSize(1);
        assertThat(feed(two)).hasSize(1);
    }

    @Test
    void aHiddenQuestionCannotBeUsed() {
        UUID agrochemist = agrochemist("approved");

        assertApi(() -> service.invite(admin, question(true), agrochemist), 404, CommunityErrors.QUESTION_NOT_FOUND);
        assertThat(feed(agrochemist)).isEmpty();
    }

    @Test
    void anUnknownQuestionIsNotFound() {
        UUID agrochemist = agrochemist("approved");

        assertApi(() -> service.invite(admin, UUID.randomUUID(), agrochemist), 404,
                CommunityErrors.QUESTION_NOT_FOUND);
    }

    @Test
    void aFarmerAndAnUnknownUserAreNotAgrochemists() {
        assertApi(() -> service.invite(admin, question, author), 404, CommunityErrors.AGROCHEMIST_NOT_FOUND);
        assertApi(() -> service.invite(admin, question, UUID.randomUUID()), 404,
                CommunityErrors.AGROCHEMIST_NOT_FOUND);
        assertThat(feed(author)).isEmpty();
    }

    @Test
    void anAgrochemistWithoutApprovalIsRefused() {
        for (String status : List.of("pending", "rejected", "documents_requested")) {
            UUID agrochemist = agrochemist(status);

            assertApi(() -> service.invite(admin, question, agrochemist), 409,
                    CommunityErrors.AGROCHEMIST_NOT_VERIFIED);
            assertThat(feed(agrochemist)).isEmpty();
        }
    }

    @Test
    void aBlockedAgrochemistIsRefused() {
        UUID agrochemist = agrochemist("approved");
        jdbc.update("UPDATE users SET status = 'blocked' WHERE id = ?", agrochemist);

        assertApi(() -> service.invite(admin, question, agrochemist), 409,
                CommunityErrors.AGROCHEMIST_NOT_VERIFIED);
        assertThat(feed(agrochemist)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM community_invitations WHERE agrochemist_id = ?",
                Integer.class, agrochemist)).isZero();
    }

    private static void assertApi(Runnable call, int status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus().value()).isEqualTo(status);
            assertThat(e.getCode()).isEqualTo(code);
        });
    }

    private List<Notification> feed(UUID user) {
        return notifications.list(user, false, 0, 50);
    }

    private UUID user() {
        seq++;
        return jdbc.queryForObject("""
                INSERT INTO users (phone, password_hash, full_name) VALUES (?, 'x', 'Agro')
                RETURNING id""", UUID.class, "+7705400%04d".formatted(seq));
    }

    private UUID agrochemist(String verificationStatus) {
        UUID id = user();
        jdbc.update("INSERT INTO user_roles (user_id, role_code) VALUES (?, 'agrochemist')", id);
        jdbc.update("INSERT INTO agrochemist_profiles (user_id, verification_status) VALUES (?, ?)", id,
                verificationStatus);
        return id;
    }

    private UUID question(boolean hidden) {
        return jdbc.queryForObject("""
                INSERT INTO community_questions (author_id, crop_code, region_id, title, body, hidden_at, hidden_by)
                VALUES (?, 'potato', (SELECT min(id) FROM regions), 'Title', 'Body',
                        CASE WHEN ? THEN now() END, CASE WHEN ? THEN ? END) RETURNING id
                """, UUID.class, author, hidden, hidden, admin);
    }
}
