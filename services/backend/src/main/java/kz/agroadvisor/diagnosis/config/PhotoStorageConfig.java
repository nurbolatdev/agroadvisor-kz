package kz.agroadvisor.diagnosis.config;

import java.net.URI;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

import kz.agroadvisor.diagnosis.service.PhotoStorage;
import kz.agroadvisor.diagnosis.service.S3PhotoStorage;

@Configuration
@EnableConfigurationProperties(PhotoStorageProperties.class)
class PhotoStorageConfig {

    /**
     * Path-style addressing: SeaweedFS has no bucket sub-domains. Connects lazily, on the first upload.
     * Every wait is bounded (see {@link PhotoStorageProperties}); a retry of the upload is safe because
     * each upload writes a fresh random key.
     */
    @Bean(destroyMethod = "close")
    S3Client s3Client(PhotoStorageProperties props) {
        return S3Client.builder()
                .endpointOverride(URI.create(props.endpoint()))
                .region(Region.of(props.region()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(props.accessKey(), props.secretKey())))
                .forcePathStyle(true)
                .httpClientBuilder(UrlConnectionHttpClient.builder()
                        .connectionTimeout(props.connectTimeout())
                        .socketTimeout(props.attemptTimeout()))
                .overrideConfiguration(config -> config
                        .apiCallAttemptTimeout(props.attemptTimeout())
                        .apiCallTimeout(props.totalTimeout()))
                .build();
    }

    @Bean
    PhotoStorage photoStorage(S3Client s3, PhotoStorageProperties props) {
        return new S3PhotoStorage(s3, props.bucket());
    }
}
