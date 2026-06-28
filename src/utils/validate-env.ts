const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

export function validateEnvironment(): void {
  const MISSING: string[] = [];

  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      MISSING.push(key);
    }
  }

  if (MISSING.length > 0) {
    console.error(
      `\n  Fatal: Missing required environment variables:\n` +
        MISSING.map((k) => `    - ${k}`).join('\n') +
        `\n\n  Please set them in .env or .env.local before starting the application.\n`,
    );
    process.exit(1);
  }
}
