package kz.agroadvisor.diagnosis.service;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import kz.agroadvisor.catalog.model.Crop;
import kz.agroadvisor.catalog.repository.CropRepository;
import kz.agroadvisor.diagnosis.service.Prediction.ClassScore;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class StubAiClientTest {

    private final CropRepository crops = mock(CropRepository.class);
    private final StubAiClient client = new StubAiClient(crops);

    @Test
    void answersWithTheContractShapeForTheRequestedCrop() {
        Prediction prediction = client.predict("tomato", new byte[] {1, 2, 3});

        assertThat(prediction.status()).isEqualTo("ok");
        assertThat(prediction.crop()).isEqualTo("tomato");
        assertThat(prediction.top1()).isEqualTo(new ClassScore("tomato__healthy", 0.99));
        assertThat(prediction.top3()).containsExactly(prediction.top1());
        assertThat(prediction.detectedCrop()).isNull();
        assertThat(prediction.classesVersion()).isPositive();
    }

    @Test
    void marksItsAnswerAsAPlaceholderSoItIsNeverShownAsARealDiagnosis() {
        Prediction prediction = client.predict("potato", new byte[0]);

        assertThat(prediction.modelVersion()).isEqualTo("placeholder-v0");
        assertThat(prediction.isPlaceholder()).isTrue();
    }

    @Test
    void aRealModelVersionIsNotAPlaceholder() {
        Prediction real = new Prediction("ok", "tomato", new ClassScore("tomato__late_blight", 0.9),
                List.of(), null, "efficientnet-b0-v3", 2, 41);

        assertThat(real.isPlaceholder()).isFalse();
    }

    @Test
    void listsTheCropsFromTheReferenceInsteadOfHardcodingThem() {
        when(crops.findAllByOrderBySortOrderAscCodeAsc()).thenReturn(List.of(
                new Crop("tomato", Map.of("en", "Tomato"), 1), new Crop("wheat", Map.of("en", "Wheat"), 2)));

        assertThat(client.crops()).containsExactly("tomato", "wheat");
    }
}
