package kz.agroadvisor.diagnosis.service;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import kz.agroadvisor.common.web.ApiException;

/** Photo bucket on an S3-compatible server (SeaweedFS in this project). */
public class S3PhotoStorage implements PhotoStorage {

    private static final Logger log = LoggerFactory.getLogger(S3PhotoStorage.class);

    private final S3Client s3;
    private final String bucket;

    public S3PhotoStorage(S3Client s3, String bucket) {
        this.s3 = s3;
        this.bucket = bucket;
    }

    /** An unreachable or stuck storage is reported as 503 with a stable code, not as a bare 500. */
    @Override
    public String store(UUID userId, byte[] photo, String contentType) {
        String key = "diagnoses/" + userId + "/" + UUID.randomUUID() + extension(contentType);
        try {
            s3.putObject(PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(contentType)
                    .contentLength((long) photo.length)
                    .build(), RequestBody.fromBytes(photo));
        } catch (SdkException e) {
            log.warn("Photo upload to bucket '{}' failed: {}", bucket, e.toString());
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, DiagnosisErrors.STORAGE_UNAVAILABLE,
                    "Photo storage is unavailable, try again later");
        }
        return key;
    }

    @Override
    public void delete(String key) {
        s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
    }

    private static String extension(String contentType) {
        return "image/png".equals(contentType) ? ".png" : ".jpg";
    }
}
