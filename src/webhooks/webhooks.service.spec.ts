import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../database/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { CreateWebhookDto } from './webhook.dto';

const mockPrisma = {};

describe('WebhooksService', () => {
  let service: WebhooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhooksService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should throw error (webhooks not yet implemented)', async () => {
      await expect(service.create('user-1', {} as CreateWebhookDto)).rejects.toThrow(
        'Webhooks module not yet implemented',
      );
    });
  });

  describe('findAll', () => {
    it('should return empty array', async () => {
      const result = await service.findAll('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException', async () => {
      await expect(service.findOne('bad-id', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException', async () => {
      await expect(service.remove('1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
