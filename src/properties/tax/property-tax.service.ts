// @ts-nocheck

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface TaxRecord {
  year: number;
  amount: number;
  assessmentValue?: number;
  taxRate?: number;
}

export interface TaxSummary {
  propertyId: string;
  totalTaxesPaid: number;
  averageAnnualTax: number;
  yearOverYearChange: number | null;
  records: TaxRecord[];
}

@Injectable()
export class PropertyTaxService {
  constructor(private readonly prisma: PrismaService) {}

  async getTaxHistory(propertyId: string): Promise<TaxRecord[]> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        taxHistory: true,
        annualTaxAmount: true,
        taxAssessmentValue: true,
        taxRate: true,
      },
    });

    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`);
    }

    if (property.taxHistory && Array.isArray(property.taxHistory)) {
      return property.taxHistory as TaxRecord[];
    }

    if (property.annualTaxAmount) {
      return [
        {
          year: new Date().getFullYear(),
          amount: Number(property.annualTaxAmount),
          assessmentValue: property.taxAssessmentValue
            ? Number(property.taxAssessmentValue)
            : undefined,
          taxRate: property.taxRate ? Number(property.taxRate) : undefined,
        },
      ];
    }

    return [];
  }

  async getTaxSummary(propertyId: string): Promise<TaxSummary> {
    const records = await this.getTaxHistory(propertyId);

    if (records.length === 0) {
      return {
        propertyId,
        totalTaxesPaid: 0,
        averageAnnualTax: 0,
        yearOverYearChange: null,
        records,
      };
    }

    const totalTaxesPaid = records.reduce((sum, r) => sum + r.amount, 0);
    const averageAnnualTax = totalTaxesPaid / records.length;

    let yearOverYearChange: number | null = null;
    if (records.length >= 2) {
      const sorted = [...records].sort((a, b) => b.year - a.year);
      const latest = sorted[0];
      const previous = sorted[1];
      yearOverYearChange =
        previous.amount > 0
          ? Math.round(((latest.amount - previous.amount) / previous.amount) * 10000) / 100
          : null;
    }

    return {
      propertyId,
      totalTaxesPaid: Math.round(totalTaxesPaid * 100) / 100,
      averageAnnualTax: Math.round(averageAnnualTax * 100) / 100,
      yearOverYearChange,
      records,
    };
  }

  async compareTax(propertyIds: string[]): Promise<any[]> {
    const comparisons = [];

    for (const propId of propertyIds) {
      const summary = await this.getTaxSummary(propId);
      const property = await this.prisma.property.findUnique({
        where: { id: propId },
        select: { id: true, title: true, address: true, city: true, state: true, price: true },
      });

      comparisons.push({
        ...summary,
        property,
      });
    }

    return comparisons;
  }
}
