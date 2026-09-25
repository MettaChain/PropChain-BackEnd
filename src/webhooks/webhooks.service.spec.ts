import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../database/prisma.service';
import { CreateWebhookDto, UpdateWebhookDto } from './webhook.dto';
import { BadRequestException } from '@nestjs/common';
import * as dns from 'dns';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: any;
  let mockQueue: any;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };

    prisma = {
      webhook: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        delete: jest.fn(),
      },
      webhookDeliveryLog: {
        create: jest.fn().mockResolvedValue({ id: 'dl-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
      activityLog: {
        create: jest.fn().mockResolvedValue({ id: 'act-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'BullQueue_webhook-delivery', useValue: mockQueue },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create - SSRF validation (#1253)', () => {
    it('creates a webhook with a valid public HTTPS url', async () => {
      jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any);

      const dto: CreateWebhookDto = {
        url: 'https://example.com/hook',
        eventTypes: ['PROPERTY_CREATED'] as any,
        description: 'valid webhook',
      };

      prisma.webhook.create.mockResolvedValue({
        id: 'wh-1',
        userId: 'user-1',
        url: dto.url,
        secret: 'stored-secret',
        events: dto.eventTypes,
        description: dto.description,
      });

      const result = await service.create('user-1', dto);
      expect(result).toHaveProperty('secret');
      expect(prisma.webhook.create).toHaveBeenCalled();
    });

    it('rejects cloud metadata IP 169.254.169.254', async () => {
      const dto: CreateWebhookDto = {
        url: 'http://169.254.169.254/latest/meta-data',
        eventTypes: ['PROPERTY_CREATED'] as any,
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects loopback addresses', async () => {
      const loopbacks = [
        'http://127.0.0.1:8080/hook',
        'http://127.0.0.2/hook',
        'http://localhost:3000/hook',
      ];

      for (const url of loopbacks) {
        await expect(
          service.create('user-1', { url, eventTypes: ['PROPERTY_CREATED'] as any }),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects RFC 1918 private IPv4 addresses', async () => {
      const privateIps = [
        'http://10.0.0.1/hook',
        'http://172.16.0.1/hook',
        'http://172.31.255.255/hook',
        'http://192.168.1.1/hook',
      ];

      for (const url of privateIps) {
        await expect(
          service.create('user-1', { url, eventTypes: ['PROPERTY_CREATED'] as any }),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects cloud metadata hostnames', async () => {
      const metadataHosts = [
        'http://metadata.google.internal/computeMetadata/v1/',
        'http://metadata/hook',
        'http://instance-data/latest/meta-data',
      ];

      for (const url of metadataHosts) {
        await expect(
          service.create('user-1', { url, eventTypes: ['PROPERTY_CREATED'] as any }),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects hostnames that resolve via DNS to private IPs', async () => {
      jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '10.200.0.1', family: 4 }] as any);

      const dto: CreateWebhookDto = {
        url: 'http://internal.corp-service.com/hook',
        eventTypes: ['PROPERTY_CREATED'] as any,
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('requires HTTPS in non-local production environment', async () => {
      process.env.NODE_ENV = 'production';
      jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any);

      const dto: CreateWebhookDto = {
        url: 'http://example.com/hook', // HTTP in production
        eventTypes: ['PROPERTY_CREATED'] as any,
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('allows dev allowlisted hostnames in test/dev environment', async () => {
      process.env.NODE_ENV = 'test';
      process.env.WEBHOOK_DEV_ALLOWLIST = '127.0.0.1,my-local-receiver';

      const dto: CreateWebhookDto = {
        url: 'http://127.0.0.1:4000/webhook',
        eventTypes: ['PROPERTY_CREATED'] as any,
      };

      prisma.webhook.create.mockResolvedValue({
        id: 'wh-dev',
        url: dto.url,
        secret: 'sec',
      });

      const res = await service.create('user-1', dto);
      expect(res).toBeDefined();
    });
  });

  describe('update - SSRF validation', () => {
    it('rejects updating webhook url to an internal IP', async () => {
      prisma.webhook.findFirst.mockResolvedValue({ id: 'wh-1', userId: 'user-1' });

      const dto: UpdateWebhookDto = {
        url: 'http://169.254.169.254/secret',
      };

      await expect(service.update('wh-1', 'user-1', dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('trigger - asynchronous BullMQ delivery and rate limiting (#1253, #1254)', () => {
    it('dispatches deliveries asynchronously to BullMQ queue without blocking', async () => {
      prisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://example.com/hook-1', secret: 'sec-1' },
        { id: 'wh-2', url: 'https://example.com/hook-2', secret: 'sec-2' },
      ]);

      await service.trigger('PROPERTY_CREATED', { id: 'p1' });

      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'deliver-webhook',
        expect.objectContaining({
          webhookId: 'wh-1',
          eventType: 'PROPERTY_CREATED',
          payload: { id: 'p1' },
        }),
        expect.any(Object),
      );
    });

    it('rate-limits trigger frequency per webhook', async () => {
      process.env.WEBHOOK_TRIGGER_RATE_LIMIT = '2';

      // Recreate service to pick up env
      const mod = await Test.createTestingModule({
        providers: [
          WebhooksService,
          { provide: PrismaService, useValue: prisma },
          { provide: 'BullQueue_webhook-delivery', useValue: mockQueue },
        ],
      }).compile();
      const rlService = mod.get<WebhooksService>(WebhooksService);

      prisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-rate-limited', url: 'https://example.com/rl', secret: 'sec' },
      ]);

      // Call 3 times
      await rlService.trigger('EVT', { count: 1 });
      await rlService.trigger('EVT', { count: 2 });
      await rlService.trigger('EVT', { count: 3 });

      // Only 2 should be enqueued, 3rd is rate limited
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
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

  describe('rotateSecret', () => {
    it('rotates secret, updates db, records audit log, and returns new secret', async () => {
      const existing = { id: 'wh-1', userId: 'user-1', secret: 'old-secret' };
      prisma.webhook.findFirst.mockResolvedValue(existing);
      prisma.webhook.update.mockImplementation(async ({ data }: any) => ({
        ...existing,
        ...data,
      }));

      const result = await service.rotateSecret('wh-1', 'user-1');

      expect(result.secret).toBeDefined();
      expect(result.secret).not.toBe('old-secret');
      expect(prisma.webhook.update).toHaveBeenCalledWith({
        where: { id: 'wh-1' },
        data: { secret: result.secret },
      });
      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'WEBHOOK_SECRET_ROTATED',
          entityType: 'WEBHOOK',
          entityId: 'wh-1',
        }),
      });
    });

    it('throws NotFoundException when rotating non-existent webhook', async () => {
      prisma.webhook.findFirst.mockResolvedValue(null);
      await expect(service.rotateSecret('bad-id', 'user-1')).rejects.toThrow();
    });
  });

  describe('Retry Backoff Schedule (#1256)', () => {
    it('maps attempts to correct 0-based delays', () => {
      expect(service.getRetryDelay(1)).toBe(1000);
      expect(service.getRetryDelay(2)).toBe(5000);
      expect(service.getRetryDelay(3)).toBe(15000);
      expect(service.getRetryDelay(4)).toBe(60000);
      expect(service.getRetryDelay(5)).toBe(300000);
      expect(service.getRetryDelay(99)).toBe(300000);
    });
  });

  describe('pruneOldDeliveryLogs', () => {
    it('deletes delivery logs older than specified retention days', async () => {
      const res = await service.pruneOldDeliveryLogs(30);
      expect(prisma.webhookDeliveryLog.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            lt: expect.any(Date),
          },
        },
      });
      expect(res.count).toBe(5);
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException when webhook not found', async () => {
      prisma.webhook.findFirst.mockResolvedValue(null);
      await expect(service.remove('bad-id', 'user-1')).rejects.toThrow();
    });
  });
});
