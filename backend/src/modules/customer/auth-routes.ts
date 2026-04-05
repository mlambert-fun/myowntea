// @ts-nocheck
export function registerCustomerAuthRoutes(app, deps) {
  const {
    PASSWORD_RESET_TOKEN_TTL_MINUTES,
    SESSION_COOKIE,
    SESSION_TTL_DAYS,
    bcrypt,
    clearSessionCookie,
    crypto,
    ensurePasswordResetTable,
    getSessionCustomer,
    hashPasswordResetToken,
    normalizeEmail,
    parseCookies,
    prisma,
    recordEmailConsentEvent,
    resolveRequestIp,
    resolveResetPasswordUrl,
    sendPasswordResetEmail,
    setSessionCookie,
    t,
    toNonEmptyStringOrNull,
    updateEmailPreference,
    upsertNewsletterSubscription,
  } = deps;

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const customer = await prisma.customer.findUnique({ where: { email: normalizedEmail } });
      if (!customer || !customer.passwordHash) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValid = await bcrypt.compare(password, customer.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const session = await prisma.session.create({
        data: {
          customerId: customer.id,
          expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
      });
      setSessionCookie(res, session.id);

      res.json({
        customer: {
          id: customer.id,
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          authProvider: customer.authProvider,
        },
      });
    } catch (_error) {
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, salutation, firstName, lastName, birthDate, phoneE164, marketingEmailsOptIn, reminderEmailsOptIn } = req.body;
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail || !password || !firstName || !lastName) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password too short' });
      }
      if (salutation && salutation !== 'MME' && salutation !== 'MR') {
        return res.status(400).json({ error: 'Invalid salutation' });
      }

      let parsedBirthDate = null;
      if (birthDate) {
        parsedBirthDate = new Date(birthDate);
        if (Number.isNaN(parsedBirthDate.getTime())) {
          return res.status(400).json({ error: 'Invalid birth date' });
        }
      }

      let normalizedPhone = null;
      if (phoneE164) {
        const trimmedPhone = String(phoneE164).trim();
        if (!/^\+[1-9]\d{1,14}$/.test(trimmedPhone)) {
          return res.status(400).json({ error: 'Invalid phone format' });
        }
        normalizedPhone = trimmedPhone;
      }

      const existing = await prisma.customer.findUnique({ where: { email: normalizedEmail } });
      if (existing) {
        return res.status(409).json({ error: t("backend.index.email_already_registered") });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const customer = await prisma.customer.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          authProvider: 'PASSWORD',
          salutation: salutation || null,
          firstName,
          lastName,
          birthDate: parsedBirthDate,
          phoneE164: normalizedPhone,
          address: '',
          city: '',
          postalCode: '',
          country: 'FR',
        },
      });

      const marketingOptIn = marketingEmailsOptIn === true;
      const remindersOptIn = reminderEmailsOptIn === true;
      await updateEmailPreference(customer.id, {
        transactionalOptIn: true,
        marketingOptIn,
        abandonedCartOptIn: remindersOptIn,
        postPurchaseOptIn: remindersOptIn,
        reorderOptIn: remindersOptIn,
        winbackOptIn: remindersOptIn,
      });

      const requestIp = resolveRequestIp(req);
      const userAgent = toNonEmptyStringOrNull(req.header('user-agent'));
      await upsertNewsletterSubscription({
        email: normalizedEmail,
        status: marketingOptIn ? 'SUBSCRIBED' : 'UNSUBSCRIBED',
        marketingConsent: marketingOptIn,
        source: 'REGISTER_FORM',
        ipAddress: requestIp,
        userAgent,
      });
      await recordEmailConsentEvent({
        customerId: customer.id,
        email: normalizedEmail,
        action: marketingOptIn ? 'OPT_IN' : 'OPT_OUT',
        source: 'REGISTER_FORM',
        ipAddress: requestIp,
        userAgent,
        metadata: {
          marketingEmailsOptIn: marketingOptIn,
          reminderEmailsOptIn: remindersOptIn,
        },
      });

      const session = await prisma.session.create({
        data: {
          customerId: customer.id,
          expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
      });
      setSessionCookie(res, session.id);

      res.status(201).json({
        customer: {
          id: customer.id,
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          authProvider: customer.authProvider,
        },
      });
    } catch (_error) {
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    const genericResponse = {
      ok: true,
      message: t("backend.index.account_existe_email"),
    };

    try {
      await ensurePasswordResetTable();
      const email = normalizeEmail(req.body?.email);
      if (!email) {
        return res.json(genericResponse);
      }

      const customer = await prisma.customer.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          firstName: true,
        },
      });
      if (!customer || !customer.email) {
        return res.json(genericResponse);
      }

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashPasswordResetToken(rawToken);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);
      const requestIp = resolveRequestIp(req);
      const userAgent = toNonEmptyStringOrNull(req.header('user-agent'));

      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
        UPDATE "PasswordResetToken"
        SET "usedAt" = NOW()
        WHERE "customerId" = ${customer.id}
          AND "usedAt" IS NULL
      `;
        await tx.$executeRaw`
        INSERT INTO "PasswordResetToken" (
          "id",
          "customerId",
          "tokenHash",
          "expiresAt",
          "usedAt",
          "requestedFromIp",
          "userAgent",
          "createdAt"
        )
        VALUES (
          ${crypto.randomUUID()},
          ${customer.id},
          ${tokenHash},
          ${expiresAt},
          NULL,
          ${requestIp},
          ${userAgent},
          NOW()
        )
      `;
      });

      const resetUrl = resolveResetPasswordUrl(rawToken);
      try {
        await sendPasswordResetEmail({
          to: customer.email,
          customerId: customer.id,
          firstName: customer.firstName,
          resetUrl,
        });
      } catch (mailError) {
        console.error('Password reset email error:', mailError);
      }

      return res.json(genericResponse);
    } catch (error) {
      console.error('Forgot password error:', error);
      return res.status(500).json({ error: 'Failed to process forgot password request' });
    }
  });

  app.get('/api/auth/reset-password/validate', async (req, res) => {
    try {
      await ensurePasswordResetTable();
      const token = toNonEmptyStringOrNull(req.query?.token);
      if (!token) {
        return res.status(400).json({ valid: false, error: 'Token is required' });
      }

      const tokenHash = hashPasswordResetToken(token);
      const rows = await prisma.$queryRaw`
      SELECT
        "id",
        "customerId",
        "expiresAt",
        "usedAt"
      FROM "PasswordResetToken"
      WHERE "tokenHash" = ${tokenHash}
      LIMIT 1
    `;
      const tokenRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (!tokenRow || tokenRow.usedAt) {
        return res.json({ valid: false });
      }

      const expiresAt = new Date(tokenRow.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
        return res.json({ valid: false });
      }

      return res.json({ valid: true, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      console.error('Reset token validation error:', error);
      return res.status(500).json({ valid: false, error: 'Failed to validate reset token' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      await ensurePasswordResetTable();
      const token = toNonEmptyStringOrNull(req.body?.token);
      const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

      if (!token || !newPassword) {
        return res.status(400).json({ error: 'token and newPassword are required' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must contain at least 8 characters' });
      }

      const tokenHash = hashPasswordResetToken(token);
      const rows = await prisma.$queryRaw`
      SELECT
        "id",
        "customerId",
        "expiresAt",
        "usedAt"
      FROM "PasswordResetToken"
      WHERE "tokenHash" = ${tokenHash}
      LIMIT 1
    `;
      const tokenRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (!tokenRow || tokenRow.usedAt) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      const expiresAt = new Date(tokenRow.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await prisma.$transaction(async (tx) => {
        await tx.customer.update({
          where: { id: tokenRow.customerId },
          data: {
            passwordHash,
            authProvider: 'PASSWORD',
          },
        });
        await tx.session.deleteMany({
          where: { customerId: tokenRow.customerId },
        });
        await tx.$executeRaw`
        UPDATE "PasswordResetToken"
        SET "usedAt" = NOW()
        WHERE "customerId" = ${tokenRow.customerId}
          AND "usedAt" IS NULL
      `;
      });

      return res.json({ ok: true, message: 'Password reset successful' });
    } catch (error) {
      console.error('Reset password error:', error);
      return res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  app.post('/api/auth/guest', async (req, res) => {
    try {
      const { guestCustomerId } = req.body;
      const session = await getSessionCustomer(req);
      if (session) {
        return res.json({
          customer: {
            id: session.customer.id,
            email: session.customer.email,
            firstName: session.customer.firstName,
            lastName: session.customer.lastName,
          },
          guestCustomerId: session.customer.email ? null : session.customer.id,
        });
      }

      if (guestCustomerId) {
        const existingGuest = await prisma.customer.findFirst({
          where: { id: guestCustomerId, email: null },
        });
        if (existingGuest) {
          const guestSession = await prisma.session.create({
            data: {
              customerId: existingGuest.id,
              expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
            },
          });
          setSessionCookie(res, guestSession.id);
          return res.json({
            customer: {
              id: existingGuest.id,
              email: existingGuest.email,
              firstName: existingGuest.firstName,
              lastName: existingGuest.lastName,
            },
            guestCustomerId: existingGuest.id,
          });
        }
      }

      const guest = await prisma.customer.create({
        data: {
          email: null,
          passwordHash: null,
          authProvider: 'PASSWORD',
          firstName: t("backend.index.guest"),
          lastName: null,
          address: '',
          city: '',
          postalCode: '',
          country: 'FR',
        },
      });
      const guestSession = await prisma.session.create({
        data: {
          customerId: guest.id,
          expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
      });
      setSessionCookie(res, guestSession.id);

      res.status(201).json({
        customer: {
          id: guest.id,
          email: guest.email,
          firstName: guest.firstName,
          lastName: guest.lastName,
        },
        guestCustomerId: guest.id,
      });
    } catch (_error) {
      res.status(500).json({ error: 'Guest session failed' });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const sessionId = cookies[SESSION_COOKIE];
      if (sessionId) {
        await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
      }
      clearSessionCookie(res);
      res.json({ success: true });
    } catch (_error) {
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  app.get('/api/me', async (req, res) => {
    try {
      const session = await getSessionCustomer(req);
      if (!session) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const customer = session.customer;
      res.json({
        customer: {
          id: customer.id,
          email: customer.email,
          authProvider: customer.authProvider,
          salutation: customer.salutation,
          firstName: customer.firstName,
          lastName: customer.lastName,
          birthDate: customer.birthDate,
          phoneE164: customer.phoneE164,
        },
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  });
}
