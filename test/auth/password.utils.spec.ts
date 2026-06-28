import { ConfigService } from '@nestjs/config';
import { getPasswordPolicy, validatePassword } from '../../src/auth/password.utils';

function mockConfig(overrides: Record<string, string> = {}): ConfigService {
  const defaults: Record<string, string> = {
    PASSWORD_MIN_LENGTH: '8',
    PASSWORD_REQUIRE_UPPERCASE: 'true',
    PASSWORD_REQUIRE_LOWERCASE: 'true',
    PASSWORD_REQUIRE_DIGIT: 'true',
    PASSWORD_REQUIRE_SPECIAL: 'true',
  };
  return {
    get(key: string) {
      return overrides[key] ?? defaults[key] ?? undefined;
    },
  } as unknown as ConfigService;
}

describe('getPasswordPolicy', () => {
  it('returns default values when config service has no overrides', () => {
    const configService = mockConfig();
    const policy = getPasswordPolicy(configService);

    expect(policy.minLength).toBe(8);
    expect(policy.requireUppercase).toBe(true);
    expect(policy.requireLowercase).toBe(true);
    expect(policy.requireDigit).toBe(true);
    expect(policy.requireSpecial).toBe(true);
    expect(policy.specialChars).toBeDefined();
  });

  it('reflects env-driven overrides', () => {
    const configService = mockConfig({
      PASSWORD_MIN_LENGTH: '12',
      PASSWORD_REQUIRE_UPPERCASE: 'false',
      PASSWORD_SPECIAL_CHARS: '!@#$',
    });

    const policy = getPasswordPolicy(configService);

    expect(policy.minLength).toBe(12);
    expect(policy.requireUppercase).toBe(false);
    expect(policy.requireLowercase).toBe(true);
    expect(policy.requireDigit).toBe(true);
    expect(policy.requireSpecial).toBe(true);
    expect(policy.specialChars).toBe('!@#$');
  });
});

describe('validatePassword', () => {
  it('accepts a strong password by default policy', () => {
    const configService = mockConfig();
    const errors = validatePassword('Str0ng!Pass', configService);
    expect(errors).toHaveLength(0);
  });

  it('rejects short or simple passwords', () => {
    const configService = mockConfig({ PASSWORD_MIN_LENGTH: '12' });
    const errors = validatePassword('weak', configService);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('requires uppercase/lowercase/digit/special as configured', () => {
    const configService = mockConfig({
      PASSWORD_REQUIRE_UPPERCASE: 'true',
      PASSWORD_REQUIRE_LOWERCASE: 'true',
      PASSWORD_REQUIRE_DIGIT: 'true',
      PASSWORD_REQUIRE_SPECIAL: 'true',
    });

    const errors = validatePassword('noupper1!', configService);
    expect(errors).toContain('Password must include at least one uppercase letter');
  });
});
