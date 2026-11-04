package kz.agroadvisor.diagnosis.service;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Set;
import java.util.zip.CRC32;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import kz.agroadvisor.common.web.ApiException;

/**
 * Removes personal metadata (GPS, camera, time, author, embedded thumbnails and trailers) from a photo
 * by cutting bytes out of the container; the pixel data is never decoded or re-encoded, so it stays
 * identical. It works on an allow-list: what is not known to be needed for showing the picture is dropped.
 *
 * <ul>
 *   <li>JPEG: kept are the coding markers (frames, tables, scans), APP0 as JFIF without a thumbnail, APP2
 *       only with the {@code ICC_PROFILE\0} prefix and APP14 only as Adobe. Dropped are the other APPn (Exif,
 *       XMP, IPTC, MPF, JFXX, ...) and comments; any other marker is {@code invalid_image}. If the Exif had
 *       an Orientation tag, a minimal Exif with only that tag replaces it, so a rotated phone photo still
 *       shows upright. Everything after the first EOI (Multi-Picture, Samsung SEFT, Motion Photo video) is
 *       cut off.</li>
 *   <li>PNG: kept are the critical chunks and {@code iCCP, sRGB, gAMA, cHRM, pHYs, tRNS, bKGD, sBIT}; text,
 *       time and unknown chunks are dropped, as is anything after {@code IEND}. {@code eXIf} is replaced by
 *       a minimal one with only the Orientation, if it had one.</li>
 * </ul>
 *
 * A file without such parts comes back byte for byte. A broken container (a segment or chunk running past
 * the end, no EOI / IEND) is {@code invalid_image}, with the same code and status as the AI service's.
 */
@Component
public class ImageMetadataStripper {

    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
    private static final Set<String> PNG_KEPT_CHUNKS = Set.of(
            "IHDR", "PLTE", "IDAT", "IEND", // critical
            "iCCP", "sRGB", "gAMA", "cHRM", "pHYs", "tRNS", "bKGD", "sBIT");

