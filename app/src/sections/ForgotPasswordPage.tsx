import { useState } from 'react';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';
import { api } from '@/api/client';
import { t } from "@/lib/i18n";
export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    return (<div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />
      <main className="pt-28 pb-16">
        <div className="mx-auto max-w-md px-6">
          <PageBreadcrumb />
          <div className="rounded-2xl bg-white p-8 shadow">
            <h2 className="mb-2 font-display text-2xl text-[var(--sage-deep)]">{t("app.sections.forgot_password_page.password_oublie")}</h2>
            <p className="mb-6 text-sm text-[var(--sage-deep)]/60">{t("app.sections.forgot_password_page.saisissez_email_recevoir")}</p>

            {error && <div className="mb-4 text-sm text-red-600">{error}</div>}
            {successMessage && (<div className="mb-4 rounded-xl border border-[#E5E0D5] bg-[#FBF8F2] p-3 text-sm text-[var(--sage-deep)]/80">
                {successMessage}
              </div>)}

            <form className="space-y-4" onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setSuccessMessage(null);
            const normalizedEmail = email.trim();
            if (!normalizedEmail) {
                setError(t("app.sections.forgot_password_page.please_enter_email"));
                return;
            }
            setLoading(true);
            try {
                const response = await api.forgotPassword({ email: normalizedEmail });
                setSuccessMessage(response.message || t("app.sections.forgot_password_page.account_existe_email"));
            }
            catch {
                setError(t("app.sections.forgot_password_page.failed_envoyer_email"));
            }
            finally {
                setLoading(false);
            }
        }}>
              <input type={t("app.sections.forgot_password_page.email")} required placeholder={t("app.sections.forgot_password_page.email_2")} value={email} onChange={(event) => setEmail(event.target.value)} className="input-elegant w-full"/>
              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? 'Envoi...' : t("app.sections.forgot_password_page.envoyer_link")}
              </button>
            </form>

            <div className="mt-4 text-xs text-[var(--sage-deep)]/60">{t("app.sections.forgot_password_page.back")}{' '}
              <button className="underline" onClick={() => (window.location.href = '/login')}>{t("app.sections.forgot_password_page.login")}</button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>);
}

