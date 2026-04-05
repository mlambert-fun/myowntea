// @ts-nocheck
export function createEmailLinkService({
  API_BASE_URL,
  EMAIL_UNSUBSCRIBE_SECRET,
  RESET_PASSWORD_URL_BASE,
  crypto,
  toNonEmptyStringOrNull,
}) {
  const toBase64Url = (value) =>
    Buffer.from(String(value || ''), 'utf8').toString('base64url');

  const fromBase64Url = (value) => {
    try {
      return Buffer.from(String(value || ''), 'base64url').toString('utf8');
    } catch {
      return null;
    }
  };

  const buildUnsubscribeToken = (customerId, email) => {
    const payload = `${customerId}.${email}`;
    const signature = crypto
      .createHmac('sha256', EMAIL_UNSUBSCRIBE_SECRET)
      .update(payload)
      .digest('base64url');
    return `${customerId}.${toBase64Url(email).trim()}.${signature}`;
  };

  const verifyUnsubscribeToken = (token) => {
    const raw = toNonEmptyStringOrNull(token);
    if (!raw) {
      return null;
    }
    const [customerId, encodedEmail, signature] = raw.split('.');
    if (!customerId || !encodedEmail || !signature) {
      return null;
    }
    const email = fromBase64Url(encodedEmail);
    if (!email) {
      return null;
    }
    const expected = buildUnsubscribeToken(customerId, email).split('.')[2];
    if (signature !== expected) {
      return null;
    }
    return { customerId, email };
  };

  const buildUnsubscribeUrl = (customerId, email) => {
    if (!customerId || !email) {
      return null;
    }
    const token = buildUnsubscribeToken(customerId, email);
    const base = `${API_BASE_URL}/api/email/unsubscribe`;
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}unsubscribe=${encodeURIComponent(token)}`;
  };

  const resolveResetPasswordUrl = (token) =>
    `${RESET_PASSWORD_URL_BASE}?token=${encodeURIComponent(token)}`;

  const hashPasswordResetToken = (token) =>
    crypto.createHash('sha256').update(token).digest('hex');

  return {
    buildUnsubscribeUrl,
    hashPasswordResetToken,
    resolveResetPasswordUrl,
    verifyUnsubscribeToken,
  };
}
