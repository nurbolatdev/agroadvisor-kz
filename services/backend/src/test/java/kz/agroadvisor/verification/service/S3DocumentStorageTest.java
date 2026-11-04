package kz.agroadvisor.verification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import kz.agroadvisor.common.web.ApiException;

class S3DocumentStorageTest {

    private final S3Client s3 = mock(S3Client.class);
    private final S3DocumentStorage storage = new S3DocumentStorage(s3, "docs");
    private final UUID userId = UUID.randomUUID();

    private PutObjectRequest upload(String contentType) {
        String key = storage.store(userId, new byte[] {1, 2, 3}, contentType);
        ArgumentCaptor<PutObjectRequest> request = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3).putObject(request.capture(), any(RequestBody.class));
        assertThat(request.getValue().key()).isEqualTo(key);
        return request.getValue();
    }

    @Test
    void putsTheDocumentUnderTheUsersPrefixWithItsType() {
        PutObjectRequest request = upload("application/pdf");

        assertThat(request.bucket()).isEqualTo("docs");
        assertThat(request.key()).matches("agrochemist-documents/" + userId + "/[0-9a-f-]{36}\\.pdf");
        assertThat(request.contentType()).isEqualTo("application/pdf");
        assertThat(request.contentLength()).isEqualTo(3L);
    }

    @Test
    void picksTheExtensionByType() {
        assertThat(upload("image/png").key()).endsWith(".png");
    }

    @Test
    void readsTheBytesBack() {
        when(s3.getObjectAsBytes(any(GetObjectRequest.class)))
                .thenReturn(ResponseBytes.fromByteArray(GetObjectResponse.builder().build(), new byte[] {7, 8}));

        assertThat(storage.load("agrochemist-documents/u/d.pdf")).containsExactly(7, 8);
    }

    @Test
    void deletesByKey() {
        storage.delete("agrochemist-documents/u/d.pdf");

        ArgumentCaptor<DeleteObjectRequest> request = ArgumentCaptor.forClass(DeleteObjectRequest.class);
        verify(s3).deleteObject(request.capture());
        assertThat(request.getValue().bucket()).isEqualTo("docs");
        assertThat(request.getValue().key()).isEqualTo("agrochemist-documents/u/d.pdf");
    }

    @Test
    void reportsAnUnavailableStorageAsServiceUnavailable() {
        when(s3.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenThrow(SdkClientException.create("Connection refused"));
        when(s3.getObjectAsBytes(any(GetObjectRequest.class))).thenThrow(SdkClientException.create("timeout"));

        assertThatThrownBy(() -> storage.store(userId, new byte[] {1}, "image/jpeg"))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                    assertThat(e.getCode()).isEqualTo("storage_unavailable");
                });
        assertThatThrownBy(() -> storage.load("k")).isInstanceOf(ApiException.class);
    }
}
