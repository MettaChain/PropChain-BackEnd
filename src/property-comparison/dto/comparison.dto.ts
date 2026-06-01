import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

const COMPARISON_MIN = 2;
const COMPARISON_MAX = 4;

/**
 * DTO for `GET /property-comparison?ids=uuid1,uuid2,...`.
 * Accepts a comma-separated string and normalizes it into an array.
 */
export class CompareQueryDto {
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value.flatMap((v: string) => String(v).split(','));
    }
    return typeof value === 'string'
      ? value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      : value;
  })
  @IsArray()
  @ArrayMinSize(COMPARISON_MIN, {
    message: `At least ${COMPARISON_MIN} properties are required for comparison`,
  })
  @ArrayMaxSize(COMPARISON_MAX, {
    message: `A maximum of ${COMPARISON_MAX} properties can be compared at once`,
  })
  @ArrayUnique({ message: 'Duplicate property IDs are not allowed' })
  @IsUUID('all', { each: true })
  ids!: string[];
}

/**
 * DTO for `POST /property-comparison` with `{ ids: [...] }` body.
 */
export class CompareBodyDto {
  @IsArray()
  @ArrayMinSize(COMPARISON_MIN, {
    message: `At least ${COMPARISON_MIN} properties are required for comparison`,
  })
  @ArrayMaxSize(COMPARISON_MAX, {
    message: `A maximum of ${COMPARISON_MAX} properties can be compared at once`,
  })
  @ArrayUnique({ message: 'Duplicate property IDs are not allowed' })
  @IsUUID('all', { each: true })
  ids!: string[];
}

export const COMPARISON_LIMITS = { min: COMPARISON_MIN, max: COMPARISON_MAX };
