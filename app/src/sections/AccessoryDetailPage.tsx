import { useEffect, useState } from 'react';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { api, type Product, type ProductVariant } from '@/api/client';
import { useBlend } from '@/context/BlendContext';
import { DataLoadingState } from '@/components/ui/loading-state';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';

const getSlugFromPath = () => {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[1] || '';
};

export default function AccessoryDetailPage() {
  const [item, setItem] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const { addVariantToCart } = useBlend();
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [zoomOrigin, setZoomOrigin] = useState('50% 50%');
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const getPriceDisplay = (product: Product, variant: ProductVariant | null) => {
    const prices = (product.variants || [])
      .map((v) => v.priceCents)
      .filter((price) => typeof price === 'number');
    if (prices.length > 1) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      if (min !== max) {
        return `à partir de ${(min / 100).toFixed(2)} €`;
      }
    }
    if (variant) {
      return `${(variant.priceCents / 100).toFixed(2)} €`;
    }
    if (typeof product.priceCents === 'number') {
      return `${(product.priceCents / 100).toFixed(2)} €`;
    }
    return '—';
  };

  const handleZoomMove = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setZoomOrigin(`${x}% ${y}%`);
  };

  const handleZoomLeave = () => {
    setZoomOrigin('50% 50%');
  };

  const productImages = (() => {
    const urls = new Set<string>();
    if (selectedVariant?.imageUrl) urls.add(selectedVariant.imageUrl);
    if (item?.defaultVariant?.imageUrl) urls.add(item.defaultVariant.imageUrl);
    (item?.variants || []).forEach((variant) => {
      if (variant.imageUrl) urls.add(variant.imageUrl);
    });
    (item?.images || []).forEach((imageUrl) => {
      if (imageUrl) urls.add(imageUrl);
    });
    if (urls.size === 0) urls.add('/assets/misc/ingredient_placeholder.png');
    return Array.from(urls);
  })();

  const openLightbox = () => {
    const currentUrl =
      selectedVariant?.imageUrl ||
      item?.defaultVariant?.imageUrl ||
      item?.images?.[0] ||
      '/assets/misc/ingredient_placeholder.png';
    const index = Math.max(0, productImages.indexOf(currentUrl));
    setLightboxIndex(index);
    setIsLightboxOpen(true);
  };

  const handleNextImage = () => {
    if (productImages.length <= 1) return;
    setLightboxIndex((prev) => (prev + 1) % productImages.length);
  };

  const handlePrevImage = () => {
    if (productImages.length <= 1) return;
    setLightboxIndex((prev) => (prev - 1 + productImages.length) % productImages.length);
  };

  useEffect(() => {
    const slug = getSlugFromPath();
    api.getProduct(slug)
      .then((data) => setItem(data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!item?.options || item.options.length === 0) {
      setSelectedOptions({});
      return;
    }
    const defaults: Record<string, string> = {};
    item.options.forEach((option) => {
      if (option.values && option.values.length > 0) {
        defaults[option.id] = option.values[0].id;
      }
    });
    setSelectedOptions(defaults);
  }, [item]);

  useEffect(() => {
    if (!item) {
      setSelectedVariant(null);
      return;
    }
    const variants = item.variants || [];
    if (variants.length === 0) {
      setSelectedVariant(null);
      return;
    }

    if (!item.options || item.options.length === 0) {
      setSelectedVariant(item.defaultVariant || variants[0] || null);
      return;
    }

    const matching = variants.find((variant) => {
      const optionValues = variant.optionValues || [];
      return item.options!.every((option) => {
        const selectedValueId = selectedOptions[option.id];
        if (!selectedValueId) return false;
        return optionValues.some(
          (value) => value.optionId === option.id && value.id === selectedValueId
        );
      });
    });
    setSelectedVariant(matching || item.defaultVariant || variants[0] || null);
  }, [item, selectedOptions]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!isLightboxOpen) return;
      if (event.key === 'Escape') setIsLightboxOpen(false);
      if (event.key === 'ArrowRight') handleNextImage();
      if (event.key === 'ArrowLeft') handlePrevImage();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isLightboxOpen, productImages.length]);

  return (
    <div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />
      <main className="pt-28 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <PageBreadcrumb />
          {loading ? (
            <DataLoadingState size="sm" className="py-8" titleClassName="text-sm text-[var(--sage-deep)]/60" />
          ) : !item ? (
            <div className="text-sm text-[var(--sage-deep)]/60">Produit introuvable.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-8 bg-white rounded-2xl shadow overflow-hidden">
              <div className="space-y-3">
                <button
                  type="button"
                  className="h-[fit-content] bg-[#F3F1EE] overflow-hidden group cursor-zoom-in w-full"
                  onMouseMove={handleZoomMove}
                  onMouseLeave={handleZoomLeave}
                  onClick={openLightbox}
                  aria-label="Ouvrir la galerie"
                >
                  <img
                    src={
                      selectedVariant?.imageUrl ||
                      item.defaultVariant?.imageUrl ||
                      item.images?.[0] ||
                      '/assets/misc/ingredient_placeholder.png'
                    }
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-150"
                    style={{ transformOrigin: zoomOrigin }}
                  />
                </button>
                {productImages.length > 1 && (
                  <div className="flex flex-wrap gap-3 p-8 -pt-0">
                    {productImages
                      .filter(
                        (imageUrl) =>
                          imageUrl !==
                          (selectedVariant?.imageUrl ||
                            item.defaultVariant?.imageUrl ||
                            item.images?.[0] ||
                            '/assets/misc/ingredient_placeholder.png')
                      )
                      .map((imageUrl) => (
                      <button
                        key={imageUrl}
                        type="button"
                        className={`h-16 w-16 rounded-xl overflow-hidden border transition ${
                          'border-[var(--border)] hover:border-[var(--gold-antique)]'
                        }`}
                        onClick={() => {
                          const targetIndex = productImages.indexOf(imageUrl);
                          setLightboxIndex(targetIndex >= 0 ? targetIndex : 0);
                          setIsLightboxOpen(true);
                        }}
                        aria-label="Voir l'image"
                      >
                        <img src={imageUrl} alt={item.title} className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-4 p-8">
                <h2 className="font-display text-3xl text-[var(--sage-deep)]">{item.title}</h2>
                <p className="text-sm text-[var(--sage-deep)]/60">{item.description}</p>
                <div className="font-display text-2xl text-[var(--gold-antique)]">
                  {getPriceDisplay(item, selectedVariant)}
                </div>
                {item.options && item.options.length > 0 && (
                  <div className="space-y-3">
                    {item.options.map((option) => (
                      <div key={option.id} className="space-y-2">
                        <div className="text-xs uppercase tracking-wide text-[var(--sage-deep)]/60">
                          {option.name}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {option.values.map((value) => {
                            const isSelected = selectedOptions[option.id] === value.id;
                            return (
                              <button
                                key={value.id}
                                className={`px-3 py-2 rounded-full border text-xs transition ${
                                  isSelected
                                    ? 'border-[var(--sage-deep)] bg-[var(--sage-deep)] text-white'
                                    : 'border-[var(--border)] text-[var(--sage-deep)]/70 hover:border-[var(--sage-deep)]'
                                }`}
                                onClick={() =>
                                  setSelectedOptions((prev) => ({
                                    ...prev,
                                    [option.id]: value.id,
                                  }))
                                }
                              >
                                {value.value}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  className="btn-primary"
                  disabled={!selectedVariant}
                  onClick={() =>
                    selectedVariant &&
                    addVariantToCart({
                      variantId: selectedVariant.id,
                      name: item.title,
                      priceCents: selectedVariant.priceCents,
                      imageUrl: selectedVariant.imageUrl || null,
                      quantity: 1,
                      selectedOptions: selectedVariant.optionValues?.map((value) => ({
                        name: value.optionName || 'Option',
                        value: value.value,
                      })),
                    })
                  }
                >
                  Ajouter au panier
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />

      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-w-5xl w-[90vw] max-h-[85vh]"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={productImages[lightboxIndex]}
              alt={item?.title || 'Produit'}
              className="w-full h-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            />
            <button
              type="button"
              className="absolute -top-4 -right-4 w-10 h-10 rounded-full bg-white text-[var(--sage-deep)] shadow flex items-center justify-center"
              onClick={() => setIsLightboxOpen(false)}
              aria-label="Fermer"
            >
              ×
            </button>
            {productImages.length > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-[var(--sage-deep)] shadow flex items-center justify-center"
                  onClick={handlePrevImage}
                  aria-label="Image précédente"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-[var(--sage-deep)] shadow flex items-center justify-center"
                  onClick={handleNextImage}
                  aria-label="Image suivante"
                >
                  ›
                </button>
                <div className="absolute bottom-4 right-4 text-xs text-white/80">
                  {lightboxIndex + 1} / {productImages.length}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
