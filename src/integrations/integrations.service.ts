import { Injectable, Inject } from '@nestjs/common';
import {
  IMlsAdapter,
  ICrmAdapter,
  IPaymentAdapter,
  MLS_ADAPTER,
  CRM_ADAPTER,
  PAYMENT_ADAPTER,
  MlsListing,
  CrmContact,
  PaymentResult,
} from './contracts/adapters.interface';

@Injectable()
export class IntegrationsService {
  constructor(
    @Inject(MLS_ADAPTER) private readonly mlsAdapter: IMlsAdapter,
    @Inject(CRM_ADAPTER) private readonly crmAdapter: ICrmAdapter,
    @Inject(PAYMENT_ADAPTER) private readonly paymentAdapter: IPaymentAdapter,
  ) {}

  // MLS Integration
  async searchMlsListings(query: {
    location?: string;
    minPrice?: number;
    maxPrice?: number;
  }): Promise<MlsListing[]> {
    return this.mlsAdapter.searchListings(query);
  }

  async getMlsListing(mlsId: string): Promise<MlsListing | null> {
    return this.mlsAdapter.getListing(mlsId);
  }

  // Payment Gateway Integration
  async processPayment(amount: number, currency: string, token: string): Promise<PaymentResult> {
    return this.paymentAdapter.processPayment(amount, currency, token);
  }

  async refundPayment(transactionId: string): Promise<PaymentResult> {
    return this.paymentAdapter.refundPayment(transactionId);
  }

  // CRM Integration
  async createCrmContact(contact: Omit<CrmContact, 'id'>): Promise<CrmContact> {
    return this.crmAdapter.createContact(contact);
  }

  async getCrmContact(id: string): Promise<CrmContact | null> {
    return this.crmAdapter.getContact(id);
  }

  async syncCrmContact(userId: string, data: Partial<CrmContact>): Promise<void> {
    return this.crmAdapter.syncContact(userId, data);
  }
}
