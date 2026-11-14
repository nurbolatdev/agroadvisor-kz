package kz.agroadvisor.consultations.service;

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
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import kz.agroadvisor.common.web.ApiException;

class S3ConsultationPhotoStorageTest {

    private final S3Client s3 = mock(S3Client.class);
    private final S3ConsultationPhotoStorage storage = new S3ConsultationPhotoStorage(s3, "photos");
    private final UUID consultationId = UUID.randomUUID();

    private PutObjectRequest upload(String contentType) {
        String key = storage.store(consultationId, new byte[] {1, 2, 3}, contentType);
        ArgumentCaptor<PutObjectRequest> request = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3).putObject(request.capture(), any(RequestBody.class));
        assertThat(request.getValue().key()).isEqualTo(key);
        return request.getValue();
    }

    @Test
    void putsThePhotoUnderTheConsultationsPrefixWithItsType() {
        PutObjectRequest request = upload("image/jpeg");

        assertThat(request.bucket()).isEqualTo("photos");
        assertThat(request.key()).matches("consultations/" + consultationId + "/[0-9a-f-]{36}\\.jpg");
        assertThat(request.contentType()).isEqualTo("image/jpeg");
        assertThat(request.contentLength()).isEqualTo(3L);
    }

    @Test
    void picksThePngExtension() {
        assertThat(upload("image/png").key()).endsWith(".png");
    }

    @Test
    void aFailedUploadIsServiceUnavailable() {
        when(s3.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenThrow(SdkClientException.create("down"));

        assertThatThrownBy(() -> storage.store(consultationId, new byte[] {1}, "image/jpeg"))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                    assertThat(e.getCode()).isEqualTo("storage_unavailable");
                });
    }

    @Test
    void readsTheBytesBack() {
        when(s3.getObjectAsBytes(any(GetObjectRequest.class)))
                .thenReturn(ResponseBytes.fromByteArray(GetObjectResponse.builder().build(), new byte[] {7, 8}));

        assertThat(storage.load("consultations/c/p.jpg")).containsExactly(7, 8);
    }

    @Test
    void aMissingObjectIsNotFound() {
        when(s3.getObjectAsBytes(any(GetObjectRequest.class))).thenThrow(NoSuchKeyException.builder().build());

        assertThatThrownBy(() -> storage.load("consultations/c/p.jpg"))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                    assertThat(e.getCode()).isEqualTo("photo_not_found");
                });
    }

    @Test
    void aBrokenDownloadIsServiceUnavailable() {
        when(s3.getObjectAsBytes(any(GetObjectRequest.class))).thenThrow(SdkClientException.create("down"));

        assertThatThrownBy(() -> storage.load("consultations/c/p.jpg"))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }

    @Test
    void deletesByKey() {
        storage.delete("consultations/c/p.jpg");

        ArgumentCaptor<DeleteObjectRequest> request = ArgumentCaptor.forClass(DeleteObjectRequest.class);
        verify(s3).deleteObject(request.capture());
        assertThat(request.getValue().key()).isEqualTo("consultations/c/p.jpg");
    }
}
