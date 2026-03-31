import { Footer } from '@/sections/Footer';
import { Navigation } from '@/sections/Navigation';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';
import { t } from '@/lib/i18n';

const resolveOAuthErrorMessage = (code: string | null) => {
  switch ((code || '').trim()) {
    case 'google_oauth_not_configured':
      return t('app.sections.login_error_page.google_oauth_not_configured');
    case 'invalid_oauth_state':
      return t('app.sections.login_error_page.invalid_oauth_state');
    case 'oauth_token_failed':
      return t('app.sections.login_error_page.oauth_token_failed');
    case 'oauth_userinfo_failed':
      return t('app.sections.login_error_page.oauth_userinfo_failed');
    case 'google_account_conflict':
      return t('app.sections.login_error_page.google_account_conflict');
    case 'oauth_failed':
      return t('app.sections.login_error_page.oauth_failed');
    default:
      return t('app.sections.login_error_page.default_message');
  }
};

export default function LoginErrorPage() {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const code = params.get('code');
  const message = resolveOAuthErrorMessage(code);

  return (
    <div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />
      <main className="pt-28 pb-16">
        <div className="mx-auto max-w-3xl px-6">
          <PageBreadcrumb />
          <div className="rounded-[2rem] border border-[#E6DCC8] bg-white p-8 shadow-sm">
            <p className="text-xs uppercase tracking-[0.26em] text-[var(--gold-antique)]">
              {t('app.sections.login_error_page.kicker')}
            </p>
            <h1 className="mt-3 font-display text-4xl text-[var(--sage-deep)]">
              {t('app.sections.login_error_page.title')}
            </h1>
            <p className="mt-4 text-base leading-7 text-[var(--sage-deep)]/75">{message}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/login"
                className="inline-flex rounded-full bg-[var(--sage-deep)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#294239]"
              >
                {t('app.sections.login_error_page.back_to_login')}
              </a>
              <a
                href="/contact"
                className="inline-flex rounded-full border border-[var(--gold-antique)] px-5 py-3 text-sm font-semibold text-[var(--gold-antique)] transition hover:bg-[var(--cream-apothecary)]"
              >
                {t('app.sections.login_error_page.contact_us')}
              </a>
            </div>

            {code && (
              <p className="mt-6 text-xs text-[var(--sage-deep)]/45">
                {t('app.sections.login_error_page.error_code', undefined, { code })}
              </p>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
