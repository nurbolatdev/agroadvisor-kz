package kz.agroadvisor.consultations.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.services.s3.S3Client;

import kz.agroadvisor.consultations.service.ConsultationPhotoStorage;
import kz.agroadvisor.consultations.service.S3ConsultationPhotoStorage;

@Configuration
class ConsultationPhotoStorageConfig {

    /**
     * Uses the S3 client and the bucket of the diagnosis photos, with keys under their own prefix
     * ({@code consultations/}), so nothing has to be created in the storage for it.
     */
    @Bean
    ConsultationPhotoStorage consultationPhotoStorage(S3Client s3,
            @Value("${app.photos.bucket:diagnosis-photos}") String bucket) {
        return new S3ConsultationPhotoStorage(s3, bucket);
    }
}
