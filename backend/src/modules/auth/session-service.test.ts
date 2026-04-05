import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { createAuthSessionService } from './session-service.js';

function createService() {
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

test('createAuthSessionService sets secure cookie flags based on NODE_ENV', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const cookieCalls: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const response = {
    cookie(name: string, value: string, options: Record<string, unknown>) {
      cookieCalls.push({ name, value, options });
    },
  };

  try {
    process.env.NODE_ENV = 'development';
    const devService = createService();
    devService.setAdminSessionCookie(response, 'dev-session');

    process.env.NODE_ENV = 'production';
    const prodService = createService();
    prodService.setAdminSessionCookie(response, 'prod-session');
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }

  assert.equal(cookieCalls.length, 2);
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
});

test('createAuthSessionService exposes stable parsing and PKCE helpers', () => {
  const service = createService();

  assert.deepEqual(service.parseCookies('foo=bar; answer=42; encoded=hello%20world'), {
    foo: 'bar',
    answer: '42',
    encoded: 'hello world',
  });
  assert.equal(
    service.createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
  );
});
