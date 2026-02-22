import { PropertyStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export { PropertyStatus };

export class Property {
  id: string;
  title: string;
  description: string | null;
  location: string;
  price: Decimal;
  status: PropertyStatus;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  // Valuation fields
  estimatedValue: Decimal | null;
  valuationDate: Date | null;
  valuationConfidence: number | null;
  valuationSource: string | null;
  lastValuationId: string | null;
  // Property features
  bedrooms: number | null;
  bathrooms: number | null;
  squareFootage: Decimal | null;
  yearBuilt: number | null;
  propertyType: string | null;
  lotSize: Decimal | null;
}

export type CreatePropertyInput = {
  title: string;
  description?: string;
  location: string;
  price: number | Decimal;
  status?: PropertyStatus;
  ownerId: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number | Decimal;
  yearBuilt?: number;
  propertyType?: string;
  lotSize?: number | Decimal;
};

export type UpdatePropertyInput = Partial<Omit<CreatePropertyInput, 'ownerId'>>;
