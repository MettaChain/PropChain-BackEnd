import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { parse } from 'csv-parse/sync';
import { hashPassword } from '../auth/security.utils';
import { UserRole } from '../types/prisma.types';

interface UserImportRecord {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role?: string;
  phone?: string;
}

@Injectable()
export class UserImportService {
  private readonly logger = new Logger(UserImportService.name);

  constructor(private prisma: PrismaService) {}

  async importFromCsv(buffer: Buffer) {
    let records: UserImportRecord[];
    try {
      records = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (error) {
      this.logger.error('Failed to parse CSV:', error);
      throw new BadRequestException('Invalid CSV format: ' + error.message);
    }

    const report = {
      total: records.length,
      success: 0,
      failed: 0,
      errors: [] as { row: number; email: string; error: string }[],
    };

    if (records.length === 0) {
      throw new BadRequestException('CSV file is empty');
    }

    const usersToCreate: any[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const rowNumber = i + 2; // +1 for 0-indexed, +1 for header row
      const { email, firstName, lastName, password, role, phone } = record;

      try {
        // Validation
        if (!email || !firstName || !lastName || !password) {
          throw new Error('Missing required fields (email, firstName, lastName, password)');
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          throw new Error(`Invalid email format: ${email}`);
        }

        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters long');
        }

        // Check for existing user in database
        const existingUser = await this.prisma.user.findUnique({
          where: { email },
        });
        if (existingUser) {
          throw new Error('User with this email already exists');
        }

        // Check for duplicate in current CSV
        if (usersToCreate.some((u) => u.email === email)) {
          throw new Error('Duplicate email in CSV');
        }

        const hashedPassword = await hashPassword(password);

        // Generate unique referral code
        let referralCode: string;
        let isUnique = false;
        let attempts = 0;

        // Basic unique code generation
        do {
          referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
          const existingCode = await this.prisma.user.findUnique({ where: { referralCode } });
          if (!existingCode) {
            isUnique = true;
          }
          attempts++;
        } while (!isUnique && attempts < 10);

        if (!isUnique) {
          throw new Error('Could not generate a unique referral code');
        }

        usersToCreate.push({
          email,
          firstName,
          lastName,
          password: hashedPassword,
          role: (role?.toUpperCase() as UserRole) || UserRole.USER,
          phone: phone || null,
          referralCode,
          passwordHistory: {
            create: {
              passwordHash: hashedPassword,
            },
          },
        });
      } catch (error) {
        report.failed++;
        report.errors.push({
          row: rowNumber,
          email: email || 'N/A',
          error: error.message,
        });
      }
    }

    // Bulk creation in a transaction
    if (usersToCreate.length > 0) {
      try {
        await this.prisma.$transaction(
          usersToCreate.map((userData) => this.prisma.user.create({ data: userData })),
        );
        report.success = usersToCreate.length;
      } catch (error) {
        this.logger.error('Bulk creation failed:', error);
        throw new BadRequestException('Bulk creation failed. Please check the CSV data.');
      }
    }

    return report;
  }
}
