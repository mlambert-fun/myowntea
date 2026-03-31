import { useEffect, useState } from 'react';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { api, type Product } from '@/api/client';
import { AccessoriesGrid } from '@/components/AccessoriesGrid';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';
import { t } from "@/lib/i18n";
export default function AccessoriesPage() {
    const [items, setItems] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        api.getProducts('ACCESSORY')
            .then((data) => setItems(data))
            .finally(() => setLoading(false));
    }, []);
    return (<div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />
      <main className="pt-28 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          <PageBreadcrumb />
          <div className="mb-8">
            <h2 className="font-display text-3xl text-[var(--sage-deep)]">Accessoires</h2>
            <p className="text-sm text-[var(--sage-deep)]/60">{t("app.sections.accessories_page.completez_degustation_essentiels")}</p>
          </div>
          <AccessoriesGrid items={items} loading={loading}/>
        </div>
      </main>
      <Footer />
    </div>);
}

