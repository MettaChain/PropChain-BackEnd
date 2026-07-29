const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'] as const;
const JWT_SECRET_VARS = ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const;
const MIN_JWT_SECRET_LENGTH = 32;

export function validateEnvironment(): void {
  const MISSING: string[] = [];
  const WEAK: string[] = [];

  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      MISSING.push(key);
    }
  }

  for (const key of JWT_SECRET_VARS) {
    const value = process.env[key];
    if (value && value.length < MIN_JWT_SECRET_LENGTH) {
      WEAK.push(`${key} (found ${value.length} chars, need at least ${MIN_JWT_SECRET_LENGTH})`);
    }
  }

  if (MISSING.length > 0 || WEAK.length > 0) {
    const sections: string[] = [];
    if (MISSING.length > 0) {
      sections.push(
        `Missing required environment variables:\n` + MISSING.map((k) => `    - ${k}`).join('\n'),
      );
    }
    if (WEAK.length > 0) {
      sections.push(
        `Environment variables below the minimum required length (256 bits / ${MIN_JWT_SECRET_LENGTH} chars):\n` +
          WEAK.map((k) => `    - ${k}`).join('\n'),
      );
    }
    console.error(
      `\n  Fatal:\n  ` +
        sections.join('\n\n  ') +
        `\n\n  Please set them in .env or .env.local before starting the application.\n`,
    );
    process.exit(1);
  }
}
