package kz.agroadvisor.diagnosis.service;

import java.util.List;

/** The AI service as seen by the diagnosis module; {@link HttpAiClient} is the real one, {@code StubAiClient} a fake. */
public interface AiClient {

    /** Recognizes the disease on a photo of the given crop. */
    Prediction predict(String crop, byte[] image);

    /** Crop codes the model supports (the AI service's {@code GET /classes}), not a hardcoded list. */
    List<String> crops();

    /**
     * The model the AI service runs now (its {@code GET /health}). Throws {@code 503 ai_unavailable} when the
     * service cannot be reached, is not ready, or runs a placeholder model that is not allowed.
     */
    ModelInfo modelInfo();
}
