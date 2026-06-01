import {
  IsEnum,
  IsString,
  MinLength,
} from 'class-validator';

export class RequestRoleEscalationDto {
  @IsString()
  @MinLength(10)
  justification: string;

  @IsEnum([
    'organizer',
    'moderator',
    'admin',
  ])
  requestedRole: string;
}