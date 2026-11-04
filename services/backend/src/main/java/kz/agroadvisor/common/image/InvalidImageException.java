package kz.agroadvisor.common.image;

/**
 * The bytes are not a readable JPEG or PNG: an unknown format or a broken container. It is not an HTTP
 * error by itself; each caller turns it into the error code of its own endpoint.
 */
public class InvalidImageException extends RuntimeException {

    public InvalidImageException(String message) {
        super(message);
    }
}
