import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationsService } from '../../src/integrations/integrations.service';

describe('IntegrationsService', () => {
  let service: IntegrationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IntegrationsService],
    }).compile();
    service = module.get(IntegrationsService);
  });

  describe('MLS', () => {
    it('returns empty array for listings search', async () => {
      const result = await service.searchMlsListings({ location: 'NYC' });
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns null for unknown listing', async () => {
      expect(await service.getMlsListing('unknown')).toBeNull();
    });
  });

  describe('Payments', () => {
    it('processes payment and returns result', async () => {
      const result = await service.processPayment(1000, 'USD', 'tok_test');
      expect(result.status).toBe('pending');
      expect(result.amount).toBe(1000);
      expect(result.currency).toBe('USD');
      expect(result.transactionId).toBeDefined();
    });

    it('refunds payment', async () => {
      const result = await service.refundPayment('txn_123');
      expect(result.transactionId).toBe('txn_123');
      expect(result.status).toBe('pending');
    });
  });

  describe('CRM', () => {
    it('creates a contact with generated id', async () => {
      const contact = await service.createCrmContact({
        name: 'John',
        email: 'john@example.com',
        type: 'lead',
      });
      expect(contact.id).toBeDefined();
      expect(contact.email).toBe('john@example.com');
    });

    it('returns null for unknown contact', async () => {
      expect(await service.getCrmContact('unknown')).toBeNull();
    });
  });
});
