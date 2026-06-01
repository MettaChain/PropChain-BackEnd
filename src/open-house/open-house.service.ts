import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateOpenHouseDto } from './dto/create-open-house.dto';
import { RsvpOpenHouseDto } from './dto/rsvp-open-house.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class OpenHouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateOpenHouseDto) {
    return this.prisma.openHouse.create({
      data: {
        propertyId: dto.propertyId,
        title: dto.title ?? 'Open House',
        description: dto.description,
        startAt: dto.startAt,
        endAt: dto.endAt,
      },
    });
  }

  async findOne(id: string) {
    const openHouse = await this.prisma.openHouse.findUnique({
      where: { id },
      include: { rsvps: true, property: true },
    });
    if (!openHouse) {
      throw new NotFoundException('Open house not found');
    }
    return openHouse;
  }

  async cancel(id: string) {
    return this.prisma.openHouse.update({
      where: { id },
      data: { isCancelled: true, cancelledAt: new Date() },
    });
  }

  async rsvp(openHouseId: string, dto: RsvpOpenHouseDto) {
    const openHouse = await this.prisma.openHouse.findUnique({
      where: { id: openHouseId },
      include: { property: { select: { title: true, address: true } } },
    });
    if (!openHouse) {
      throw new NotFoundException('Open house not found');
    }

    const rsvp = await this.prisma.openHouseRsvp.upsert({
      where: { openHouseId_userId: { openHouseId, userId: dto.userId } },
      update: { status: dto.status },
      create: {
        openHouseId,
        userId: dto.userId,
        status: dto.status,
      },
    });

    const title = `RSVP Confirmed: ${openHouse.title}`;
    const message = `Your RSVP status is ${dto.status} for "${openHouse.property.title}" at ${openHouse.property.address}.`;
    await this.notificationsService.sendNotification(dto.userId, title, message, 'OPEN_HOUSE_RSVP', {
      openHouseId,
      status: dto.status,
      propertyTitle: openHouse.property.title,
      propertyAddress: openHouse.property.address,
      startAt: openHouse.startAt,
      endAt: openHouse.endAt,
    });

    return rsvp;
  }
}
