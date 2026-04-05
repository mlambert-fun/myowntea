import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, type AdminLoginChallengeResponse } from '../api/client';
import { useAdminAuth } from '../auth';
import { t } from '../lib/i18n';

type LoginPhase = 'credentials' | 'totp' | 'setup_totp';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setAuthenticatedUser } = useAdminAuth();
  const redirectTarget = useMemo(() => {
    const from = (location.state as { from?: string } | null)?.from;
    return typeof from === 'string' && from.startsWith('/') ? from : '/';
  }, [location.state]);

  const [phase, setPhase] = useState<LoginPhase>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<AdminLoginChallengeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const challengeSetup = challenge?.setup ?? null;

  useEffect(() => {
    if (user) {
      navigate(redirectTarget, { replace: true });
    }
  }, [navigate, redirectTarget, user]);

  async function handleCredentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const response = await api.adminLogin(email, password);
      setChallenge(response);
      setCode('');
      setPhase(response.step);
      setInfo(
        response.step === 'setup_totp'
          ? t('admin.pages.login.setup_scan_instruction')
          : t('admin.pages.login.totp_instruction')
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.pages.login.login_failed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.verifyAdminCode(challenge.challengeId, code);
      setAuthenticatedUser(response.user);
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.pages.login.code_invalid'));
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(value: string, successMessage: string, failureMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      setInfo(successMessage);
      setError(null);
    } catch {
      setError(failureMessage);
    }
  }

  return (
    <div className="admin-auth-screen">
      <div className="admin-auth-card">
        <div className="admin-auth-intro">
          <p className="admin-auth-eyebrow">My Own Tea</p>
          <h1 className="admin-auth-title">{t('admin.pages.login.secure_access_title')}</h1>
          <p className="admin-auth-subtitle">{t('admin.pages.login.secure_access_subtitle')}</p>
        </div>

        {error && <div className="admin-auth-alert admin-auth-alert-error">{error}</div>}
        {info && <div className="admin-auth-alert admin-auth-alert-info">{info}</div>}

        {phase === 'credentials' && (
          <form className="admin-auth-form" onSubmit={handleCredentialsSubmit}>
            <div className="admin-auth-field">
              <label htmlFor="admin-email">{t('admin.pages.customer_detail.email')}</label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
                placeholder="admin@myowntea.com"
              />
            </div>

            <div className="admin-auth-field">
              <label htmlFor="admin-password">{t('admin.pages.login.password')}</label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                placeholder={t('admin.pages.login.password_placeholder')}
              />
            </div>

            <button className="admin-btn admin-btn-primary admin-auth-submit" type="submit" disabled={loading}>
              {loading ? t('admin.pages.login.checking') : t('admin.pages.login.continue')}
            </button>
          </form>
        )}

        {(phase === 'totp' || phase === 'setup_totp') && challenge && (
          <div className="admin-auth-step">
            {phase === 'setup_totp' && challengeSetup && (
              <div className="admin-auth-setup">
                <div className="admin-auth-setup-header">
                  <h2>{t('admin.pages.login.setup_title')}</h2>
                  <p>
                    {t('admin.pages.login.issuer_label')}: <strong>{challengeSetup.issuer}</strong>
                  </p>
                </div>

                <div className="admin-auth-secret-block">
                  <span className="admin-auth-secret-label">{t('admin.pages.login.manual_key')}</span>
                  <code>{challengeSetup.manualEntryKey}</code>
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary"
                    onClick={() =>
                      void copyToClipboard(
                        challengeSetup.manualEntryKey,
                        t('admin.pages.login.copy_secret_success'),
                        t('admin.pages.login.copy_secret_failed')
                      )
                    }
                  >
                    {t('admin.pages.login.copy_secret')}
                  </button>
                </div>

                <div className="admin-auth-secret-block">
                  <span className="admin-auth-secret-label">{t('admin.pages.login.otpauth_uri')}</span>
                  <textarea
                    readOnly
                    value={challengeSetup.otpauthUrl}
                    rows={3}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary"
                    onClick={() =>
                      void copyToClipboard(
                        challengeSetup.otpauthUrl,
                        t('admin.pages.login.copy_uri_success'),
                        t('admin.pages.login.copy_uri_failed')
                      )
                    }
                  >
                    {t('admin.pages.login.copy_uri')}
                  </button>
                </div>

                <p className="admin-auth-helper">{t('admin.pages.login.scan_helper')}</p>
              </div>
            )}

            <form className="admin-auth-form" onSubmit={handleCodeSubmit}>
              <div className="admin-auth-field">
                <label htmlFor="admin-code">{t('admin.pages.login.code_label')}</label>
                <input
                  id="admin-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D+/g, '').slice(0, 6))}
                  required
                  placeholder="123456"
                />
              </div>

              <div className="admin-auth-actions">
                <button className="admin-btn admin-btn-primary admin-auth-submit" type="submit" disabled={loading}>
                  {loading ? t('admin.pages.login.validating') : t('admin.pages.login.validate_code')}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => {
                    setPhase('credentials');
                    setChallenge(null);
                    setCode('');
                    setInfo(null);
                    setError(null);
                  }}
                  disabled={loading}
                >
                  {t('admin.pages.login.start_over')}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
