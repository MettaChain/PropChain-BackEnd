import { IsEnum, IsString, IsNotEmpty } from 'class-validator';
import { RsvpStatus } from '@prisma/client';

export class RsvpOpenHouseDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsEnum(RsvpStatus)
  status: RsvpStatus;
}
