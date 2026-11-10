# Build context: services/backend
#   docker build -t agroadvisor-backend:local services/backend
#   docker run --rm -p 8080:8080 --env-file <file with the prod variables> agroadvisor-backend:local
FROM eclipse-temurin:21.0.13_9-jdk-noble AS build

WORKDIR /build

# Dependencies first: editing the sources does not download them again.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -B -q dependency:go-offline

# Tests are not built here; the CI job "backend" runs them.
COPY src/main/ src/main/
RUN ./mvnw -B -q -Dmaven.test.skip=true package \
    && cp target/backend-*.jar application.jar \
    && java -Djarmode=tools -jar application.jar extract --layers --destination extracted

FROM eclipse-temurin:21.0.13_9-jre-noble

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home app

WORKDIR /app

# Least often changed layers first.
COPY --from=build /build/extracted/dependencies/ ./
COPY --from=build /build/extracted/spring-boot-loader/ ./
COPY --from=build /build/extracted/snapshot-dependencies/ ./
COPY --from=build /build/extracted/application/ ./

# The prod profile refuses to start without its settings (see services/backend/README.md).
# JAVA_TOOL_OPTIONS can be overridden at run time to tune memory.
ENV SPRING_PROFILES_ACTIVE=prod \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"

USER 10001:10001
EXPOSE 8080

# The port is fixed at 8080 here; do not change SERVER_PORT.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS -o /dev/null http://127.0.0.1:8080/actuator/health/liveness || exit 1

ENTRYPOINT ["java", "-jar", "application.jar"]
