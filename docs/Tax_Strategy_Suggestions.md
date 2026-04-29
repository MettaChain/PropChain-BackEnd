# Tax Strategy Suggestions

PropChain supports lightweight tax strategy suggestions on property transactions.

These suggestions are:

- Informational only
- Non-binding
- Not legal or tax advice
- Intended to help users structure internal discussions and transaction planning

## Endpoints

```bash
GET /transactions/:transactionId/tax-strategies
POST /transactions/:transactionId/tax-strategies
PATCH /transactions/:transactionId/tax-strategies/:strategyId
```

## Create Payload

```json
{
  "strategyType": "Installment sale timing",
  "jurisdiction": "Austin, Texas, USA",
  "estimatedTaxRate": 7.5,
  "explanation": "Consider sequencing closing milestones to spread taxable recognition where appropriate.",
  "metadata": {
    "source": "internal-review"
  }
}
```

## Notes

- `strategyType` and `explanation` are required.
- `jurisdiction` is optional. If omitted, the API derives a label from the property city, state, and country when available.
- `estimatedTaxImpact` is auto-calculated when `estimatedTaxRate` is provided.
- Suggestions are versioned. Updates increment the version unless a specific version is supplied.
- Real-time notification events are emitted through the existing notifications pipeline when suggestions are created or updated.
