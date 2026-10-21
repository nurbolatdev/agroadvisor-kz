package kz.agroadvisor.common.web;

import org.springframework.http.HttpStatusCode;

/** Codes for errors that are not specific to a module. */
public final class ErrorCodes {

    public static final String VALIDATION_FAILED = "validation_failed";
    public static final String BAD_REQUEST = "bad_request";
    public static final String UNAUTHORIZED = "unauthorized";
    public static final String FORBIDDEN = "forbidden";
    public static final String NOT_FOUND = "not_found";
    public static final String METHOD_NOT_ALLOWED = "method_not_allowed";
    public static final String CONFLICT = "conflict";
    public static final String PAYLOAD_TOO_LARGE = "payload_too_large";
    public static final String UNSUPPORTED_MEDIA_TYPE = "unsupported_media_type";
    public static final String INTERNAL_ERROR = "internal_error";

    private ErrorCodes() {
    }

    /** Default code for framework errors that carry only an HTTP status. */
    public static String forStatus(HttpStatusCode status) {
        return switch (status.value()) {
            case 400 -> BAD_REQUEST;
            case 401 -> UNAUTHORIZED;
            case 403 -> FORBIDDEN;
            case 404 -> NOT_FOUND;
            case 405 -> METHOD_NOT_ALLOWED;
            case 409 -> CONFLICT;
            case 413 -> PAYLOAD_TOO_LARGE;
            case 415 -> UNSUPPORTED_MEDIA_TYPE;
            default -> status.is5xxServerError() ? INTERNAL_ERROR : BAD_REQUEST;
        };
    }
}
