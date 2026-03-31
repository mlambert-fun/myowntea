import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { getRedirectGeoContext } from '@/lib/locale-market';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';
import { t } from "@/lib/i18n";
const REDIRECT_SEED_KEY = 'mot_redirect_seed';
const getRedirectSeed = () => {
    const existing = localStorage.getItem(REDIRECT_SEED_KEY);
    if (existing && existing.trim().length > 0)
        return existing;
    const generated = `seed-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    localStorage.setItem(REDIRECT_SEED_KEY, generated);
    return generated;
};
export default function NotFoundPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const [isResolvingRedirect, setIsResolvingRedirect] = useState(true);
    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            try {
                const path = `${location.pathname}${location.search}`;
                const redirectContext = getRedirectGeoContext();
                const seed = getRedirectSeed();
                const decision = await api.resolveRedirect({
                    path,
                    locale: redirectContext.locale || undefined,
                    countryCode: redirectContext.countryCode || undefined,
                    seed,
                });
                if (cancelled)
                    return;
                if (decision?.matched && decision.targetPath) {
                    if (/^https?:\/\//i.test(decision.targetPath)) {
                        window.location.assign(decision.targetPath);
                        return;
                    }
                    if (decision.targetPath !== path) {
                        navigate(decision.targetPath, { replace: true });
                        return;
                    }
                }
            }
            catch {
                // Silent fail: fallback to 404 content.
            }
            finally {
                if (!cancelled) {
                    setIsResolvingRedirect(false);
                }
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [location.pathname, location.search, navigate]);
    return (<div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />

      <main className="pt-28 pb-12">
        <section className="max-w-3xl mx-auto px-6">
          <PageBreadcrumb />
          <div className="bg-white rounded-2xl shadow p-8 sm:p-10 text-center">
            {isResolvingRedirect ? (<p className="text-[var(--sage-deep)]/70">{t("app.sections.not_found_page.verification_redirect")}</p>) : (<>
                <div className="font-display text-6xl sm:text-7xl text-[var(--sage-deep)] leading-none">404</div>
                <h1 className="font-display text-3xl text-[var(--sage-deep)] mt-4">Page introuvable</h1>
                <p className="text-[var(--sage-deep)]/70 mt-3">{t("app.sections.not_found_page.contenu_demande_apos")}</p>

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link to="/" className="btn-primary w-full sm:w-auto">{t("app.sections.not_found_page.back_apos_home")}</Link>
                  <Link to="/?a=creator" className="btn-secondary w-full sm:w-auto">{t("app.sections.not_found_page.create_my_melange")}</Link>
                </div>
              </>)}
          </div>
        </section>
      </main>

      <Footer />
    </div>);
}
