import { useEffect, useState } from 'react';
import { api, type Product } from '@/api/client';
import { AccessoriesGrid } from '@/components/AccessoriesGrid';
import { t } from "@/lib/i18n";
export function AccessoriesHome() {
    const [items, setItems] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        api.getProducts('ACCESSORY')
            .then((data) => setItems(data))
            .finally(() => setLoading(false));
    }, []);
    return (<section className="py-20 bg-[#F5F1E8]">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="text-center mb-10">
          <span className="inline-block text-sm uppercase tracking-[3px] text-[var(--gold-antique)] font-medium mb-4">
            Accessoires
          </span>
          <h2 className="font-display text-4xl md:text-5xl text-[var(--sage-deep)] mb-4">{t("app.sections.accessories_home.essentiels_sublimer")} <span className="italic">{t("app.sections.accessories_home.your_ritual")}</span></h2>
          <p className="text-[var(--sage-deep)]/60 max-w-xl mx-auto">{t("app.sections.accessories_home.retrouvez_selection_accessoires")}</p>
          <div className="mt-4 flex justify-center">
            <a href="/accessoires" className="inline-flex items-center px-4 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-[var(--gold-antique)]/30 text-sm font-medium text-[var(--sage-deep)] tracking-wide transition-colors hover:bg-[var(--gold-antique)] hover:text-white">{t("app.sections.accessories_home.view_all_accessoires")}</a>
          </div>
        </div>

        <AccessoriesGrid items={items} loading={loading} maxItems={4}/>
      </div>
    </section>);
}
