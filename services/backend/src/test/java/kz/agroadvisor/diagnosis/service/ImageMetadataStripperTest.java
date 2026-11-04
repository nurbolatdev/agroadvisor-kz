package kz.agroadvisor.diagnosis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import kz.agroadvisor.common.web.ApiException;

class ImageMetadataStripperTest {

    private static final byte[] SOI = {(byte) 0xFF, (byte) 0xD8};
    private static final byte[] EOI = {(byte) 0xFF, (byte) 0xD9};
    /** SOS header, entropy data with a stuffed 0xFF00 and a restart marker, no EOI. */
    private static final byte[] SCAN = {(byte) 0xFF, (byte) 0xDA, 0, 4, 1, 2, 0x11, 0x22, (byte) 0xFF, 0x00, 0x33,
        (byte) 0xFF, (byte) 0xD0, 0x44};
    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
    /** JFIF 1.1, 1:1 aspect, no thumbnail. */
    private static final byte[] JFIF = seg(0xE0, new byte[] {'J', 'F', 'I', 'F', 0, 1, 1, 0, 0, 1, 0, 1, 0, 0});

    private final ImageMetadataStripper stripper = new ImageMetadataStripper();

    // ---- JPEG: allow-list ----

    @Test
    void jpegKeepsOnlyJfifIccAdobeAndTheCodingSegments() {
        byte[] jfif = JFIF;
        byte[] icc = seg(0xE2, "ICC_PROFILE\0data");
        byte[] adobe = seg(0xEE, "Adobe\0\0\0\0\0\0\0");
        byte[] dqt = seg(0xDB, new byte[] {0, 1, 2, 3});
        byte[] xmp = seg(0xE1, "http://ns.adobe.com/xap/1.0/\0<x/>");
        byte[] mpf = seg(0xE2, "MPF\0data");
        byte[] app3 = seg(0xE3, "Meta\0");
        byte[] iptc = seg(0xED, "Photoshop 3.0\0");
        byte[] app15 = seg(0xEF, "x");
        byte[] comment = seg(0xFE, "taken at 43.2N 76.9E");

        byte[] result = stripper.strip(cat(SOI, jfif, xmp, icc, mpf, app3, iptc, adobe, app15, comment, dqt, SCAN,
                EOI));

        assertThat(result).isEqualTo(cat(SOI, jfif, icc, adobe, dqt, SCAN, EOI));
    }

    @Test
    void jpegWithoutMetadataStaysByteForByte() {
        byte[] original = cat(SOI, JFIF, seg(0xDB, new byte[] {0, 1, 2}), SCAN, EOI);

        assertThat(stripper.strip(original)).isEqualTo(original);
    }

    @Test
    void aJfifThumbnailIsCutOffAndAJfxxExtensionIsDropped() {
        byte[] withThumbnail = seg(0xE0, new byte[] {'J', 'F', 'I', 'F', 0, 1, 2, 0, 72, 0, 72, 2, 2, 9, 9, 9, 9, 9,
            9, 9, 9, 9, 9, 9, 9});
        byte[] jfxx = seg(0xE0, cat("JFXX\0".getBytes(StandardCharsets.US_ASCII), new byte[] {0x10},
                "a whole jpeg with GPS".getBytes(StandardCharsets.US_ASCII)));
        byte[] vendor = seg(0xE0, "Ocad$Rev1234");

        byte[] result = stripper.strip(cat(SOI, withThumbnail, jfxx, vendor, SCAN, EOI));

        byte[] jfifNoThumbnail = seg(0xE0, new byte[] {'J', 'F', 'I', 'F', 0, 1, 2, 0, 72, 0, 72, 2, 0, 0});
        assertThat(result).isEqualTo(cat(SOI, jfifNoThumbnail, SCAN, EOI));
    }

    @Test
    void adobeIsKeptOnlyAsAdobeAndCutToItsTwelveBytes() {
        byte[] adobe = new byte[] {'A', 'd', 'o', 'b', 'e', 0, 100, 0, 0, 0, 0, 1};
        byte[] adobeWithTail = seg(0xEE, cat(adobe, "tail with GPS".getBytes(StandardCharsets.US_ASCII)));
        byte[] other = seg(0xEE, "Something else 12345");
        byte[] short14 = seg(0xEE, "Adobe\0");

        assertThat(stripper.strip(cat(SOI, adobeWithTail, other, short14, SCAN, EOI)))
                .isEqualTo(cat(SOI, seg(0xEE, adobe), SCAN, EOI));
    }

