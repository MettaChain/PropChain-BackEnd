# Transactions (Payment / Investment API) improvements

- **Structured logging (#1414):** `TransactionsService` uses `AppLogger`. Events are a constant message plus a metadata object with a stable `event` name:

  | `event` | Level | Fields |
  | --- | --- | --- |
  | `transactions.created` | log | `transactionId`, `type` |
  | `transactions.updated` | log | `transactionId` |
  | `transactions.status_updated` | log | `transactionId`, `status` |
  | `transactions.blockchain_auto_record_failed` | warn | `transactionId`, `error` |

- **Input sanitization (#1404):** the free-text `notes` field on create/update DTOs is cleaned with `CleanText` (strips HTML tags and control characters, collapses whitespace).
- **Reduced complexity (#1405):** the blockchain auto-record step of `create()` moved into a private `autoRecordOnBlockchain()` helper.
- **Query optimization (#1400):** the existence checks in `create()` only select the columns they use instead of loading full property/user rows.
