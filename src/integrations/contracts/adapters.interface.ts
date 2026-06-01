export interface MlsListing {
  mlsId: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  status: string;
}

export interface PaymentResult {
  transactionId: string;
  status: 'success' | 'failed' | 'pending';
  amount: number;
  currency: string;
}

export interface CrmContact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  type: 'lead' | 'client';
}

export const MLS_ADAPTER = 'MLS_ADAPTER';
export interface IMlsAdapter {
  searchListings(query: { location?: string; minPrice?: number; maxPrice?: number }): Promise<MlsListing[]>;
  getListing(mlsId: string): Promise<MlsListing | null>;
}

export const CRM_ADAPTER = 'CRM_ADAPTER';
export interface ICrmAdapter {
  createContact(contact: Omit<CrmContact, 'id'>): Promise<CrmContact>;
  getContact(id: string): Promise<CrmContact | null>;
  syncContact(userId: string, data: Partial<CrmContact>): Promise<void>;
}

export const PAYMENT_ADAPTER = 'PAYMENT_ADAPTER';
export interface IPaymentAdapter {
  processPayment(amount: number, currency: string, token: string): Promise<PaymentResult>;
  refundPayment(transactionId: string): Promise<PaymentResult>;
}
