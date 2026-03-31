import { useState } from 'react';
import { PhoneField } from '@/components/forms/PhoneField';
import { DEFAULT_LOCALE_MARKET, readLocaleMarketPreference } from '@/lib/locale-market';
import { isValidPhoneE164 } from '@/lib/phone';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { useAuth } from '@/context/AuthContext';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';
import { t } from "@/lib/i18n";
export default function RegisterPage() {
    const { register, customer } = useAuth();
    const [salutation, setSalutation] = useState<'MME' | 'MR' | ''>('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [phoneE164, setPhoneE164] = useState('');
    const [marketingEmailsOptIn, setMarketingEmailsOptIn] = useState(false);
    const [reminderEmailsOptIn, setReminderEmailsOptIn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const defaultPhoneCountryCode = readLocaleMarketPreference()?.countryCode || DEFAULT_LOCALE_MARKET.countryCode;
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    const validateForm = () => {
        if (!salutation)
            return t("app.sections.register_page.please_select_title");
        if (!firstName.trim() || !lastName.trim())
            return t("app.sections.register_page.please_enter_first_name");
        if (!email.trim() || !password)
            return t("app.sections.register_page.email_password_required");
        if (password.length < 8)
            return t("app.sections.register_page.password_must_contenir");
        if (phoneE164 && !isValidPhoneE164(phoneE164)) {
            return t("app.sections.register_page.format_attendu_phone");
        }
        return null;
    };
    return (<div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />
      <main className="pt-28 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          <PageBreadcrumb />
          <div className="bg-white rounded-2xl p-8 shadow">
            <h2 className="font-display text-2xl text-[var(--sage-deep)] mb-2">{t("app.sections.register_page.create_account")}</h2>
            <p className="text-sm text-[var(--sage-deep)]/60 mb-6">{t("app.sections.register_page.enregistrez_espace_customer")}</p>

            {error && <div className="text-sm text-red-600 mb-4">{error}</div>}

            <form onSubmit={async (e) => {
            e.preventDefault();
            const validationError = validateForm();
            if (validationError) {
                setError(validationError);
                return;
            }
            setLoading(true);
            setError(null);
            try {
                await register({
                    email,
                    password,
                    salutation: salutation || null,
                    firstName,
                    lastName,
                    birthDate: birthDate || null,
                    phoneE164: phoneE164 || null,
                    marketingEmailsOptIn,
                    reminderEmailsOptIn,
                });
                window.location.href = '/';
            }
            catch {
                setError(t("app.sections.register_page.failed_create_account"));
            }
            finally {
                setLoading(false);
            }
        }} className="space-y-4">
              <div>
                <p className="text-sm font-medium text-[var(--sage-deep)]">{t("app.sections.register_page.title")}</p>
                <div className="mt-2 flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" value="MME" checked={salutation === 'MME'} onChange={() => setSalutation('MME')}/>
                    Mme
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" value="MR" checked={salutation === 'MR'} onChange={() => setSalutation('MR')}/>
                    M.
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder={t("app.sections.register_page.first_name")} value={firstName} onChange={(e) => setFirstName(e.target.value)} className="input-elegant w-full"/>
                <input type="text" placeholder="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} className="input-elegant w-full"/>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input type="date" placeholder={t("app.sections.register_page.date_naissance")} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="input-elegant w-full"/>
                <PhoneField value={phoneE164} onChange={setPhoneE164} autoCountryCode={defaultPhoneCountryCode} searchPlaceholder={t("app.sections.register_page.phone_country_search", 'Rechercher un pays ou un indicatif')} emptyLabel={t("app.sections.register_page.phone_country_empty", 'Aucun indicatif trouvé.')} placeholderFallback={t("app.sections.register_page.phone_local_placeholder", '6 12 34 56 78')}/>
              </div>

              <input type={t("app.sections.register_page.email")} required placeholder={t("app.sections.register_page.email_2")} value={email} onChange={(e) => setEmail(e.target.value)} className="input-elegant w-full"/>

              <input type="password" required placeholder={t("app.sections.register_page.password")} value={password} onChange={(e) => setPassword(e.target.value)} className="input-elegant w-full"/>

              <div className="space-y-2 rounded-xl border border-[#EEE6D8] bg-[#FBF8F2] p-3">
                <label className="flex items-start gap-2 text-sm text-[var(--sage-deep)]">
                  <input type="checkbox" checked={marketingEmailsOptIn} onChange={(e) => setMarketingEmailsOptIn(e.target.checked)} className="mt-0.5"/>
                  <span>{t("app.sections.register_page.souhaite_recevoir_emails_2")}</span>
                </label>
                <label className="flex items-start gap-2 text-sm text-[var(--sage-deep)]">
                  <input type="checkbox" checked={reminderEmailsOptIn} onChange={(e) => setReminderEmailsOptIn(e.target.checked)} className="mt-0.5"/>
                  <span>{t("app.sections.register_page.souhaite_recevoir_emails")}</span>
                </label>
              </div>

              <button className="w-full btn-primary" disabled={loading}>
                {loading ? t("app.sections.register_page.blend") : t("app.sections.register_page.create_my_account")}
              </button>
            </form>

            {!customer?.email && (<div className="mt-4">
                <button type="button" onClick={() => {
                window.location.href = `${apiBaseUrl}/auth/google/start`;
            }} className="w-full btn-secondary flex items-center justify-center gap-2">
                  <span className="inline-flex h-4 w-4 items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.62l6.85-6.85C35.9 2.44 30.36 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.5 13.08 17.77 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.14-3.08-.4-4.55H24v9.02h12.94c-.58 3.12-2.32 5.77-4.94 7.56l7.56 5.87C44.09 37.98 46.98 31.79 46.98 24.55z"/>
                      <path fill="#FBBC05" d="M10.54 28.59c-.48-1.42-.76-2.94-.76-4.59s.27-3.17.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.98-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.36 0 11.7-2.1 15.6-5.7l-7.56-5.87c-2.1 1.41-4.79 2.25-8.04 2.25-6.23 0-11.5-3.58-13.46-8.69l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                  </span>{t("app.sections.register_page.continue_with_google")}</button>
              </div>)}

            <div className="text-xs text-[var(--sage-deep)]/60 mt-4">{t("app.sections.register_page.deja_inscrit")}{' '}
              <button className="underline" onClick={() => (window.location.href = '/login')}>
                {t("app.sections.register_page.login_cta")}
              </button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>);
}
