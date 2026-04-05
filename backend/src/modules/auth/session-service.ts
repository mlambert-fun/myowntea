// @ts-nocheck
export function createAuthSessionService({
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_HOURS,
  GOOGLE_OAUTH_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  WEB_BASE_URL,
  crypto,
  prisma,
}) {
  const parseCookies = (cookieHeader) => {
    const list = {};
    if (!cookieHeader) {
      return list;
    }
    cookieHeader.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      const key = parts.shift()?.trim();
      if (!key) {
        return;
      }
      const value = decodeURIComponent(parts.join('='));
      list[key] = value;
    });
    return list;
  };

  const resolveCookieSecurity = () => {
    const secure = process.env.NODE_ENV === 'production';
    return {
      secure,
      sameSite: secure ? 'none' : 'lax',
    };
  };

  const setSessionCookie = (res, sessionId) => {
    const { secure, sameSite } = resolveCookieSecurity();
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite,
      secure,
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
      path: '/',
    });
  };

  const clearSessionCookie = (res) => {
    const { secure, sameSite } = resolveCookieSecurity();
    res.cookie(SESSION_COOKIE, '', {
      httpOnly: true,
      sameSite,
      secure,
      maxAge: 0,
      path: '/',
    });
  };

  const setAdminSessionCookie = (res, sessionToken) => {
    const { secure, sameSite } = resolveCookieSecurity();
    res.cookie(ADMIN_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite,
      secure,
      maxAge: ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000,
      path: '/',
    });
  };

  const clearAdminSessionCookie = (res) => {
    const { secure, sameSite } = resolveCookieSecurity();
    res.cookie(ADMIN_SESSION_COOKIE, '', {
      httpOnly: true,
      sameSite,
      secure,
      maxAge: 0,
      path: '/',
    });
  };

  const setOAuthCookie = (res, name, value) => {
    const { secure, sameSite } = resolveCookieSecurity();
    res.cookie(name, value, {
      httpOnly: true,
      sameSite,
      secure,
      maxAge: GOOGLE_OAUTH_TTL_MS,
      path: '/',
    });
  };

  const clearOAuthCookie = (res, name) => {
    const { secure, sameSite } = resolveCookieSecurity();
    res.cookie(name, '', {
      httpOnly: true,
      sameSite,
      secure,
      maxAge: 0,
      path: '/',
    });
  };

  const base64UrlEncode = (buffer) =>
    buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

  const createCodeVerifier = () => base64UrlEncode(crypto.randomBytes(32));

  const createCodeChallenge = (verifier) =>
    base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());

  const redirectWithError = (res, message) => {
    const encoded = encodeURIComponent(message);
    res.redirect(`${WEB_BASE_URL}/login-error?code=${encoded}`);
  };

  const getSessionCustomer = async (req) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[SESSION_COOKIE];
    if (!sessionId) {
      return null;
    }
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { customer: true },
    });
    if (!session) {
      return null;
    }
    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    return session;
  };

  const requireCustomer = async (req, res, next) => {
    try {
      const session = await getSessionCustomer(req);
      if (!session) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      req.customer = session.customer;
      req.session = session;
      next();
    } catch (_error) {
      res.status(401).json({ error: 'Not authenticated' });
    }
  };

  const requireAccountCustomer = async (req, res, next) => {
    try {
      const session = await getSessionCustomer(req);
      if (!session || !session.customer.email) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      req.customer = session.customer;
      req.session = session;
      next();
    } catch (_error) {
      res.status(401).json({ error: 'Not authenticated' });
    }
  };

  return {
    base64UrlEncode,
    clearAdminSessionCookie,
    clearOAuthCookie,
    clearSessionCookie,
    createCodeChallenge,
    createCodeVerifier,
    getSessionCustomer,
    parseCookies,
    redirectWithError,
    requireAccountCustomer,
    requireCustomer,
    setAdminSessionCookie,
    setOAuthCookie,
    setSessionCookie,
  };
}
