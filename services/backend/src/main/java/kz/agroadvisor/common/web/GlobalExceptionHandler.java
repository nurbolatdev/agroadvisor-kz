package kz.agroadvisor.common.web;

import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Turns every error into RFC 9457 Problem Details ({@code application/problem+json})
 * with extra properties: {@code code} — stable machine-readable error code, {@code reason} — an
 * optional narrowing of the code, and {@code errors} — field errors for validation failures.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ProblemDetail> handleApiException(ApiException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
        problem.setProperty("code", ex.getCode());
        if (ex.getReason() != null) {
            problem.setProperty("reason", ex.getReason());
        }
        ResponseEntity.BodyBuilder response = ResponseEntity.status(ex.getStatus());
        ex.getHeaders().forEach(response::header);
        return response.body(problem);
    }

    // Thrown by @PreAuthorize inside controllers; without these the catch-all below would answer 500
    @ExceptionHandler(AccessDeniedException.class)
    public ProblemDetail handleAccessDenied(AccessDeniedException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "Access denied");
        problem.setProperty("code", ErrorCodes.FORBIDDEN);
        return problem;
    }

    @ExceptionHandler(AuthenticationException.class)
    public ProblemDetail handleAuthentication(AuthenticationException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Authentication required");
        problem.setProperty("code", ErrorCodes.UNAUTHORIZED);
        return problem;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnexpected(Exception ex) {
        log.error("Unhandled error", ex);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "Unexpected server error");
        problem.setProperty("code", ErrorCodes.INTERNAL_ERROR);
        return problem;
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status,
            WebRequest request) {
        ProblemDetail problem = ex.getBody();
        problem.setDetail("Validation failed");
        problem.setProperty("code", ErrorCodes.VALIDATION_FAILED);
        List<Map<String, String>> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(GlobalExceptionHandler::toFieldError)
                .toList();
        problem.setProperty("errors", errors);
        return handleExceptionInternal(ex, problem, headers, status, request);
    }

    /** A bad query parameter ({@code @Min}/{@code @Max} on {@code page}, {@code size}) is a validation failure too. */
    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(
            HandlerMethodValidationException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        if (status.is5xxServerError()) {
            // A failed return-value check is a server bug, not a bad request
            return super.handleHandlerMethodValidationException(ex, headers, status, request);
        }
        ProblemDetail problem = ex.getBody();
        problem.setDetail("Validation failed");
        problem.setProperty("code", ErrorCodes.VALIDATION_FAILED);
        List<Map<String, String>> errors = ex.getParameterValidationResults().stream()
                .<Map<String, String>>map(result -> {
                    String field = result.getMethodParameter().getParameterName();
                    String message = result.getResolvableErrors().stream()
                            .map(MessageSourceResolvable::getDefaultMessage)
                            .filter(Objects::nonNull)
                            .findFirst().orElse("is invalid");
                    return Map.of("field", field == null ? "" : field, "message", message);
                })
                .toList();
        problem.setProperty("errors", errors);
        return handleExceptionInternal(ex, problem, headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception ex, Object body, HttpHeaders headers, HttpStatusCode status,
            WebRequest request) {
        // The parent builds the body from the exception when body is null, so add the code afterwards
        ResponseEntity<Object> response = super.handleExceptionInternal(ex, body, headers, status, request);
        if (response != null && response.getBody() instanceof ProblemDetail problem
                && (problem.getProperties() == null || !problem.getProperties().containsKey("code"))) {
            problem.setProperty("code", ErrorCodes.forStatus(status));
        }
        return response;
    }

    private static Map<String, String> toFieldError(FieldError error) {
        String message = error.getDefaultMessage() == null ? "is invalid" : error.getDefaultMessage();
        return Map.of("field", error.getField(), "message", message);
    }
}
