import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { createAdminSecurityService } from './security-service.js';

function toNonEmptyStringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function createService() {
  return createAdminSecurityService({
    ADMIN_SESSION_COOKIE: 'mot_admin_session',
    ADMIN_SESSION_TTL_HOURS: 12,
    clearAdminSessionCookie: () => undefined,
    crypto,
    normalizeEmail: (value: string) => value.trim().toLowerCase(),
    parseCookies: () => ({}),
    prisma: {},
    resolveRequestIp: () => '127.0.0.1',
    toNonEmptyStringOrNull,
  });
}

function decodeBase32(input: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function computeTotp(secret: string, timestampMs: number, digits: number, periodSeconds: number) {
  const counter = Math.floor(timestampMs / 1000 / periodSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto
    .createHmac('sha1', decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

test('admin security service round-trips encrypted TOTP secrets and formats setup payloads', () => {
  const service = createService();
  const secret = service.generateAdminTotpSecret();
  const encrypted = service.encryptAdminSecret(secret);
  const decrypted = service.decryptAdminSecret(encrypted);
  const otpauthUrl = service.buildAdminTotpUri('admin@myowntea.com', secret);

  assert.match(secret, /^[A-Z2-7]+$/);
  assert.equal(decrypted, secret);
  assert.match(service.formatAdminTotpSecret(secret), /^[A-Z2-7 ]+$/);
  assert.match(otpauthUrl, /^otpauth:\/\/totp\//);
  assert.match(otpauthUrl, /admin%40myowntea\.com/);
});

test('admin security service verifies a valid TOTP code for the current window', () => {
  const service = createService();
  const secret = 'JBSWY3DPEHPK3PXP';
  const fixedNow = 1_700_000_000_000;
  const previousDateNow = Date.now;
  const validCode = computeTotp(
    secret,
    fixedNow,
    service.ADMIN_TOTP_DIGITS,
    service.ADMIN_TOTP_PERIOD_SECONDS
  );

  try {
    Date.now = () => fixedNow;
    assert.equal(service.verifyAdminTotpCode(secret, validCode), true);
    assert.equal(service.verifyAdminTotpCode(secret, '000000'), false);
  } finally {
    Date.now = previousDateNow;
  }
});

test('admin security service can decrypt legacy MFA secrets encrypted with JWT_SECRET', () => {
  const previousAdminTotpKey = process.env.ADMIN_TOTP_ENCRYPTION_KEY;
  const previousAdminTotpPrevious = process.env.ADMIN_TOTP_ENCRYPTION_KEY_PREVIOUS;
  const previousJwtSecret = process.env.JWT_SECRET;
  const secret = 'JBSWY3DPEHPK3PXP';

  try {
    delete process.env.ADMIN_TOTP_ENCRYPTION_KEY;
    delete process.env.ADMIN_TOTP_ENCRYPTION_KEY_PREVIOUS;
    process.env.JWT_SECRET = 'legacy-jwt-secret';
    const legacyService = createService();
    const legacyEncrypted = legacyService.encryptAdminSecret(secret);

    process.env.ADMIN_TOTP_ENCRYPTION_KEY = 'primary-admin-totp-secret';
    process.env.JWT_SECRET = 'legacy-jwt-secret';
    const migratedService = createService();

    assert.equal(migratedService.decryptAdminSecret(legacyEncrypted), secret);
    assert.equal(
      migratedService.decryptAdminSecretWithMetadata(legacyEncrypted)?.usedLegacySecret,
      true
    );
  } finally {
    if (typeof previousAdminTotpKey === 'string') {
      process.env.ADMIN_TOTP_ENCRYPTION_KEY = previousAdminTotpKey;
    } else {
      delete process.env.ADMIN_TOTP_ENCRYPTION_KEY;
    }
    if (typeof previousAdminTotpPrevious === 'string') {
      process.env.ADMIN_TOTP_ENCRYPTION_KEY_PREVIOUS = previousAdminTotpPrevious;
    } else {
      delete process.env.ADMIN_TOTP_ENCRYPTION_KEY_PREVIOUS;
    }
    if (typeof previousJwtSecret === 'string') {
      process.env.JWT_SECRET = previousJwtSecret;
    } else {
      delete process.env.JWT_SECRET;
    }
  }
});
