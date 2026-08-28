import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { PropertiesService } from '../properties.service';
import * as PDFDocument from 'pdfkit';
import { Buffer } from 'buffer';

@Injectable()
export class PropertyReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propertiesService: PropertiesService,
  ) {}

  async generatePropertyReport(propertyId: string): Promise<Buffer> {
    // Get the property
    const property = await this.propertiesService.findOne(propertyId);
    if (!property) {
      throw new NotFoundException(`Property with ID ${propertyId} not found`);
    }

    // Get comparable properties (similar properties in the same area)
    const comparableProperties = await this.getComparableProperties(property);

    // Get market analysis data
    const marketAnalysis = await this.getMarketAnalysis(property);

    // Generate PDF
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => {
      chunks.push(chunk);
    });

    doc.on('end', () => {
      // PDF generation complete
    });

    // Add content to PDF
    this.addPropertyHeader(doc, property);
    this.addPropertyDetails(doc, property);
    this.addComparableProperties(doc, comparableProperties);
    this.addMarketAnalysis(doc, marketAnalysis);
    this.addFooter(doc);

    doc.end();

    // Wait for PDF to be generated
    return new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', (err) => {
        reject(err);
      });
    });
  }

  private async getComparableProperties(property: any): Promise<any[]> {
    // Find similar properties in the same city and state
    // With similar price range (+/- 20%) and same property type
    const priceLow = property.price.times(0.8);
    const priceHigh = property.price.times(1.2);

    return this.prisma.property.findMany({
      where: {
        id: { not: property.id }, // Exclude the property itself
        city: property.city,
        state: property.state,
        propertyType: property.propertyType,
        price: {
          gte: priceLow,
          lte: priceHigh,
        },
        status: 'ACTIVE',
      },
      include: {
        owner: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      take: 5, // Limit to 5 comparable properties
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  private async getMarketAnalysis(property: any): Promise<any> {
    // Get average price for similar properties in the area
    const priceLow = property.price.times(0.8);
    const priceHigh = property.price.times(1.2);

    const [avgPrice, count, recentSales] = await Promise.all([
      this.prisma.property.aggregate({
        where: {
          city: property.city,
          state: property.state,
          propertyType: property.propertyType,
          price: {
            gte: priceLow,
            lte: priceHigh,
          },
          status: 'ACTIVE',
        },
        _avg: {
          price: true,
        },
      }),
      this.prisma.property.count({
        where: {
          city: property.city,
          state: property.state,
          propertyType: property.propertyType,
          price: {
            gte: priceLow,
            lte: priceHigh,
          },
          status: 'ACTIVE',
        },
      }),
      this.prisma.transaction.findMany({
        where: {
          property: {
            city: property.city,
            state: property.state,
          },
          status: 'COMPLETED',
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
        include: {
          property: true,
        },
      }),
    ]);

    // Calculate price trend from recent sales
    let priceTrend = 'stable';
    if (recentSales.length >= 3) {
      const prices = recentSales.map((tx: any) => tx.property.price);
      const firstHalf = prices.slice(0, Math.ceil(prices.length / 2));
      const secondHalf = prices.slice(Math.ceil(prices.length / 2));

      const avgFirstHalf = firstHalf
        .reduce((sum: Decimal, p: Decimal) => sum.plus(p), new Decimal(0))
        .divide(firstHalf.length);
      const avgSecondHalf = secondHalf
        .reduce((sum: Decimal, p: Decimal) => sum.plus(p), new Decimal(0))
        .divide(secondHalf.length);

      const diffPercent = avgSecondHalf.minus(avgFirstHalf).divide(avgFirstHalf).times(100);

      if (diffPercent.greaterThan(5)) {
        priceTrend = 'increasing';
      } else if (diffPercent.lessThan(-5)) {
        priceTrend = 'decreasing';
      }
    }

    return {
      averagePrice: avgPrice._avg.price || new Decimal(0),
      comparableCount: count,
      recentSalesCount: recentSales.length,
      priceTrend,
      recentSales: recentSales.slice(0, 3), // Show top 3 recent sales
    };
  }

  private addPropertyHeader(doc: PDFKit.PDFDocument, property: any) {
    doc.fontSize(24).text('Property Report', { align: 'center' }).moveDown(0.5);

    doc.fontSize(16).text(property.title, { align: 'center' }).moveDown(1);

    // Add a separator line
    doc
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .stroke()
      .moveDown(1);
  }

  private addPropertyDetails(doc: PDFKit.PDFDocument, property: any) {
    doc.fontSize(12);

    // Property basic info
    doc.text(`Property ID: ${property.id}`, { continued: true });
    doc.text(`Status: ${property.status}`);
    doc.moveDown(0.5);

    doc.text(`Address: ${property.address}`);
    doc.text(`${property.city}, ${property.state} ${property.zipCode}`);
    doc.text(`Country: ${property.country}`);
    doc.moveDown(0.5);

    doc.text(`Price: $${property.price.toFormat(2)}`);
    doc.text(`Property Type: ${property.propertyType}`);
    doc.text(`Bedrooms: ${property.bedrooms || 'N/A'}`);
    doc.text(`Bathrooms: ${property.bathrooms || 'N/A'}`);
    doc.text(`Square Feet: ${property.squareFeet ? property.squareFeet.toFormat(0) : 'N/A'} sq ft`);
    doc.text(`Lot Size: ${property.lotSize ? property.lotSize.toFormat(2) : 'N/A'} acres`);
    doc.text(`Year Built: ${property.yearBuilt || 'N/A'}`);
    doc.moveDown(0.5);

    if (property.description) {
      doc.text('Description:');
      doc.text(property.description, { indent: 10 });
      doc.moveDown(0.5);
    }

    if (property.features && property.features.length > 0) {
      doc.text('Features:');
      const featuresText = property.features.join(', ');
      doc.text(featuresText, { indent: 10 });
      doc.moveDown(0.5);
    }

    // Owner information
    if (property.owner) {
      doc.text(`Listed by: ${property.owner.firstName} ${property.owner.lastName}`);
      doc.moveDown(0.5);
    }

    doc.moveDown(1);
  }

  private addComparableProperties(doc: PDFKit.PDFDocument, properties: any[]) {
    doc.fontSize(16).text('Comparable Properties', { underline: true });
    doc.moveDown(0.5);

    if (properties.length === 0) {
      doc.text('No comparable properties found in the area.');
      doc.moveDown(1);
      return;
    }

    // Create a table-like structure for comparable properties
    properties.forEach((prop, index) => {
      if (index > 0) {
        doc.moveDown(0.5);
      }

      doc.fontSize(12).text(`${index + 1}. ${prop.title}`, { continued: true });
      doc.text(` - $${prop.price.toFormat(2)}`);

      doc.text(`   ${prop.address}`);
      doc.text(`   ${prop.city}, ${prop.state} ${prop.zipCode}`);
      doc.text(
        `   ${prop.bedrooms} bd | ${prop.bathrooms} ba | ${prop.squareFeet ? prop.squareFeet.toFormat(0) : 'N/A'} sq ft`,
      );

      if (prop.owner) {
        doc.text(`   Listed by: ${prop.owner.firstName} ${prop.owner.lastName}`);
      }

      doc.moveDown(0.2);
    });

    doc.moveDown(1);
  }

  private addMarketAnalysis(doc: PDFKit.PDFDocument, analysis: any) {
    doc.fontSize(16).text('Market Analysis', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(12);
    doc.text(`Average Price in Area: $${analysis.averagePrice.toFormat(2)}`);
    doc.text(`Number of Comparable Properties: ${analysis.comparableCount}`);
    doc.text(`Recent Sales (Last 3 Months): ${analysis.recentSalesCount}`);
    doc.text(`Price Trend: ${analysis.priceTrend}`);

    if (analysis.recentSales && analysis.recentSales.length > 0) {
      doc.moveDown(0.5);
      doc.text('Recent Sales:', { underline: true });
      doc.moveDown(0.2);

      analysis.recentSales.forEach((sale: any, index: number) => {
        if (index > 0) {
          doc.moveDown(0.2);
        }
        doc.text(`${index + 1}. ${sale.property.title}`);
        doc.text(`   Sale Price: $${sale.amount.toFormat(2)}`);
        doc.text(`   Sale Date: ${sale.createdAt.toLocaleDateString()}`);
        doc.text(
          `   Property: ${sale.property.bedrooms} bd | ${sale.property.bathrooms} ba | ${sale.property.squareFeet ? sale.property.squareFeet.toFormat(0) : 'N/A'} sq ft`,
        );
      });
    }

    doc.moveDown(1);
  }

  private addFooter(doc: PDFKit.PDFDocument) {
    doc.fontSize(10);
    doc.text(`Generated on ${new Date().toLocaleString()} | PropChain Real Estate Platform`, {
      align: 'center',
    });
  }
}