    @Test
    void aReservedOrExtensionMarkerIsInvalid() {
        assertInvalid(cat(SOI, seg(0x02, "x"), SCAN, EOI));
        assertInvalid(cat(SOI, seg(0xC8, "x"), SCAN, EOI));
        assertInvalid(cat(SOI, seg(0xF3, "x"), SCAN, EOI));
    }

    // ---- JPEG: orientation ----

    @Test
    void gpsIsRemovedButOrientationSurvivesInAMinimalExif() {
        byte[] jfif = JFIF;
        byte[] exif = seg(0xE1, exifWithGps(true, 6));

        byte[] result = stripper.strip(cat(SOI, jfif, exif, SCAN, EOI));

        byte[] minimal = seg(0xE1, new byte[] {'E', 'x', 'i', 'f', 0, 0, 'M', 'M', 0, 42, 0, 0, 0, 8, 0, 1, 0x01,
            0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0});
        assertThat(result).isEqualTo(cat(SOI, jfif, minimal, SCAN, EOI));
        assertThat(new String(result, StandardCharsets.ISO_8859_1)).doesNotContain("GPS");
    }

    @Test
    void littleEndianExifKeepsItsByteOrder() {
        byte[] result = stripper.strip(cat(SOI, seg(0xE1, exifWithGps(false, 3)), SCAN, EOI));

        byte[] minimal = seg(0xE1, new byte[] {'E', 'x', 'i', 'f', 0, 0, 'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12,
            0x01, 3, 0, 1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0});
        assertThat(result).isEqualTo(cat(SOI, minimal, SCAN, EOI));
    }

    @Test
    void exifWithoutOrientationOrWithAnInvalidOneIsDroppedCompletely() {
        byte[] noOrientation = seg(0xE1, exifWithGps(true, 0));
        byte[] invalid = seg(0xE1, exifWithGps(true, 9));

        assertThat(stripper.strip(cat(SOI, noOrientation, SCAN, EOI))).isEqualTo(cat(SOI, SCAN, EOI));
        assertThat(stripper.strip(cat(SOI, invalid, SCAN, EOI))).isEqualTo(cat(SOI, SCAN, EOI));
    }

    @Test
    void anExifThatIsNotATiffIsDroppedWithoutAnError() {
        byte[] junk = seg(0xE1, "Exif\0\0not a tiff header at all");

        assertThat(stripper.strip(cat(SOI, junk, SCAN, EOI))).isEqualTo(cat(SOI, SCAN, EOI));
    }

    // ---- JPEG: structure ----

    @Test
    void everythingAfterTheFirstEoiIsCutOff() {
        byte[] trailer = cat(EOI, seg(0xE2, "MPF\0second picture"), SOI, SCAN, EOI, "SEFT".getBytes());
        byte[] original = cat(SOI, JFIF, SCAN, EOI, trailer);

        assertThat(stripper.strip(original)).isEqualTo(cat(SOI, JFIF, SCAN, EOI));
    }

    @Test
    void aMetadataSegmentBetweenScansIsDroppedAndTheSecondScanKept() {
        byte[] second = {(byte) 0xFF, (byte) 0xDA, 0, 2, 0x55};
        byte[] original = cat(SOI, SCAN, seg(0xE1, "Exif\0\0late"), second, EOI);

        assertThat(stripper.strip(original)).isEqualTo(cat(SOI, SCAN, second, EOI));
    }

    @Test
    void standaloneMarkersAndFillBytesAreKept() {
        byte[] original = cat(SOI, new byte[] {(byte) 0xFF, 0x01, (byte) 0xFF, (byte) 0xD3}, seg(0xDB, new byte[] {1}),
                new byte[] {(byte) 0xFF, (byte) 0xFF, (byte) 0xFF}, SCAN, new byte[] {(byte) 0xFF}, EOI);

        assertThat(stripper.strip(original)).isEqualTo(original);
    }

