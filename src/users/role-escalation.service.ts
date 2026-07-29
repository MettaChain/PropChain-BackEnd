import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RequestRoleEscalationDto } from './dto/request-role-escalation.dto';

@Injectable()
export class RoleEscalationService {
  private readonly logger = new Logger(RoleEscalationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async requestEscalation(userId: string, dto: RequestRoleEscalationDto): Promise<void> {
    // Audit log the escalation request (#886)
    await this.prisma.activityLog
      .create({
        data: {
          userId,
          action: 'ROLE_ESCALATION_REQUESTED',
          entityType: 'USER',
          entityId: userId,
          description: `User requested role escalation to ${dto.requestedRole}`,
          metadata: {
            requestedRole: dto.requestedRole,
            justification: dto.justification,
          },
        },
      })
      .catch((err) => {
        this.logger.error(`Failed to audit-log role escalation request: ${err}`);
      });
  }
}
