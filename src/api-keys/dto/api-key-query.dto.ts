import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IntersectionType } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto';

export class ApiKeyFilterDto {
  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}

export class ApiKeyQueryDto extends IntersectionType(
  ApiKeyFilterDto,
  PaginationDto,
) {}
