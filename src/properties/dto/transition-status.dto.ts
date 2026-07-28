// @ts-nocheck

import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PROPERTY_STATUS_ENUM } from '../../common/common.types';

/**
 * Body for `PATCH /properties/:id/status`.
 * `status` must be a valid PropertyStatus value; the service verifies that
 * the transition from the current status to this one is allowed by the workflow.
 */
export class TransitionPropertyStatusDto {
  @IsEnum(PropertyStatusDto)
  status: PropertyStatusDto;

  /** Optional note explaining the transition (e.g., "buyer signed contract"). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}