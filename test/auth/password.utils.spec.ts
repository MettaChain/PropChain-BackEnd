import { validatePassword } from '../../src/auth/password.utils';

describe('validatePassword', () => {
  const OLD_ENV = process.env;

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('accepts a strong password by default policy', () => {
    const errors = validatePassword('Str0ng!Pass');
    expect(errors).toHaveLength(0);
  });

  it('rejects short or simple passwords', () => {
    process.env.PASSWORD_MIN_LENGTH = '12';
    const errors = validatePassword('weak');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('requires uppercase/lowercase/digit/special as configured', () => {
    process.env.PASSWORD_REQUIRE_UPPERCASE = 'true';
    process.env.PASSWORD_REQUIRE_LOWERCASE = 'true';
    process.env.PASSWORD_REQUIRE_DIGIT = 'true';
    process.env.PASSWORD_REQUIRE_SPECIAL = 'true';

    const errors = validatePassword('noupper1!');
    expect(errors).toContain('Password must include at least one uppercase letter');
  });
});
