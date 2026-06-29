import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AuditLogQueryDto } from './audit-log-query.dto';

describe('AuditLogQueryDto', () => {
  it('accepts valid ISO 8601 dates', async () => {
    const dto = plainToInstance(AuditLogQueryDto, {
      dateFrom: '2024-01-01T00:00:00Z',
      dateTo: '2024-12-31T23:59:59Z',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects malformed date strings for dateFrom', async () => {
    const dto = plainToInstance(AuditLogQueryDto, {
      dateFrom: 'not-a-date',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('dateFrom');
  });

  it('rejects malformed date strings for dateTo', async () => {
    const dto = plainToInstance(AuditLogQueryDto, {
      dateTo: 'bad-date-value',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('dateTo');
  });

  it('accepts missing optional dates', async () => {
    const dto = plainToInstance(AuditLogQueryDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('accepts dateFrom without dateTo', async () => {
    const dto = plainToInstance(AuditLogQueryDto, {
      dateFrom: '2024-06-01T00:00:00Z',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('accepts dateTo without dateFrom', async () => {
    const dto = plainToInstance(AuditLogQueryDto, {
      dateTo: '2024-06-30T23:59:59Z',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects numeric strings for dates', async () => {
    const dto = plainToInstance(AuditLogQueryDto, {
      dateFrom: 12345,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
