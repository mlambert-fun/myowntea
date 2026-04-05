// @ts-nocheck
export function registerCustomerOAuthRoutes(app, deps) {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_COOKIE_STATE,
    GOOGLE_OAUTH_COOKIE_VERIFIER,
    GOOGLE_OAUTH_SCOPE,
    GOOGLE_REDIRECT_URL,
    SESSION_TTL_DAYS,
    WEB_BASE_URL,
    base64UrlEncode,
    clearOAuthCookie,
    createCodeChallenge,
    createCodeVerifier,
    crypto,
    parseCookies,
    prisma,
    redirectWithError,
    setOAuthCookie,
    setSessionCookie,
  } = deps;

  app.get('/auth/google/start', (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URL) {
      return res.status(500).send('Google OAuth not configured');
    }

    const state = base64UrlEncode(crypto.randomBytes(16));
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);

    setOAuthCookie(res, GOOGLE_OAUTH_COOKIE_STATE, state);
    setOAuthCookie(res, GOOGLE_OAUTH_COOKIE_VERIFIER, codeVerifier);

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URL,
      response_type: 'code',
      scope: GOOGLE_OAUTH_SCOPE,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get('/auth/google/callback', async (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URL) {
      return redirectWithError(res, 'google_oauth_not_configured');
    }
    if (req.query.error) {
      return redirectWithError(res, String(req.query.error));
    }

    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    const cookies = parseCookies(req.headers.cookie);
    const storedState = cookies[GOOGLE_OAUTH_COOKIE_STATE];
    const codeVerifier = cookies[GOOGLE_OAUTH_COOKIE_VERIFIER];

    clearOAuthCookie(res, GOOGLE_OAUTH_COOKIE_STATE);
    clearOAuthCookie(res, GOOGLE_OAUTH_COOKIE_VERIFIER);

    if (!code || !state || !storedState || state !== storedState || !codeVerifier) {
      return redirectWithError(res, 'invalid_oauth_state');
    }

    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          code,
          redirect_uri: GOOGLE_REDIRECT_URL,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
      });
      if (!tokenResponse.ok) {
        return redirectWithError(res, 'oauth_token_failed');
      }

      const tokenData = (await tokenResponse.json());
      if (!tokenData.access_token) {
        return redirectWithError(res, 'missing_access_token');
      }

      const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!userResponse.ok) {
        return redirectWithError(res, 'oauth_userinfo_failed');
      }

      const profile = (await userResponse.json());
      if (!profile.email || !profile.email_verified || !profile.sub) {
        return redirectWithError(res, 'email_not_verified');
      }

      const email = profile.email.toLowerCase();
      const googleId = profile.sub;
      let customer = await prisma.customer.findFirst({
        where: {
          OR: [{ googleId }, { email }],
        },
      });

      if (customer) {
        if (!customer.googleId) {
          customer = await prisma.customer.update({
            where: { id: customer.id },
            data: { googleId, authProvider: 'GOOGLE' },
          });
        } else if (customer.googleId !== googleId) {
          return redirectWithError(res, 'google_account_conflict');
        } else if (customer.authProvider !== 'GOOGLE') {
          customer = await prisma.customer.update({
            where: { id: customer.id },
            data: { authProvider: 'GOOGLE' },
          });
        }
      } else {
        customer = await prisma.customer.create({
          data: {
            email,
            googleId,
            authProvider: 'GOOGLE',
            passwordHash: null,
            firstName: profile.given_name || null,
            lastName: profile.family_name || null,
            address: '',
            city: '',
            postalCode: '',
            country: 'FR',
          },
        });
      }

      const session = await prisma.session.create({
        data: {
          customerId: customer.id,
          expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
      });
      setSessionCookie(res, session.id);
      res.redirect(`${WEB_BASE_URL}/`);
    } catch (_error) {
      redirectWithError(res, 'oauth_failed');
    }
  });
}
