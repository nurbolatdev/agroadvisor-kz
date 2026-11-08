package kz.agroadvisor.diagnosis.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectsResponse;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Error;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.model.S3Object;
import software.amazon.awssdk.services.s3.paginators.ListObjectsV2Iterable;

import kz.agroadvisor.common.web.ApiException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class S3PhotoStorageTest {

    private final S3Client s3 = mock(S3Client.class);
    private final S3PhotoStorage storage = new S3PhotoStorage(s3, "diagnosis-photos");
    private final UUID userId = UUID.randomUUID();

    private PutObjectRequest upload(String contentType) {
        String key = storage.store(userId, "photo-1", new byte[] {1, 2, 3}, contentType);
        ArgumentCaptor<PutObjectRequest> request = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3).putObject(request.capture(), any(RequestBody.class));
        assertThat(request.getValue().key()).isEqualTo(key);
        return request.getValue();
    }

    @Test
    void putsTheBytesIntoTheBucketUnderTheUsersPrefix() {
        PutObjectRequest request = upload("image/jpeg");

        assertThat(request.bucket()).isEqualTo("diagnosis-photos");
        assertThat(request.key()).isEqualTo("diagnoses/" + userId + "/photo-1.jpg");
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

        assertThatThrownBy(() -> storage.store(userId, "photo-1", new byte[] {1}, "image/jpeg"))
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
    void loadsAnObjectByItsKey() {
        when(s3.getObjectAsBytes(any(GetObjectRequest.class))).thenReturn(
                ResponseBytes.fromByteArray(GetObjectResponse.builder().build(), new byte[] {7, 8}));

        assertThat(storage.load("diagnoses/u/photo.jpg")).contains(new byte[] {7, 8});

        ArgumentCaptor<GetObjectRequest> request = ArgumentCaptor.forClass(GetObjectRequest.class);
        verify(s3).getObjectAsBytes(request.capture());
        assertThat(request.getValue().bucket()).isEqualTo("diagnosis-photos");
        assertThat(request.getValue().key()).isEqualTo("diagnoses/u/photo.jpg");
    }

    @Test
    void aMissingObjectIsEmptyNotAnError() {
        when(s3.getObjectAsBytes(any(GetObjectRequest.class))).thenThrow(NoSuchKeyException.builder().build());

        assertThat(storage.load("diagnoses/u/gone.jpg")).isEmpty();
    }

    @Test
    void reportsAnUnavailableStorageOnLoadAsServiceUnavailable() {
        when(s3.getObjectAsBytes(any(GetObjectRequest.class)))
                .thenThrow(SdkClientException.create("Connection refused"));

        assertThatThrownBy(() -> storage.load("diagnoses/u/photo.jpg"))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                    assertThat(e.getCode()).isEqualTo("storage_unavailable");
                });
    }

    @Test
    void theSameNameGivesTheSameKeyAndAnotherNameAnotherKey() {
        String first = storage.store(userId, "aaa", new byte[] {1}, "image/jpeg");
        String again = storage.store(userId, "aaa", new byte[] {1}, "image/jpeg");
        String other = storage.store(userId, "bbb", new byte[] {1}, "image/jpeg");

        assertThat(again).isEqualTo(first);
        assertThat(other).isNotEqualTo(first);
    }

    @Test
    void theSameNameOfAnotherUserIsAnotherKey() {
        String mine = storage.store(userId, "aaa", new byte[] {1}, "image/jpeg");
        String theirs = storage.store(UUID.randomUUID(), "aaa", new byte[] {1}, "image/jpeg");

        assertThat(theirs).isNotEqualTo(mine);
    }

    @Test
    void refusesANameThatCouldLeaveTheUsersFolder() {
        for (String bad : new String[] {"", "../x", "a/b", "a.b", "a b", "x".repeat(65)}) {
            assertThatThrownBy(() -> storage.store(userId, bad, new byte[] {1}, "image/jpeg"))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    // --- list, head, deleteAll (orphan cleanup) ---

    private static S3Object object(String key, Instant modified) {
        return S3Object.builder().key(key).lastModified(modified).build();
    }

    @Test
    void listsAllPagesOfAPrefixWithoutLoadingThemUpFront() {
        Instant t = Instant.parse("2026-11-01T00:00:00Z");
        when(s3.listObjectsV2Paginator(any(ListObjectsV2Request.class)))
                .thenAnswer(inv -> new ListObjectsV2Iterable(s3, inv.getArgument(0, ListObjectsV2Request.class)));
        // 1500 objects over two pages of 1000 and 500
        List<S3Object> first = IntStream.range(0, 1000).mapToObj(i -> object("diagnoses/u/" + i, t)).toList();
        List<S3Object> second = IntStream.range(1000, 1500).mapToObj(i -> object("diagnoses/u/" + i, t)).toList();
        when(s3.listObjectsV2(any(ListObjectsV2Request.class))).thenAnswer(inv -> {
            ListObjectsV2Request request = inv.getArgument(0);
            return request.continuationToken() == null
                    ? ListObjectsV2Response.builder().contents(first).isTruncated(true).nextContinuationToken("t1").build()
                    : ListObjectsV2Response.builder().contents(second).isTruncated(false).build();
        });

        List<StoredObject> listed = storage.list("diagnoses/").toList();

        assertThat(listed).hasSize(1500);
        assertThat(listed.get(0)).isEqualTo(new StoredObject("diagnoses/u/0", t));
        assertThat(listed.get(1499).key()).isEqualTo("diagnoses/u/1499");
        ArgumentCaptor<ListObjectsV2Request> requests = ArgumentCaptor.forClass(ListObjectsV2Request.class);
        verify(s3, times(2)).listObjectsV2(requests.capture());
        assertThat(requests.getAllValues()).allSatisfy(r -> {
            assertThat(r.bucket()).isEqualTo("diagnosis-photos");
            assertThat(r.prefix()).isEqualTo("diagnoses/");
        });
        assertThat(requests.getAllValues().get(1).continuationToken()).isEqualTo("t1");
    }

    @Test
    void listingAnEmptyPrefixGivesAnEmptyStream() {
        when(s3.listObjectsV2Paginator(any(ListObjectsV2Request.class)))
                .thenAnswer(inv -> new ListObjectsV2Iterable(s3, inv.getArgument(0, ListObjectsV2Request.class)));
        when(s3.listObjectsV2(any(ListObjectsV2Request.class)))
                .thenReturn(ListObjectsV2Response.builder().isTruncated(false).build());

        assertThat(storage.list("diagnoses/")).isEmpty();
    }

    @Test
    void headGivesTheKeyAndTheLastModifiedTime() {
        Instant t = Instant.parse("2026-11-01T00:00:00Z");
        when(s3.headObject(any(HeadObjectRequest.class))).thenReturn(HeadObjectResponse.builder().lastModified(t).build());

        assertThat(storage.head("diagnoses/u/a.jpg")).contains(new StoredObject("diagnoses/u/a.jpg", t));
    }

    @Test
    void headOfAMissingObjectIsEmpty() {
        when(s3.headObject(any(HeadObjectRequest.class))).thenThrow(NoSuchKeyException.builder().build());
        assertThat(storage.head("diagnoses/u/a.jpg")).isEmpty();

        when(s3.headObject(any(HeadObjectRequest.class)))
                .thenThrow(S3Exception.builder().statusCode(404).build());
        assertThat(storage.head("diagnoses/u/b.jpg")).isEmpty();
    }

    @Test
    void headOfAnUnreachableStorageIsNotMistakenForAMissingObject() {
        when(s3.headObject(any(HeadObjectRequest.class)))
                .thenThrow(S3Exception.builder().statusCode(500).build());

        assertThatThrownBy(() -> storage.head("diagnoses/u/a.jpg")).isInstanceOf(S3Exception.class);
    }

    @Test
    void deletesInBatchesOfAThousandAndReportsNothingWhenAllWent() {
        when(s3.deleteObjects(any(DeleteObjectsRequest.class))).thenReturn(DeleteObjectsResponse.builder().build());
        List<String> keys = IntStream.range(0, 2500).mapToObj(i -> "diagnoses/u/" + i).toList();

        assertThat(storage.deleteAll(keys)).isEmpty();

        ArgumentCaptor<DeleteObjectsRequest> requests = ArgumentCaptor.forClass(DeleteObjectsRequest.class);
        verify(s3, times(3)).deleteObjects(requests.capture());
        assertThat(requests.getAllValues()).extracting(r -> r.delete().objects().size())
                .containsExactly(1000, 1000, 500);
        assertThat(requests.getAllValues()).allSatisfy(r -> assertThat(r.bucket()).isEqualTo("diagnosis-photos"));
    }

    @Test
    void deleteAllReturnsTheKeysTheStorageRefused() {
        when(s3.deleteObjects(any(DeleteObjectsRequest.class))).thenReturn(DeleteObjectsResponse.builder()
                .errors(S3Error.builder().key("diagnoses/u/b").code("AccessDenied").build()).build());

        assertThat(storage.deleteAll(List.of("diagnoses/u/a", "diagnoses/u/b", "diagnoses/u/c")))
                .containsExactly("diagnoses/u/b");
    }

    @Test
    void aFailedBatchCountsAllItsKeysAsFailedAndTheNextBatchStillRuns() {
        when(s3.deleteObjects(any(DeleteObjectsRequest.class)))
                .thenThrow(SdkClientException.create("down"))
                .thenReturn(DeleteObjectsResponse.builder().build());
        List<String> keys = IntStream.range(0, 1200).mapToObj(i -> "diagnoses/u/" + i).toList();

        List<String> failed = storage.deleteAll(keys);

        assertThat(failed).hasSize(1000).first().isEqualTo("diagnoses/u/0");
        verify(s3, times(2)).deleteObjects(any(DeleteObjectsRequest.class));
    }

    @Test
    void deleteAllOfNothingCallsNothing() {
        assertThat(storage.deleteAll(List.of())).isEmpty();
        verify(s3, never()).deleteObjects(any(DeleteObjectsRequest.class));
    }
}
