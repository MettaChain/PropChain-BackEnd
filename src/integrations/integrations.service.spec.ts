import { IntegrationsService } from './integrations.service';
import { MLS_ADAPTER, CRM_ADAPTER, PAYMENT_ADAPTER } from './contracts/adapters.interface';

void MLS_ADAPTER;
void CRM_ADAPTER;
void PAYMENT_ADAPTER;

describe('IntegrationsService', () => {
  let service: IntegrationsService;
  const mlsAdapter = {
    searchListings: jest.fn().mockResolvedValue([]),
    getListing: jest.fn().mockResolvedValue(null),
  };
  const crmAdapter = {
    createContact: jest.fn(),
    getContact: jest.fn().mockResolvedValue(null),
    syncContact: jest.fn(),
  };
  const paymentAdapter = { processPayment: jest.fn(), refundPayment: jest.fn() };

  beforeEach(() => {
    service = new IntegrationsService(mlsAdapter as any, crmAdapter as any, paymentAdapter as any);
  });

  it('searchMlsListings returns empty array when no listings found', async () => {
    const result = await service.searchMlsListings({ location: 'Lagos' });
    expect(mlsAdapter.searchListings).toHaveBeenCalledWith({ location: 'Lagos' });
    expect(result).toEqual([]);
  });

  it('getCrmContact returns null when contact not found', async () => {
    const result = await service.getCrmContact('id-1');
    expect(result).toBeNull();
  });
});