    @Test
    void aSegmentShorterThanItsLengthFieldIsInvalid() {
        assertInvalid(cat(SOI, new byte[] {(byte) 0xFF, (byte) 0xE1, 0, 1}, SCAN, EOI));
        assertInvalid(cat(SOI, new byte[] {(byte) 0xFF, (byte) 0xDB, 0, 0}, SCAN, EOI));
    }

    @Test
    void aSegmentRunningPastTheEndIsInvalid() {
        assertInvalid(cat(SOI, new byte[] {(byte) 0xFF, (byte) 0xE1, 0x7F, 0x00, 1, 2, 3}));
    }

    @Test
    void aJpegWithoutEoiIsInvalid() {
        assertInvalid(cat(SOI, JFIF, SCAN));
        assertInvalid(cat(SOI, JFIF));
    }

    @Test
    void garbageBetweenSegmentsIsInvalid() {
        assertInvalid(cat(SOI, new byte[] {1, 2, 3, 4}, EOI));
    }

    // ---- PNG ----

    @Test
    void pngKeepsCriticalAndColourChunksOnly() {
        byte[] ihdr = chunk("IHDR", new byte[] {0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0});
        byte[] kept = cat(chunk("PLTE", new byte[] {1, 2, 3}), chunk("iCCP", new byte[] {'s', 0, 0, 1}),
                chunk("sRGB", new byte[] {0}), chunk("gAMA", new byte[4]), chunk("cHRM", new byte[32]),
                chunk("pHYs", new byte[9]), chunk("tRNS", new byte[] {0}), chunk("bKGD", new byte[] {0}),
                chunk("sBIT", new byte[] {8}));
        byte[] dropped = cat(chunk("tEXt", "GPS\0 43.2N".getBytes(StandardCharsets.US_ASCII)),
                chunk("zTXt", new byte[] {'k', 0, 0, 1}), chunk("iTXt", new byte[] {'k', 0, 0, 0, 0, 0, 'v'}),
                chunk("eXIf", new byte[] {'M', 'M', 0, 42}), chunk("tIME", new byte[7]),
                chunk("sPLT", new byte[] {'p', 0, 8}), chunk("hIST", new byte[2]), chunk("prVt", new byte[] {1}));
        byte[] idat = chunk("IDAT", new byte[] {1, 2, 3, 4});
        byte[] iend = chunk("IEND", new byte[0]);

        byte[] result = stripper.strip(cat(PNG_SIGNATURE, ihdr, dropped, kept, idat, iend));

        assertThat(result).isEqualTo(cat(PNG_SIGNATURE, ihdr, kept, idat, iend));
    }

    @Test
    void pngGpsIsRemovedButOrientationSurvivesInAMinimalExifChunk() {
        byte[] ihdr = chunk("IHDR", new byte[13]);
        byte[] exif = chunk("eXIf", tiffOf(exifWithGps(true, 6)));
        byte[] idat = chunk("IDAT", new byte[] {1});
        byte[] iend = chunk("IEND", new byte[0]);

        byte[] result = stripper.strip(cat(PNG_SIGNATURE, ihdr, exif, idat, iend));

        byte[] minimal = chunk("eXIf", new byte[] {'M', 'M', 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1,
            0, 6, 0, 0, 0, 0, 0, 0});
        assertThat(result).isEqualTo(cat(PNG_SIGNATURE, ihdr, minimal, idat, iend));
        assertThat(new String(result, StandardCharsets.ISO_8859_1)).doesNotContain("GPS", "Cam");
    }

    @Test
    void pngLittleEndianOrientationKeepsItsByteOrder() {
        byte[] body = cat(chunk("IHDR", new byte[13]), chunk("IDAT", new byte[] {1}), chunk("IEND", new byte[0]));
        byte[] exif = chunk("eXIf", tiffOf(exifWithGps(false, 8)));

        byte[] result = stripper.strip(cat(PNG_SIGNATURE, exif, body));

        byte[] minimal = chunk("eXIf", new byte[] {'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 8,
            0, 0, 0, 0, 0, 0, 0});
        assertThat(result).isEqualTo(cat(PNG_SIGNATURE, minimal, body));
    }

