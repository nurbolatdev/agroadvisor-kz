package kz.agroadvisor.common.web;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;

/**
 * Business error returned to the client as Problem Details.
 *
 * <p>{@code code} is a stable machine-readable value in snake_case (for example
 * {@code disease_not_found}); clients map it to localized messages. {@code reason} is an optional
 * second machine-readable value that narrows the code (for example {@code blurry} for
 * {@code low_quality}); {@code detail} stays a human-readable text.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final String reason;
    private final Map<String, String> headers = new LinkedHashMap<>();

    public ApiException(HttpStatus status, String code, String detail) {
        this(status, code, detail, null);
    }

    public ApiException(HttpStatus status, String code, String detail, String reason) {
        super(detail);
        this.status = status;
        this.code = code;
        this.reason = reason;
    }

    /** Adds a response header, e.g. {@code Retry-After}; returns this so that it can be chained on a throw. */
    public ApiException withHeader(String name, String value) {
        headers.put(name, value);
        return this;
    }

    /** Extra response headers of this error, usually none. */
    public Map<String, String> getHeaders() {
        return Map.copyOf(headers);
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    /** Null when the code needs no narrowing. */
    public String getReason() {
        return reason;
    }
}
