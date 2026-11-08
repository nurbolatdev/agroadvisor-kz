package kz.agroadvisor.diagnosis.service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.Delete;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectsResponse;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.ObjectIdentifier;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import kz.agroadvisor.common.web.ApiException;

/** Photo bucket on an S3-compatible server (SeaweedFS in this project). */
public class S3PhotoStorage implements PhotoStorage {

    private static final Logger log = LoggerFactory.getLogger(S3PhotoStorage.class);

    /** The S3 limit of keys in one DeleteObjects call. */
    private static final int DELETE_BATCH = 1000;

    private static final Pattern NAME =Pattern.compile("[A-Za-z0-9-]{1,64}");

    private final S3Client s3;
    private final String bucket;

    public S3PhotoStorage(S3Client s3, String bucket) {
        this.s3 = s3;
        this.bucket = bucket;
    }

    /** An unreachable or stuck storage is reported as 503 with a stable code, not as a bare 500. */
    @Override
    public String store(UUID userId, String name, byte[] photo, String contentType) {
        if (!NAME.matcher(name).matches()) {
            throw new IllegalArgumentException("Object name must be 1-64 letters, digits or hyphens");
        }
        String key = "diagnoses/" + userId + "/" + name + extension(contentType);
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
    public Optional<byte[]> load(String key) {
        try {
            return Optional.of(s3.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(key).build())
                    .asByteArray());
        } catch (NoSuchKeyException e) {
            return Optional.empty();
        } catch (SdkException e) {
            log.warn("Photo download from bucket '{}' failed: {}", bucket, e.toString());
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, DiagnosisErrors.STORAGE_UNAVAILABLE,
                    "Photo storage is unavailable, try again later");
        }
    }

    @Override
    public void delete(String key) {
        s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
    }

    @Override
    public Stream<StoredObject> list(String prefix) {
        return s3.listObjectsV2Paginator(ListObjectsV2Request.builder().bucket(bucket).prefix(prefix).build())
                .contents().stream()
                .map(o -> new StoredObject(o.key(), o.lastModified()));
    }

    @Override
    public Optional<StoredObject> head(String key) {
        try {
            HeadObjectResponse head = s3.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());
            return Optional.of(new StoredObject(key, head.lastModified()));
        } catch (NoSuchKeyException e) {
            return Optional.empty();
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                return Optional.empty();
            }
            throw e;
        }
    }

    @Override
    public List<String> deleteAll(Collection<String> keys) {
        List<String> all = List.copyOf(keys);
        List<String> failed = new ArrayList<>();
        for (int from = 0; from < all.size(); from += DELETE_BATCH) {
            List<String> batch = all.subList(from, Math.min(from + DELETE_BATCH, all.size()));
            try {
                DeleteObjectsResponse response = s3.deleteObjects(DeleteObjectsRequest.builder()
                        .bucket(bucket)
                        .delete(Delete.builder()
                                .objects(batch.stream().map(k -> ObjectIdentifier.builder().key(k).build()).toList())
                                .quiet(true)
                                .build())
                        .build());
                response.errors().forEach(e -> failed.add(e.key()));
            } catch (SdkException e) {
                log.warn("Deleting a batch of {} objects from bucket '{}' failed: {}", batch.size(), bucket, e.toString());
                failed.addAll(batch);
            }
        }
        return failed;
    }

    private static String extension(String contentType) {
        return "image/png".equals(contentType) ? ".png" : ".jpg";
    }
}
