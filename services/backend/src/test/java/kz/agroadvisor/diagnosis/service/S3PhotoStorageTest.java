package kz.agroadvisor.diagnosis.service;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import kz.agroadvisor.common.web.ApiException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class S3PhotoStorageTest {

    private final S3Client s3 = mock(S3Client.class);
    private final S3PhotoStorage storage = new S3PhotoStorage(s3, "diagnosis-photos");
    private final UUID userId = UUID.randomUUID();

    private PutObjectRequest upload(String contentType) {
        String key = storage.store(userId, new byte[] {1, 2, 3}, contentType);
        ArgumentCaptor<PutObjectRequest> request = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3).putObject(request.capture(), any(RequestBody.class));
        assertThat(request.getValue().key()).isEqualTo(key);
        return request.getValue();
    }

    @Test
    void putsTheBytesIntoTheBucketUnderTheUsersPrefix() {
        PutObjectRequest request = upload("image/jpeg");

        assertThat(request.bucket()).isEqualTo("diagnosis-photos");
        assertThat(request.key()).matches("diagnoses/" + userId + "/[0-9a-f-]{36}\\.jpg");
        assertThat(request.contentType()).isEqualTo("image/jpeg");
        assertThat(request.contentLength()).isEqualTo(3L);
    }

    @Test
    void usesThePngExtensionForPng() {
        assertThat(upload("image/png").key()).endsWith(".png");
    }

    @Test
    void reportsAnUnavailableStorageAsServiceUnavailableWithAStableCode() {
        when(s3.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenThrow(SdkClientException.create("Connection refused"));

        assertThatThrownBy(() -> storage.store(userId, new byte[] {1}, "image/jpeg"))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                    assertThat(e.getCode()).isEqualTo("storage_unavailable");
                });
    }

    @Test
    void deletesAnObjectByItsKey() {
        storage.delete("diagnoses/u/photo.jpg");

        ArgumentCaptor<DeleteObjectRequest> request = ArgumentCaptor.forClass(DeleteObjectRequest.class);
        verify(s3).deleteObject(request.capture());
        assertThat(request.getValue().bucket()).isEqualTo("diagnosis-photos");
        assertThat(request.getValue().key()).isEqualTo("diagnoses/u/photo.jpg");
    }

    @Test
    void everyUploadGetsItsOwnKey() {
        String first = storage.store(userId, new byte[] {1}, "image/jpeg");
        String second = storage.store(userId, new byte[] {1}, "image/jpeg");

        assertThat(first).isNotEqualTo(second);
    }
}
