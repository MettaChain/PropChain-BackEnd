import {
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

export class ApproveRoleEscalationDto {
  @IsBoolean()
  approved: boolean;

  @IsOptional()
  @IsString()
  comment?: string;
}