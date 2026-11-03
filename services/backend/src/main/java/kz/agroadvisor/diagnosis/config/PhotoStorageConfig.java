package kz.agroadvisor.diagnosis.config;

import java.net.URI;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
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
     * <p>
     * Checksums are WHEN_REQUIRED: by default the SDK sends every upload as aws-chunked with a trailing
     * CRC32, and SeaweedFS 4.48 sometimes answers that with 400 "Content-Md5 you specified is not valid"
     * (seen in CI and reproduced with stress runs, mostly on the first uploads after the container starts).
     * Without the trailer the upload still goes as signed aws-chunked, but the error did not occur.
     * Response validation is switched off for symmetry (the backend only uploads and deletes photos; reads
     * are not made by this client), so downloads are not checksum-verified.
     */
    @Bean(destroyMethod = "close")
    S3Client s3Client(PhotoStorageProperties props) {
        return S3Client.builder()
                .endpointOverride(URI.create(props.endpoint()))
                .region(Region.of(props.region()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(props.accessKey(), props.secretKey())))
                .forcePathStyle(true)
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
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
