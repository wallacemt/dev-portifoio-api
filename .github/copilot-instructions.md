# Copilot Instructions for AI Coding Agents

## Project Overview

This is a TypeScript backend API for a portfolio application, organized with clear service, controller, repository, and validation layers. The project uses Prisma ORM for database access, Jest for testing, and Docker for containerization. Swagger is used for API documentation.

## Architecture & Data Flow

- **Controllers (`src/controllers/`)**: Handle HTTP requests, delegate to services. Each domain (auth, formation, owner, project, skill, status, utils) has its own controller.
- **Services (`src/services/`)**: Business logic, orchestrate calls to repositories and external APIs (e.g., `geminiService.ts`).
- **Repositories (`src/repository/`)**: Direct database access via Prisma. Each domain has a dedicated repository.
- **Middleware (`src/middleware/`)**: Request logging and authentication policies.
- **Validations (`src/validations/`)**: Joi-based validation for request payloads, organized by domain.
- **Types (`src/types/`)**: Shared TypeScript types for strong typing across layers.
- **Utils (`src/utils/`)**: Common utilities (error handling, hashing, type guards).
- **Docs (`src/docs/`)**: Swagger configuration and OpenAPI YAML files for API documentation.

## Developer Workflows

- **Build**: Use `tsc` (TypeScript compiler) for building. See `tsconfig.json` for config.
- **Test**: Run `npm test` or `npx jest` for tests. Jest setup is in `jest.setup.ts` and `jest.config.json`. Mocks for Prisma are in `src/tests/mocks/prismaMock.ts`.
- **Database**: Prisma schema in `prisma/schema.prisma`. Use Prisma CLI for migrations. Test DB setup in `src/tests/setupTestDB.ts`.
- **Run**: Main entry is `src/app.ts`. Use Docker (`docker-compose.yaml`, `Dockerfile`) for containerized runs.
- **API Docs**: Swagger config in `src/docs/swaggerConfiguration.ts`, YAML specs in `src/docs/paths/` and `src/docs/schemas/`.

## Project-Specific Patterns

- **Domain Separation**: Each domain (auth, owner, project, etc.) has its own controller, service, repository, validation, and types for modularity.
- **Error Handling**: Centralized in `src/utils/exception.ts` and custom error type guards in `src/utils/isCustomError.ts`.
- **Authentication**: Managed via middleware (`authPolice.ts`) and controller/service patterns.
- **Logging**: Request logging via `middleware/requestLogger.ts`.
- **External APIs**: Gemini AI integration in `services/geminiService.ts` with quota management, caching, and retry logic.
- **Quota Management**: `utils/quotaManager.ts` tracks API usage, implements rate limiting, and prevents quota exhaustion.
- **Translation Caching**: 24-hour cache for translations to minimize API calls and respect quota limits.
- **Testing**: Use `src/tests/mocks/prismaMock.ts` for mocking Prisma in tests.

## Integration Points

- **Prisma**: All DB access via repositories, configured in `src/prisma/prismaClient.ts`.
- **Swagger**: API docs auto-generated from YAML files and configuration.
- **Docker**: Use provided Dockerfile and docker-compose for local development and deployment.

## Example Patterns

- To add a new domain, create corresponding files in `controllers/`, `services/`, `repository/`, `validations/`, and `types/`.
- For new API endpoints, update the relevant controller and service, add validation, and document in Swagger YAML files.
- For database changes, update `prisma/schema.prisma` and run Prisma migrations.
- **Gemini API Usage**: Always use `TranslationService` which includes automatic caching, quota management, and graceful fallbacks. Check quota status via `/api/utils/quota-status` endpoint.
- **Rate Limiting**: The system automatically throttles requests when approaching daily quota limits (180/200 requests) and implements exponential backoff on errors.

---

For questions or unclear conventions, ask for clarification or examples from maintainers.
