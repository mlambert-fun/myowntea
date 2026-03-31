import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { useAuth } from '@/context/AuthContext';
import { t } from "@/lib/i18n";
export default function AccountPage() {
    const { customer } = useAuth();
    return (<div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />
      <main className="pt-28 pb-16">
        <div className="max-w-3xl mx-auto px-6">
          <div className="bg-white rounded-2xl p-8 shadow">
            <h2 className="font-display text-2xl text-[var(--sage-deep)] mb-2">{t("app.sections.account_page.my_account")}</h2>
            <p className="text-sm text-[var(--sage-deep)]/60 mb-6">
              Bienvenue {customer?.firstName || customer?.email || 'Client'}.
            </p>
            <div className="text-sm text-[var(--sage-deep)] space-y-1">
              <div>{t("app.sections.account_page.email")}{customer?.email || '—'}</div>
              <div>{t("app.sections.account_page.first_name")}{customer?.firstName || '—'}</div>
              <div>Nom: {customer?.lastName || '—'}</div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>);
}

