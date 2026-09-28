# MFA / 2FA Roadmap

## Current State

Two-factor authentication is fully implemented using TOTP (Time-based One-Time Password).

### Endpoints

| Endpoint                                 | Method | Description                                          |
| ---------------------------------------- | ------ | ---------------------------------------------------- |
| `POST /api/auth/2fa/setup`               | POST   | Initialize 2FA — returns secret + QR code URL        |
| `POST /api/auth/2fa/verify`              | POST   | Verify a TOTP code and activate 2FA                  |
| `POST /api/auth/2fa/disable`             | POST   | Disable 2FA (requires password + fresh 2FA code)     |
| `POST /api/auth/2fa/recovery-codes`      | POST   | Regenerate recovery codes (requires fresh 2FA code)  |
| `GET /api/auth/2fa/devices`              | GET    | List trusted devices                                 |
| `DELETE /api/auth/2fa/devices/:id`       | DELETE | Revoke a trusted device                              |
| `POST /api/auth/2fa/admin/force-disable` | POST   | Admin reset of a locked-out user's 2FA (admins only) |

### DTOs

- **`VerifyTwoFactorDto`** — `{ code: string }` — used by `POST /api/auth/2fa/verify`
- **`SetupTwoFactorResponse`** — `{ secret: string; qrCodeUrl: string; otpAuthUrl: string }`
- **`ForceDisableTwoFactorDto`** — `{ email: string }` — admin reset target

### Login Flow with 2FA

1. User submits email + password
2. If `twoFactorEnabled === true`:
   - If the request includes a valid `trustedDeviceToken` for a device the user
     previously remembered, the challenge is skipped.
   - Otherwise the server requires a TOTP `totpCode` or a single-use
     `backupCode` in the same `POST /api/auth/2fa/verify`-style login payload.
3. Set `rememberDevice: true` alongside a successful code to receive a
   `trustedDeviceToken` (and `trustedDeviceExpiresAt`) that skips future
   challenges from that device.
4. Backup/recovery codes are supported — each use invalidates the code.

### Recovery Codes

- 8 codes generated at setup via `generateBackupCodes()`
- Stored as SHA-256 hashes in `twoFactorBackupCodes` array
- Verified with timing-safe comparison via `verifyBackupCode()`
- Each code can only be used once
- `POST /api/auth/2fa/recovery-codes` replaces the whole set; it requires a
  fresh TOTP or recovery code so a stolen access token alone cannot rotate them.

### Trusted Devices

- `TrustedDevice` stores only a SHA-256 hash of the device token
- Lifetime is `TRUSTED_DEVICE_TTL_DAYS` (default 30 days)
- Devices are revoked automatically when the password changes, 2FA is disabled,
  or an admin resets the account
- Users can list and revoke their own devices

### High-Risk Operation Gating

`FreshTwoFactorGuard` protects sensitive operations (change password, disable
2FA, regenerate recovery codes). When the user has 2FA enabled, these endpoints
require a current TOTP or unused recovery code supplied via the `x-2fa-code`
header (or a `totpCode` / `twoFactorCode` / `code` body field), so a
trusted-device session or stale access token cannot perform them alone.

### Dependencies

- `src/auth/security.utils.ts` — TOTP generation/verification, backup codes, QR code URL
- `src/auth/two-factor.service.ts` — trusted devices and recovery-code lifecycle
- `src/auth/guards/fresh-two-factor.guard.ts` — fresh 2FA enforcement
- `src/auth/auth.service.ts` — `setupTwoFactor()`, `verifyTwoFactor()`, `disableTwoFactor()`, `adminForceDisableTwoFactor()`
- `src/types/prisma.types.ts` — `twoFactorEnabled`, `twoFactorSecret`, `twoFactorBackupCodes` fields

## Future Enhancements

- [ ] SMS-based 2FA as fallback
- [ ] Hardware key (WebAuthn/FIDO2) support
- [ ] Admin-enforced 2FA for agent/admin roles (opt-in today)
