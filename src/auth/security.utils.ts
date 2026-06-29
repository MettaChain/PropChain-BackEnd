// @ts-nocheck

import * as bcrypt from 'bcrypt';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export type TotpOptions = {
  secret: string;
  digits?: number;
  period?: number;
  window?: number;
  timestamp?: number;
};

export type VerifyTotpOptions = TotpOptions & {
  code: string;
};

export async function hashPassword(password: string, rounds: number = 12): Promise<string> {
  return bcrypt.hash(password, rounds);
}

export async function comparePassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function sanitizeUser<T extends Record<string, unknown>>(user: T) {
  const safeUser = { ...user };
  delete safeUser.password;
  delete safeUser.twoFactorSecret;
  delete safeUser.twoFactorBackupCodes;
  return safeUser;
}

export function createSha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function randomToken(size = 32): string {
  return randomBytes(size).toString('hex');
}

export function randomBase32Secret(length = 32): string {
  let secret = '';
  while (secret.length < length) {
    const nextIndex = randomBytes(1)[0] % BASE32_ALPHABET.length;
    secret += BASE32_ALPHABET[nextIndex];
  }
  return secret;
}

export function decodeBase32(input: string): Buffer {
  const normalized = input.replace(/=+$/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      continue;
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () => randomBytes(4).toString('hex').toUpperCase());
}

export function verifyBackupCode(candidate: string, backupCodeHashes: string[]) {
  const digest = createSha256(candidate.trim().toUpperCase());
  const digestBuffer = Buffer.from(digest);

  return backupCodeHashes.find((hash) => {
    const hashBuffer = Buffer.from(hash);
    return digestBuffer.length === hashBuffer.length && timingSafeEqual(digestBuffer, hashBuffer);
  });
}

export function buildOtpAuthUrl(email: string, secret: string, issuer = 'PropChain'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const encodedIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

export function buildQrCodeUrl(otpAuthUrl: string): string {
  return `https://quickchart.io/qr?text=${encodeURIComponent(otpAuthUrl)}`;
}

export function generateTotpCode({
  secret,
  digits = 6,
  period = 30,
  timestamp = Date.now(),
}: TotpOptions): string {
  const counter = Math.floor(timestamp / 1000 / period);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (binaryCode % 10 ** digits).toString().padStart(digits, '0');
}

export function verifyTotpCode({
  secret,
  code,
  digits = 6,
  period = 30,
  window = 1,
  timestamp = Date.now(),
}: VerifyTotpOptions): boolean {
  const normalizedCode = code.trim();

  for (let offset = -window; offset <= window; offset += 1) {
    const expectedCode = generateTotpCode({
      secret,
      digits,
      period,
      timestamp: timestamp + offset * period * 1000,
    });

    if (expectedCode === normalizedCode) {
      return true;
    }
  }

  return false;
}

export function generateReactivationToken(): { token: string; hash: string } {
  const token = randomToken(32);
  const hash = createSha256(token);
  return { token, hash };
}

export function parseDuration(input: string, fallbackSeconds: number): number {
  const value = input?.trim();
  if (!value) {
    return fallbackSeconds;
  }

  const match = /^(\d+)([smhd])$/i.exec(value);
  if (!match) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackSeconds;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
  };

  return amount * multipliers[unit];
}
