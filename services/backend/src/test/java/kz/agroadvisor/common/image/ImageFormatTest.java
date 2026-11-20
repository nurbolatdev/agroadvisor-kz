package kz.agroadvisor.common.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;

import org.junit.jupiter.api.Test;

class ImageFormatTest {

    @Test
    void recognisesJpegByItsFirstBytes() {
        assertThat(ImageFormat.detect(new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0}))
                .contains("image/jpeg");
    }

    @Test
    void recognisesPngByItsSignature() {
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0};

        assertThat(ImageFormat.detect(png)).contains("image/png");
    }

    @Test
    void rejectsEmptyAndMissingData() {
        assertThat(ImageFormat.detect(new byte[0])).isEmpty();
        assertThat(ImageFormat.detect(null)).isEmpty();
    }

    @Test
    void rejectsAnotherFormat() {
        assertThat(ImageFormat.detect("GIF89a-not-an-accepted-image".getBytes())).isEqualTo(Optional.empty());
    }

    @Test
    void rejectsMoreThanTenMegabytes() {
        byte[] big = new byte[ImageFormat.MAX_BYTES + 1];
        big[0] = (byte) 0xFF;
        big[1] = (byte) 0xD8;
        big[2] = (byte) 0xFF;

        assertThat(ImageFormat.detect(big)).isEmpty();
    }

    @Test
    void acceptsExactlyTenMegabytes() {
        byte[] max = new byte[ImageFormat.MAX_BYTES];
        max[0] = (byte) 0xFF;
        max[1] = (byte) 0xD8;
        max[2] = (byte) 0xFF;

        assertThat(ImageFormat.detect(max)).contains("image/jpeg");
    }
}
