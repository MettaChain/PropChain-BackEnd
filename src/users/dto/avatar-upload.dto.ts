import { IsString, IsOptional } from 'class-validator';

export class AvatarUploadResponseDto {
  @IsString()
  avatarUrl: string;

  @IsString()
  sizes: {
    small: string;
    medium: string;
    large: string;
  };
}

export class AvatarDeleteDto {
  @IsString()
  filename: string;
}

export class AvatarUpdateDto {
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
