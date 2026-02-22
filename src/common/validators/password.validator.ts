import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PasswordValidator {
  constructor(private readonly configService: ConfigService) {}

  validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Length validation
    const minLength = this.configService.get<number>('PASSWORD_MIN_LENGTH', 12);
    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters long`);
    }

    // Special characters validation
    if (this.configService.get<boolean>('PASSWORD_REQUIRE_SPECIAL_CHARS', true)) {
      const specialCharRegex = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;
      if (!specialCharRegex.test(password)) {
        errors.push('Password must contain at least one special character');
      }
    }

    // Numbers validation
    if (this.configService.get<boolean>('PASSWORD_REQUIRE_NUMBERS', true)) {
      const numberRegex = /\d/;
      if (!numberRegex.test(password)) {
        errors.push('Password must contain at least one number');
      }
    }

    // Uppercase validation
    if (this.configService.get<boolean>('PASSWORD_REQUIRE_UPPERCASE', true)) {
      const uppercaseRegex = /[A-Z]/;
      if (!uppercaseRegex.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
      }
    }

    // Common password patterns to avoid
    const commonPatterns = [/password/i, /123456/, /qwerty/, /abc123/, /admin/, /welcome/];

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        errors.push('Password contains common patterns that are easy to guess');
        break;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  isPasswordStrong(password: string): boolean {
    const { valid } = this.validatePassword(password);
    return valid;
  }

  getValidationMessage(password: string): string {
    const { errors } = this.validatePassword(password);
    return errors.join(', ') || 'Password is valid';
  }
}
