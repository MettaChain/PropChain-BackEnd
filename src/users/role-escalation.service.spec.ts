import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { RoleEscalationService } from './role-escalation.service';

describe('RoleEscalationService', () => {
  let service: RoleEscalationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleEscalationService,
        {
          provide: PrismaService,
          useValue: {
            activityLog: {
              create: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<RoleEscalationService>(RoleEscalationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
