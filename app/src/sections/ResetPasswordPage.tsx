import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';
import { api } from '@/api/client';
import { t } from "@/lib/i18n";
export default function ResetPasswordPage() {
    const location = useLocation();
    const token = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return params.get('token') || '';
    }, [location.search]);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [checkingToken, setCheckingToken] = useState(true);
    const [tokenValid, setTokenValid] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    useEffect(() => {
        let mounted = true;
        const checkToken = async () => {
            if (!token) {
                if (mounted) {
                    setTokenValid(false);
                    setCheckingToken(false);
                    setError(t("app.sections.reset_password_page.link_invalid_please"));
                }
                return;
            }
            try {
                setCheckingToken(true);
                const response = await api.validateResetPasswordToken(token);
                if (!mounted)
                    return;
                if (response.valid) {
                    setTokenValid(true);
                    setError(null);
                }
                else {
                    setTokenValid(false);
                    setError(t("app.sections.reset_password_page.link_reinitialisation_invalid"));
                }
            }
            catch {
                if (!mounted)
                    return;
                setTokenValid(false);
                setError(t("app.sections.reset_password_page.failed_verifier_link"));
            }
            finally {
                if (mounted)
                    setCheckingToken(false);
            }
        };
        checkToken();
        return () => {
            mounted = false;
        };
    }, [token]);
    return (<div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />
      <main className="pt-28 pb-16">
        <div className="mx-auto max-w-md px-6">
          <PageBreadcrumb />
          <div className="rounded-2xl bg-white p-8 shadow">
            <h2 className="mb-2 font-display text-2xl text-[var(--sage-deep)]">{t("app.sections.reset_password_page.new_password")}</h2>
            <p className="mb-6 text-sm text-[var(--sage-deep)]/60">{t("app.sections.reset_password_page.choisissez_new_password")}</p>

            {checkingToken && <div className="mb-4 text-sm text-[var(--sage-deep)]/70">{t("app.sections.reset_password_page.verification_link")}</div>}
            {error && <div className="mb-4 text-sm text-red-600">{error}</div>}
            {success && (<div className="mb-4 rounded-xl border border-[#E5E0D5] bg-[#FBF8F2] p-3 text-sm text-[var(--sage-deep)]/80">
                {success}
              </div>)}

            {!checkingToken && tokenValid && !success && (<form className="space-y-4" onSubmit={async (event) => {
                event.preventDefault();
                setError(null);
                if (newPassword.length < 8) {
                    setError(t("app.sections.reset_password_page.password_must_contenir"));
                    return;
                }
                if (newPassword !== confirmPassword) {
                    setError(t("app.sections.reset_password_page.mots_password_correspondent"));
                    return;
                }
                setLoading(true);
                try {
                    await api.resetPassword({ token, newPassword });
                    setSuccess(t("app.sections.reset_password_page.password_summer_reinitialise"));
                    setNewPassword('');
                    setConfirmPassword('');
                }
                catch (requestError: any) {
                    const message = requestError?.message || t("app.sections.reset_password_page.failed_reset_password");
                    setError(message);
                }
                finally {
                    setLoading(false);
                }
            }}>
                <input type="password" required placeholder={t("app.sections.reset_password_page.new_password")} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="input-elegant w-full"/>
                <input type="password" required placeholder={t("app.sections.reset_password_page.confirmer_password")} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="input-elegant w-full"/>
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? 'Validation...' : t("app.sections.reset_password_page.mettre_day_password")}
                </button>
              </form>)}

            <div className="mt-4 text-xs text-[var(--sage-deep)]/60">{t("app.sections.reset_password_page.back")}{' '}
              <button className="underline" onClick={() => (window.location.href = '/login')}>{t("app.sections.reset_password_page.login")}</button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>);
}