    @Test
    void pngExifWithoutAUsableOrientationIsDroppedCompletely() {
        byte[] body = cat(chunk("IHDR", new byte[13]), chunk("IDAT", new byte[] {1}), chunk("IEND", new byte[0]));
        byte[] without = chunk("eXIf", tiffOf(exifWithGps(true, 0)));
        byte[] invalid = chunk("eXIf", tiffOf(exifWithGps(true, 9)));
        byte[] junk = chunk("eXIf", new byte[] {1, 2, 3});

        for (byte[] exif : new byte[][] {without, invalid, junk}) {
            assertThat(stripper.strip(cat(PNG_SIGNATURE, exif, body))).isEqualTo(cat(PNG_SIGNATURE, body));
        }
    }

    @Test
    void pngWithoutMetadataStaysByteForByte() {
        byte[] original = cat(PNG_SIGNATURE, chunk("IHDR", new byte[13]), chunk("IDAT", new byte[] {9}),
                chunk("IEND", new byte[0]));

        assertThat(stripper.strip(original)).isEqualTo(original);
    }

    @Test
    void pngDataAfterIendIsCutOff() {
        byte[] body = cat(PNG_SIGNATURE, chunk("IHDR", new byte[13]), chunk("IDAT", new byte[] {9}),
                chunk("IEND", new byte[0]));

        assertThat(stripper.strip(cat(body, chunk("tEXt", "late".getBytes()), new byte[] {1, 2}))).isEqualTo(body);
    }

    @Test
    void aTruncatedPngChunkIsInvalid() {
        assertInvalid(cat(PNG_SIGNATURE, new byte[] {0, 0, 0x7F, 0, 'I', 'D', 'A', 'T', 1}));
    }

    @Test
    void aPngWithoutIendIsInvalid() {
        assertInvalid(cat(PNG_SIGNATURE, chunk("IHDR", new byte[13]), chunk("IDAT", new byte[] {9})));
    }

    // ---- invalid_image is the same error the AI service gives ----

    @Test
    void unknownFormatIsInvalidImageWithoutAReason() {
        assertInvalid(new byte[] {1, 2, 3, 4, 5, 6, 7, 8, 9});
    }

    // ---- pixels do not change ----

    @Test
    void aRealJpegDecodesToTheSamePixelsAfterStripping() throws IOException {
        byte[] real = encode("jpg");
        // Put a comment, Exif with GPS and an IPTC segment right after SOI, and a trailer after EOI
        byte[] dirty = cat(SOI, seg(0xFE, "GPS 43.2N"), seg(0xE1, exifWithGps(true, 6)), seg(0xED, "Photoshop 3.0\0"),
                java.util.Arrays.copyOfRange(real, 2, real.length), "TRAILER-MPF".getBytes());

        byte[] clean = stripper.strip(dirty);

        assertThat(clean.length).isLessThan(dirty.length);
        assertThat(new String(clean, StandardCharsets.ISO_8859_1)).doesNotContain("GPS", "TRAILER", "Photoshop");
        assertSamePixels(real, clean);
    }

    @Test
    void aRealPngDecodesToTheSamePixelsAfterStripping() throws IOException {
        byte[] real = encode("png");
        int afterIhdr = PNG_SIGNATURE.length + 12 + 13;
        byte[] dirty = cat(java.util.Arrays.copyOfRange(real, 0, afterIhdr),
                chunk("tEXt", "GPS\0 43.2N".getBytes(StandardCharsets.US_ASCII)), chunk("tIME", new byte[7]),
                chunk("eXIf", new byte[] {'M', 'M', 0, 42}),
                java.util.Arrays.copyOfRange(real, afterIhdr, real.length), "TRAILER".getBytes());

        byte[] clean = stripper.strip(dirty);

        assertThat(new String(clean, StandardCharsets.ISO_8859_1)).doesNotContain("GPS", "TRAILER", "tIME");
        assertSamePixels(real, clean);
    }

    // ---- helpers ----

