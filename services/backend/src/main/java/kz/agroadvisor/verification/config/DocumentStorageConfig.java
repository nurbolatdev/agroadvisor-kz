package kz.agroadvisor.verification.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.services.s3.S3Client;

import kz.agroadvisor.verification.service.DocumentStorage;
import kz.agroadvisor.verification.service.S3DocumentStorage;

@Configuration
class DocumentStorageConfig {

    /**
     * Uses the S3 client of the photo storage. {@code app.documents.bucket} may name a separate bucket
     * (documents are more sensitive than leaf photos); by default it is the photo bucket, with keys under
     * their own prefix, so nothing has to be created in the storage for it.
     */
    @Bean
    DocumentStorage documentStorage(S3Client s3,
            @Value("${app.documents.bucket:${app.photos.bucket:diagnosis-photos}}") String bucket) {
        return new S3DocumentStorage(s3, bucket);
    }
}
