import { IsString, IsOptional, IsUUID, IsNumber, Min, Max, IsBoolean } from 'class-validator';
import { Field, InputType, Int } from '@nestjs/graphql';

export class FlagForReviewDto {
  @IsOptional()
  @IsUUID()
  duplicateOfId?: string;

  @IsOptional()
  @IsString()
  reviewNotes?: string;
}

export class CheckDuplicateDto {
  @Field()
  @IsString()
  address: string;

  @Field()
  @IsString()
  city: string;

  @Field()
  @IsString()
  state: string;

  @Field()
  @IsString()
  zipCode: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  country?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsString({ each: true })
  imageHashes?: string[];
}

export class MergeDuplicateDto {
  @Field()
  @IsUUID()
  keepPropertyId: string;

  @Field()
  @IsUUID()
  discardPropertyId: string;
}

// Response types
export enum DuplicateType {
  ADDRESS = 'ADDRESS',
  IMAGE = 'IMAGE',
  ADDRESS_AND_IMAGE = 'ADDRESS_AND_IMAGE',
}

export interface DuplicateMatch {
  id: string;
  type: DuplicateType;
  confidenceScore: number;
  property: {
    id: string;
    title: string | null;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    price: number;
    owner: {
      id: string;
      firstName: string | null;
      lastName: string | null;
    };
    images: {
      id: string;
      url: string;
    }[];
  };
  matchedOn?: string[];
}

export interface DuplicateCheckResult {
  hasDuplicates: boolean;
  matches: DuplicateMatch[];
  warning?: string;
}
