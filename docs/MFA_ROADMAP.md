# MFA / 2FA Roadmap

## Current State

Two-factor authentication is fully implemented using TOTP (Time-based One-Time Password).

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/auth/2fa/setup` | POST | Initialize 2FA — returns secret + QR code URL |
| `POST /api/auth/2fa/verify` | POST | Verify a TOTP code and activate 2FA |
| `POST /api/auth/2fa/disable` | POST | Disable 2FA (requires current TOTP code) |
| `POST /api/auth/2fa/backup-codes` | POST | Regenerate backup codes |

### DTOs

- **`VerifyTwoFactorDto`** — `{ code: string }` — used by `POST /api/auth/2fa/verify`
- **`SetupTwoFactorResponse`** — `{ secret: string; qrCodeUrl: string; otpAuthUrl: string }`

### Login Flow with 2FA

1. User submits email + password
2. If `twoFactorEnabled === true`, server returns `{ requiresTwoFactor: true, tempToken }`
3. Client calls `POST /api/auth/2fa/verify` with `tempToken` + TOTP `code`
4. Server validates code against stored `twoFactorSecret` using `verifyTotpCode()`
5. Backup codes are supported — each use invalidates the code

### Backup Codes

- 8 codes generated at setup via `generateBackupCodes()`
- Stored as SHA-256 hashes in `twoFactorBackupCodes` array
- Verified with timing-safe comparison via `verifyBackupCode()`
- Each code can only be used once

### Dependencies

- `src/auth/security.utils.ts` — TOTP generation/verification, backup codes, QR code URL
- `src/auth/auth.service.ts` — `setupTwoFactor()`, `verifyTwoFactor()`, `disableTwoFactor()`
- `src/types/prisma.types.ts` — `twoFactorEnabled`, `twoFactorSecret`, `twoFactorBackupCodes` fields

## Future Enhancements

- [ ] SMS-based 2FA as fallback
- [ ] Hardware key (WebAuthn/FIDO2) support
- [ ] Admin-enforced 2FA for agent/admin roles
- [ ] Trusted device management
