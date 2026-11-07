package kz.agroadvisor.diagnosis.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;

import kz.agroadvisor.common.web.ApiException;

class DiagnosisErrorsTest {

    @ParameterizedTest(name = "{0} {1} gives the token back: {2}")
    @CsvSource({
        // the server did no work or failed on its side: refunded
        "SERVICE_UNAVAILABLE, ai_unavailable, true",
        "BAD_GATEWAY, ai_error, true",
        "SERVICE_UNAVAILABLE, storage_unavailable, true",
        "INTERNAL_SERVER_ERROR, internal_error, true",
        "CONFLICT, request_in_progress, true",
        // compute was spent on, or the fault is in, the client's input: charged
        "BAD_REQUEST, unknown_crop, false",
        "BAD_REQUEST, invalid_image, false",
        "UNPROCESSABLE_CONTENT, low_quality, false",
        "UNPROCESSABLE_CONTENT, idempotency_key_reused, false",
        "NOT_FOUND, diagnosis_not_found, false",
    })
    void decidesByTheStatusOfTheError(HttpStatus status, String code, boolean refunded) {
        assertThat(DiagnosisErrors.givesBackTheToken(new ApiException(status, code, "detail"))).isEqualTo(refunded);
    }

    @Test
    void anUnknownRuntimeExceptionIsAFaultOfTheServerSoTheTokenIsGivenBack() {
        assertThat(DiagnosisErrors.givesBackTheToken(new IllegalStateException("boom"))).isTrue();
        assertThat(DiagnosisErrors.givesBackTheToken(new NullPointerException())).isTrue();
        assertThat(DiagnosisErrors.givesBackTheToken(new DataIntegrityViolationException("unique"))).isTrue();
    }
}
