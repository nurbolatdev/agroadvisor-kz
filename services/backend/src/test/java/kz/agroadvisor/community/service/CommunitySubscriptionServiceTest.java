package kz.agroadvisor.community.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.common.web.ApiException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class CommunitySubscriptionServiceTest {

    @Autowired
    private CommunitySubscriptionService service;
    @Autowired
    private kz.agroadvisor.community.repository.CommunitySubscriptionRepository repository;
    @Autowired
    private JdbcTemplate jdbc;

    private UUID me;

    @BeforeEach
    void setUp() {
        me = jdbc.queryForObject("""
                INSERT INTO users (phone, password_hash, full_name) VALUES ('+77053990001', 'x', 'Test')
                RETURNING id""", UUID.class);
    }

    @Test
    void theSetIsReplacedAndListedAlphabetically() {
        assertThat(service.list(me)).isEmpty();

        assertThat(service.replace(me, List.of("tomato", "corn"))).containsExactly("corn", "tomato");
        assertThat(service.replace(me, List.of("potato"))).containsExactly("potato");
        assertThat(service.replace(me, List.of())).isEmpty();
    }

    @Test
    void anUnknownCropKeepsThePreviousSet() {
        service.replace(me, List.of("corn"));

        assertInvalid(List.of("tomato", "banana"));
        assertThat(service.list(me)).containsExactly("corn");
    }

    @Test
    void duplicatesAndTooManyCodesAreRejected() {
        service.replace(me, List.of("corn"));

        assertInvalid(List.of("corn", "corn"));
        assertInvalid(java.util.stream.IntStream.range(0, 21).mapToObj(i -> "crop" + i).toList());
        assertInvalid(null);
        assertThat(service.list(me)).containsExactly("corn");
    }

    @Test
    void aSubscriptionInsertedByAParallelRequestDoesNotFailTheReplace() {
        // The other request commits the same crop between this one's delete and insert
        jdbc.update("INSERT INTO community_crop_subscriptions (user_id, crop_code) VALUES (?, 'corn')", me);

        assertThat(repository.list(me)).containsExactly("corn");
        repository.insert(me, "corn");

        assertThat(repository.list(me)).containsExactly("corn");
    }

    private void assertInvalid(List<String> crops) {
        assertThatThrownBy(() -> service.replace(me, crops)).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus().value()).isEqualTo(400);
            assertThat(e.getCode()).isEqualTo("validation_failed");
        });
    }
}
