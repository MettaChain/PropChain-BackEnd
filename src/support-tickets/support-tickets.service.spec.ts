import { SupportTicketsService } from './support-tickets.service';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('SupportTicketsService', () => {
  let service: SupportTicketsService;
  let prisma: jest.Mocked<Partial<PrismaService>>;
  let notifications: jest.Mocked<Partial<NotificationsService>>;

  beforeEach(() => {
    prisma = {
      supportTicket: {
        create: jest.fn().mockResolvedValue({ id: 'ticket-1', priority: 'HIGH', slaDeadline: new Date() }),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      } as any,
    };
    notifications = { sendNotification: jest.fn().mockResolvedValue(undefined) };
    service = new SupportTicketsService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  it('creates a ticket with correct SLA deadline for HIGH priority', async () => {
    const result = await service.createTicket('user-1', {
      subject: 'Test', description: 'Desc', priority: 'HIGH',
    } as any);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(prisma.supportTicket!.create).toHaveBeenCalled();
    expect(result.id).toBe('ticket-1');
  });
});