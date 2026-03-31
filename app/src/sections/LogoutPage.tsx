import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';
import { t } from "@/lib/i18n";
export default function LogoutPage() {
    const [secondsLeft, setSecondsLeft] = useState(5);
    const navigate = useNavigate();
    useEffect(() => {
        const interval = window.setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev <= 1) {
                    window.clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => window.clearInterval(interval);
    }, []);
    useEffect(() => {
        if (secondsLeft === 0) {
            navigate('/');
        }
    }, [secondsLeft, navigate]);
    return (<div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />
      <main className="pt-28 pb-16">
        <div className="relative mx-auto max-w-3xl px-6">
          <PageBreadcrumb />
          <div className="absolute -top-10 right-8 h-24 w-24 rounded-full bg-[var(--sage-deep)]/10 blur-2xl"/>
          <div className="absolute -bottom-8 left-4 h-20 w-20 rounded-full bg-[var(--gold-antique)]/20 blur-2xl"/>
          <div className="relative overflow-hidden rounded-2xl border border-[#EEE6D8] bg-white/90 p-10 shadow-xl">
            <div className="flex flex-col items-start gap-4">
              <span className="inline-flex items-center rounded-full bg-[var(--sage-deep)]/10 px-4 py-2 text-xs uppercase tracking-[0.22em] text-[var(--sage-deep)]">{t("app.sections.logout_page.session_terminee")}</span>
              <h1 className="font-display text-3xl text-[var(--sage-deep)]">{t("app.sections.logout_page.vous_etes_deconnecte")}</h1>
              <p className="text-base text-[var(--sage-deep)]/70">{t("app.sections.logout_page.vous_allez_redirige")}{' '}
                <span className="font-semibold text-[var(--gold-antique)]">{secondsLeft}</span> seconde
                {secondsLeft > 1 ? 's' : ''}.
              </p>
              <button type="button" onClick={() => navigate('/')} className="mt-2 inline-flex items-center justify-center rounded-full border border-[var(--sage-deep)] px-5 py-2 text-sm font-medium text-[var(--sage-deep)] transition hover:border-[var(--gold-antique)] hover:text-[var(--gold-antique)]">{t("app.sections.logout_page.revenir_apos_home")}</button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>);
}