    private void assertInvalid(byte[] photo) {
        assertThatThrownBy(() -> stripper.strip(photo)).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getCode()).isEqualTo(DiagnosisErrors.INVALID_IMAGE);
            assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(e.getReason()).isNull();
        });
    }

    private static void assertSamePixels(byte[] before, byte[] after) throws IOException {
        BufferedImage a = ImageIO.read(new ByteArrayInputStream(before));
        BufferedImage b = ImageIO.read(new ByteArrayInputStream(after));
        assertThat(a).isNotNull();
        assertThat(b).isNotNull();
        assertThat(b.getWidth()).isEqualTo(a.getWidth());
        assertThat(b.getHeight()).isEqualTo(a.getHeight());
        for (int y = 0; y < a.getHeight(); y++) {
            for (int x = 0; x < a.getWidth(); x++) {
                assertThat(b.getRGB(x, y)).as("pixel %d,%d", x, y).isEqualTo(a.getRGB(x, y));
            }
        }
    }

    private static byte[] encode(String format) throws IOException {
        BufferedImage image = new BufferedImage(24, 16, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < 16; y++) {
            for (int x = 0; x < 24; x++) {
                image.setRGB(x, y, (x * 10) << 16 | (y * 15) << 8 | (x + y) * 5);
            }
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, format, out);
        return out.toByteArray();
    }

    /**
     * An Exif payload (with the {@code Exif\0\0} prefix): IFD0 with Make (a string) and, if
     * {@code orientation > 0}, Orientation, plus a GPS IFD pointer to a GPS IFD with a text value.
     */
    private static byte[] exifWithGps(boolean big, int orientation) {
        ByteArrayOutputStream t = new ByteArrayOutputStream();
        int entries = orientation > 0 ? 3 : 2;
        int gpsIfd = 8 + 2 + 12 * entries + 4;
        t.writeBytes(big ? new byte[] {'M', 'M'} : new byte[] {'I', 'I'});
        w16(t, 42, big);
        w32(t, 8, big);
        w16(t, entries, big);
        entry(t, 0x010F, 2, 4, "Cam\0".getBytes(StandardCharsets.US_ASCII), big); // Make
        if (orientation > 0) {
            entry(t, 0x0112, 3, 1, new byte[] {(byte) (big ? 0 : orientation), (byte) (big ? orientation : 0), 0, 0},
                    big);
        }
        w16(t, 0x8825, big);
        w16(t, 4, big);
        w32(t, 1, big);
        w32(t, gpsIfd, big); // GPS IFD pointer
        w32(t, 0, big); // no next IFD
        w16(t, 1, big); // GPS IFD: one entry
        entry(t, 0x0002, 2, 4, "GPS\0".getBytes(StandardCharsets.US_ASCII), big);
        w32(t, 0, big);
        return cat(new byte[] {'E', 'x', 'i', 'f', 0, 0}, t.toByteArray());
    }

    private static void entry(ByteArrayOutputStream t, int tag, int type, int count, byte[] value, boolean big) {
        w16(t, tag, big);
        w16(t, type, big);
        w32(t, count, big);
        t.writeBytes(value);
    }

    private static void w16(ByteArrayOutputStream t, int v, boolean big) {
        t.write(big ? v >> 8 : v);
        t.write(big ? v : v >> 8);
    }

    private static void w32(ByteArrayOutputStream t, int v, boolean big) {
        if (big) {
            w16(t, v >>> 16, true);
            w16(t, v, true);
        } else {
            w16(t, v, false);
            w16(t, v >>> 16, false);
        }
    }

    /** The TIFF block of an Exif payload, as a PNG {@code eXIf} chunk holds it (no {@code Exif\0\0}). */
    private static byte[] tiffOf(byte[] exifPayload) {
        return java.util.Arrays.copyOfRange(exifPayload, 6, exifPayload.length);
    }

    private static byte[] seg(int marker, String payload) {
        return seg(marker, payload.getBytes(StandardCharsets.ISO_8859_1));
    }

    private static byte[] seg(int marker, byte[] payload) {
        int length = payload.length + 2;
        return cat(new byte[] {(byte) 0xFF, (byte) marker, (byte) (length >> 8), (byte) length}, payload);
    }

    private static byte[] chunk(String type, byte[] data) {
        byte[] typeBytes = type.getBytes(StandardCharsets.US_ASCII);
        CRC32 crc = new CRC32();
        crc.update(typeBytes);
        crc.update(data);
        long c = crc.getValue();
        return cat(intBytes(data.length), typeBytes, data, intBytes(c));
    }

    private static byte[] intBytes(long v) {
        return new byte[] {(byte) (v >> 24), (byte) (v >> 16), (byte) (v >> 8), (byte) v};
    }

    private static byte[] cat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] p : parts) {
            out.writeBytes(p);
        }
        return out.toByteArray();
    }
}
