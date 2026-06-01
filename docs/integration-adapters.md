# Integration Adapters

The PropChain backend uses a pluggable adapter pattern for external integrations.

## Available Contracts
All adapter contracts are defined in `src/integrations/contracts/adapters.interface.ts`.

- `IMlsAdapter`: Multiple Listing Service integration.
- `ICrmAdapter`: CRM Integration (e.g. Salesforce, HubSpot).
- `IPaymentAdapter`: Payment Gateways (e.g. Stripe).

## Implementing a New Adapter
1. Create a new class that implements the target interface (e.g., `HubSpotCrmAdapter implements ICrmAdapter`).
2. Add the adapter implementation to `src/integrations/adapters/`.
3. In `integrations.module.ts`, swap out the `useClass` for the respective injection token to use your new adapter.

Example:
```typescript
{
  provide: CRM_ADAPTER,
  useClass: HubSpotCrmAdapter,
}
```
