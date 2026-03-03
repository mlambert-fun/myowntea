import { useEffect, useMemo, useState } from 'react';
import { api, type Product } from '@/api/client';
import { useBlend } from '@/context/BlendContext';
import { InlineLoading } from '@/components/ui/loading-state';

const MAX_ACCESSORIES = 3;
const ACCESSORY_CACHE_TTL_MS = 30 * 60 * 1000;
let accessoryCache: { items: AccessoryCard[]; timestamp: number } | null = null;
let accessoryPromise: Promise<AccessoryCard[]> | null = null;

type AccessoryCard = {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  image: string;
  variantId?: string;
  productId?: string;
  selectedOptions: Array<{ name: string; value: string }>;
};

export function CartDrawerAccessories() {
  const { addVariantToCart } = useBlend();
  const [items, setItems] = useState<AccessoryCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const now = Date.now();
    const cached = accessoryCache && now - accessoryCache.timestamp < ACCESSORY_CACHE_TTL_MS
      ? accessoryCache.items
      : null;

    if (cached && cached.length > 0) {
      setItems(cached);
      setLoading(false);
    }

    if (!accessoryPromise) {
      accessoryPromise = api.getProducts('ACCESSORY')
        .then((products) => {
          const cards = (products || [])
            .flatMap((product: Product) => {
              const variant = product.defaultVariant || product.variants?.[0];
              const image = variant?.imageUrl || product.images?.[0] || '/assets/misc/ingredient_placeholder.png';
              const selectedOptions = (variant?.optionValues || []).map((value) => ({
                name: value.optionName || 'Option',
                value: value.value,
              }));
              return [{
                id: product.id,
                name: product.title,
                slug: product.slug,
                priceCents: variant?.priceCents ?? product.priceCents ?? 0,
                image,
                variantId: variant?.id,
                productId: variant ? undefined : product.id,
                selectedOptions,
              }];
            })
            .sort(() => Math.random() - 0.5)
            .slice(0, MAX_ACCESSORIES);
          accessoryCache = { items: cards, timestamp: Date.now() };
          return cards;
        })
        .finally(() => {
          accessoryPromise = null;
        });
    }

    accessoryPromise
      .then((cards) => {
        if (!mounted) return;
        setItems(cards);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const hasItems = items.length > 0;
  const title = useMemo(() => (
    hasItems
      ? 'Des accessoires uniques pour accompagner votre dégustation'
      : 'Aucun accessoire disponible pour le moment'
  ), [hasItems]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-[var(--sage-deep)]">
          {title}
        </h4>
      </div>
      {loading ? (
        <InlineLoading label="Chargement des accessoires..." textClassName="text-xs text-[var(--sage-deep)]/60" />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
          {items.map((item) => (
            <div
              key={item.id}
              className="min-w-[180px] max-w-[180px] snap-start rounded-2xl border border-[#EEE6D8] bg-white p-3 flex flex-col"
            >
              <div
                className="h-44 w-full overflow-hidden rounded-xl bg-[#F3F1EE] mb-3 cursor-pointer"
                onClick={() => {
                  window.location.href = `/accessoires/${item.slug}`;
                }}
              >
                <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
              </div>
              <div className="flex-1">
                <div
                  className="text-sm font-medium text-[var(--sage-deep)] line-clamp-2 cursor-pointer"
                  onClick={() => {
                    window.location.href = `/accessoires/${item.slug}`;
                  }}
                >
                  {item.name}
                </div>
                <div className="text-xs text-[var(--gold-antique)] mt-1">{(item.priceCents / 100).toFixed(2)} €</div>
              </div>
              <button
                className="mt-3 w-full btn-secondary text-xs py-2"
                onClick={() => addVariantToCart({
                  variantId: item.variantId,
                  productId: item.productId,
                  name: item.name,
                  priceCents: item.priceCents,
                  imageUrl: item.image,
                  selectedOptions: item.selectedOptions,
                })}
              >
                Ajouter
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
