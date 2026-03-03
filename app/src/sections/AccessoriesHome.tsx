import { useEffect, useState } from 'react';
import { api, type Product } from '@/api/client';
import { AccessoriesGrid } from '@/components/AccessoriesGrid';

export function AccessoriesHome() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProducts('ACCESSORY')
      .then((data) => setItems(data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section id="accessoires" className="py-20 bg-[#F5F1E8]">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="text-center mb-10">
          <span className="inline-block text-sm uppercase tracking-[3px] text-[var(--gold-antique)] font-medium mb-4">
            Accessoires
          </span>
          <h2 className="font-display text-4xl md:text-5xl text-[var(--sage-deep)] mb-4">
            Des essentiels pour sublimer votre rituel
          </h2>
          <p className="text-[var(--sage-deep)]/60 max-w-xl mx-auto">
            Retrouvez une sélection d’accessoires pour accompagner vos créations.
          </p>
          <div className="mt-4 flex justify-center">
            <a
              href="/accessoires"
              className="inline-flex items-center px-4 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-[var(--gold-antique)]/30 text-sm font-medium text-[var(--sage-deep)] tracking-wide transition-colors hover:bg-[var(--gold-antique)] hover:text-white"
            >
              Voir tous les accessoires
            </a>
          </div>
        </div>

        <AccessoriesGrid items={items} loading={loading} />
      </div>
    </section>
  );
}
