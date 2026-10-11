# AgroAdvisor KZ — Backend

Core REST API of the platform.

## Responsibilities

- Authentication and roles (farmer, agrochemist, admin)
- Diagnoses: forwarding images to the AI service, storing results
- Community: posts, answers, votes, moderation
- Agrochemist verification and consultations
- Disease reference, regional statistics, analytics for the admin panel
- Caching with Redis

## Stack

Java, Spring Boot, PostgreSQL, Redis.

## Package structure

```
kz.agroadvisor
├── config       # Application and infrastructure configuration
├── security     # Authentication and authorization
├── controller   # REST controllers
├── service      # Business logic
├── repository   # Data access
├── model        # JPA entities
├── dto          # Request and response objects
├── mapper       # Entity ↔ DTO mapping
└── exception    # Error handling
```

Database migrations live in `src/main/resources/db/migration`.
