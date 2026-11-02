package kz.agroadvisor.diagnosis.service;

import java.util.List;

/** The AI service as seen by the diagnosis module; {@link HttpAiClient} is the real one, {@code StubAiClient} a fake. */
public interface AiClient {

    /** Recognizes the disease on a photo of the given crop. */
    Prediction predict(String crop, byte[] image);

    /** Crop codes the model supports (the AI service's {@code GET /classes}), not a hardcoded list. */
    List<String> crops();
}
