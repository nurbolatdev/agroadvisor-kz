package kz.agroadvisor.community.web;

import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.community.service.CommunityAnswerService;

/**
 * Answers, the best answer and votes. A hidden question or answer is 404 for everyone; the best answer is
 * picked only by the author of the question.
 */
@RestController
@RequestMapping("/api/community")
@PreAuthorize("(hasRole('FARMER') or hasRole('AGROCHEMIST')) and @featureAccess.allows(authentication, 'community')")
public class CommunityAnswerController {

    private final CommunityAnswerService answers;

    public CommunityAnswerController(CommunityAnswerService answers) {
        this.answers = answers;
    }

    @GetMapping("/questions/{id}/answers")
    @Operation(operationId = "listCommunityAnswers",
            description = "Visible answers: the best first, then by score, time and id. 404 question_not_found.")
    public List<AnswerResponse> list(@PathVariable UUID id, Authentication authentication) {
        UUID me = me(authentication);
        return answers.list(me, id).stream().map(a -> AnswerResponse.of(a, me)).toList();
    }

    @PostMapping("/questions/{id}/answers")
    @Operation(operationId = "answerCommunityQuestion",
            description = "Anyone with access may answer, the author of the question too. 400 validation_failed; "
                    + "404 question_not_found; 409 answer_limit after 200 answers; 429 rate_limited after 30 "
                    + "answers an hour.")
    @ApiResponse(responseCode = "201", description = "The new answer")
    public ResponseEntity<AnswerResponse> answer(@PathVariable UUID id, @Valid @RequestBody CreateAnswerRequest request,
            Authentication authentication) {
        UUID me = me(authentication);
        AnswerResponse created = AnswerResponse.of(answers.answer(me, id, request.text()), me);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/questions/{id}/accepted-answer")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "acceptCommunityAnswer",
            description = "Author of the question only; replaces the previous best answer, a repeat changes "
                    + "nothing. 403 not_question_author; 404 question_not_found or answer_not_found; 409 "
                    + "own_answer.")
    @ApiResponse(responseCode = "204", description = "The answer is the best one")
    public void accept(@PathVariable UUID id, @Valid @RequestBody AcceptAnswerRequest request,
            Authentication authentication) {
        answers.accept(me(authentication), id, request.answerId());
    }

    @DeleteMapping("/questions/{id}/accepted-answer")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "clearCommunityAcceptedAnswer",
            description = "Author of the question only; without a best answer it does nothing.")
    @ApiResponse(responseCode = "204", description = "The question has no best answer")
    public void unaccept(@PathVariable UUID id, Authentication authentication) {
        answers.unaccept(me(authentication), id);
    }

    @PutMapping("/answers/{id}/vote")
    @Operation(operationId = "voteCommunityAnswer",
            description = "A vote of 1 or -1 on an answer of someone else; a repeat replaces the vote. 400 "
                    + "validation_failed; 404 answer_not_found; 409 own_answer; 429 rate_limited after 60 "
                    + "votes a minute.")
    public VoteResponse vote(@PathVariable UUID id, @Valid @RequestBody VoteRequest request,
            Authentication authentication) {
        return VoteResponse.of(answers.vote(me(authentication), id, request.value()));
    }

    @DeleteMapping("/answers/{id}/vote")
    @Operation(operationId = "unvoteCommunityAnswer", description = "Takes the vote back; without one it "
            + "does nothing.")
    public VoteResponse unvote(@PathVariable UUID id, Authentication authentication) {
        return VoteResponse.of(answers.unvote(me(authentication), id));
    }

    private static UUID me(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
