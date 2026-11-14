package kz.agroadvisor.consultations.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.consultations.model.ConsultationStatus;
import kz.agroadvisor.consultations.repository.ConsultationRepository.Consultation;
import kz.agroadvisor.consultations.repository.ConsultationRepository.Item;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class ConsultationRepositoryTest {

    @Autowired
    private ConsultationRepository repository;
    @Autowired
    private JdbcTemplate jdbc;

    private UUID farmer;
    private UUID agrochemist;
    private UUID stranger;
    private int seq;

    @BeforeEach
    void setUp() {
        farmer = user("Farmer");
        agrochemist = user("Agrochemist");
        stranger = user("Stranger");
    }

    @Test
    void insertCreatesARequestedConsultation() {
        Consultation created = repository.insert(farmer, agrochemist, null);

        assertThat(created.status()).isEqualTo(ConsultationStatus.REQUESTED);
        assertThat(created.farmerId()).isEqualTo(farmer);
        assertThat(created.agrochemistId()).isEqualTo(agrochemist);
        assertThat(created.acceptedAt()).isNull();
        assertThat(created.closedAt()).isNull();
        assertThat(created.lastMessageAt()).isNotNull();
    }

    @Test
    void secondOpenConsultationForThePairIsRejected() {
        repository.insert(farmer, agrochemist, null);
        assertThatThrownBy(() -> repository.insert(farmer, agrochemist, null))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void bothParticipantsFindItAndAStrangerDoesNot() {
        UUID id = repository.insert(farmer, agrochemist, null).id();

        Item seenByFarmer = repository.findForParticipant(id, farmer).orElseThrow();
        assertThat(seenByFarmer.farmerName()).isEqualTo("Farmer");
        assertThat(seenByFarmer.agrochemistName()).isEqualTo("Agrochemist");
        assertThat(repository.findForParticipant(id, agrochemist)).isPresent();
        assertThat(repository.findForParticipant(id, stranger)).isEmpty();
        assertThat(repository.findForParticipant(UUID.randomUUID(), farmer)).isEmpty();
    }

    @Test
    void unreadCountCountsOnlyIncomingUnreadMessages() {
        UUID id = repository.insert(farmer, agrochemist, null).id();
        repository.insertMessage(id, farmer, "first");
        repository.insertMessage(id, agrochemist, "second");
        UUID third = repository.insertMessage(id, agrochemist, "third");
        jdbc.update("UPDATE consultation_messages SET read_at = now() WHERE id = ?", third);

        assertThat(repository.findForParticipant(id, farmer).orElseThrow().unreadCount()).isEqualTo(1);
        assertThat(repository.findForParticipant(id, agrochemist).orElseThrow().unreadCount()).isEqualTo(1);
        assertThat(repository.listFor(farmer, Set.of(), 0, 10).get(0).unreadCount()).isEqualTo(1);
    }

    @Test
    void unreadCountIgnoresDeclinedAndClosedConsultations() {
        UUID other = user("Other agrochemist");
        UUID declined = repository.insert(farmer, agrochemist, null).id();
        UUID withdrawn = repository.insert(farmer, other, null).id();
        repository.insertMessage(declined, agrochemist, "unread in declined");
        repository.insertMessage(withdrawn, other, "unread in withdrawn");
        repository.updateStatus(declined, ConsultationStatus.DECLINED, agrochemist);
        repository.updateStatus(withdrawn, ConsultationStatus.CLOSED, farmer);

        assertThat(repository.findForParticipant(declined, farmer).orElseThrow().unreadCount()).isZero();
        assertThat(repository.listFor(farmer, Set.of(), 0, 10)).extracting(Item::unreadCount)
                .containsOnly(0);
    }

    @Test
    void isParticipantIsTrueOnlyForTheTwoSides() {
        UUID id = repository.insert(farmer, agrochemist, null).id();

        assertThat(repository.isParticipant(id, farmer)).isTrue();
        assertThat(repository.isParticipant(id, agrochemist)).isTrue();
        assertThat(repository.isParticipant(id, stranger)).isFalse();
        assertThat(repository.isParticipant(UUID.randomUUID(), farmer)).isFalse();
    }

    @Test
    void lastMessageIsTheNewestAndIsCutToThePreview() {
        UUID id = repository.insert(farmer, agrochemist, null).id();
        repository.insertMessage(id, farmer, "first");
        repository.insertMessage(id, agrochemist, "x".repeat(300));

        Item item = repository.findForParticipant(id, farmer).orElseThrow();
        assertThat(item.lastMessage().senderId()).isEqualTo(agrochemist);
        assertThat(item.lastMessage().text()).hasSize(140);
        assertThat(item.lastMessage().hasPhoto()).isFalse();
    }

    @Test
    void lastMessageOfAPhotoWithoutTextHasNoTextAndHasPhoto() {
        UUID id = repository.insert(farmer, agrochemist, null).id();
        jdbc.update("""
                INSERT INTO consultation_messages (consultation_id, sender_id, photo_key, photo_content_type,
                                                   photo_size_bytes)
                VALUES (?, ?, 'consultations/x/a.jpg', 'image/jpeg', 10)""", id, farmer);

        Item item = repository.findForParticipant(id, agrochemist).orElseThrow();
        assertThat(item.lastMessage().text()).isNull();
        assertThat(item.lastMessage().hasPhoto()).isTrue();
    }

    @Test
    void consultationWithoutMessagesHasNoLastMessage() {
        UUID id = repository.insert(farmer, agrochemist, null).id();
        Item item = repository.findForParticipant(id, farmer).orElseThrow();
        assertThat(item.lastMessage()).isNull();
        assertThat(item.unreadCount()).isZero();
    }

    @Test
    void listIsSortedByLatestActivityAndPaged() {
        UUID other = user("Other agrochemist");
        UUID third = user("Third agrochemist");
        UUID a = repository.insert(farmer, agrochemist, null).id();
        UUID b = repository.insert(farmer, other, null).id();
        UUID c = repository.insert(farmer, third, null).id();
        repository.insertMessage(b, farmer, "early");
        repository.insertMessage(c, farmer, "middle");
        repository.insertMessage(a, farmer, "late");

        List<Item> all = repository.listFor(farmer, Set.of(), 0, 10);
        assertThat(all).extracting(item -> item.consultation().id()).containsExactly(a, c, b);

        assertThat(repository.listFor(farmer, Set.of(), 0, 2)).extracting(item -> item.consultation().id())
                .containsExactly(a, c);
        assertThat(repository.listFor(farmer, Set.of(), 1, 2)).extracting(item -> item.consultation().id())
                .containsExactly(b);
        assertThat(repository.listFor(stranger, Set.of(), 0, 10)).isEmpty();
    }

    @Test
    void listFiltersByStatusAndShowsTheAgrochemistTheirIncoming() {
        UUID other = user("Other agrochemist");
        UUID a = repository.insert(farmer, agrochemist, null).id();
        UUID b = repository.insert(farmer, other, null).id();
        repository.updateStatus(a, ConsultationStatus.ACTIVE, null);

        assertThat(repository.listFor(farmer, Set.of(ConsultationStatus.ACTIVE), 0, 10))
                .extracting(item -> item.consultation().id()).containsExactly(a);
        assertThat(repository.listFor(farmer, Set.of(ConsultationStatus.ACTIVE, ConsultationStatus.REQUESTED), 0, 10))
                .hasSize(2);
        assertThat(repository.listFor(farmer, Set.of(ConsultationStatus.REQUESTED), 0, 10)).hasSize(1);
        assertThat(repository.listFor(other, Set.of(ConsultationStatus.REQUESTED), 0, 10))
                .extracting(item -> item.consultation().id()).containsExactly(b);
        assertThat(repository.listFor(other, Set.of(ConsultationStatus.ACTIVE), 0, 10)).isEmpty();
    }

    @Test
    void countPendingCountsOnlyRequestedOnesOfTheFarmer() {
        UUID other = user("Other agrochemist");
        UUID a = repository.insert(farmer, agrochemist, null).id();
        repository.insert(farmer, other, null);
        assertThat(repository.countPending(farmer)).isEqualTo(2);

        repository.updateStatus(a, ConsultationStatus.ACTIVE, null);
        assertThat(repository.countPending(farmer)).isEqualTo(1);
        assertThat(repository.countPending(agrochemist)).isZero();
    }

    @Test
    void updateStatusSetsTheDates() {
        UUID id = repository.insert(farmer, agrochemist, null).id();

        repository.updateStatus(id, ConsultationStatus.ACTIVE, null);
        Consultation active = repository.lock(id).orElseThrow();
        assertThat(active.status()).isEqualTo(ConsultationStatus.ACTIVE);
        assertThat(active.acceptedAt()).isNotNull();
        assertThat(active.closedAt()).isNull();

        repository.updateStatus(id, ConsultationStatus.CLOSED, farmer);
        Consultation closed = repository.lock(id).orElseThrow();
        assertThat(closed.status()).isEqualTo(ConsultationStatus.CLOSED);
        assertThat(closed.closedAt()).isNotNull();
        assertThat(closed.closedBy()).isEqualTo(farmer);
    }

    @Test
    void declineSetsClosedDateAndAuthor() {
        UUID id = repository.insert(farmer, agrochemist, null).id();
        repository.updateStatus(id, ConsultationStatus.DECLINED, agrochemist);

        Consultation declined = repository.lock(id).orElseThrow();
        assertThat(declined.status()).isEqualTo(ConsultationStatus.DECLINED);
        assertThat(declined.closedBy()).isEqualTo(agrochemist);
        assertThat(declined.acceptedAt()).isNull();
    }

    @Test
    void lockOfAMissingConsultationIsEmpty() {
        assertThat(repository.lock(UUID.randomUUID())).isEmpty();
    }

    private UUID user(String name) {
        return jdbc.queryForObject(
                "INSERT INTO users (phone, password_hash, full_name) VALUES (?, 'x', ?) RETURNING id",
                UUID.class, "+7788" + (1_000_000 + seq++), name);
    }
}
