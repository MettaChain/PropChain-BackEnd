import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message:
      'Password is too weak. It must contain at least one uppercase letter, one lowercase letter, and at least one number or special character.',
  })
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsOptional()
  @IsPhoneNumber(undefined, { message: 'Please provide a valid phone number' })
  phone?: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  totpCode?: string;

  @IsOptional()
  @IsString()
  backupCode?: string;

  /** Token issued for a previously trusted device (#1291). */
  @IsOptional()
  @IsString()
  trustedDeviceToken?: string;

  /** When true, remember this device after a successful 2FA challenge (#1291). */
  @IsOptional()
  @IsBoolean()
  rememberDevice?: boolean;

  @IsOptional()
  @IsString()
  captchaToken?: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class VerifyTwoFactorDto {
  @IsString()
  code: string;
}

export class DisableTwoFactorDto {
  @IsString()
  password: string;
}

/**
 * Admin-initiated 2FA reset (#1291). Identifies the target account by email so
 * a locked-out user can be recovered without exposing internal IDs.
 */
export class ForceDisableTwoFactorDto {
  @IsEmail()
  email: string;
}

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  monthlyQuota?: number;
}

export class UpdateApiKeyPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissions: string[];
}

export class RequestPasswordResetDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message:
      'Password is too weak. It must contain at least one uppercase letter, one lowercase letter, and at least one number or special character.',
  })
  newPassword: string;
}
