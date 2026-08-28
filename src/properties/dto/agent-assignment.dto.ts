import { IsString, IsNumber, IsOptional, Min, Max, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignAgentDto {
  @ApiProperty({ description: 'The ID of the agent to assign' })
  @IsString()
  agentId: string;

  @ApiPropertyOptional({
    description: 'The commission rate for this agent on this property (0 to 1, e.g. 0.03 for 3%)',
    default: 0.03,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRate?: number;

  @ApiPropertyOptional({
    description: 'Override contact phone number for this property assignment',
  })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({
    description: 'Override contact email address for this property assignment',
  })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}

export class UpdateAgentAssignmentDto {
  @ApiPropertyOptional({
    description: 'The commission rate for this agent on this property (0 to 1, e.g. 0.03 for 3%)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRate?: number;

  @ApiPropertyOptional({
    description: 'Override contact phone number for this property assignment',
  })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({
    description: 'Override contact email address for this property assignment',
  })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}
