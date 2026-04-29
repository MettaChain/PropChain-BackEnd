import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateMilestoneDto, UpdateMilestoneDto } from './dto/timeline.dto';
import { MilestoneStatus } from '../types/prisma.types';

@Injectable()
export class TimelineService {
  constructor(private prisma: PrismaService) {}

  async addMilestone(transactionId: string, dto: CreateMilestoneDto) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return this.prisma.transactionMilestone.create({
      data: {
        transactionId,
        title: dto.title,
        description: dto.description,
        expectedDate: new Date(dto.expectedDate),
        status: MilestoneStatus.PENDING,
      },
    });
  }

  async updateMilestone(milestoneId: string, dto: UpdateMilestoneDto) {
    const milestone = await this.prisma.transactionMilestone.findUnique({
      where: { id: milestoneId },
    });

    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    const updateData: any = {};
    if (dto.title) updateData.title = dto.title;
    if (dto.description) updateData.description = dto.description;
    if (dto.status) updateData.status = dto.status;
    if (dto.expectedDate) updateData.expectedDate = new Date(dto.expectedDate);
    if (dto.actualDate) updateData.actualDate = new Date(dto.actualDate);

    return this.prisma.transactionMilestone.update({
      where: { id: milestoneId },
      data: updateData,
    });
  }

  async getTimeline(transactionId: string) {
    const milestones = await this.prisma.transactionMilestone.findMany({
      where: { transactionId },
      orderBy: { expectedDate: 'asc' },
    });

    const total = milestones.length;
    const completed = milestones.filter(m => m.status === MilestoneStatus.COMPLETED).length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Check for delays
    const now = new Date();
    const updatedMilestones = milestones.map(m => {
      if (m.status === MilestoneStatus.PENDING && new Date(m.expectedDate) < now) {
        return { ...m, isOverdue: true };
      }
      return { ...m, isOverdue: false };
    });

    return {
      transactionId,
      progress,
      milestones: updatedMilestones,
    };
  }
}
