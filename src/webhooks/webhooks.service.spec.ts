// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../database/prisma.service';
import { CreateWebhookDto } from './webhook.dto';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      webhook: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        delete: jest.fn(),
      },
      webhookDeliveryLog: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhooksService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a webhook and returns it with the plaintext secret', async () => {
      const dto: CreateWebhookDto = {
        url: 'https://example.com/hook',
        eventTypes: ['transaction.created'],
        description: 'test webhook',
      } as CreateWebhookDto;

      prisma.webhook.create.mockResolvedValue({
        id: 'wh-1',
        userId: 'user-1',
        url: dto.url,
        secret: 'stored-secret',
        events: dto.eventTypes,
        description: dto.description,
      });

      const result = await service.create('user-1', dto);

      expect(prisma.webhook.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          url: dto.url,
          events: dto.eventTypes,
          description: dto.description,
          secret: expect.any(String),
        }),
      });
      expect(result).toHaveProperty('secret');
    });
  });

  describe('findAll', () => {
    it('should return webhooks for a user', async () => {
      prisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', userId: 'user-1', url: 'https://example.com' },
      ]);

      const result = await service.findAll('user-1');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException when webhook not found', async () => {
      prisma.webhook.findFirst.mockResolvedValue(null);
      await expect(service.findOne('bad-id', 'user-1')).rejects.toThrow();
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException when webhook not found', async () => {
      prisma.webhook.findFirst.mockResolvedValue(null);
      await expect(service.remove('bad-id', 'user-1')).rejects.toThrow();
    });
  });
});
