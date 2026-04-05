import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { createAdminSecurityService } from '../dist/modules/admin/security-service.js';
import { createAuthSessionService } from '../dist/modules/auth/session-service.js';
import { createOrderWorkflowService } from '../dist/modules/order/service.js';
import { createShippingService } from '../dist/modules/shipping/service.js';

function logSuccess(message) {
  console.log(`PASS ${message}`);
}

function toNonEmptyStringOrNull(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function createAuthService() {
  return createAuthSessionService({
    ADMIN_SESSION_COOKIE: 'mot_admin_session',
    ADMIN_SESSION_TTL_HOURS: 12,
    GOOGLE_OAUTH_TTL_MS: 10 * 60 * 1000,
    SESSION_COOKIE: 'mot_session',
    SESSION_TTL_DAYS: 30,
    WEB_BASE_URL: 'https://myowntea.fr',
    crypto,
    prisma: {},
  });
}

function decodeBase32(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

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

function computeTotp(secret, timestampMs, digits, periodSeconds) {
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

function runAuthSessionChecks() {
  const previousNodeEnv = process.env.NODE_ENV;
  const cookieCalls = [];
  const response = {
    cookie(name, value, options) {
      cookieCalls.push({ name, value, options });
    },
  };

  try {
    process.env.NODE_ENV = 'development';
    createAuthService().setAdminSessionCookie(response, 'dev-session');

    process.env.NODE_ENV = 'production';
    createAuthService().setAdminSessionCookie(response, 'prod-session');
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }

  assert.deepEqual(cookieCalls[0], {
    name: 'mot_admin_session',
    value: 'dev-session',
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 12 * 60 * 60 * 1000,
      path: '/',
    },
  });
  assert.deepEqual(cookieCalls[1], {
    name: 'mot_admin_session',
    value: 'prod-session',
    options: {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: 12 * 60 * 60 * 1000,
      path: '/',
    },
  });
  assert.deepEqual(createAuthService().parseCookies('foo=bar; hello=tea%20time'), {
    foo: 'bar',
    hello: 'tea time',
  });
  assert.equal(
    createAuthService().createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
  );

  logSuccess('auth session helpers');
}

function runAdminSecurityChecks() {
  const service = createAdminSecurityService({
    ADMIN_SESSION_COOKIE: 'mot_admin_session',
    ADMIN_SESSION_TTL_HOURS: 12,
    clearAdminSessionCookie: () => undefined,
    crypto,
    normalizeEmail: (value) => value.trim().toLowerCase(),
    parseCookies: () => ({}),
    prisma: {},
    resolveRequestIp: () => '127.0.0.1',
    toNonEmptyStringOrNull,
  });

  const secret = service.generateAdminTotpSecret();
  const encrypted = service.encryptAdminSecret(secret);
  const fixedNow = 1_700_000_000_000;
  const validCode = computeTotp(
    'JBSWY3DPEHPK3PXP',
    fixedNow,
    service.ADMIN_TOTP_DIGITS,
    service.ADMIN_TOTP_PERIOD_SECONDS
  );
  const previousDateNow = Date.now;

  assert.equal(service.decryptAdminSecret(encrypted), secret);
  assert.match(service.formatAdminTotpSecret(secret), /^[A-Z2-7 ]+$/);
  assert.match(service.buildAdminTotpUri('admin@myowntea.com', secret), /^otpauth:\/\/totp\//);

  try {
    Date.now = () => fixedNow;
    assert.equal(service.verifyAdminTotpCode('JBSWY3DPEHPK3PXP', validCode), true);
    assert.equal(service.verifyAdminTotpCode('JBSWY3DPEHPK3PXP', '000000'), false);
  } finally {
    Date.now = previousDateNow;
  }

  logSuccess('admin MFA security helpers');
}

function runShippingChecks() {
  const service = createShippingService({
    getShippingOfferLabelByMode: (mode) => (mode === 'RELAY' ? 'Point relais' : 'Domicile'),
    getStoreSettings: async () => ({ id: 'default' }),
    normalizeShippingMode: (value) => {
      const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
      return normalized === 'HOME' || normalized === 'RELAY' ? normalized : null;
    },
    normalizeShippingOfferCode: (value) =>
      typeof value === 'string' && value.trim().length > 0 ? value.trim().toUpperCase() : null,
    normalizeShippingOfferId: (value) =>
      typeof value === 'string' && value.trim().length > 0 ? value.trim() : null,
    quoteShippingOffer: async () => null,
    resolveCheckoutShippingQuote: (params) => ({
      shippingCents: params.mode === 'RELAY' ? 460 : 590,
      defaultShippingCents: 590,
      mode: params.mode,
      zone: params.countryCode === 'BE' ? 'BE' : 'FR',
      supportsRelay: params.countryCode !== 'US',
      thresholdCents: 4500,
    }),
    toNonEmptyStringOrNull,
  });

  assert.deepEqual(
    service.extractShippingSelection({
      query: {
        mode: 'relay',
        offerCode: 'mpr',
        countryCode: 'FR',
        postalCode: '59000',
        city: 'Lille',
      },
      body: {
        shippingSelection: {
          mode: 'home',
          offerCode: 'dom',
          countryCode: 'BE',
          postalCode: '1000',
          city: 'Brussels',
        },
      },
    }),
    {
      mode: 'RELAY',
      offerId: null,
      offerCode: 'mpr',
      countryCode: 'FR',
      postalCode: '59000',
      city: 'Lille',
    }
  );

  assert.deepEqual(
    service.parseBoxtalTrackingPayload(
      {
        content: [
          {
            status: 'IN_TRANSIT',
            trackingNumber: 'TRACK123',
            packageTrackingUrl: 'https://tracking.example/track123',
          },
        ],
      },
      'FALLBACK123'
    ),
    {
      providerStatus: 'IN_TRANSIT',
      trackingNumber: 'TRACK123',
      trackingUrl: 'https://tracking.example/track123',
    }
  );

  logSuccess('shipping helpers');
}

function runOrderWorkflowChecks() {
  class TestOrderWorkflowError extends Error {}

  const service = createOrderWorkflowService({
    ORDER_NOTIFICATION_BY_STATUS: {},
    ORDER_STATUS_TRANSITIONS: {
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['PREPARING', 'CANCELLED'],
      PREPARING: ['SHIPPED', 'CANCELLED'],
      SHIPPED: ['DELIVERED'],
      DELIVERED: [],
      CANCELLED: [],
    },
    OrderWorkflowError: TestOrderWorkflowError,
    buildOrderNotificationEmailContent: () => ({
      subject: 'Test notification',
      text: 'Test notification',
      html: '<p>Test notification</p>',
    }),
    createShippingOrder: async () => null,
    crypto,
    ensureEmailPreference: async () => ({ transactionalOptIn: true }),
    ensureOrderWorkflowTables: async () => undefined,
    mapBoxtalStatus: () => null,
    normalizeShippingMode: () => null,
    prisma: {},
    queueEmailDelivery: async () => undefined,
    t: (key) => (key === 'backend.index.email' ? 'email' : key),
    toJsonObjectRecord: (value) =>
      value && typeof value === 'object' && !Array.isArray(value) ? value : {},
    toNonEmptyStringOrNull,
    toStatusOrNull: (value) =>
      typeof value === 'string' && value.trim().length > 0 ? value.trim().toUpperCase() : null,
  });

  assert.deepEqual(
    service.computeAvailableOrderTransitions({
      status: 'PENDING',
      paymentStatus: 'pending',
    }),
    ['CANCELLED']
  );

  assert.deepEqual(
    service.computeAvailableOrderTransitions({
      status: 'PREPARING',
      paymentStatus: 'completed',
      shipment: {
        trackingNumber: 'TRACK123',
        provider: 'BOXTAL',
      },
    }),
    ['SHIPPED', 'CANCELLED']
  );

  logSuccess('order workflow helpers');
}

function main() {
  runAuthSessionChecks();
  runAdminSecurityChecks();
  runShippingChecks();
  runOrderWorkflowChecks();
  console.log('All backend quality tests passed.');
}

main();
