# Admin Module

Back-office API for platform administrators: dashboard, user moderation, property moderation, transaction monitoring, fraud investigation, backups, archival, cleanup, API keys, and background-queue management.

## Files

| File                                               | Purpose                                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `admin.controller.ts`                              | All `/admin/*` routes                                                               |
| `admin.service.ts`                                 | Orchestration; delegates to Fraud, Backup, Transactions, Sessions, Archive, Cleanup |
| `admin-audit.interceptor.ts`                       | Writes an audit record for every admin action                                       |
| `interceptors/admin-access-logging.interceptor.ts` | Access logging for admin routes                                                     |
| `queue/`                                           | BullMQ queue inspection and retry (`/admin/queues`)                                 |
| `dto/admin.dto.ts`                                 | Request DTOs                                                                        |

## Security model

- The whole controller is guarded by `JwtAuthGuard` + `RolesGuard` with `@Roles(UserRole.ADMIN)`. **Every** route is admin-only; there are no per-route exceptions.
- `AdminAuditInterceptor` is applied at controller level, so every mutation is recorded with the acting admin's ID. Don't bypass it by calling services from another controller.
- The permission matrix is in [docs/RBAC_Permission_Matrix.md](../../docs/RBAC_Permission_Matrix.md).

## Endpoints

| Area                | Routes                                                                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard           | `GET /admin/dashboard`                                                                                                                                                                                                  |
| Users               | `GET /admin/users`, `PATCH /admin/users/:id`, `POST /admin/users/:id/block`, `POST /admin/users/:id/unblock`                                                                                                            |
| Property moderation | `GET /admin/properties/moderation/queue`, `POST /admin/properties/:id/{approve,reject,flag}`, `POST /admin/properties/moderation/bulk`                                                                                  |
| Transactions        | `GET /admin/transactions/monitoring`, `GET /admin/transactions/monitoring/summary`, `PATCH /admin/transactions/:id/status`                                                                                              |
| Fraud               | `GET /admin/fraud/alerts[/summary                                                                                                                                                                                       | /:id]`, `PATCH /admin/fraud/alerts/:id`, `POST /admin/fraud/alerts/:id/notes`, `POST /admin/fraud/alerts/:id/block-user`, `POST /admin/fraud/users/:id/scan`, `POST /admin/fraud/properties/:id/scan` |
| Backups             | `GET /admin/backups[/status                                                                                                                                                                                             | /schedule]`, `PUT /admin/backups/schedule`, `POST /admin/backups/run`, `POST /admin/backups/:id/restore`, `GET /admin/backups/:id/download`                                                           |
| Archive             | `GET /admin/archive/{files,status}`, `POST /admin/archive/{run,restore}`                                                                                                                                                |
| Cleanup             | `GET /admin/cleanup/status`, `POST /admin/cleanup/run`                                                                                                                                                                  |
| Exports             | `DELETE /admin/exports/:filename`                                                                                                                                                                                       |
| API keys            | `GET /admin/api-keys`, `POST /admin/api-keys/:id/{revoke,rotate}`                                                                                                                                                       |
| Email               | `GET /admin/email/preview/:templateName` (renders templates with sample data)                                                                                                                                           |
| i18n                | `GET /admin/i18n/missing-keys`                                                                                                                                                                                          |
| Queues              | `GET /admin/queues`, `GET /admin/queues/metrics`, `GET /admin/queues/:name/failed`, `POST /admin/queues/:name/jobs/:jobId/retry`, `POST /admin/queues/:name/failed/retry-all`, `DELETE /admin/queues/:name/jobs/:jobId` |

Related docs: [fraud](../fraud/README.md), [backup](../backup/README.md), [docs/User_Management.md](../../docs/User_Management.md), [docs/View_Audit_Logs.md](../../docs/View_Audit_Logs.md).

## Queue monitoring

`QueueModule` registers only the **`mail`** queue with BullMQ, so `/admin/queues` can only inspect queues that are registered there. To manage another queue (e.g. `webhook-delivery`), add it to `BullModule.registerQueue(...)` in `queue/queue.module.ts`.

## Gotchas

- `POST /admin/backups/:id/restore` **overwrites the live database** (see [backup README](../backup/README.md)). There is no confirmation step on the API.
- Blocking a user (`/users/:id/block`) and fraud blocking both set `User.isBlocked`; unblocking via `/users/:id/unblock` clears both.
- The email preview route embeds sample URLs such as `http://localhost:3000/...`. That is expected and not a config leak.

## Tests

`admin-audit.interceptor.spec.ts`, plus integration tests in `test/admin/`.
