import { Navigation } from '@/sections/Navigation';
import { Footer } from '@/sections/Footer';
import { Link } from 'react-router-dom';
import { t } from "@/lib/i18n";
export default function MaintenancePage() {
    return (<div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />
      <main className="pt-28 pb-16">
        <div className="mx-auto max-w-3xl px-6">
          <section className="rounded-3xl border border-[#E5E0D5] bg-white p-8 shadow-[0_18px_40px_rgba(45,62,54,0.10)] sm:p-12">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--gold-antique)]/20 text-[var(--sage-deep)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 9v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 3c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className="mt-5 font-display text-3xl text-[var(--sage-deep)] sm:text-4xl">Maintenance en cours</h1>
            <p className="mt-4 text-sm leading-7 text-[var(--sage-deep)]/75 sm:text-base">{t("app.sections.maintenance_page.nous_effectuons_update")}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/" className="inline-flex items-center justify-center rounded-xl bg-[var(--sage-deep)] px-5 py-3 text-sm font-medium text-white transition hover:brightness-110">{t("app.sections.maintenance_page.back_apos_home")}</Link>
              <Link to="/contact" className="inline-flex items-center justify-center rounded-xl border border-[var(--sage-deep)]/20 bg-white px-5 py-3 text-sm font-medium text-[var(--sage-deep)] transition hover:bg-[var(--sage-deep)]/5">{t("app.sections.maintenance_page.contacter_support")}</Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>);
}

