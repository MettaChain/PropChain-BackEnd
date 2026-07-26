<<<<<<< ours
# Multi-Factor Authentication (MFA) Roadmap

## Purpose
This document outlines the planned MFA implementation for PropChain. MFA is opt-in and will be introduced without breaking current authentication flows.

## Goals
- Add second-factor verification for sensitive actions and login.
- Support TOTP-based authenticators and backup codes.
- Keep MFA optional for users.
- Provide a developer-friendly path for future enrollment, verification, and recovery.

## Current placeholder endpoints
The backend exposes the following auth-related endpoints today:

- `POST /auth/2fa/setup` — initialize enrollment, generate a TOTP secret, QR code URL, and backup codes.
- `POST /auth/2fa/verify` — verify the TOTP code and enable two-factor authentication for the user.
- `POST /auth/2fa/disable` — disable two-factor authentication after password confirmation.

These endpoints are currently implemented in the `AuthService` as enrollment and verification flow placeholders.

## Implementation plan

### Phase 1: Secure enrollment and verification
1. Generate a TOTP secret and hashed backup codes.
2. Store the secret and backup codes in the user record.
3. Present the user with a QR code URL and a code list.
4. Verify the first TOTP code before enabling MFA.

### Phase 2: Login flow support
1. Require a second factor during login only for users with MFA enabled.
2. Accept either a valid TOTP code or an unused backup code.
3. Consume backup codes on use and maintain a fresh in-memory/hard storage list.

### Phase 3: Recovery and revocation
1. Add endpoints to regenerate backup codes.
2. Add endpoint to disable MFA after re-authentication.
3. Audit MFA changes in user activity logs.

## Notes
- The API contract is simple and opt-in.
- Existing auth workflows continue to work for users who do not enable MFA.
- Future expansion can include push notifications, SMS OTP, or hardware keys.
=======
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
>>>>>>> theirs
