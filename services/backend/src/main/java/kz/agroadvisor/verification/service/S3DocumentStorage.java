package kz.agroadvisor.verification.service;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import kz.agroadvisor.common.web.ApiException;

/** Documents in a bucket of an S3-compatible server (SeaweedFS), under the prefix {@code agrochemist-documents/}. */
public class S3DocumentStorage implements DocumentStorage {

    private static final Logger log = LoggerFactory.getLogger(S3DocumentStorage.class);

    private final S3Client s3;
    private final String bucket;

    public S3DocumentStorage(S3Client s3, String bucket) {
        this.s3 = s3;
        this.bucket = bucket;
    }

    @Override
    public String store(UUID userId, byte[] document, String contentType) {
        String key = "agrochemist-documents/" + userId + "/" + UUID.randomUUID() + extension(contentType);
        try {
            s3.putObject(PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(contentType)
                    .contentLength((long) document.length)
                    .build(), RequestBody.fromBytes(document));
        } catch (SdkException e) {
            throw unavailable("upload", e);
        }
        return key;
    }

    @Override
    public byte[] load(String key) {
        try {
            return s3.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(key).build()).asByteArray();
        } catch (SdkException e) {
            throw unavailable("download", e);
        }
    }

    @Override
    public void delete(String key) {
        s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
    }

    private static ApiException unavailable(String action, SdkException e) {
        log.warn("Document {} failed: {}", action, e.toString());
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, VerificationErrors.STORAGE_UNAVAILABLE,
                "Document storage is unavailable, try again later");
    }

    private static String extension(String contentType) {
        return switch (contentType) {
            case "application/pdf" -> ".pdf";
            case "image/png" -> ".png";
            default -> ".jpg";
        };
    }
}
