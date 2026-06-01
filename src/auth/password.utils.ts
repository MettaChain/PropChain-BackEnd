export type PasswordPolicy = {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigit: boolean;
  requireSpecial: boolean;
  specialChars?: string;
};

export function getPasswordPolicy(): PasswordPolicy {
  const minLength = Number(process.env.PASSWORD_MIN_LENGTH ?? 8);
  return {
    minLength: Number.isFinite(minLength) && minLength > 0 ? minLength : 8,
    requireUppercase: (process.env.PASSWORD_REQUIRE_UPPERCASE ?? 'true') === 'true',
    requireLowercase: (process.env.PASSWORD_REQUIRE_LOWERCASE ?? 'true') === 'true',
    requireDigit: (process.env.PASSWORD_REQUIRE_DIGIT ?? 'true') === 'true',
    requireSpecial: (process.env.PASSWORD_REQUIRE_SPECIAL ?? 'true') === 'true',
    specialChars:
      process.env.PASSWORD_SPECIAL_CHARS ?? '!@#$%^&*()_+-=[]{}|;:\",./<>?'.slice(0, 32),
  };
}

export function validatePassword(password: string): string[] {
  const errors: string[] = [];
  const policy = getPasswordPolicy();

  if (!password || password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters long`);
  }

  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must include at least one uppercase letter');
  }

  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must include at least one lowercase letter');
  }

  if (policy.requireDigit && !/[0-9]/.test(password)) {
    errors.push('Password must include at least one digit');
  }

  if (policy.requireSpecial) {
    const special = policy.specialChars ?? '[^A-Za-z0-9]';
    const escaped = special.replace(/[-\\\]^$*+?.()|{}]/g, '\\$&');
    const specialRegex = new RegExp('[' + escaped + ']');
    if (!specialRegex.test(password)) {
      errors.push('Password must include at least one special character');
    }
  }

  return errors;
}
