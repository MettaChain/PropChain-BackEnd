# Escrow Management Module (issue #1611)

Self-contained NestJS module for managing transaction escrow accounts. All new
files live under `api-extensions/modules/escrow-management/`; the existing
`src/`, `prisma/` and `test/` trees are left untouched.

## State machine

```
PENDING --holdFunds--> HELD --release--> RELEASED
   |                    |  \
   |                    |   \--refund--> REFUNDED
   |                    |
   +--dispute-----------+  (dispute hold locks the escrow)
                          |
                          +--resolveDispute(RELEASE | REFUND)
```

`PENDING`, `HELD`, `RELEASED` and `REFUNDED` match the `escrowStatus` values on
the existing `Transaction` model. A dispute hold is a locked `HELD` escrow.
Funds are only released once every configured milestone has been completed.

## Integration points

- `PrismaService` is injected through the local `ESCROW_MANAGEMENT_PRISMA`
  token. Transaction existence is checked with `transaction.findUnique`, the
  escrow fields are mirrored with `transaction.update`, and every audit entry
  is persisted through `transactionHistory.create`.
- `TransactionFeesService.calculateFees` supplies the fee breakdown. The escrow
  amount is the fee-inclusive `totalAmount`, while `baseAmount` keeps the
  original transaction value. Creation is rejected when that fee-inclusive
  amount exceeds the transaction amount.
- All endpoints are guarded by `JwtAuthGuard`; the actor recorded in the audit
  trail is always the authenticated user's `sub`, never a request-body value.

## Endpoints

| Method | Path                                                    | Purpose                                       |
| ------ | ------------------------------------------------------- | --------------------------------------------- |
| POST   | `/escrow-management`                                    | Create a pending escrow                       |
| GET    | `/escrow-management`                                    | List escrows (optional `transactionId` query) |
| GET    | `/escrow-management/:transactionId`                     | Get one escrow                                |
| GET    | `/escrow-management/:transactionId/balance`             | Get held balance                              |
| GET    | `/escrow-management/:transactionId/audit`               | Get audit trail                               |
| GET    | `/escrow-management/:transactionId/fees`                | Get fee breakdown                             |
| POST   | `/escrow-management/:transactionId/hold`                | Hold funds                                    |
| POST   | `/escrow-management/:transactionId/milestones/complete` | Complete a milestone                          |
| POST   | `/escrow-management/:transactionId/release`             | Conditionally release                         |
| POST   | `/escrow-management/:transactionId/refund`              | Refund with reason                            |
| POST   | `/escrow-management/:transactionId/dispute`             | Place a dispute hold                          |
| POST   | `/escrow-management/:transactionId/dispute/resolve`     | Resolve a dispute                             |

## Tests

`escrow-management.service.spec.ts` covers creation validation, fee
integration, fund holding, milestone-gated release, refunds, dispute holds and
audit-trail persistence.
