RequestLog, ExportJob, and WebhookDeliveryLog lack runtime indexes for retention queries
Repo Avatar
MettaChain/PropChain-BackEnd
Context
schema.prisma RequestLog/ExportJob/WebhookDeliveryLog tables are written by analytics, data-export, and webhook flows but have no @@index on the columns used in retention/status queries (createdAt, status, nextRetryAt, userId).

Problem
Cleanup/retention and admin 'list failed deliveries / find old export jobs' queries do full scans that grow quadratically with usage; retryFailedDeliveries (every minute) queries nextRetryAt/attempts without an index.

Proposed approach
Add composite indexes (status+nextRetryAt, userId+createdAt, createdAt) via a normalised migration, and validate with EXPLAIN in the DB integration suite.

Admin queue monitoring service and controller have no tests
Repo Avatar
MettaChain/PropChain-BackEnd
Context
src/admin/queue/queue.service.ts (BullMQ queue metrics, failed-job retry/removal) and queue.controller.ts (admin/queues endpoints) have no specs.

Problem
Retry-all-failed and delete-job operations can derail production queues (re-running bad jobs en masse); guardrail behavior (ADMIN only) and queue-name sanitization are untested. BullMQ worker state differences across versions compound this.

Proposed approach
Add queue.service.spec.ts with a mocked BullMQ queue (jobs, counts, retries, purge), and a controller spec asserting @Roles(ADMIN) + input handling; e2e optional behind a disposable Redis.

Acceptance criteria
Queue ops have unit coverage; role enforcement asserted.

