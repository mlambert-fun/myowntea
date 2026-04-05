// @ts-nocheck
export function registerAdminAuthRoutes(app, deps) {
  const {
    ADMIN_SESSION_COOKIE,
    ADMIN_TOTP_DIGITS,
    ADMIN_TOTP_ISSUER,
    ADMIN_TOTP_PERIOD_SECONDS,
    bcrypt,
    buildAdminTotpUri,
    clearAdminAuthFailures,
    clearAdminSessionCookie,
    consumeAdminAuthChallenge,
    consumeOutstandingAdminChallengesForUser,
    createAdminAuthChallenge,
    createAdminSession,
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
    normalizeEmail,
    parseCookies,
    prisma,
    recordAdminAuthFailure,
    resolveAdminAuthRateLimitKey,
    resolveRequestIp,
    serializeAdminUser,
    setAdminSessionCookie,
    toNonEmptyStringOrNull,
    upsertAdminMfaConfig,
    verifyAdminTotpCode,
  } = deps;

  app.post('/api/admin/auth/login', async (req, res) => {
    try {
      await ensureAdminSecurityTables();
      const normalizedEmail = normalizeEmail(req.body?.email);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const requestIp = resolveRequestIp(req);
      const userAgent = toNonEmptyStringOrNull(req.header('user-agent'));
      const rateLimitKey = resolveAdminAuthRateLimitKey('login', req, normalizedEmail || 'unknown');

      if (hasExceededAdminAuthRateLimit(rateLimitKey)) {
        const retryAfterSeconds = getAdminAuthRetryAfterSeconds(rateLimitKey);
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
      }

      if (!normalizedEmail || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const adminUser = await getAdminUserByEmail(normalizedEmail);
      const isPasswordValid = Boolean(adminUser?.passwordHash) && await bcrypt.compare(password, adminUser.passwordHash);

      if (!adminUser || !isPasswordValid) {
        recordAdminAuthFailure(rateLimitKey);
        await logAdminAuditEvent({
          adminUserId: adminUser?.id || null,
          eventType: 'LOGIN_PASSWORD',
          status: 'ERROR',
          targetType: 'ADMIN_AUTH',
          metadata: {
            email: normalizedEmail,
            reason: 'INVALID_CREDENTIALS',
          },
          ipAddress: requestIp,
          userAgent,
        });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      clearAdminAuthFailures(rateLimitKey);
      const mfaConfig = await getAdminMfaConfigByUserId(adminUser.id);

      if (mfaConfig?.secretEncrypted) {
        const challenge = await createAdminAuthChallenge({
          userId: adminUser.id,
          purpose: 'VERIFY_TOTP',
          secretEncrypted: null,
          requestIp,
          userAgent,
        });

        await logAdminAuditEvent({
          adminUserId: adminUser.id,
          eventType: 'LOGIN_PASSWORD',
          status: 'SUCCESS',
          targetType: 'MFA_VERIFY_REQUIRED',
          targetId: challenge.id,
          metadata: {
            email: adminUser.email,
            expiresAt: challenge.expiresAt.toISOString(),
          },
          ipAddress: requestIp,
          userAgent,
        });

        return res.json({
          step: 'totp',
          challengeId: challenge.id,
          expiresAt: challenge.expiresAt.toISOString(),
          user: serializeAdminUser(adminUser, { mfaEnabled: true }),
        });
      }

      const secret = generateAdminTotpSecret();
      const encryptedSecret = encryptAdminSecret(secret);
      const challenge = await createAdminAuthChallenge({
        userId: adminUser.id,
        purpose: 'SETUP_TOTP',
        secretEncrypted: encryptedSecret,
        requestIp,
        userAgent,
      });

      await logAdminAuditEvent({
        adminUserId: adminUser.id,
        eventType: 'LOGIN_PASSWORD',
        status: 'SUCCESS',
        targetType: 'MFA_SETUP_REQUIRED',
        targetId: challenge.id,
        metadata: {
          email: adminUser.email,
          expiresAt: challenge.expiresAt.toISOString(),
        },
        ipAddress: requestIp,
        userAgent,
      });

      return res.json({
        step: 'setup_totp',
        challengeId: challenge.id,
        expiresAt: challenge.expiresAt.toISOString(),
        user: serializeAdminUser(adminUser, { mfaEnabled: false }),
        setup: {
          issuer: ADMIN_TOTP_ISSUER,
          secret,
          manualEntryKey: formatAdminTotpSecret(secret),
          otpauthUrl: buildAdminTotpUri(adminUser.email, secret),
          digits: ADMIN_TOTP_DIGITS,
          periodSeconds: ADMIN_TOTP_PERIOD_SECONDS,
        },
      });
    } catch (error) {
      console.error('Admin login error:', error);
      return res.status(500).json({ error: 'Admin login failed' });
    }
  });

  app.post('/api/admin/auth/verify', async (req, res) => {
    try {
      await ensureAdminSecurityTables();
      const challengeId = toNonEmptyStringOrNull(req.body?.challengeId);
      const normalizedCode = normalizeAdminTotpCode(req.body?.code);
      const requestIp = resolveRequestIp(req);
      const userAgent = toNonEmptyStringOrNull(req.header('user-agent'));

      if (!challengeId || !normalizedCode) {
        return res.status(400).json({ error: 'Challenge id and authentication code are required' });
      }

      const challenge = await getAdminAuthChallengeById(challengeId);
      if (!challenge || challenge.consumedAt) {
        return res.status(400).json({ error: 'This authentication challenge is no longer valid' });
      }

      const expiresAt = new Date(challenge.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        await consumeAdminAuthChallenge(challengeId);
        return res.status(400).json({ error: 'This authentication challenge has expired' });
      }

      const adminUser = await prisma.user.findUnique({ where: { id: challenge.userId } });
      if (!adminUser || adminUser.role !== 'ADMIN') {
        await consumeAdminAuthChallenge(challengeId);
        return res.status(401).json({ error: 'Admin authentication required' });
      }

      const rateLimitKey = resolveAdminAuthRateLimitKey('totp', req, adminUser.email || adminUser.id);
      if (hasExceededAdminAuthRateLimit(rateLimitKey)) {
        const retryAfterSeconds = getAdminAuthRetryAfterSeconds(rateLimitKey);
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({ error: 'Too many invalid authentication codes. Try again later.' });
      }

      let encryptedSecret = null;
      if (challenge.purpose === 'SETUP_TOTP') {
        encryptedSecret = challenge.secretEncrypted;
      } else if (challenge.purpose === 'VERIFY_TOTP') {
        const mfaConfig = await getAdminMfaConfigByUserId(adminUser.id);
        encryptedSecret = mfaConfig?.secretEncrypted || null;
      } else {
        await consumeAdminAuthChallenge(challengeId);
        return res.status(400).json({ error: 'Unsupported authentication challenge' });
      }

      const decryptedSecretRecord = decryptAdminSecretWithMetadata(encryptedSecret);
      const decryptedSecret = decryptedSecretRecord?.secret || null;
      if (!decryptedSecret || !verifyAdminTotpCode(decryptedSecret, normalizedCode)) {
        recordAdminAuthFailure(rateLimitKey);
        await logAdminAuditEvent({
          adminUserId: adminUser.id,
          eventType: challenge.purpose === 'SETUP_TOTP' ? 'MFA_SETUP_VERIFY' : 'LOGIN_TOTP',
          status: 'ERROR',
          targetType: 'ADMIN_AUTH',
          targetId: challenge.id,
          metadata: {
            email: adminUser.email,
            reason: 'INVALID_TOTP',
          },
          ipAddress: requestIp,
          userAgent,
        });
        return res.status(401).json({ error: 'Invalid authentication code' });
      }

      clearAdminAuthFailures(rateLimitKey);

      if (challenge.purpose === 'SETUP_TOTP') {
        await upsertAdminMfaConfig({
          userId: adminUser.id,
          secretEncrypted: encryptedSecret,
        });
      } else if (decryptedSecretRecord?.usedLegacySecret) {
        await upsertAdminMfaConfig({
          userId: adminUser.id,
          secretEncrypted: encryptAdminSecret(decryptedSecret),
        });
      }

      await consumeOutstandingAdminChallengesForUser(adminUser.id);
      const adminSession = await createAdminSession({
        userId: adminUser.id,
        requestIp,
        userAgent,
      });

      setAdminSessionCookie(res, adminSession.token);
      await logAdminAuditEvent({
        adminUserId: adminUser.id,
        eventType: challenge.purpose === 'SETUP_TOTP' ? 'MFA_SETUP' : 'LOGIN_TOTP',
        status: 'SUCCESS',
        targetType: 'ADMIN_SESSION',
        targetId: adminSession.id,
        metadata: {
          expiresAt: adminSession.expiresAt.toISOString(),
        },
        ipAddress: requestIp,
        userAgent,
      });

      return res.json({
        user: serializeAdminUser(adminUser, { mfaEnabled: true }),
        expiresAt: adminSession.expiresAt.toISOString(),
      });
    } catch (error) {
      console.error('Admin TOTP verification error:', error);
      return res.status(500).json({ error: 'Failed to verify authentication code' });
    }
  });

  app.get('/api/admin/auth/me', async (req, res) => {
    try {
      const adminSession = await getAdminSessionRecord(req);
      if (!adminSession) {
        clearAdminSessionCookie(res);
        return res.status(401).json({ error: 'Admin authentication required' });
      }

      return res.json({
        user: adminSession.user,
        session: {
          id: adminSession.session.id,
          expiresAt: adminSession.session.expiresAt,
        },
      });
    } catch (error) {
      clearAdminSessionCookie(res);
      return res.status(401).json({ error: 'Admin authentication required' });
    }
  });

  app.post('/api/admin/auth/logout', async (req, res) => {
    const requestIp = resolveRequestIp(req);
    const userAgent = toNonEmptyStringOrNull(req.header('user-agent'));

    try {
      const adminSession = await getAdminSessionRecord(req).catch(() => null);
      const cookies = parseCookies(req.headers.cookie);
      const rawToken = cookies[ADMIN_SESSION_COOKIE];

      if (rawToken) {
        await destroyAdminSessionByToken(rawToken);
      }

      clearAdminSessionCookie(res);

      if (adminSession?.user?.id) {
        await logAdminAuditEvent({
          adminUserId: adminSession.user.id,
          eventType: 'LOGOUT',
          status: 'SUCCESS',
          targetType: 'ADMIN_SESSION',
          targetId: adminSession.session.id,
          ipAddress: requestIp,
          userAgent,
        });
      }

      return res.json({ success: true });
    } catch (error) {
      clearAdminSessionCookie(res);
      return res.status(500).json({ error: 'Admin logout failed' });
    }
  });
}
