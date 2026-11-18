# API Extensions

This folder contains self-contained extensions to the PropChain backend API.

## Purpose

The main codebase (`src/`, `prisma/`, `test/`, etc.) is undergoing active cleanup and refactoring by the core team. To keep new work isolated, all external additions live here.

## Subfolders

| Subfolder | Contents |
|-----------|---------|
| `modules/` | New NestJS modules (controllers, services) |
| `dto/` | Data Transfer Objects, validation schemas |
| `services/` | Business logic services, utility services |
| `guards/` | Auth guards, role guards, rate limit guards |
| `interceptors/` | Logging, caching, transform interceptors |
| `tests/` | Unit tests, integration tests, e2e tests |
| `docs/` | API docs, architecture notes, integration guides |
| `scripts/` | Migration scripts, data scripts, automation |
| `examples/` | API usage examples, integration demos |

## Rules

1. **Stay in this folder.** All new files must be under `api-extensions/`.
2. **Do not modify the main codebase** (`src/`, `prisma/`, `test/`, etc.) unless an issue explicitly requires it.
3. **Follow existing conventions.** Match the module structure and patterns in the main codebase.
4. **Write tests.** Every service, controller, and guard should include tests.
5. **Use TypeScript strictly.** All code must be properly typed.
6. **Follow NestJS patterns.** Use dependency injection, modules, controllers, and services.
7. **Ensure lint and build pass** before submitting a PR.
