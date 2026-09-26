import { Logger } from '@nestjs/common';
import Web3 from 'web3';

const logger = new Logger('EnvValidation');

const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'] as const;
const JWT_SECRET_VARS = ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const;
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Whether CAPTCHA verification is required at runtime (#1194).
 *
 * CAPTCHA is required by default (docs recommend keeping it on in production)
 * and is only disabled when CAPTCHA_BYPASS=true is explicitly set for
 * development. When required, a missing RECAPTCHA_SECRET is a fatal
 * configuration error that must abort boot instead of surfacing as an opaque
 * 500 during login.
 */
export function isCaptchaRequired(): boolean {
  return process.env.CAPTCHA_BYPASS !== 'true';
}

/**
 * Validate blockchain configuration when BLOCKCHAIN_ENABLED=true (#1178).
 *
 * Blockchain support is opt-in: when disabled this returns no errors and the
 * rest of the environment validation is unaffected. When enabled it requires a
 * real RPC endpoint, a checksummed (non-zero) contract address, and a 32-byte
 * private key so misconfiguration fails fast at boot.
 */
export function validateBlockchainEnvironment(): string[] {
  const errors: string[] = [];

  if (process.env.BLOCKCHAIN_ENABLED !== 'true') {
    return errors;
  }

  const contractAddress = process.env.BLOCKCHAIN_CONTRACT_ADDRESS;
  if (!contractAddress) {
    errors.push('BLOCKCHAIN_CONTRACT_ADDRESS is required when BLOCKCHAIN_ENABLED=true');
  } else if (/^0x0{40}$/i.test(contractAddress)) {
    errors.push('BLOCKCHAIN_CONTRACT_ADDRESS must not be the zero address');
  } else {
    let checksumOk = false;
    try {
      checksumOk = Web3.utils.toChecksumAddress(contractAddress) === contractAddress;
    } catch {
      checksumOk = false;
    }
    if (!checksumOk) {
      errors.push(
        'BLOCKCHAIN_CONTRACT_ADDRESS must be a valid EIP-55 checksummed address (checksum mismatch)',
      );
    }
  }

  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL;
  if (!rpcUrl) {
    errors.push('BLOCKCHAIN_RPC_URL is required when BLOCKCHAIN_ENABLED=true');
  } else if (/placeholder|your[_-]|example\.com/i.test(rpcUrl)) {
    errors.push('BLOCKCHAIN_RPC_URL must be a real endpoint (placeholder value detected)');
  } else if (!/^https?:\/\//i.test(rpcUrl)) {
    errors.push('BLOCKCHAIN_RPC_URL must be a valid http(s) URL');
  }

  const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY;
  if (!privateKey) {
    errors.push('BLOCKCHAIN_PRIVATE_KEY is required when BLOCKCHAIN_ENABLED=true');
  } else if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    errors.push('BLOCKCHAIN_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string');
  }

  return errors;
}

export function validateEnvironment(): void {
  const MISSING: string[] = [];
  const WEAK: string[] = [];

  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      MISSING.push(key);
    }
  }

  // #1194 – fail fast at boot when CAPTCHA is required but the secret is
  // absent. This prevents the request-time 500 caused by a missing secret.
  if (isCaptchaRequired() && !process.env.RECAPTCHA_SECRET) {
    MISSING.push(
      'RECAPTCHA_SECRET (required because CAPTCHA_BYPASS != true; ' +
        'set CAPTCHA_BYPASS=true for development environments without reCAPTCHA)',
    );
  }

  for (const key of JWT_SECRET_VARS) {
    const value = process.env[key];
    if (value && value.length < MIN_JWT_SECRET_LENGTH) {
      WEAK.push(`${key} (found ${value.length} chars, need at least ${MIN_JWT_SECRET_LENGTH})`);
    }
  }

  const blockchainErrors = validateBlockchainEnvironment();

  if (MISSING.length > 0 || WEAK.length > 0 || blockchainErrors.length > 0) {
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
    if (blockchainErrors.length > 0) {
      sections.push(
        `Blockchain configuration errors:\n` + blockchainErrors.map((k) => `    - ${k}`).join('\n'),
      );
    }
    logger.error(
      `\n  Fatal:\n  ` +
        sections.join('\n\n  ') +
        `\n\n  Please set them in .env or .env.local before starting the application.\n`,
    );
    process.exit(1);
  }
}
