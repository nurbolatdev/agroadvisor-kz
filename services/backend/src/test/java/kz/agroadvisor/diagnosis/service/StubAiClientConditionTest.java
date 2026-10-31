package kz.agroadvisor.diagnosis.service;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import kz.agroadvisor.catalog.service.CatalogService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** The placeholder model must be switched on explicitly, never by default. */
class StubAiClientConditionTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(StubAiClient.class)
            .withBean(CatalogService.class, () -> mock(CatalogService.class));

    @Test
    void isAbsentUnlessExplicitlyEnabled() {
        runner.run(context -> assertThat(context).doesNotHaveBean(AiClient.class));
    }

    @Test
    void isAbsentForAnyOtherClientName() {
        runner.withPropertyValues("app.ai.client=http").run(context -> assertThat(context).doesNotHaveBean(AiClient.class));
    }

    @Test
    void isPresentWhenTheStubIsRequested() {
        runner.withPropertyValues("app.ai.client=stub").run(context -> assertThat(context).hasSingleBean(AiClient.class));
    }
}
