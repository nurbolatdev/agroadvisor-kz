package kz.agroadvisor.diagnosis.service;

import java.util.UUID;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/** Photo bucket on an S3-compatible server (SeaweedFS in this project). */
public class S3PhotoStorage implements PhotoStorage {

    private final S3Client s3;
    private final String bucket;

    public S3PhotoStorage(S3Client s3, String bucket) {
        this.s3 = s3;
        this.bucket = bucket;
    }

    @Override
    public String store(UUID userId, byte[] photo, String contentType) {
        String key = "diagnoses/" + userId + "/" + UUID.randomUUID() + extension(contentType);
        s3.putObject(PutObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .contentType(contentType)
                .contentLength((long) photo.length)
                .build(), RequestBody.fromBytes(photo));
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
