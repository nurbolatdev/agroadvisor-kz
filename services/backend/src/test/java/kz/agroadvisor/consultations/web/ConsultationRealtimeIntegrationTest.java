package kz.agroadvisor.consultations.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.messaging.converter.StringMessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import com.jayway.jsonpath.JsonPath;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.consultations.service.ConsultationEvents;
import kz.agroadvisor.consultations.service.ConsultationPhotoStorage;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

@TestPropertySource(properties = {"app.websocket.connect-deadline-ms=1500", "app.websocket.expiry-check-ms=300"})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ConsultationRealtimeIntegrationTest {

    private static final String QUEUE = "/user/queue/consultations";
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xDB, 0, 2, (byte) 0xFF,
        (byte) 0xD9};

    @LocalServerPort
    private int port;
    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private ApplicationEventPublisher publisher;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @MockitoBean
    private ConsultationPhotoStorage photos;

    private final List<UUID> created = new ArrayList<>();
    private final List<StompSession> sessions = new ArrayList<>();
    private final List<WebSocketStompClient> clients = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        sessions.forEach(s -> {
            if (s.isConnected()) {
                s.disconnect();
            }
        });
        clients.forEach(WebSocketStompClient::stop);
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    private UUID newUser(Role role, String verification) {
        String phone = "+7727" + (1_000_000 + (int) (Math.random() * 8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Live " + phone, "ru", Set.of(role)))
                .getId();
        created.add(id);
        if (verification != null) {
            jdbc.update("""
                    INSERT INTO agrochemist_profiles (user_id, specialization, experience_years,
                                                      verification_status)
                    VALUES (?, 'plant_protection', 4, ?)""", id, verification);
        }
        return id;
    }

    private String token(UUID id) {
        return jwt.issueAccessToken(id);
    }

    private record Chat(UUID id, UUID farmer, UUID agrochemist) {
    }

    private Chat activeChat() throws Exception {
        UUID farmer = newUser(Role.FARMER, null);
        UUID agrochemist = newUser(Role.AGROCHEMIST, "approved");
        String location = mvc.perform(post("/api/consultations").header("Authorization", bearer(farmer))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"agrochemistId\": \"" + agrochemist + "\", \"text\": \"Help\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getHeader("Location");
        UUID id = UUID.fromString(location.substring(location.lastIndexOf('/') + 1));
        mvc.perform(post("/api/consultations/" + id + "/accept").header("Authorization", bearer(agrochemist)))
                .andExpect(status().isOk());
        return new Chat(id, farmer, agrochemist);
    }

    private String bearer(UUID user) {
        return "Bearer " + token(user);
    }

    /** The first frame of a connect attempt: a session, or null when the server refused it. */
    private StompSession tryConnect(String token) {
        WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
        // The server sends application/json; the test reads it as text and parses it with JsonPath
        client.setMessageConverter(new StringMessageConverter() {
            @Override
            protected boolean supportsMimeType(org.springframework.messaging.MessageHeaders headers) {
                return true;
            }
        });
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler(); // receipts need one
        scheduler.setDaemon(true);
        scheduler.initialize();
        client.setTaskScheduler(scheduler);
        clients.add(client);
        StompHeaders headers = new StompHeaders();
        if (token != null) {
            headers.add("Authorization", "Bearer " + token);
        }
        try {
            StompSession session = client.connectAsync("ws://localhost:" + port + "/ws", new WebSocketHttpHeaders(),
                    headers, new StompSessionHandlerAdapter() { }).get(5, TimeUnit.SECONDS);
            sessions.add(session);
            session.setAutoReceipt(true);
            return session;
        } catch (Exception e) {
            return null;
        }
    }

    private StompSession connect(UUID user) {
        StompSession session = tryConnect(token(user));
        assertThat(session).as("connected").isNotNull();
        return session;
    }

    private BlockingQueue<String> listen(StompSession session) throws Exception {
        BlockingQueue<String> frames = new LinkedBlockingQueue<>();
        session.subscribe(QUEUE, new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return String.class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                frames.add((String) payload);
            }
        });
        Thread.sleep(500); // the broker has no confirmation we could wait for; the subscription is immediate
        return frames;
    }

    private static boolean closesSoon(StompSession session) throws InterruptedException {
        for (int i = 0; i < 50 && session.isConnected(); i++) {
            Thread.sleep(100);
        }
        return !session.isConnected();
    }

    @Test
    void connectWithoutOrWithABadTokenOrAsAdminIsRefused() {
        assertThat(tryConnect(null)).isNull();
        assertThat(tryConnect("not-a-token")).isNull();
        assertThat(tryConnect(token(newUser(Role.ADMIN, null)))).isNull();
    }

    @Test
    void subscribingOutsideTheOwnQueueOrSendingClosesTheSession() throws Exception {
        UUID farmer = newUser(Role.FARMER, null);

        StompSession subscribing = connect(farmer);
        subscribing.subscribe("/topic/anything", new StompSessionHandlerAdapter() { });
        assertThat(closesSoon(subscribing)).as("subscribe elsewhere").isTrue();

        StompSession foreignQueue = connect(farmer);
        foreignQueue.subscribe("/queue/consultations", new StompSessionHandlerAdapter() { });
        assertThat(closesSoon(foreignQueue)).as("the broker's queue without /user").isTrue();

        StompSession sending = connect(farmer);
        sending.send("/queue/consultations", "forged");
        assertThat(closesSoon(sending)).as("send").isTrue();
    }

    @Test
    void theRecipientHearsAboutAMessageAndTheSenderAndAStrangerDoNot() throws Exception {
        Chat chat = activeChat();
        UUID stranger = newUser(Role.FARMER, null);
        BlockingQueue<String> recipient = listen(connect(chat.agrochemist));
        BlockingQueue<String> sender = listen(connect(chat.farmer));
        BlockingQueue<String> outsider = listen(connect(stranger));

        String response = mvc.perform(post("/api/consultations/" + chat.id + "/messages")
                .header("Authorization", bearer(chat.farmer)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"text\": \"Leaves are yellow\"}")).andExpect(status().isCreated()).andReturn()
                .getResponse().getContentAsString();

        String event = recipient.poll(5, TimeUnit.SECONDS);
        assertThat(event).isNotNull();
        assertThat(JsonPath.<String>read(event, "$.type")).isEqualTo("message_created");
        assertThat(JsonPath.<String>read(event, "$.consultationId")).isEqualTo(chat.id.toString());
        assertThat(JsonPath.<String>read(event, "$.messageId")).isEqualTo(JsonPath.<String>read(response, "$.id"));
        assertThat(sender.poll(1, TimeUnit.SECONDS)).isNull();
        assertThat(outsider.poll(1, TimeUnit.SECONDS)).isNull();
    }

    @Test
    void theSenderHearsThatTheMessagesWereRead() throws Exception {
        Chat chat = activeChat();
        String response = mvc.perform(post("/api/consultations/" + chat.id + "/messages")
                .header("Authorization", bearer(chat.farmer)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"text\": \"Hello\"}")).andReturn().getResponse().getContentAsString();
        String messageId = JsonPath.read(response, "$.id");
        BlockingQueue<String> sender = listen(connect(chat.farmer));

        mvc.perform(post("/api/consultations/" + chat.id + "/read").header("Authorization", bearer(chat.agrochemist))
                .contentType(MediaType.APPLICATION_JSON).content("{\"upTo\": \"" + messageId + "\"}"))
                .andExpect(status().isOk());

        String event = sender.poll(5, TimeUnit.SECONDS);
        assertThat(event).isNotNull();
        assertThat(JsonPath.<String>read(event, "$.type")).isEqualTo("messages_read");
        assertThat(JsonPath.<String>read(event, "$.messageId")).isEqualTo(messageId);
    }

    @Test
    void aSocketThatNeverCompletesAConnectFrameIsClosed() throws Exception {
        CountDownLatch closed = new CountDownLatch(1);
        WebSocketSession raw = new StandardWebSocketClient().execute(new TextWebSocketHandler() {
            @Override
            public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
                closed.countDown();
            }
        }, "ws://localhost:" + port + "/ws").get(5, TimeUnit.SECONDS);
        raw.sendMessage(new TextMessage("CONN")); // half a frame keeps the transport's own timer quiet

        assertThat(closed.await(10, TimeUnit.SECONDS)).as("closed by the connect deadline").isTrue();
    }

    @Test
    void subscribingToAnotherUsersQueueClosesTheSession() throws Exception {
        UUID other = newUser(Role.FARMER, null);
        StompSession session = connect(newUser(Role.FARMER, null));

        session.subscribe("/user/" + other + "/queue/consultations", new StompSessionHandlerAdapter() { });

        assertThat(closesSoon(session)).isTrue();
    }

    @Test
    void aBlockedUserCannotConnectWithAnIssuedToken() {
        UUID farmer = newUser(Role.FARMER, null);
        String token = token(farmer);
        jdbc.update("UPDATE users SET status = 'blocked' WHERE id = ?", farmer);

        assertThat(tryConnect(token)).isNull();
    }

    @Test
    void aNewRequestAnAcceptanceAndADeclineAreAnnounced() throws Exception {
        UUID farmer = newUser(Role.FARMER, null);
        UUID agrochemist = newUser(Role.AGROCHEMIST, "approved");
        BlockingQueue<String> forAgrochemist = listen(connect(agrochemist));
        BlockingQueue<String> forFarmer = listen(connect(farmer));

        UUID first = request(farmer, agrochemist);
        assertUpdated(forAgrochemist, first);
        mvc.perform(post("/api/consultations/" + first + "/accept").header("Authorization", bearer(agrochemist)))
                .andExpect(status().isOk());
        assertUpdated(forFarmer, first);
        mvc.perform(post("/api/consultations/" + first + "/close").header("Authorization", bearer(farmer)))
                .andExpect(status().isOk());

        UUID second = request(farmer, agrochemist);
        mvc.perform(post("/api/consultations/" + second + "/decline").header("Authorization", bearer(agrochemist)))
                .andExpect(status().isOk());
        // the farmer hears about the decline (the events before it are also in the queue)
        String last = null;
        for (String frame; (frame = forFarmer.poll(3, TimeUnit.SECONDS)) != null;) {
            last = frame;
        }
        assertThat(last).isNotNull();
        assertThat(JsonPath.<String>read(last, "$.consultationId")).isEqualTo(second.toString());
    }

    private UUID request(UUID farmer, UUID agrochemist) throws Exception {
        String location = mvc.perform(post("/api/consultations").header("Authorization", bearer(farmer))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"agrochemistId\": \"" + agrochemist + "\", \"text\": \"Help\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getHeader("Location");
        return UUID.fromString(location.substring(location.lastIndexOf('/') + 1));
    }

    private static void assertUpdated(BlockingQueue<String> frames, UUID consultation) throws Exception {
        String event = frames.poll(5, TimeUnit.SECONDS);
        assertThat(event).isNotNull();
        assertThat(JsonPath.<String>read(event, "$.type")).isEqualTo("consultation_updated");
        assertThat(JsonPath.<String>read(event, "$.consultationId")).isEqualTo(consultation.toString());
    }

    @Test
    void aClosedConsultationIsAnnouncedToBothSides() throws Exception {
        Chat chat = activeChat();
        BlockingQueue<String> farmer = listen(connect(chat.farmer));
        BlockingQueue<String> agrochemist = listen(connect(chat.agrochemist));

        mvc.perform(post("/api/consultations/" + chat.id + "/close").header("Authorization", bearer(chat.farmer)))
                .andExpect(status().isOk());

        for (BlockingQueue<String> side : List.of(farmer, agrochemist)) {
            String event = side.poll(5, TimeUnit.SECONDS);
            assertThat(event).isNotNull();
            assertThat(JsonPath.<String>read(event, "$.type")).isEqualTo("consultation_updated");
        }
    }

    @Test
    void anEventIsSentOnlyAfterTheCommitAndNeverForARollback() throws Exception {
        Chat chat = activeChat();
        BlockingQueue<String> recipient = listen(connect(chat.agrochemist));
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        ConsultationEvents.ConsultationEvent event = new ConsultationEvents.ConsultationEvent(
                ConsultationEvents.CONSULTATION_UPDATED, chat.id, null, List.of(chat.agrochemist));

        tx.executeWithoutResult(status -> {
            publisher.publishEvent(event);
            status.setRollbackOnly();
        });
        assertThat(recipient.poll(1, TimeUnit.SECONDS)).as("rolled back").isNull();

        tx.executeWithoutResult(status -> publisher.publishEvent(event));
        assertThat(recipient.poll(5, TimeUnit.SECONDS)).as("committed").isNotNull();
    }

    @Test
    void aFailedPhotoInsertIsNotAnnounced() throws Exception {
        Chat chat = activeChat();
        BlockingQueue<String> recipient = listen(connect(chat.agrochemist));
        // A key longer than the column makes the INSERT fail, so the message never exists
        when(photos.store(eq(chat.id), any(), anyString())).thenReturn("consultations/" + "k".repeat(520));

        mvc.perform(multipart("/api/consultations/" + chat.id + "/messages/photo")
                .file(new MockMultipartFile("image", "leaf.jpg", "image/jpeg", JPEG))
                .header("Authorization", bearer(chat.farmer))).andExpect(status().is5xxServerError());

        assertThat(recipient.poll(1, TimeUnit.SECONDS)).isNull();
    }
}
