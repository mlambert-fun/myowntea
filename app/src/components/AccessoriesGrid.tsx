import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { type Product, type ProductVariant } from '@/api/client';
import { useBlend } from '@/context/BlendContext';
import { DataLoadingState } from '@/components/ui/loading-state';

type AccessoriesGridProps = {
  items: Product[];
  loading: boolean;
};

export function AccessoriesGrid({ items, loading }: AccessoriesGridProps) {
  const { addVariantToCart } = useBlend();
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [quickviewProduct, setQuickviewProduct] = useState<Product | null>(null);

  const getPriceDisplay = (product: Product) => {
    const prices = (product.variants || [])
      .map((variant) => variant.priceCents)
      .filter((price) => typeof price === 'number');
    if (prices.length > 1) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      if (min !== max) {
        return `à partir de ${(min / 100).toFixed(2)} €`;
      }
    }
    if (product.defaultVariant) {
      return `${(product.defaultVariant.priceCents / 100).toFixed(2)} €`;
    }
    if (typeof product.priceCents === 'number') {
      return `${(product.priceCents / 100).toFixed(2)} €`;
    }
    return '—';
  };

  useEffect(() => {
    setSelectedVariants((prev) => {
      const next = { ...prev };
      items.forEach((product) => {
        if (!next[product.id] && product.variants && product.variants.length > 0) {
          next[product.id] = product.variants[0].id;
        }
      });
      return next;
    });
  }, [items]);

  const getSelectedVariant = (product: Product) => {
    const selectedId = selectedVariants[product.id];
    const fromSelection = product.variants?.find((variant) => variant.id === selectedId);
    return fromSelection || product.defaultVariant || product.variants?.[0] || null;
  };

  const handleAddToCart = (product: Product) => {
    const selectedVariant = getSelectedVariant(product);
    if (!selectedVariant && (product.variants?.length || 0) > 0) {
      setQuickviewProduct(product);
      return;
    }
    if (!selectedVariant) return;
    addVariantToCart({
      variantId: selectedVariant.id,
      name: product.title,
      priceCents: selectedVariant.priceCents,
      imageUrl: selectedVariant.imageUrl || null,
      quantity: 1,
      selectedOptions: selectedVariant.optionValues?.map((value) => ({
        name: value.optionName || 'Option',
        value: value.value,
      })),
    });
  };

  return (
    <>
      {loading ? (
        <DataLoadingState
          size="sm"
          className="py-6"
          titleClassName="text-sm text-[var(--sage-deep)]/60"
        />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => {
            const selectedVariant = getSelectedVariant(item);
            const hasMultipleVariants = (item.variants?.length || 0) > 1;
            return (
              <div key={item.id} className="group bg-white rounded-2xl shadow overflow-hidden flex flex-col">
                <div
                  className="relative h-[22rem] overflow-hidden bg-[var(--cream-apothecary)] flex items-center justify-center cursor-pointer"
                  onClick={() => (window.location.href = `/accessoires/${item.slug}`)}
                >
                  <img
                    src={
                      selectedVariant?.imageUrl ||
                      item.defaultVariant?.imageUrl ||
                      item.images?.[0] ||
                      '/assets/misc/ingredient_placeholder.png'
                    }
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="absolute bottom-4 left-4 right-4">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          window.location.href = `/accessoires/${item.slug}`;
                        }}
                        className="w-full py-2 bg-white/90 rounded-lg text-sm font-medium text-[var(--sage-deep)] flex items-center justify-center gap-2"
                      >
                        <Info className="w-4 h-4" />
                        Voir détails
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-5 flex flex-1 flex-col">
                  <div className="flex-1">
                  <h3
                    className="font-medium text-[var(--sage-deep)] mb-1 cursor-pointer"
                    onClick={() => (window.location.href = `/accessoires/${item.slug}`)}
                  >
                    {item.title}
                  </h3>
                  <p className="text-xs text-[var(--sage-deep)]/60 line-clamp-2">
                    {item.description}
                  </p>
                  <div className="font-display text-lg text-[var(--gold-antique)] mt-3">
                    {getPriceDisplay(item)}
                  </div>
                  </div>
                  <div className="mt-4 grid gap-2">
                  {hasMultipleVariants ? (
                    <div className="flex gap-2">
                      {(item.variants || []).slice(0, 3).map((variant) => {
                        const optionLabel = variant.optionValues?.[0]
                          ? `${variant.optionValues[0].optionName || 'Option'}: ${variant.optionValues[0].value}`
                          : 'Option';
                        return (
                          <div key={variant.id} className="group relative">
                            <button
                              type="button"
                              className={`h-12 w-12 rounded-xl overflow-hidden transition ${
                                variant.id === selectedVariant?.id
                                  ? 'border-2 border-[var(--gold-antique)]'
                                  : 'border border-[var(--white-warm)] hover:border-[var(--gold-antique)]'
                              }`}
                              onClick={() =>
                                setSelectedVariants((prev) => ({
                                  ...prev,
                                  [item.id]: variant.id,
                                }))
                              }
                              aria-label={optionLabel}
                            >
                              <img
                                src={variant.imageUrl || '/assets/misc/ingredient_placeholder.png'}
                                alt={item.title}
                                className="h-full w-full object-cover"
                              />
                            </button>
                            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                              {optionLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <button
                      className="btn-secondary w-full"
                      onClick={() => (window.location.href = `/accessoires/${item.slug}`)}
                    >
                      Voir le détail
                    </button>
                  )}
                  <button className="btn-primary w-full" onClick={() => handleAddToCart(item)}>
                    Ajouter au panier
                  </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {quickviewProduct && (
        <QuickviewModal
          product={quickviewProduct}
          onClose={() => setQuickviewProduct(null)}
          onAddToCart={(variant) => {
            addVariantToCart({
              variantId: variant.id,
              name: quickviewProduct.title,
              priceCents: variant.priceCents,
              imageUrl: variant.imageUrl || null,
              quantity: 1,
              selectedOptions: variant.optionValues?.map((value) => ({
                name: value.optionName || 'Option',
                value: value.value,
              })),
            });
          }}
        />
      )}
    </>
  );
}

function QuickviewModal({
  product,
  onClose,
  onAddToCart,
}: {
  product: Product;
  onClose: () => void;
  onAddToCart: (variant: ProductVariant) => void;
}) {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);

  useEffect(() => {
    if (!product.options || product.options.length === 0) {
      setSelectedOptions({});
      return;
    }
    const defaults: Record<string, string> = {};
    product.options.forEach((option) => {
      if (option.values && option.values.length > 0) {
        defaults[option.id] = option.values[0].id;
      }
    });
    setSelectedOptions(defaults);
  }, [product]);

  useEffect(() => {
    const variants = product.variants || [];
    if (variants.length === 0) {
      setSelectedVariant(null);
      return;
    }
    if (!product.options || product.options.length === 0) {
      setSelectedVariant(product.defaultVariant || variants[0] || null);
      return;
    }
    const matching = variants.find((variant) => {
      const optionValues = variant.optionValues || [];
      return product.options!.every((option) => {
        const selectedValueId = selectedOptions[option.id];
        if (!selectedValueId) return false;
        return optionValues.some(
          (value) => value.optionId === option.id && value.id === selectedValueId
        );
      });
    });
    setSelectedVariant(matching || product.defaultVariant || variants[0] || null);
  }, [product, selectedOptions]);

  const getPriceDisplay = () => {
    const prices = (product.variants || [])
      .map((variant) => variant.priceCents)
      .filter((price) => typeof price === 'number');
    if (prices.length > 1) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      if (min !== max) {
        return `à partir de ${(min / 100).toFixed(2)} €`;
      }
    }
    if (selectedVariant) {
      return `${(selectedVariant.priceCents / 100).toFixed(2)} €`;
    }
    return '—';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur cursor-close-cross"
      onClick={onClose}
    >
      <div
        className="relative w-[90vw] max-w-4xl max-h-[85vh] overflow-y-auto bg-white rounded-2xl p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute top-4 right-4 rounded-full p-2 text-[var(--sage-deep)]/70 hover:text-[var(--sage-deep)] hover:bg-[#F3F1EE] transition"
          onClick={onClose}
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-60 bg-[#F3F1EE] rounded-2xl overflow-hidden">
            <img
              src={
                selectedVariant?.imageUrl ||
                product.defaultVariant?.imageUrl ||
                product.images?.[0] ||
                '/assets/misc/ingredient_placeholder.png'
              }
              alt={product.title}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-2xl text-[var(--sage-deep)]">{product.title}</h2>
              <p className="text-sm text-[var(--sage-deep)]/60">{product.description}</p>
            </div>
            <div className="font-display text-xl text-[var(--gold-antique)]">{getPriceDisplay()}</div>
            {product.options && product.options.length > 0 && (
              <div className="space-y-3">
                {product.options.map((option) => (
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
              className="btn-primary w-full"
              disabled={!selectedVariant}
              onClick={() => selectedVariant && onAddToCart(selectedVariant)}
            >
              Ajouter au panier
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
