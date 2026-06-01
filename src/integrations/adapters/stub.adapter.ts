import { Injectable, Logger } from '@nestjs/common';
import { IMlsAdapter, ICrmAdapter, IPaymentAdapter, MlsListing, CrmContact, PaymentResult } from '../contracts/adapters.interface';

@Injectable()
export class StubMlsAdapter implements IMlsAdapter {
  private readonly logger = new Logger(StubMlsAdapter.name);

  async searchListings(query: { location?: string; minPrice?: number; maxPrice?: number }): Promise<MlsListing[]> {
    this.logger.debug(`Stub MLS search: ${JSON.stringify(query)}`);
    return [];
  }

  async getListing(mlsId: string): Promise<MlsListing | null> {
    this.logger.debug(`Stub MLS get listing: ${mlsId}`);
    return null;
  }
}

@Injectable()
export class StubCrmAdapter implements ICrmAdapter {
  private readonly logger = new Logger(StubCrmAdapter.name);

  async createContact(contact: Omit<CrmContact, 'id'>): Promise<CrmContact> {
    this.logger.debug(`Stub CRM create contact: ${contact.email}`);
    return { ...contact, id: `crm_${Date.now()}` };
  }

  async getContact(id: string): Promise<CrmContact | null> {
    this.logger.debug(`Stub CRM get contact: ${id}`);
    return null;
  }

  async syncContact(userId: string, data: Partial<CrmContact>): Promise<void> {
    this.logger.debug(`Stub CRM sync user ${userId}`);
  }
}

@Injectable()
export class StubPaymentAdapter implements IPaymentAdapter {
  private readonly logger = new Logger(StubPaymentAdapter.name);

  async processPayment(amount: number, currency: string, token: string): Promise<PaymentResult> {
    this.logger.debug(`Stub processing payment: ${amount} ${currency}`);
    return {
      transactionId: `txn_${Date.now()}`,
      status: 'pending',
      amount,
      currency,
    };
  }

  async refundPayment(transactionId: string): Promise<PaymentResult> {
    this.logger.debug(`Stub refunding: ${transactionId}`);
    return {
      transactionId,
      status: 'pending',
      amount: 0,
      currency: 'USD',
    };
  }
}
