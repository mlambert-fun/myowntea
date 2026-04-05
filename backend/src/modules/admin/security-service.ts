// @ts-nocheck
export function createAdminSecurityService({
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_HOURS,
  clearAdminSessionCookie,
  crypto,
  normalizeEmail,
  parseCookies,
  prisma,
  resolveRequestIp,
  toNonEmptyStringOrNull,
}) {
  const ADMIN_MFA_CHALLENGE_TTL_MINUTES = (() => {
    const parsed = Number(process.env.ADMIN_MFA_CHALLENGE_TTL_MINUTES || 10);
    if (!Number.isFinite(parsed)) {
      return 10;
    }
    return Math.min(30, Math.max(5, Math.round(parsed)));
  })();
  const ADMIN_TOTP_PERIOD_SECONDS = 30;
  const ADMIN_TOTP_DIGITS = 6;
  const ADMIN_TOTP_ISSUER =
    toNonEmptyStringOrNull(process.env.ADMIN_TOTP_ISSUER) || 'My Own Tea';
  const collectAdminTotpEncryptionSecrets = () => {
    const candidates = [];
    const pushCandidate = (value) => {
      const normalized = toNonEmptyStringOrNull(value);
      if (!normalized || candidates.includes(normalized)) {
        return;
      }
      candidates.push(normalized);
    };

    pushCandidate(process.env.ADMIN_TOTP_ENCRYPTION_KEY);

    String(process.env.ADMIN_TOTP_ENCRYPTION_KEY_PREVIOUS || '')
      .split(',')
      .map((value) => toNonEmptyStringOrNull(value))
      .filter(Boolean)
      .forEach((value) => pushCandidate(value));

    // Legacy fallback for MFA secrets created before ADMIN_TOTP_ENCRYPTION_KEY existed.
    pushCandidate(process.env.JWT_SECRET);

    if (candidates.length === 0) {
      candidates.push('dev-admin-totp-secret');
    }

    return candidates;
  };
  const ADMIN_TOTP_ENCRYPTION_SECRETS = collectAdminTotpEncryptionSecrets();
  const ADMIN_TOTP_PRIMARY_ENCRYPTION_SECRET = ADMIN_TOTP_ENCRYPTION_SECRETS[0];
  const ADMIN_AUTH_RATE_LIMIT_WINDOW_MS = (() => {
    const parsed = Number(process.env.ADMIN_AUTH_RATE_LIMIT_WINDOW_MINUTES || 15);
    if (!Number.isFinite(parsed)) {
      return 15 * 60 * 1000;
    }
    return Math.min(60, Math.max(5, Math.round(parsed))) * 60 * 1000;
  })();
  const ADMIN_AUTH_RATE_LIMIT_MAX_FAILURES = (() => {
    const parsed = Number(process.env.ADMIN_AUTH_RATE_LIMIT_MAX_FAILURES || 5);
    if (!Number.isFinite(parsed)) {
      return 5;
    }
    return Math.min(10, Math.max(3, Math.round(parsed)));
  })();
  const ADMIN_BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const ADMIN_TOTP_DRIFT_STEPS = 1;

  const deriveAdminTotpEncryptionKey = (secret = ADMIN_TOTP_PRIMARY_ENCRYPTION_SECRET) =>
    crypto.createHash('sha256').update(secret).digest();

  const encodeBase32 = (buffer) => {
    let bits = 0;
    let value = 0;
    let output = '';
    buffer.forEach((byte) => {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += ADMIN_BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    });
    if (bits > 0) {
      output += ADMIN_BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }
    return output;
  };

  const decodeBase32 = (input) => {
    const normalized = String(input || '')
      .toUpperCase()
      .replace(/[^A-Z2-7]/g, '');
    if (!normalized) {
      return Buffer.alloc(0);
    }
    let bits = 0;
    let value = 0;
    const bytes = [];
    for (const char of normalized) {
      const index = ADMIN_BASE32_ALPHABET.indexOf(char);
      if (index < 0) {
        continue;
      }
      value = (value << 5) | index;
      bits += 5;
      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return Buffer.from(bytes);
  };

  const generateAdminTotpSecret = () => encodeBase32(crypto.randomBytes(20));
  const formatAdminTotpSecret = (secret) =>
    String(secret || '')
      .replace(/[^A-Z2-7]/gi, '')
      .toUpperCase()
      .match(/.{1,4}/g)
      ?.join(' ') || '';
  const buildAdminTotpUri = (email, secret) => {
    const accountName = encodeURIComponent(`${ADMIN_TOTP_ISSUER}:${email}`);
    const issuer = encodeURIComponent(ADMIN_TOTP_ISSUER);
    return `otpauth://totp/${accountName}?secret=${encodeURIComponent(secret)}&issuer=${issuer}&algorithm=SHA1&digits=${ADMIN_TOTP_DIGITS}&period=${ADMIN_TOTP_PERIOD_SECONDS}`;
  };
  const encryptAdminSecret = (value) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      deriveAdminTotpEncryptionKey(ADMIN_TOTP_PRIMARY_ENCRYPTION_SECRET),
      iv
    );
    const encrypted = Buffer.concat([
      cipher.update(String(value || ''), 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${authTag.toString('base64url')}.${encrypted.toString('base64url')}`;
  };
  const tryDecryptAdminSecret = (encryptedValue, encryptionSecret) => {
    const raw = toNonEmptyStringOrNull(encryptedValue);
    if (!raw) {
      return null;
    }
    const [ivEncoded, authTagEncoded, payloadEncoded] = raw.split('.');
    if (!ivEncoded || !authTagEncoded || !payloadEncoded) {
      return null;
    }
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        deriveAdminTotpEncryptionKey(encryptionSecret),
        Buffer.from(ivEncoded, 'base64url')
      );
      decipher.setAuthTag(Buffer.from(authTagEncoded, 'base64url'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payloadEncoded, 'base64url')),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      return null;
    }
  };
  const decryptAdminSecretWithMetadata = (encryptedValue) => {
    for (const candidateSecret of ADMIN_TOTP_ENCRYPTION_SECRETS) {
      const decrypted = tryDecryptAdminSecret(encryptedValue, candidateSecret);
      if (!decrypted) {
        continue;
      }
      return {
        secret: decrypted,
        encryptionSecret: candidateSecret,
        usedLegacySecret: candidateSecret !== ADMIN_TOTP_PRIMARY_ENCRYPTION_SECRET,
      };
    }
    return null;
  };
  const decryptAdminSecret = (encryptedValue) =>
    decryptAdminSecretWithMetadata(encryptedValue)?.secret || null;
  const normalizeAdminTotpCode = (value) => {
    const digitsOnly = String(value || '').replace(/\D+/g, '');
    if (digitsOnly.length !== ADMIN_TOTP_DIGITS) {
      return null;
    }
    return digitsOnly;
  };
  const computeAdminTotpCode = (secret, counter) => {
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
    return String(binary % 10 ** ADMIN_TOTP_DIGITS).padStart(
      ADMIN_TOTP_DIGITS,
      '0'
    );
  };
  const verifyAdminTotpCode = (secret, candidateCode) => {
    const normalizedCode = normalizeAdminTotpCode(candidateCode);
    if (!secret || !normalizedCode) {
      return false;
    }
    const currentCounter = Math.floor(
      Date.now() / 1000 / ADMIN_TOTP_PERIOD_SECONDS
    );
    for (
      let offset = -ADMIN_TOTP_DRIFT_STEPS;
      offset <= ADMIN_TOTP_DRIFT_STEPS;
      offset += 1
    ) {
      if (computeAdminTotpCode(secret, currentCounter + offset) === normalizedCode) {
        return true;
      }
    }
    return false;
  };
  const hashAdminSessionToken = (token) =>
    crypto.createHash('sha256').update(String(token || '')).digest('hex');

  const adminAuthRateLimitState = new Map();
  const readAdminAuthRateLimitEntry = (key) => {
    const entry = adminAuthRateLimitState.get(key);
    if (!entry) {
      return null;
    }
    if (entry.resetAt <= Date.now()) {
      adminAuthRateLimitState.delete(key);
      return null;
    }
    return entry;
  };
  const resolveAdminAuthRateLimitKey = (scope, req, identifier) => {
    const ip = resolveRequestIp(req) || 'unknown';
    const normalizedIdentifier =
      String(identifier || '').trim().toLowerCase() || 'unknown';
    return `${scope}:${ip}:${normalizedIdentifier}`;
  };
  const getAdminAuthRetryAfterSeconds = (key) => {
    const entry = readAdminAuthRateLimitEntry(key);
    if (!entry) {
      return 0;
    }
    return Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
  };
  const hasExceededAdminAuthRateLimit = (key) => {
    const entry = readAdminAuthRateLimitEntry(key);
    return Boolean(entry && entry.count >= ADMIN_AUTH_RATE_LIMIT_MAX_FAILURES);
  };
  const recordAdminAuthFailure = (key) => {
    const existing = readAdminAuthRateLimitEntry(key);
    if (!existing) {
      adminAuthRateLimitState.set(key, {
        count: 1,
        resetAt: Date.now() + ADMIN_AUTH_RATE_LIMIT_WINDOW_MS,
      });
      return;
    }
    existing.count += 1;
    adminAuthRateLimitState.set(key, existing);
  };
  const clearAdminAuthFailures = (key) => {
    adminAuthRateLimitState.delete(key);
  };

  let adminSecurityTablesEnsurePromise = null;
  let adminSecurityTablesEnsured = false;
  const ensureAdminSecurityTables = async () => {
    if (adminSecurityTablesEnsured) {
      return;
    }
    if (adminSecurityTablesEnsurePromise) {
      await adminSecurityTablesEnsurePromise;
      return;
    }
    adminSecurityTablesEnsurePromise = (async () => {
      await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AdminMfaConfig" (
        "userId" TEXT NOT NULL PRIMARY KEY,
        "secretEncrypted" TEXT NOT NULL,
        "enabledAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
      await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AdminAuthChallenge" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "purpose" TEXT NOT NULL,
        "secretEncrypted" TEXT,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "consumedAt" TIMESTAMP(3),
        "requestedFromIp" TEXT,
        "userAgent" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
      await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AdminSession" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "tokenHash" TEXT NOT NULL UNIQUE,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "ipAddress" TEXT,
        "userAgent" TEXT
      );
    `);
      await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "adminUserId" TEXT,
        "eventType" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "targetType" TEXT,
        "targetId" TEXT,
        "metadata" TEXT,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
      await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AdminAuthChallenge_userId_createdAt_idx"
      ON "AdminAuthChallenge"("userId", "createdAt" DESC);
    `);
      await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AdminAuthChallenge_expiresAt_idx"
      ON "AdminAuthChallenge"("expiresAt");
    `);
      await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AdminSession_expiresAt_idx"
      ON "AdminSession"("expiresAt");
    `);
      await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AdminSession_userId_lastSeenAt_idx"
      ON "AdminSession"("userId", "lastSeenAt" DESC);
    `);
      await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AdminAuditLog_adminUserId_createdAt_idx"
      ON "AdminAuditLog"("adminUserId", "createdAt" DESC);
    `);
      await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AdminAuditLog_eventType_createdAt_idx"
      ON "AdminAuditLog"("eventType", "createdAt" DESC);
    `);
      await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'AdminMfaConfig_userId_fkey'
        ) THEN
          ALTER TABLE "AdminMfaConfig"
          ADD CONSTRAINT "AdminMfaConfig_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);
      await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'AdminAuthChallenge_userId_fkey'
        ) THEN
          ALTER TABLE "AdminAuthChallenge"
          ADD CONSTRAINT "AdminAuthChallenge_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);
      await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'AdminSession_userId_fkey'
        ) THEN
          ALTER TABLE "AdminSession"
          ADD CONSTRAINT "AdminSession_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);
      await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'AdminAuditLog_adminUserId_fkey'
        ) THEN
          ALTER TABLE "AdminAuditLog"
          ADD CONSTRAINT "AdminAuditLog_adminUserId_fkey"
          FOREIGN KEY ("adminUserId") REFERENCES "User"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);
      adminSecurityTablesEnsured = true;
    })();
    try {
      await adminSecurityTablesEnsurePromise;
    } catch (error) {
      adminSecurityTablesEnsurePromise = null;
      adminSecurityTablesEnsured = false;
      throw error;
    }
  };

  const serializeAdminUser = (user, options = {}) => ({
    id: user.id,
    email: user.email,
    role: 'ADMIN',
    mfaEnabled: Boolean(options.mfaEnabled),
  });

  const getAdminUserByEmail = async (email) => {
    const normalizedEmailValue = normalizeEmail(email);
    if (!normalizedEmailValue) {
      return null;
    }
    return prisma.user.findFirst({
      where: {
        email: normalizedEmailValue,
        role: 'ADMIN',
      },
    });
  };

  const getAdminMfaConfigByUserId = async (userId) => {
    await ensureAdminSecurityTables();
    const rows = await prisma.$queryRaw`
      SELECT
        "userId",
        "secretEncrypted",
        "enabledAt",
        "createdAt",
        "updatedAt"
      FROM "AdminMfaConfig"
      WHERE "userId" = ${userId}
      LIMIT 1
    `;
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  };

  const upsertAdminMfaConfig = async ({ userId, secretEncrypted }) => {
    await ensureAdminSecurityTables();
    await prisma.$executeRaw`
      INSERT INTO "AdminMfaConfig" (
        "userId",
        "secretEncrypted",
        "enabledAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${userId},
        ${secretEncrypted},
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT ("userId")
      DO UPDATE SET
        "secretEncrypted" = EXCLUDED."secretEncrypted",
        "enabledAt" = NOW(),
        "updatedAt" = NOW()
    `;
  };

  const createAdminAuthChallenge = async ({
    userId,
    purpose,
    secretEncrypted,
    requestIp,
    userAgent,
  }) => {
    await ensureAdminSecurityTables();
    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + ADMIN_MFA_CHALLENGE_TTL_MINUTES * 60 * 1000
    );
    await prisma.$executeRaw`
      INSERT INTO "AdminAuthChallenge" (
        "id",
        "userId",
        "purpose",
        "secretEncrypted",
        "expiresAt",
        "consumedAt",
        "requestedFromIp",
        "userAgent",
        "createdAt"
      )
      VALUES (
        ${challengeId},
        ${userId},
        ${purpose},
        ${secretEncrypted || null},
        ${expiresAt},
        NULL,
        ${requestIp || null},
        ${userAgent || null},
        NOW()
      )
    `;
    return {
      id: challengeId,
      expiresAt,
    };
  };

  const getAdminAuthChallengeById = async (challengeId) => {
    await ensureAdminSecurityTables();
    const rows = await prisma.$queryRaw`
      SELECT
        c."id",
        c."userId",
        c."purpose",
        c."secretEncrypted",
        c."expiresAt",
        c."consumedAt",
        c."requestedFromIp",
        c."userAgent",
        c."createdAt"
      FROM "AdminAuthChallenge" c
      WHERE c."id" = ${challengeId}
      LIMIT 1
    `;
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  };

  const consumeAdminAuthChallenge = async (challengeId) => {
    await ensureAdminSecurityTables();
    await prisma.$executeRaw`
      UPDATE "AdminAuthChallenge"
      SET "consumedAt" = NOW()
      WHERE "id" = ${challengeId}
        AND "consumedAt" IS NULL
    `;
  };

  const consumeOutstandingAdminChallengesForUser = async (userId) => {
    await ensureAdminSecurityTables();
    await prisma.$executeRaw`
      UPDATE "AdminAuthChallenge"
      SET "consumedAt" = NOW()
      WHERE "userId" = ${userId}
        AND "consumedAt" IS NULL
    `;
  };

  const createAdminSession = async ({ userId, requestIp, userAgent }) => {
    await ensureAdminSecurityTables();
    const sessionId = crypto.randomUUID();
    const rawToken = crypto.randomBytes(48).toString('base64url');
    const tokenHash = hashAdminSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000);
    await prisma.$executeRaw`
      INSERT INTO "AdminSession" (
        "id",
        "userId",
        "tokenHash",
        "expiresAt",
        "lastSeenAt",
        "createdAt",
        "ipAddress",
        "userAgent"
      )
      VALUES (
        ${sessionId},
        ${userId},
        ${tokenHash},
        ${expiresAt},
        NOW(),
        NOW(),
        ${requestIp || null},
        ${userAgent || null}
      )
    `;
    return {
      id: sessionId,
      token: rawToken,
      expiresAt,
    };
  };

  const destroyAdminSessionByToken = async (rawToken) => {
    const normalizedToken = toNonEmptyStringOrNull(rawToken);
    if (!normalizedToken) {
      return;
    }
    await ensureAdminSecurityTables();
    const tokenHash = hashAdminSessionToken(normalizedToken);
    await prisma.$executeRaw`
      DELETE FROM "AdminSession"
      WHERE "tokenHash" = ${tokenHash}
    `;
  };

  const getAdminSessionRecord = async (req) => {
    await ensureAdminSecurityTables();
    const cookies = parseCookies(req.headers.cookie);
    const rawToken = toNonEmptyStringOrNull(cookies[ADMIN_SESSION_COOKIE]);
    if (!rawToken) {
      return null;
    }
    const tokenHash = hashAdminSessionToken(rawToken);
    const rows = await prisma.$queryRaw`
      SELECT
        s."id" AS "sessionId",
        s."userId",
        s."expiresAt",
        s."lastSeenAt",
        s."createdAt" AS "sessionCreatedAt",
        s."ipAddress",
        s."userAgent",
        u."id" AS "adminUserId",
        u."email",
        u."role"
      FROM "AdminSession" s
      INNER JOIN "User" u ON u."id" = s."userId"
      WHERE s."tokenHash" = ${tokenHash}
      LIMIT 1
    `;
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!row) {
      return null;
    }
    const expiresAt = new Date(row.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      await destroyAdminSessionByToken(rawToken);
      return null;
    }
    if (String(row.role || '').toUpperCase() !== 'ADMIN') {
      await destroyAdminSessionByToken(rawToken);
      return null;
    }
    const lastSeenAt = new Date(row.lastSeenAt);
    if (
      Number.isNaN(lastSeenAt.getTime()) ||
      Date.now() - lastSeenAt.getTime() > 5 * 60 * 1000
    ) {
      await prisma.$executeRaw`
          UPDATE "AdminSession"
          SET "lastSeenAt" = NOW()
          WHERE "id" = ${row.sessionId}
        `;
    }
    const mfaConfig = await getAdminMfaConfigByUserId(row.userId);
    return {
      session: {
        id: row.sessionId,
        userId: row.userId,
        expiresAt,
        createdAt: row.sessionCreatedAt,
      },
      user: serializeAdminUser(
        {
          id: row.adminUserId,
          email: row.email,
        },
        {
          mfaEnabled: Boolean(mfaConfig?.enabledAt),
        }
      ),
    };
  };

  const logAdminAuditEvent = async (params) => {
    try {
      await ensureAdminSecurityTables();
      const metadata = params?.metadata ? JSON.stringify(params.metadata) : null;
      await prisma.$executeRaw`
          INSERT INTO "AdminAuditLog" (
            "id",
            "adminUserId",
            "eventType",
            "status",
            "targetType",
            "targetId",
            "metadata",
            "ipAddress",
            "userAgent",
            "createdAt"
          )
          VALUES (
            ${crypto.randomUUID()},
            ${params?.adminUserId || null},
            ${params?.eventType || 'UNKNOWN'},
            ${params?.status || 'SUCCESS'},
            ${params?.targetType || null},
            ${params?.targetId || null},
            ${metadata},
            ${params?.ipAddress || null},
            ${params?.userAgent || null},
            NOW()
          )
        `;
    } catch (error) {
      console.error('Admin audit log error:', error);
    }
  };

  const adminMutationAudit = (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req.method || '').toUpperCase())) {
      next();
      return;
    }
    const startedAt = Date.now();
    res.on('finish', () => {
      if (!req.adminUser) {
        return;
      }
      void logAdminAuditEvent({
        adminUserId: req.adminUser.id,
        eventType: 'API_MUTATION',
        status: res.statusCode >= 400 ? 'ERROR' : 'SUCCESS',
        targetType: `${req.method} ${req.path}`,
        targetId: req.params?.id || null,
        metadata: {
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
        },
        ipAddress: resolveRequestIp(req),
        userAgent: toNonEmptyStringOrNull(req.header('user-agent')),
      });
    });
    next();
  };

  const requireAdminApi = async (req, res, next) => {
    try {
      const adminSession = await getAdminSessionRecord(req);
      if (!adminSession) {
        clearAdminSessionCookie(res);
        return res.status(401).json({ error: 'Admin authentication required' });
      }
      req.adminSession = adminSession.session;
      req.adminUser = adminSession.user;
      next();
    } catch (error) {
      clearAdminSessionCookie(res);
      return res.status(401).json({ error: 'Admin authentication required' });
    }
  };

  return {
    ADMIN_TOTP_DIGITS,
    ADMIN_TOTP_ISSUER,
    ADMIN_TOTP_PERIOD_SECONDS,
    adminMutationAudit,
    buildAdminTotpUri,
    clearAdminAuthFailures,
    consumeAdminAuthChallenge,
    consumeOutstandingAdminChallengesForUser,
    createAdminAuthChallenge,
    createAdminSession,
    decryptAdminSecret,
    decryptAdminSecretWithMetadata,
    destroyAdminSessionByToken,
    encryptAdminSecret,
    ensureAdminSecurityTables,
    formatAdminTotpSecret,
    generateAdminTotpSecret,
    getAdminAuthChallengeById,
    getAdminAuthRetryAfterSeconds,
    getAdminMfaConfigByUserId,
    getAdminSessionRecord,
    getAdminUserByEmail,
    hasExceededAdminAuthRateLimit,
    logAdminAuditEvent,
    normalizeAdminTotpCode,
    recordAdminAuthFailure,
    requireAdminApi,
    resolveAdminAuthRateLimitKey,
    serializeAdminUser,
    upsertAdminMfaConfig,
    verifyAdminTotpCode,
  };
}
