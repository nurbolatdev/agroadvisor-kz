package kz.agroadvisor.community.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.services.s3.S3Client;

import kz.agroadvisor.community.service.CommunityPhotoStorage;
import kz.agroadvisor.community.service.S3CommunityPhotoStorage;

@Configuration
class CommunityPhotoStorageConfig {

    /**
     * Uses the S3 client and the bucket of the diagnosis photos, with keys under their own prefix
     * ({@code community/}), so nothing has to be created in the storage for it.
     */
    @Bean
    CommunityPhotoStorage communityPhotoStorage(S3Client s3,
            @Value("${app.photos.bucket:diagnosis-photos}") String bucket) {
        return new S3CommunityPhotoStorage(s3, bucket);
    }
}