    private static final byte[] ICC_PREFIX = "ICC_PROFILE\0".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] JFIF_PREFIX = "JFIF\0".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] ADOBE_PREFIX = "Adobe".getBytes(StandardCharsets.US_ASCII);
    /** JFIF: identifier, version, units, densities, thumbnail size; Adobe: identifier, version, two flags, transform. */
    private static final int JFIF_PAYLOAD_LENGTH = 14;
    private static final int ADOBE_PAYLOAD_LENGTH = 12;
    private static final byte[] EXIF_PREFIX = {'E', 'x', 'i', 'f', 0, 0};
    private static final int EXIF_ORIENTATION_TAG = 0x0112;
    private static final int TIFF_SHORT = 3;

    private static final int MARKER_TEM = 0x01;
    private static final int MARKER_SOI = 0xD8;
    private static final int MARKER_EOI = 0xD9;
    private static final int MARKER_SOS = 0xDA;
    private static final int MARKER_APP0 = 0xE0;
    private static final int MARKER_APP1 = 0xE1;
    private static final int MARKER_APP2 = 0xE2;
    private static final int MARKER_APP14 = 0xEE;
    private static final int MARKER_APP15 = 0xEF;
    private static final int MARKER_COM = 0xFE;

    public byte[] strip(byte[] photo) {
        if (photo.length > PNG_SIGNATURE.length
                && Arrays.equals(photo, 0, PNG_SIGNATURE.length, PNG_SIGNATURE, 0, PNG_SIGNATURE.length)) {
            return stripPng(photo);
        }
        if (photo.length > 3 && u8(photo, 0) == 0xFF && u8(photo, 1) == MARKER_SOI) {
            return stripJpeg(photo);
        }
        throw invalid();
    }

    // ---- JPEG ----

    private static byte[] stripJpeg(byte[] in) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(in.length);
        out.write(in, 0, 2); // SOI
        int pos = 2;
        boolean orientationKept = false;
        while (true) {
            if (pos + 1 >= in.length || u8(in, pos) != 0xFF) {
                throw invalid(); // no EOI before the end, or garbage between segments
            }
            int marker = u8(in, pos + 1);
            if (marker == 0xFF) { // fill byte before a marker
                out.write(0xFF);
                pos++;
                continue;
            }
            if (marker == MARKER_EOI) {
                out.write(in, pos, 2);
                return out.toByteArray(); // anything after the first EOI is not part of the picture
            }
            if (marker == MARKER_TEM || (marker >= 0xD0 && marker <= 0xD7)) { // standalone, no length
                out.write(in, pos, 2);
                pos += 2;
                continue;
            }
            if (marker == 0x00 || marker == MARKER_SOI || pos + 4 > in.length) {
                throw invalid();
            }
            int length = (u8(in, pos + 2) << 8) | u8(in, pos + 3);
            int end = pos + 2 + length;
            if (length < 2 || end > in.length) {
                throw invalid();
            }
            if (marker == MARKER_SOS) {
                // The entropy-coded data after the header is copied untouched, up to the next real marker
                int next = endOfScan(in, end);
                out.write(in, pos, next - pos);
                pos = next;
                continue;
            }
            int payload = pos + 4;
            if (marker == MARKER_APP0) {
                writeJfifWithoutThumbnail(out, in, payload, end);
            } else if (marker == MARKER_APP14) {
                writeAdobe(out, in, payload, end);
            } else if (marker == MARKER_APP2) {
                if (hasPrefix(in, payload, end, ICC_PREFIX)) {
                    out.write(in, pos, end - pos);
                }
            } else if (marker == MARKER_APP1) {
                // Exif and XMP are dropped, except that an Orientation is carried over in a minimal Exif.
                // Known cost of dropping an Exif that had no Orientation: Java ImageIO guesses the colour
                // space of a JPEG without JFIF and with component ids 0, 1, 2 from the presence of APP
                // segments, so it may decode such a file with different colours (PIL, the AI service and
                // the phone viewers are not affected). If the backend ever decodes photos with ImageIO
                // (thumbnails, previews), write the minimal Exif with Orientation = 1 whenever a valid
                // Exif was present.
                Orientation orientation = orientationKept || !hasPrefix(in, payload, end, EXIF_PREFIX) ? null
                        : exifOrientation(in, payload + EXIF_PREFIX.length, end);
                if (orientation != null) {
                    writeMinimalExif(out, orientation);
                    orientationKept = true;
                }
            } else if (isDroppedMarker(marker)) {
                // other APPn and comments: not part of the picture
            } else if (isCodingMarker(marker)) {
                out.write(in, pos, end - pos);
            } else {
                throw invalid(); // reserved or extension marker: not a photo from a camera
            }
            pos = end;
        }
    }

    private static boolean isDroppedMarker(int marker) {
        return (marker >= MARKER_APP1 && marker <= MARKER_APP15) || marker == MARKER_COM;
    }

    /** SOFn (not DHT, JPG, DAC), DHT, DAC, DQT, DNL, DRI, DHP, EXP: what a decoder needs to read the scans. */
    private static boolean isCodingMarker(int marker) {
        return (marker >= 0xC0 && marker <= 0xCF && marker != 0xC8) || (marker >= 0xDB && marker <= 0xDF);
    }

    private static boolean hasPrefix(byte[] in, int payloadStart, int end, byte[] prefix) {
        return end - payloadStart >= prefix.length
                && Arrays.equals(in, payloadStart, payloadStart + prefix.length, prefix, 0, prefix.length);
    }

    /**
     * JFIF APP0 rewritten to its 14 payload bytes with no thumbnail (Xthumbnail = Ythumbnail = 0): a thumbnail
     * or a JFXX extension can hold a whole other picture, with its own Exif. Any other APP0 is dropped.
     */
    private static void writeJfifWithoutThumbnail(ByteArrayOutputStream out, byte[] in, int payload, int end) {
        if (end - payload < JFIF_PAYLOAD_LENGTH || !hasPrefix(in, payload, end, JFIF_PREFIX)) {
            return;
        }
        out.write(0xFF);
        out.write(MARKER_APP0);
        out.write((JFIF_PAYLOAD_LENGTH + 2) >> 8);
        out.write(JFIF_PAYLOAD_LENGTH + 2);
        out.write(in, payload, JFIF_PAYLOAD_LENGTH - 2);
        out.write(0); // Xthumbnail
        out.write(0); // Ythumbnail
    }

    /** Adobe APP14 (colour transform), cut to its 12 bytes. Any other APP14 is dropped. */
    private static void writeAdobe(ByteArrayOutputStream out, byte[] in, int payload, int end) {
        if (end - payload < ADOBE_PAYLOAD_LENGTH || !hasPrefix(in, payload, end, ADOBE_PREFIX)) {
            return;
        }
        out.write(0xFF);
        out.write(MARKER_APP14);
        out.write((ADOBE_PAYLOAD_LENGTH + 2) >> 8);
        out.write(ADOBE_PAYLOAD_LENGTH + 2);
        out.write(in, payload, ADOBE_PAYLOAD_LENGTH);
    }

    /** Index of the first marker after the entropy-coded data that starts at {@code from}. */
    private static int endOfScan(byte[] in, int from) {
        int p = from;
        while (p < in.length) {
            if (u8(in, p) != 0xFF) {
                p++;
                continue;
            }
            if (p + 1 >= in.length) {
                break;
            }
            int next = u8(in, p + 1);
            if (next == 0x00 || (next >= 0xD0 && next <= 0xD7)) { // stuffed byte or restart marker
                p += 2;
            } else if (next == 0xFF) { // fill byte
                p++;
            } else {
                return p;
            }
        }
        throw invalid();
    }

    /** The Orientation (1-8) of an Exif and the byte order it was written in. */
    private record Orientation(int value, boolean bigEndian) {
    }

    /**
     * The Orientation from the first IFD of the TIFF block that starts at {@code tiff} and ends at
     * {@code end} (the same block sits in a JPEG APP1 after {@code Exif\0\0} and in a PNG {@code eXIf}
     * chunk), or null if there is none or it is unusable.
     */
    private static Orientation exifOrientation(byte[] in, int tiff, int end) {
        if (end - tiff < 8) {
            return null;
        }
        boolean big = in[tiff] == 'M' && in[tiff + 1] == 'M';
        if (!big && !(in[tiff] == 'I' && in[tiff + 1] == 'I')) {
            return null;
        }
        long ifd = u32(in, tiff + 4, big);
        long entries = tiff + ifd;
        if (ifd < 8 || entries + 2 > end) {
            return null;
        }
        int count = u16(in, (int) entries, big);
        for (int i = 0; i < count; i++) {
            long entry = entries + 2 + 12L * i;
            if (entry + 12 > end) {
                return null;
            }
            if (u16(in, (int) entry, big) == EXIF_ORIENTATION_TAG) {
                boolean shortOne = u16(in, (int) entry + 2, big) == TIFF_SHORT && u32(in, (int) entry + 4, big) == 1;
                int value = u16(in, (int) entry + 8, big);
                return shortOne && value >= 1 && value <= 8 ? new Orientation(value, big) : null;
            }
        }
        return null;
    }

    /** A TIFF block with one IFD0 entry, Orientation, in the byte order of the original. */
    private static byte[] minimalTiff(Orientation orientation) {
        boolean big = orientation.bigEndian();
        byte[] tiff = new byte[26];
        tiff[0] = tiff[1] = (byte) (big ? 'M' : 'I');
        put16(tiff, 2, 42, big);
        put32(tiff, 4, 8, big);
        put16(tiff, 8, 1, big); // one entry
        put16(tiff, 10, EXIF_ORIENTATION_TAG, big);
        put16(tiff, 12, TIFF_SHORT, big);
        put32(tiff, 14, 1, big);
        put16(tiff, 18, orientation.value(), big); // value, padded to 4 bytes by the zeros
        // bytes 20..21 stay 0 (padding), 22..25 stay 0 (no next IFD)
        return tiff;
    }

    /** An APP1 segment: {@code Exif\0\0} and the minimal TIFF block. */
    private static void writeMinimalExif(ByteArrayOutputStream out, Orientation orientation) {
        byte[] tiff = minimalTiff(orientation);
        int length = 2 + EXIF_PREFIX.length + tiff.length;
        out.write(0xFF);
        out.write(MARKER_APP1);
        out.write(length >> 8);
        out.write(length);
        out.writeBytes(EXIF_PREFIX);
        out.writeBytes(tiff);
    }

    // ---- PNG ----

    private static byte[] stripPng(byte[] in) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(in.length);
        out.write(in, 0, PNG_SIGNATURE.length);
        int pos = PNG_SIGNATURE.length;
        boolean orientationKept = false;
        while (pos + 12 <= in.length) {
            long length = u32(in, pos, true);
            long end = pos + 12L + length;
            if (end > in.length) {
                throw invalid();
            }
            String type = new String(in, pos + 4, 4, StandardCharsets.ISO_8859_1);
            if (PNG_KEPT_CHUNKS.contains(type)) {
                out.write(in, pos, (int) (end - pos));
            } else if (type.equals("eXIf") && !orientationKept) {
                // The AI service turns a picture upright by this tag, so it is carried over like in a JPEG
                Orientation orientation = exifOrientation(in, pos + 8, (int) end - 4);
                if (orientation != null) {
                    writeChunk(out, "eXIf", minimalTiff(orientation));
                    orientationKept = true;
                }
            }
            pos = (int) end;
            if (type.equals("IEND")) {
                return out.toByteArray(); // trailing bytes after IEND are not part of the picture
            }
        }
        throw invalid(); // no IEND
    }

    private static void writeChunk(ByteArrayOutputStream out, String type, byte[] data) {
        byte[] typeBytes = type.getBytes(StandardCharsets.US_ASCII);
        CRC32 crc = new CRC32();
        crc.update(typeBytes);
        crc.update(data);
        out.writeBytes(intBytes(data.length));
        out.writeBytes(typeBytes);
        out.writeBytes(data);
        out.writeBytes(intBytes(crc.getValue()));
    }

    private static byte[] intBytes(long v) {
        return new byte[] {(byte) (v >> 24), (byte) (v >> 16), (byte) (v >> 8), (byte) v};
    }

    // ---- helpers ----

    private static int u8(byte[] b, int i) {
        return b[i] & 0xFF;
    }

    private static int u16(byte[] b, int i, boolean big) {
        return big ? (u8(b, i) << 8) | u8(b, i + 1) : (u8(b, i + 1) << 8) | u8(b, i);
    }

    private static long u32(byte[] b, int i, boolean big) {
        long hi = u16(b, big ? i : i + 2, big);
        long lo = u16(b, big ? i + 2 : i, big);
        return (hi << 16) | lo;
    }

    private static void put16(byte[] b, int i, int v, boolean big) {
        b[big ? i : i + 1] = (byte) (v >> 8);
        b[big ? i + 1 : i] = (byte) v;
    }

    private static void put32(byte[] b, int i, int v, boolean big) {
        put16(b, big ? i : i + 2, v >>> 16, big);
        put16(b, big ? i + 2 : i, v, big);
    }

    /** Same code, status and no {@code reason} as the AI service's {@code invalid_image} (HttpAiClient). */
    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, DiagnosisErrors.INVALID_IMAGE,
                "The photo cannot be read, send another JPEG or PNG");
    }
}
