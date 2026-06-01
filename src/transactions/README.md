Transactions Module
===================

Overview
--------

Handles lifecycle and persistence of property transactions, including escrow, commission, blockchain recording, and audit logging.

Primary endpoints
-----------------

- `POST /transactions` — Create a transaction (agent/admin). Validates property, buyer, and seller existence and computes fees/commissions.
- `GET /transactions` — List transactions with filters (propertyId, buyerId, sellerId, status, type, pagination).
- `GET /transactions/:id` — Get transaction details.
- `PUT /transactions/:id` — Update transaction (status, notes). Status updates enforce lifecycle rules.
- `POST /transactions/:id/record-on-blockchain` — Record transaction on-chain and persist blockchain metadata.
- `GET /transactions/:id/verify-blockchain` — Verify blockchain recording and optionally mark complete.
- `POST /transactions/:id/notes` — Add a note to a transaction (visibility enforced).

Lifecycle & audit expectations
------------------------------

- Status workflow: transactions follow a strict lifecycle validated by `transaction-status.constants.ts`. Invalid transitions are rejected.
- Audit logging: status transitions and critical operations are recorded via `TransactionAuditService` — every status change should produce an audit entry.
- Timeline events: status changes auto-create timeline stage events for operational tracking.
- Commissions & fees: when transactions are created/updated, the `CommissionsService` and `TransactionFeesService` are invoked to calculate and persist commission records.
- Blockchain: recording is asynchronous via `BlockchainService`. The transaction stores `blockchainHash` and `contractAddress` and verification can update status to `COMPLETED`.

Developer notes
---------------

- Controller: [src/transactions/transactions.controller.ts](src/transactions/transactions.controller.ts#L1)
- Service: [src/transactions/transactions.service.ts](src/transactions/transactions.service.ts#L1)
- DTOs: [src/transactions/dto/transaction.dto.ts](src/transactions/dto/transaction.dto.ts#L1)
- Status rules: [src/transactions/transaction-status.constants.ts](src/transactions/transaction-status.constants.ts#L1)
- Audit service: [src/transactions/transaction-audit.service.ts](src/transactions/transaction-audit.service.ts#L1)
- Tests: unit tests in [src/transactions/*.spec.ts]; integration tests may stub `BlockchainService` and `NotificationsService` to keep CI stable.

Testing guidance
-----------------

- For CI smoke tests, stub external integrations (blockchain, notifications) and use an in-memory or ephemeral test DB.
- Ensure `TransactionAuditService` logs are asserted when testing status transitions.
- When testing `recordOnBlockchain`, mock `BlockchainService.recordTransactionOnBlockchain` to return a deterministic `blockchainHash` and `contractAddress`.
