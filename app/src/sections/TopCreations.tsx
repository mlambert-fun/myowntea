import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Info } from 'lucide-react';
import { api, type BlendListing } from '@/api/client';
import { BlendPurchaseSelector } from '@/components/subscriptions/BlendPurchaseSelector';
import { useBlend } from '@/context/BlendContext';
import type { Ingredient as CreatorIngredient } from '@/data/ingredients';
import { BLEND_FORMAT_OPTIONS, DEFAULT_BLEND_FORMAT, normalizeBlendFormat, type BlendFormatCode } from '@/lib/blend-format';
import { DataLoadingState } from '@/components/ui/loading-state';
import { getBlendListingPriceByFormatCents } from '@/lib/blend-listing-pricing';
import { t } from "@/lib/i18n";
type PendingBlendCartItem = {
    listingId?: string;
    name: string;
    ingredientIds: string[];
    ingredients: Array<{
        name: string;
        ingredientColor: string;
    }>;
    price: number;
    priceByFormatCents?: Partial<Record<BlendFormatCode, number>>;
    color: string;
};
const blendFormatIconMap: Record<BlendFormatCode, string> = {
    POUCH_100G: '/assets/misc/POUCH_100.svg',
    MUSLIN_20: '/assets/misc/MUSLIN_20.svg',
};
export function TopCreations() {
    const [topCreations, setTopCreations] = useState<BlendListing[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pendingBlendCartItem, setPendingBlendCartItem] = useState<PendingBlendCartItem | null>(null);
    const [selectedBlendFormat, setSelectedBlendFormat] = useState<BlendFormatCode>(DEFAULT_BLEND_FORMAT);
    const [pendingWishlistRemovalSignatures, setPendingWishlistRemovalSignatures] = useState<Set<string>>(new Set());
    const { addToCart, setBlendIngredients, addBlendToWishlist, wishlistItems, removeWishlistItem } = useBlend();
    const navigate = useNavigate();
    useEffect(() => {
        let mounted = true;
        api
            .getBlendListings()
            .then((data) => {
            if (!mounted)
                return;
            const sorted = (Array.isArray(data) ? data : [])
                .filter((listing) => Number.isFinite(listing?.ranking) && listing.ranking >= 1 && listing.ranking <= 3)
                .sort((left, right) => {
                const leftRanking = Number.isFinite(left?.ranking) ? left.ranking : Number.MAX_SAFE_INTEGER;
                const rightRanking = Number.isFinite(right?.ranking) ? right.ranking : Number.MAX_SAFE_INTEGER;
                if (leftRanking !== rightRanking)
                    return leftRanking - rightRanking;
                return String(left?.title || '').localeCompare(String(right?.title || ''), 'fr', {
                    sensitivity: 'base',
                });
            })
                .slice(0, 3);
            setTopCreations(sorted);
            setError(null);
        })
            .catch((err) => {
            if (!mounted)
                return;
            setError(err instanceof Error ? err.message : t("app.sections.top_creations.error_lors_loading"));
        })
            .finally(() => {
            if (!mounted)
                return;
            setLoading(false);
        });
        return () => {
            mounted = false;
        };
    }, []);
    const getIngredientCategoryPriority = (value: unknown) => {
        const normalized = String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
        if (normalized.startsWith('base'))
            return 0;
        if (normalized.startsWith('fleur') || normalized.startsWith('flower'))
            return 1;
        if (normalized.startsWith('fruit'))
            return 2;
        if (normalized.startsWith('plante') || normalized.startsWith('plant') || normalized.startsWith('herb'))
            return 3;
        if (normalized.startsWith('arome') ||
            normalized.startsWith('aroma') ||
            normalized.startsWith('flavor') ||
            normalized.startsWith('flavour')) {
            return 4;
        }
        return 5;
    };
    const normalizeCreatorCategory = (value: unknown): CreatorIngredient['category'] => {
        const normalized = String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
        if (normalized.startsWith('base') || normalized === 'tea')
            return 'base';
        if (normalized.startsWith('fleur') || normalized.startsWith('flower'))
            return 'flower';
        if (normalized.startsWith('fruit'))
            return 'fruit';
        if (normalized.startsWith('plante') ||
            normalized.startsWith('plant') ||
            normalized.startsWith('herb') ||
            normalized.startsWith('vegetal') ||
            normalized === 'vegetal') {
            return 'vegetal';
        }
        if (normalized.startsWith('arome') ||
            normalized.startsWith('aroma') ||
            normalized.startsWith('flavor') ||
            normalized.startsWith('flavour') ||
            normalized.startsWith('spice')) {
            return 'aroma';
        }
        return 'base';
    };
    const toCreatorIngredient = (entry: any): CreatorIngredient | null => {
        const ingredient = entry?.ingredient || entry;
        const id = ingredient?.id || entry?.ingredientId;
        if (!id)
            return null;
        const rawIntensity = Number(ingredient?.intensity);
        const intensity = Number.isFinite(rawIntensity) ? Math.min(5, Math.max(1, Math.round(rawIntensity))) : 3;
        return {
            id: String(id),
            name: String(ingredient?.name || entry?.name || t("app.sections.top_creations.ingredient_2")),
            category: normalizeCreatorCategory(ingredient?.category || entry?.category),
            description: typeof ingredient?.description === 'string' ? ingredient.description : '',
            benefits: Array.isArray(ingredient?.benefits) ? ingredient.benefits : [],
            intensity: intensity as 1 | 2 | 3 | 4 | 5,
            color: typeof ingredient?.color === 'string' && ingredient.color ? ingredient.color : '#6B7280',
            image: (typeof ingredient?.image === 'string' && ingredient.image) ||
                (typeof ingredient?.imageUrl === 'string' && ingredient.imageUrl) ||
                '/assets/misc/ingredient_placeholder.png',
            basePrice: typeof ingredient?.price === 'number' && Number.isFinite(ingredient.price)
                ? ingredient.price
                : typeof ingredient?.basePrice === 'number' && Number.isFinite(ingredient.basePrice)
                    ? ingredient.basePrice
                    : 0,
            dayMoments: Array.isArray(ingredient?.dayMoments) ? ingredient.dayMoments : null,
            infusionTime: typeof ingredient?.infusionTime === 'string' ? ingredient.infusionTime : null,
            dosage: typeof ingredient?.dosage === 'string' ? ingredient.dosage : null,
            temperature: typeof ingredient?.temperature === 'string' ? ingredient.temperature : null,
            preparation: typeof ingredient?.preparation === 'string' ? ingredient.preparation : null,
            origin: typeof ingredient?.origin === 'string' ? ingredient.origin : null,
        };
    };
    const goToCreation = (slug: string) => {
        navigate(`/creations/${slug}`);
    };
    const scrollToCreatorSmoothly = () => {
        const creatorSection = document.getElementById('creator');
        if (!creatorSection)
            return false;
        creatorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return true;
    };
    const closeBlendFormatModal = () => {
        setPendingBlendCartItem(null);
        setSelectedBlendFormat(DEFAULT_BLEND_FORMAT);
    };
    const confirmAddBlendToCart = (quantity: number) => {
        if (!pendingBlendCartItem)
            return;
        const selectedPriceCents = pendingBlendCartItem.priceByFormatCents?.[selectedBlendFormat];
        addToCart({
            ...pendingBlendCartItem,
            price: typeof selectedPriceCents === 'number' && Number.isFinite(selectedPriceCents)
                ? selectedPriceCents / 100
                : pendingBlendCartItem.price,
            blendFormat: selectedBlendFormat,
            quantity,
        });
        closeBlendFormatModal();
    };
    const confirmAddBlendSubscriptionToCart = async (intervalCount: 1 | 2 | 3) => {
        if (!pendingBlendCartItem)
            return;
        const selectedPriceCents = pendingBlendCartItem.priceByFormatCents?.[selectedBlendFormat] ??
            Math.max(0, Math.round(pendingBlendCartItem.price * 100));
        addToCart({
            ...pendingBlendCartItem,
            price: Math.max(0, Math.round(selectedPriceCents * 0.9)) / 100,
            blendFormat: selectedBlendFormat,
            purchaseMode: 'SUBSCRIPTION',
            sourceType: 'LISTING',
            subscriptionIntervalCount: intervalCount,
            subscriptionDiscountPercent: 10,
            basePriceCents: selectedPriceCents,
        });
        closeBlendFormatModal();
    };
    const pendingModalPriceCents = pendingBlendCartItem
        ? pendingBlendCartItem.priceByFormatCents?.[selectedBlendFormat] ??
            Math.max(0, Math.round(pendingBlendCartItem.price * 100))
        : 0;
    const wishlistItemIdsBySignature = useMemo(() => {
        const signatureMap = new Map<string, string>();
        wishlistItems
            .filter((item) => Array.isArray(item.ingredientIds) && item.ingredientIds.length > 0)
            .forEach((item) => {
            const signature = item.ingredientIds.slice().sort().join(',');
            const normalizedName = String(item.name || '').trim().toLowerCase();
            const blendFormat = normalizeBlendFormat(item.blendFormat || DEFAULT_BLEND_FORMAT);
            const key = `${normalizedName}::${blendFormat}::${signature}`;
            if (!signatureMap.has(key)) {
                signatureMap.set(key, item.id);
            }
        });
        return signatureMap;
    }, [wishlistItems]);
    return (<section className="relative w-full bg-[#FAF8F3] py-20">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="text-center mb-12">
          <span className="inline-block text-sm uppercase tracking-[3px] text-[var(--gold-antique)] font-medium mb-4">{t("app.sections.top_creations.selection_community_myowntea")}</span>
          <h2 className="font-display text-4xl md:text-5xl text-[var(--sage-deep)] mb-4">{t("app.sections.top_creations.top")} <span className="italic">{t("app.sections.top_creations.blends")}</span>
          </h2>
          <p className="text-[var(--sage-deep)]/60 max-w-xl mx-auto">{t("app.sections.top_creations.decouvrez_blends_mieux")}</p>
          <div className="mt-4 flex justify-center">
            <a href="/creations" className="inline-flex items-center px-4 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-[var(--gold-antique)]/30 text-sm font-medium text-[var(--sage-deep)] tracking-wide transition-colors hover:bg-[var(--gold-antique)] hover:text-white">{t("app.sections.top_creations.view_blends")}</a>
          </div>
        </div>

        {loading ? (<DataLoadingState size="md" className="py-12" title={t("app.sections.top_creations.loading_blends")} titleClassName="text-[var(--sage-deep)]/70"/>) : error ? (<div className="text-center py-12">
            <p className="text-red-600">Erreur: {error}</p>
          </div>) : topCreations.length === 0 ? (<div className="bg-white rounded-2xl p-6 text-[var(--sage-deep)]/70 text-center">{t("app.sections.top_creations.none_blend_classee")}</div>) : (<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {topCreations.map((listing) => {
                const ingredients = listing.blend?.ingredients || [];
                const coverImageUrl = listing.coverImageUrl || listing.blend?.coverImageUrl || null;
                const orderedIngredients = [...ingredients].sort((left: any, right: any) => {
                    const leftIngredient = left.ingredient || left;
                    const rightIngredient = right.ingredient || right;
                    const leftPriority = getIngredientCategoryPriority(leftIngredient?.category || left.category);
                    const rightPriority = getIngredientCategoryPriority(rightIngredient?.category || right.category);
                    if (leftPriority !== rightPriority) {
                        return leftPriority - rightPriority;
                    }
                    const leftName = String(leftIngredient?.name || left.name || '');
                    const rightName = String(rightIngredient?.name || right.name || '');
                    return leftName.localeCompare(rightName, 'fr', { sensitivity: 'base' });
                });
                const ingredientIds = orderedIngredients
                    .map((entry: any) => entry.ingredientId || entry.ingredient?.id)
                    .filter(Boolean);
                const listingWishlistSignature = `${String(listing.title || '').trim().toLowerCase()}::${DEFAULT_BLEND_FORMAT}::${ingredientIds.slice().sort().join(',')}`;
                const matchingWishlistItemId = ingredientIds.length > 0
                    ? wishlistItemIdsBySignature.get(listingWishlistSignature) ?? null
                    : null;
                const isWishlistRemovalPending = pendingWishlistRemovalSignatures.has(listingWishlistSignature);
                const isWishlisted = Boolean(matchingWishlistItemId) && !isWishlistRemovalPending;
                const blendPriceCents = getBlendListingPriceByFormatCents(listing, DEFAULT_BLEND_FORMAT);
                const createdByLabel = (listing.createdBy || '').trim();
                const creatorFirstName = (listing.createdFromOrder?.customer?.firstName || '').trim();
                const creatorLastInitial = (listing.createdFromOrder?.customer?.lastName || '').trim().charAt(0).toUpperCase();
                const orderCreatorLabel = creatorFirstName && creatorLastInitial
                    ? `${creatorFirstName} ${creatorLastInitial}.`
                    : creatorFirstName || '';
                const creatorInfo = createdByLabel
                    ? t("app.sections.top_creations.created_by", undefined, { name: createdByLabel })
                    : orderCreatorLabel
                        ? t("app.sections.top_creations.created_by", undefined, { name: orderCreatorLabel })
                        : '';
                return (<div key={listing.id} className="group bg-white rounded-2xl shadow overflow-hidden cursor-pointer" onClick={() => goToCreation(listing.slug)}>
                  <div className="relative h-[22rem] overflow-hidden bg-[var(--cream-apothecary)] flex items-center justify-center">
                    <button type="button" className="group/wishlist absolute top-3 right-3 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-white/80 transition-all duration-300 hover:bg-white" onClick={(e) => {
                        e.stopPropagation();
                        if (isWishlistRemovalPending) {
                            return;
                        }
                        if (matchingWishlistItemId) {
                            setPendingWishlistRemovalSignatures((prev) => {
                                const next = new Set(prev);
                                next.add(listingWishlistSignature);
                                return next;
                            });
                            void removeWishlistItem(matchingWishlistItemId).finally(() => {
                                setPendingWishlistRemovalSignatures((prev) => {
                                    const next = new Set(prev);
                                    next.delete(listingWishlistSignature);
                                    return next;
                                });
                            });
                            return;
                        }
                        void addBlendToWishlist({
                            name: listing.title,
                            ingredientIds,
                            blendFormat: DEFAULT_BLEND_FORMAT,
                        });
                    }} aria-label={isWishlisted
                        ? t("app.components.wishlist_drawer.wishlist_drawer.delete")
                        : t("app.sections.creator.add_blend_wishlist")} aria-pressed={isWishlisted}>
                      <Heart className={`h-4 w-4 transition-colors ${isWishlisted
                            ? 'fill-[var(--gold-antique)] text-[var(--gold-antique)]'
                            : 'fill-transparent text-[var(--sage-deep)] group-hover/wishlist:text-[var(--gold-antique)] group-hover/wishlist:fill-[var(--gold-antique)]'}`}/>
                    </button>
                    <img
                      src={coverImageUrl || '/assets/misc/ingredient_placeholder.png'}
                      alt={listing.title}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="absolute bottom-4 left-4 right-4">
                        <button onClick={(e) => {
                        e.stopPropagation();
                        goToCreation(listing.slug);
                    }} className="w-full py-2 bg-white/90 rounded-lg text-sm font-medium text-[var(--sage-deep)] flex items-center justify-center gap-2">
                          <Info className="w-4 h-4"/>{t("app.sections.top_creations.view_details")}</button>
                      </div>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-[var(--sage-deep)] text-lg cursor-pointer" onClick={(e) => {
                        e.stopPropagation();
                        goToCreation(listing.slug);
                    }}>
                          {listing.title}
                        </h3>
                        {creatorInfo && (<p className="mt-1 text-xs text-[var(--sage-deep)]/65">{creatorInfo}</p>)}
                      </div>
                      <span className="font-display text-[var(--gold-antique)] text-lg">{(blendPriceCents / 100).toFixed(2)} €</span>
                    </div>
                    {listing.description && (<p className="text-sm text-[var(--sage-deep)]/70 mt-2 line-clamp-2">{listing.description}</p>)}
                    {orderedIngredients.length > 0 && (<div className="mt-3 grid grid-cols-4 gap-2">
                        {orderedIngredients.map((entry: any, index: number) => {
                            const ingredient = entry.ingredient || entry;
                            const ingredientName = ingredient?.name || entry.name || t("app.sections.top_creations.ingredient");
                            const ingredientImage = ingredient?.image || '/assets/misc/ingredient_placeholder.png';
                            return (<div key={`${listing.id}-ingredient-thumb-${ingredient?.id || entry.ingredientId || index}`} className="flex flex-col items-center text-center">
                              <div className="h-12 w-12 overflow-hidden rounded-lg bg-[var(--cream-apothecary)]">
                                <img
                                  src={ingredientImage}
                                  alt={ingredientName}
                                  loading="lazy"
                                  decoding="async"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <span className="mt-1 min-h-[1.5rem] text-[10px] leading-3 text-[var(--sage-deep)]/70 line-clamp-2">
                                {ingredientName}
                              </span>
                            </div>);
                        })}
                      </div>)}
                    <div className="mt-4 flex items-center gap-3">
                      <button type="button" className="btn-secondary" style={{ paddingLeft: '1rem', paddingRight: '1rem' }} onClick={(e) => {
                        e.stopPropagation();
                        const creatorIngredients = orderedIngredients
                            .map((entry: any) => toCreatorIngredient(entry))
                            .filter((ingredient): ingredient is CreatorIngredient => ingredient !== null);
                        setBlendIngredients(creatorIngredients);
                        if (!scrollToCreatorSmoothly()) {
                            navigate('/?a=creator');
                        }
                    }}>{t("app.sections.top_creations.edit_atelier")}</button>
                      <button type="button" className="btn-primary" style={{ paddingLeft: '1rem', paddingRight: '1rem' }} onClick={(e) => {
                        e.stopPropagation();
                        const ingredientsSnapshot = orderedIngredients.map((entry: any) => ({
                            name: entry.ingredient?.name || entry.name,
                            ingredientColor: entry.ingredient?.color || '#6B7280',
                        }));
                        setPendingBlendCartItem({
                            listingId: listing.id,
                            name: listing.title,
                            ingredientIds,
                            ingredients: ingredientsSnapshot,
                            price: blendPriceCents / 100,
                            priceByFormatCents: {
                                POUCH_100G: getBlendListingPriceByFormatCents(listing, 'POUCH_100G'),
                                MUSLIN_20: getBlendListingPriceByFormatCents(listing, 'MUSLIN_20'),
                            },
                            color: listing.blend?.color || '#C4A77D',
                        });
                        setSelectedBlendFormat(DEFAULT_BLEND_FORMAT);
                    }}>{t("app.sections.top_creations.add_cart")}</button>
                    </div>
                  </div>
                </div>);
            })}
          </div>)}
      </div>

      {pendingBlendCartItem && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm cursor-close-cross" onClick={closeBlendFormatModal}>
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 cursor-default" onClick={(event) => event.stopPropagation()}>
            <h3 className="font-display text-2xl text-[var(--sage-deep)] mb-5 text-center">{t("app.sections.top_creations.choisissez_format")}</h3>
            <div className="grid grid-cols-2 gap-3">
              {BLEND_FORMAT_OPTIONS.map((option) => {
                const isSelected = selectedBlendFormat === option.code;
                return (<button key={option.code} type="button" onClick={() => setSelectedBlendFormat(option.code)} className={`rounded-xl border p-3 text-center transition ${isSelected
                        ? 'border-[var(--gold-antique)] bg-[var(--cream-apothecary)]'
                        : 'border-[#E5E0D5] bg-white hover:border-[var(--gold-antique)]/50'}`}>
                    <img src={blendFormatIconMap[option.code]} alt="" className="w-8 h-8 mx-auto mb-2 object-contain"/>
                    <span className="block text-sm font-medium text-[var(--sage-deep)] px-6">{option.label}</span>
                  </button>);
            })}
            </div>
            <BlendPurchaseSelector
              sourceType="LISTING"
              listingId={pendingBlendCartItem.listingId}
              title={pendingBlendCartItem.name}
              ingredientIds={pendingBlendCartItem.ingredientIds}
              blendFormat={selectedBlendFormat}
              basePriceCents={pendingModalPriceCents}
              onOneTimePurchase={confirmAddBlendToCart}
              onSubscriptionPurchase={confirmAddBlendSubscriptionToCart}
              className="mt-5"
            />
          </div>
        </div>)}
    </section>);
}
