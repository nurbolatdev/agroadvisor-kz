package kz.agroadvisor.common.image;

import java.util.Arrays;
import java.util.Optional;

/** Detects a JPEG or PNG image from its first bytes; the Content-Type sent by a client is not trusted. */
public final class ImageFormat {

    /** The largest photo accepted. */
    public static final int MAX_BYTES = 10 * 1024 * 1024;

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};

    private ImageFormat() {
    }

    /** {@code image/jpeg} or {@code image/png}; empty for no data, more than 10 MB, or another format. */
    public static Optional<String> detect(byte[] data) {
        if (data == null || data.length == 0 || data.length > MAX_BYTES) {
            return Optional.empty();
        }
        if (startsWith(data, JPEG)) {
            return Optional.of("image/jpeg");
        }
        if (startsWith(data, PNG)) {
            return Optional.of("image/png");
        }
        return Optional.empty();
    }

    private static boolean startsWith(byte[] data, byte[] prefix) {
        return data.length > prefix.length && Arrays.equals(data, 0, prefix.length, prefix, 0, prefix.length);
    }
}
