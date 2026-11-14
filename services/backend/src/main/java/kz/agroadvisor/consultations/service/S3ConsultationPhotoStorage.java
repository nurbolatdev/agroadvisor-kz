package kz.agroadvisor.consultations.service;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import kz.agroadvisor.common.web.ApiException;

/** Chat photos in a bucket of an S3-compatible server (SeaweedFS), under the prefix {@code consultations/}. */
public class S3ConsultationPhotoStorage implements ConsultationPhotoStorage {

    /** The folder of chat photos; the cleanup of diagnosis photos ({@code diagnoses/}) never looks here. */
    public static final String PREFIX = "consultations/";

    private static final Logger log = LoggerFactory.getLogger(S3ConsultationPhotoStorage.class);

    private final S3Client s3;
    private final String bucket;

    public S3ConsultationPhotoStorage(S3Client s3, String bucket) {
        this.s3 = s3;
        this.bucket = bucket;
    }

    @Override
    public String store(UUID consultationId, byte[] photo, String contentType) {
        String key = PREFIX + consultationId + "/" + UUID.randomUUID() + extension(contentType);
        try {
            s3.putObject(PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(contentType)
                    .contentLength((long) photo.length)
                    .build(), RequestBody.fromBytes(photo));
        } catch (SdkException e) {
            throw unavailable("upload", e);
        }
        return key;
    }

    @Override
    public byte[] load(String key) {
        try {
            return s3.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(key).build()).asByteArray();
        } catch (NoSuchKeyException e) {
            // A row without an object is a data fault, not a storage outage: "try again" would never help
            log.error("Chat photo object {} is missing from bucket '{}'", key, bucket);
            throw new ApiException(HttpStatus.NOT_FOUND, ConsultationErrors.PHOTO_NOT_FOUND,
                    "The photo is not found");
        } catch (SdkException e) {
            throw unavailable("download", e);
        }
    }

    @Override
    public void delete(String key) {
        s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
    }

    private static ApiException unavailable(String action, SdkException e) {
        log.warn("Chat photo {} failed: {}", action, e.toString());
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ConsultationErrors.STORAGE_UNAVAILABLE,
                "Photo storage is unavailable, try again later");
    }

    private static String extension(String contentType) {
        return "image/png".equals(contentType) ? ".png" : ".jpg";
    }
}
