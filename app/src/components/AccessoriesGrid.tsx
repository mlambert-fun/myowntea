import { useEffect, useMemo, useState } from 'react';
import { Heart, Info, X } from 'lucide-react';
import { type Product, type ProductVariant } from '@/api/client';
import { useBlend } from '@/context/BlendContext';
import { DataLoadingState } from '@/components/ui/loading-state';
import { buildAccessoryWishlistItemIdMap, findMatchingAccessoryWishlistItemId } from '@/lib/accessory-wishlist';
import { t } from "@/lib/i18n";

type AccessoriesGridProps = {
    items: Product[];
    loading: boolean;
    maxItems?: number;
};

export function AccessoriesGrid({ items, loading, maxItems }: AccessoriesGridProps) {
    const { addVariantToCart, addAccessoryToWishlist, wishlistItems, removeWishlistItem } = useBlend();
    const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
    const [quickviewProduct, setQuickviewProduct] = useState<Product | null>(null);
    const [pendingWishlistRemovalItemIds, setPendingWishlistRemovalItemIds] = useState<Set<string>>(new Set());
    const sortedItems = [...items]
        .sort((left, right) => {
        const leftRanking = typeof left.ranking === 'number' ? left.ranking : 0;
        const rightRanking = typeof right.ranking === 'number' ? right.ranking : 0;
        if (leftRanking !== rightRanking) {
            return leftRanking - rightRanking;
        }
        return left.title.localeCompare(right.title, 'fr');
    });
    const displayedItems = typeof maxItems === 'number' && maxItems > 0
        ? sortedItems.slice(0, maxItems)
        : sortedItems;
    const wishlistItemIdsByKey = useMemo(() => buildAccessoryWishlistItemIdMap(wishlistItems), [wishlistItems]);

    const formatPriceAmount = (priceCents: number) => (priceCents % 100 === 0
        ? `${priceCents / 100}`
        : `${(priceCents / 100).toFixed(2)}`);

    const getPriceDisplay = (product: Product) => {
        const variantPrices = (product.variants || [])
            .map((variant) => variant.priceCents)
            .filter((price) => typeof price === 'number');

        if (variantPrices.length > 0) {
            const min = Math.min(...variantPrices);
            const max = Math.max(...variantPrices);

            if (min !== max) {
                return t("app.components.accessories_grid.from_price", undefined, { price: formatPriceAmount(min) });
            }

            return `${formatPriceAmount(min)} \u20AC`;
        }

        if (product.defaultVariant) {
            return `${formatPriceAmount(product.defaultVariant.priceCents)} \u20AC`;
        }

        if (typeof product.priceCents === 'number') {
            return `${formatPriceAmount(product.priceCents)} \u20AC`;
        }

        return '\u2014';
    };

    useEffect(() => {
        setSelectedVariants((prev) => {
            const next = { ...prev };
            displayedItems.forEach((product) => {
                if (!next[product.id] && product.variants && product.variants.length > 0) {
                    next[product.id] = product.variants[0].id;
                }
            });
            return next;
        });
    }, [displayedItems]);

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

        if (!selectedVariant) {
            addVariantToCart({
                productId: product.id,
                name: product.title,
                priceCents: typeof product.priceCents === 'number' ? product.priceCents : 0,
                imageUrl: product.images?.[0] || '/assets/misc/ingredient_placeholder.png',
                quantity: 1,
                selectedOptions: [],
            });
            return;
        }

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
                <DataLoadingState size="sm" className="py-6" titleClassName="text-sm text-[var(--sage-deep)]/60" />
            ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {displayedItems.map((item) => {
                        const selectedVariant = getSelectedVariant(item);
                        const hasMultipleVariants = (item.variants?.length || 0) > 1;
                        const matchingWishlistItemId = findMatchingAccessoryWishlistItemId(wishlistItemIdsByKey, {
                            variantId: selectedVariant?.id,
                            productId: item.id,
                        });
                        const isWishlistRemovalPending = matchingWishlistItemId !== null && pendingWishlistRemovalItemIds.has(matchingWishlistItemId);
                        const isWishlisted = Boolean(matchingWishlistItemId) && !isWishlistRemovalPending;

                        return (
                            <div key={item.id} className="group bg-white rounded-2xl shadow overflow-hidden flex flex-col">
                                <div
                                    className="relative h-[18rem] overflow-hidden bg-[var(--cream-apothecary)] flex items-center justify-center cursor-pointer"
                                    onClick={() => (window.location.href = `/accessoires/${item.slug}`)}
                                >
                                    <button
                                        type="button"
                                        className="group/wishlist absolute top-3 right-3 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-white/80 transition-all duration-300 hover:bg-white"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            if (isWishlistRemovalPending) {
                                                return;
                                            }
                                            if (matchingWishlistItemId) {
                                                setPendingWishlistRemovalItemIds((prev) => {
                                                    const next = new Set(prev);
                                                    next.add(matchingWishlistItemId);
                                                    return next;
                                                });
                                                void removeWishlistItem(matchingWishlistItemId).finally(() => {
                                                    setPendingWishlistRemovalItemIds((prev) => {
                                                        const next = new Set(prev);
                                                        next.delete(matchingWishlistItemId);
                                                        return next;
                                                    });
                                                });
                                                return;
                                            }
                                            void addAccessoryToWishlist({
                                                name: item.title,
                                                productId: item.id,
                                                variantId: selectedVariant?.id,
                                            });
                                        }}
                                        aria-label={isWishlisted
                                            ? t("app.components.wishlist_drawer.wishlist_drawer.delete")
                                            : t("app.components.wishlist_drawer.wishlist_drawer.wishlist")}
                                        aria-pressed={isWishlisted}
                                    >
                                        <Heart className={`h-4 w-4 transition-colors ${isWishlisted
                                            ? 'fill-[var(--gold-antique)] text-[var(--gold-antique)]'
                                            : 'fill-transparent text-[var(--sage-deep)] group-hover/wishlist:text-[var(--gold-antique)] group-hover/wishlist:fill-[var(--gold-antique)]'}`} />
                                    </button>
                                    <img
                                        src={
                                            selectedVariant?.imageUrl ||
                                            item.defaultVariant?.imageUrl ||
                                            item.images?.[0] ||
                                            '/assets/misc/ingredient_placeholder.png'
                                        }
                                        alt={item.title}
                                        loading="lazy"
                                        decoding="async"
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
                                                {t("app.components.accessories_grid.view_details")}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-5 flex flex-1 flex-col">
                                    <div className="flex-1">
                                        <div className="flex items-start justify-between gap-3">
                                            <h3
                                                className="font-medium text-[var(--sage-deep)] text-lg cursor-pointer"
                                                onClick={() => (window.location.href = `/accessoires/${item.slug}`)}
                                            >
                                                {item.title}
                                            </h3>
                                            <span className="font-display text-[var(--gold-antique)] text-lg text-right whitespace-nowrap">
                                                {getPriceDisplay(item)}
                                            </span>
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
                                                        <div key={variant.id} className="group/variant relative">
                                                            <button
                                                                type="button"
                                                                className={`h-12 w-12 rounded-xl overflow-hidden transition ${variant.id === selectedVariant?.id
                                                                    ? 'border-2 border-[var(--gold-antique)]'
                                                                    : 'border border-[var(--white-warm)] hover:border-[var(--gold-antique)]'}`}
                                                                onClick={() => setSelectedVariants((prev) => ({
                                                                    ...prev,
                                                                    [item.id]: variant.id,
                                                                }))}
                                                                aria-label={optionLabel}
                                                            >
                                                                <img
                                                                    src={variant.imageUrl || '/assets/misc/ingredient_placeholder.png'}
                                                                    alt={item.title}
                                                                    loading="lazy"
                                                                    decoding="async"
                                                                    className="h-full w-full object-cover"
                                                                />
                                                            </button>
                                                            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover/variant:opacity-100">
                                                                {optionLabel}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <button className="btn-secondary w-full" onClick={() => (window.location.href = `/accessoires/${item.slug}`)}>
                                                {t("app.components.accessories_grid.view_details_2")}
                                            </button>
                                        )}
                                        <button className="btn-primary w-full" onClick={() => handleAddToCart(item)}>
                                            {t("app.components.accessories_grid.add_cart")}
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

function QuickviewModal({ product, onClose, onAddToCart }: {
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
                if (!selectedValueId) {
                    return false;
                }
                return optionValues.some((value) => value.optionId === option.id && value.id === selectedValueId);
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
                return t("app.components.accessories_grid.from_price", undefined, {
                    price: (min / 100).toFixed(2),
                });
            }
        }

        if (selectedVariant) {
            return `${(selectedVariant.priceCents / 100).toFixed(2)} \u20AC`;
        }

        return '\u2014';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur cursor-close-cross" onClick={onClose}>
            <div
                className="relative w-[90vw] max-w-4xl max-h-[85vh] overflow-y-auto bg-white rounded-2xl p-6 shadow-2xl cursor-default"
                onClick={(event) => event.stopPropagation()}
            >
                <button
                    type="button"
                    className="absolute top-4 right-4 rounded-full p-2 text-[var(--sage-deep)]/70 hover:text-[var(--sage-deep)] hover:bg-[#F3F1EE] transition"
                    onClick={onClose}
                    aria-label={t("app.components.accessories_grid.close")}
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
                                                        className={`px-3 py-2 rounded-full border text-xs transition ${isSelected
                                                            ? 'border-[var(--sage-deep)] bg-[var(--sage-deep)] text-white'
                                                            : 'border-[var(--border)] text-[var(--sage-deep)]/70 hover:border-[var(--sage-deep)]'}`}
                                                        onClick={() => setSelectedOptions((prev) => ({
                                                            ...prev,
                                                            [option.id]: value.id,
                                                        }))}
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
                        <button className="btn-primary w-full" disabled={!selectedVariant} onClick={() => selectedVariant && onAddToCart(selectedVariant)}>
                            {t("app.components.accessories_grid.add_cart")}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
