package kz.agroadvisor.common.web;

import org.springframework.http.HttpStatus;

/**
 * Business error returned to the client as Problem Details.
 *
 * <p>{@code code} is a stable machine-readable value in snake_case (for example
 * {@code disease_not_found}); clients map it to localized messages.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code, String detail) {
        super(detail);
        this.status = status;
        this.code = code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
