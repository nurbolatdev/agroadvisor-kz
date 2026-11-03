package kz.agroadvisor.common.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** OpenAPI description served at /v3/api-docs, UI at /swagger-ui.html. */
@Configuration
public class OpenApiConfig {

    public static final String BEARER = "bearerAuth";

    /**
     * Every endpoint needs the access token except the ones that opt out with an empty
     * {@code @SecurityRequirements} (the auth endpoints).
     */
    @Bean
    OpenAPI agroAdvisorOpenApi(@Value("${app.version}") String version) {
        return new OpenAPI()
                .info(new Info()
                        .title("AgroAdvisor KZ API")
                        .description("REST API for the mobile app and the admin panel. "
                                + "Errors use RFC 9457 Problem Details with a stable `code` property.")
                        .version(version))
                .components(new Components().addSecuritySchemes(BEARER, new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList(BEARER));
    }
}
