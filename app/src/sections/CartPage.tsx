import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, ShoppingCart, Sparkles } from 'lucide-react';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { Cart } from './Cart';
import { api, type BlendListing, type Product, type ProductVariant } from '@/api/client';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { BlendPurchaseSelector } from '@/components/subscriptions/BlendPurchaseSelector';
import { useBlend } from '@/context/BlendContext';
import type { Ingredient as CreatorIngredient } from '@/data/ingredients';
import { BLEND_FORMAT_OPTIONS, DEFAULT_BLEND_FORMAT, type BlendFormatCode } from '@/lib/blend-format';
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

type AutoCarouselColumnProps =
    | {
        kind: 'blend';
        title: string;
        ctaLabel: string;
        ctaHref: string;
        items: BlendListing[];
    }
    | {
        kind: 'accessory';
        title: string;
        ctaLabel: string;
        ctaHref: string;
        items: Product[];
    };

const blendFormatIconMap: Record<BlendFormatCode, string> = {
    POUCH_100G: '/assets/misc/POUCH_100.svg',
    MUSLIN_20: '/assets/misc/MUSLIN_20.svg',
};

const shuffleAndTake = <T,>(items: T[], count: number) => {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled.slice(0, count);
};

const formatPriceCents = (priceCents?: number | null) => {
    if (typeof priceCents !== 'number' || Number.isNaN(priceCents)) {
        return '-';
    }
    return `${(priceCents / 100).toFixed(2)} â‚¬`;
};

const normalizeCreatorCategory = (value: unknown): CreatorIngredient['category'] => {
    const normalized = String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    if (normalized.startsWith('base') || normalized === 'tea') {
        return 'base';
    }
    if (normalized.startsWith('fleur') || normalized.startsWith('flower')) {
        return 'flower';
    }
    if (normalized.startsWith('fruit')) {
        return 'fruit';
    }
    if (
        normalized.startsWith('plante') ||
        normalized.startsWith('plant') ||
        normalized.startsWith('herb') ||
        normalized.startsWith('vegetal')
    ) {
        return 'vegetal';
    }
    return 'aroma';
};

const toCreatorIngredient = (entry: any): CreatorIngredient | null => {
    const ingredient = entry?.ingredient || entry;
    const id = ingredient?.id || entry?.ingredientId;

    if (!id) {
        return null;
    }

    const rawIntensity = Number(ingredient?.intensity);
    const intensity = Number.isFinite(rawIntensity) ? Math.min(5, Math.max(1, Math.round(rawIntensity))) : 3;

    return {
        id: String(id),
        name: String(ingredient?.name || entry?.name || t("app.sections.creation_detail_page.ingredient")),
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

const getVariantImages = (variant?: ProductVariant | null) => {
    const urls = Array.isArray(variant?.images)
        ? variant.images.filter((imageUrl) => typeof imageUrl === 'string' && imageUrl.trim().length > 0)
        : [];

    if (urls.length > 0) {
        return urls;
    }

    return typeof variant?.imageUrl === 'string' && variant.imageUrl.trim().length > 0
        ? [variant.imageUrl]
        : [];
};

const getVariantPrimaryImage = (variant?: ProductVariant | null) => getVariantImages(variant)[0] || null;

const getAccessoryCardImage = (product: Product, selectedVariant?: ProductVariant | null) => (
    getVariantPrimaryImage(selectedVariant) ||
    getVariantPrimaryImage(product.defaultVariant) ||
    product.images?.[0] ||
    '/assets/misc/ingredient_placeholder.png'
);

const getAccessoryPriceLabel = (product: Product, selectedVariant?: ProductVariant | null) => {
    if (selectedVariant) {
        return formatPriceCents(selectedVariant.priceCents);
    }

    const variantPrices = (product.variants || [])
        .map((variant) => variant.priceCents)
        .filter((price): price is number => typeof price === 'number');

    if (variantPrices.length > 0) {
        const min = Math.min(...variantPrices);
        const max = Math.max(...variantPrices);
        return min !== max
            ? `${t("app.sections.cart_page.from_price")} ${formatPriceCents(min)}`
            : formatPriceCents(min);
    }

    if (typeof product.priceCents === 'number') {
        return formatPriceCents(product.priceCents);
    }

    return '-';
};

const getVariantOptionLabel = (variant: ProductVariant) => (
    variant.optionValues?.[0]
        ? `${variant.optionValues[0].optionName || 'Option'}: ${variant.optionValues[0].value}`
        : 'Option'
);

function IconActionButton({
    label,
    onClick,
    className,
    wrapperClassName = '',
    children,
}: {
    label: string;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
    className: string;
    wrapperClassName?: string;
    children: ReactNode;
}) {
    const [isTooltipVisible, setIsTooltipVisible] = useState(false);

    return (
        <div
            className={`relative inline-flex shrink-0 ${wrapperClassName}`.trim()}
            onMouseEnter={() => setIsTooltipVisible(true)}
            onMouseLeave={() => setIsTooltipVisible(false)}
        >
            <button
                type="button"
                onClick={onClick}
                aria-label={label}
                className={className}
                onFocus={() => setIsTooltipVisible(true)}
                onBlur={() => setIsTooltipVisible(false)}
            >
                {children}
            </button>
            <span
                className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-2 py-1 text-[10px] text-white transition ${
                    isTooltipVisible ? 'opacity-100' : 'opacity-0'
                }`}
            >
                {label}
            </span>
        </div>
    );
}

function BlendRecommendationCard({
    listing,
    onOpenBlendModal,
}: {
    listing: BlendListing;
    onOpenBlendModal: (listing: BlendListing) => void;
}) {
    const navigate = useNavigate();
    const { setBlendIngredients } = useBlend();

    const coverImageUrl = listing.coverImageUrl || listing.blend?.coverImageUrl || '/assets/misc/ingredient_placeholder.png';
    const blendPriceCents = getBlendListingPriceByFormatCents(listing, DEFAULT_BLEND_FORMAT);
    const ingredients = Array.isArray(listing.blend?.ingredients) ? listing.blend.ingredients : [];

    const goToCreation = () => navigate(`/creations/${listing.slug}`);

    const handleEditAtelier = () => {
        const creatorIngredients = ingredients
            .map((entry: any) => toCreatorIngredient(entry))
            .filter((ingredient): ingredient is CreatorIngredient => ingredient !== null);

        setBlendIngredients(creatorIngredients);
        navigate('/?a=creator');
    };

    return (
        <div className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow transition-all duration-300 hover:shadow-md">
            <div
                className="relative aspect-[4/3] cursor-pointer overflow-hidden bg-[var(--cream-apothecary)]"
                onClick={goToCreation}
            >
                <img
                    src={coverImageUrl}
                    alt={listing.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <div className="absolute bottom-4 left-4 right-4">
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                goToCreation();
                            }}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/90 py-2 text-sm font-medium text-[var(--sage-deep)]"
                        >
                            <Eye className="h-4 w-4" />
                            {t("app.sections.creations_page.view_details")}
                        </button>
                    </div>
                </div>
            </div>
            <div className="flex flex-1 flex-col bg-[var(--cream-apothecary)] p-4">
                <div className="flex-1">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h4
                                className="line-clamp-2 cursor-pointer text-m font-medium text-[var(--sage-deep)]"
                                onClick={goToCreation}
                            >
                                {listing.title}
                            </h4>
                        </div>
                        <span className="shrink-0 whitespace-nowrap text-right font-display text-lg text-[var(--gold-antique)]">
                            {formatPriceCents(blendPriceCents)}
                        </span>
                    </div>
                </div>
                <div className="mt-4 flex items-center justify-end gap-2">
                    <IconActionButton
                        label={t("app.sections.creations_page.edit_atelier")}
                        onClick={() => handleEditAtelier()}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--sage-deep)]/15 text-[var(--sage-deep)] transition hover:border-[var(--gold-antique)] hover:text-[var(--gold-antique)]"
                    >
                        <Sparkles className="h-4 w-4" />
                    </IconActionButton>
                    <IconActionButton
                        label={t("app.sections.creations_page.add_cart")}
                        onClick={() => onOpenBlendModal(listing)}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--sage-deep)] text-white transition hover:bg-[var(--gold-antique)]"
                    >
                        <ShoppingCart className="h-4 w-4" />
                    </IconActionButton>
                </div>
            </div>
        </div>
    );
}

function AccessoryRecommendationCard({ product }: { product: Product }) {
    const navigate = useNavigate();
    const { addVariantToCart } = useBlend();
    const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

    useEffect(() => {
        const defaultVariantId = product.defaultVariant?.id || product.variants?.[0]?.id || null;
        setSelectedVariantId(defaultVariantId);
    }, [product]);

    const selectedVariant = (product.variants || []).find((variant) => variant.id === selectedVariantId)
        || product.defaultVariant
        || product.variants?.[0]
        || null;

    const hasMultipleVariants = (product.variants?.length || 0) > 1;
    const goToAccessory = () => navigate(`/accessoires/${product.slug}`);

    const handleAddToCart = () => {
        if (selectedVariant) {
            addVariantToCart({
                variantId: selectedVariant.id,
                name: product.title,
                priceCents: selectedVariant.priceCents,
                imageUrl: getVariantPrimaryImage(selectedVariant) || null,
                quantity: 1,
                selectedOptions: selectedVariant.optionValues?.map((value) => ({
                    name: value.optionName || 'Option',
                    value: value.value,
                })),
            });
            return;
        }

        addVariantToCart({
            productId: product.id,
            name: product.title,
            priceCents: typeof product.priceCents === 'number' ? product.priceCents : 0,
            imageUrl: product.images?.[0] || '/assets/misc/ingredient_placeholder.png',
            quantity: 1,
            selectedOptions: [],
        });
    };

    return (
        <div className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow transition-all duration-300 hover:shadow-md">
            <div
                className="relative aspect-[4/3] cursor-pointer overflow-hidden bg-[var(--cream-apothecary)]"
                onClick={goToAccessory}
            >
                <img
                    src={getAccessoryCardImage(product, selectedVariant)}
                    alt={product.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <div className="absolute bottom-4 left-4 right-4">
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                goToAccessory();
                            }}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/90 py-2 text-sm font-medium text-[var(--sage-deep)]"
                        >
                            <Eye className="h-4 w-4" />
                            {t("app.components.accessories_grid.view_details")}
                        </button>
                    </div>
                </div>
            </div>
            <div className="flex flex-1 flex-col bg-[var(--cream-apothecary)] p-4">
                <div className="flex-1">
                    <div className="flex items-start justify-between gap-3">
                        <h4
                            className="line-clamp-2 cursor-pointer text-lg font-medium text-[var(--sage-deep)]"
                            onClick={goToAccessory}
                        >
                            {product.title}
                        </h4>
                        <span className="shrink-0 whitespace-nowrap text-right font-display text-lg text-[var(--gold-antique)]">
                            {getAccessoryPriceLabel(product, selectedVariant)}
                        </span>
                    </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                    {hasMultipleVariants ? (
                        <div className="flex gap-2">
                            {(product.variants || []).slice(0, 3).map((variant) => {
                                const optionLabel = getVariantOptionLabel(variant);
                                const variantImage = getVariantPrimaryImage(variant) || '/assets/misc/ingredient_placeholder.png';

                                return (
                                    <div key={variant.id} className="group/variant relative">
                                        <button
                                            type="button"
                                            className={`h-10 w-10 overflow-hidden rounded-xl transition ${
                                                variant.id === selectedVariant?.id
                                                    ? 'border-2 border-[var(--gold-antique)]'
                                                    : 'border border-[var(--white-warm)] hover:border-[var(--gold-antique)]'
                                            }`}
                                            onClick={() => setSelectedVariantId(variant.id)}
                                            aria-label={optionLabel}
                                        >
                                            <img
                                                src={variantImage}
                                                alt={product.title}
                                                className="h-full w-full object-cover"
                                            />
                                        </button>
                                        <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover/variant:opacity-100">
                                            {optionLabel}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <IconActionButton
                            label={t("app.components.accessories_grid.view_details_2")}
                            onClick={() => goToAccessory()}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--sage-deep)]/15 text-[var(--sage-deep)] transition hover:border-[var(--gold-antique)] hover:text-[var(--gold-antique)]"
                        >
                            <Eye className="h-4 w-4" />
                        </IconActionButton>
                    )}
                    <IconActionButton
                        label={t("app.components.accessories_grid.add_cart")}
                        onClick={() => handleAddToCart()}
                        className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--sage-deep)] text-white transition hover:bg-[var(--gold-antique)]"
                        wrapperClassName="ml-auto"
                    >
                        <ShoppingCart className="h-4 w-4" />
                    </IconActionButton>
                </div>
            </div>
        </div>
    );
}

function AutoCarouselColumn(props: AutoCarouselColumnProps) {
    const { addToCart } = useBlend();
    const [apiInstance, setApiInstance] = useState<CarouselApi | undefined>(undefined);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [snapCount, setSnapCount] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    const [pendingBlendCartItem, setPendingBlendCartItem] = useState<PendingBlendCartItem | null>(null);
    const [selectedBlendFormat, setSelectedBlendFormat] = useState<BlendFormatCode>(DEFAULT_BLEND_FORMAT);

    useEffect(() => {
        if (!apiInstance || props.items.length <= 2 || isHovered || pendingBlendCartItem) {
            return;
        }

        const intervalId = window.setInterval(() => {
            apiInstance.scrollNext();
        }, 3200);

        return () => window.clearInterval(intervalId);
    }, [apiInstance, isHovered, pendingBlendCartItem, props.items.length]);

    useEffect(() => {
        if (!apiInstance) {
            setSelectedIndex(0);
            setSnapCount(0);
            return;
        }

        const syncCarouselState = () => {
            setSelectedIndex(apiInstance.selectedScrollSnap());
            setSnapCount(apiInstance.scrollSnapList().length);
        };

        syncCarouselState();
        apiInstance.on('select', syncCarouselState);
        apiInstance.on('reInit', syncCarouselState);

        return () => {
            apiInstance.off('select', syncCarouselState);
            apiInstance.off('reInit', syncCarouselState);
        };
    }, [apiInstance]);

    const openBlendFormatModal = (listing: BlendListing) => {
        const ingredients = Array.isArray(listing.blend?.ingredients) ? listing.blend.ingredients : [];
        const ingredientIds = ingredients
            .map((entry: any) => entry.ingredientId || entry.ingredient?.id)
            .filter(Boolean);
        const ingredientsSnapshot = ingredients.map((entry: any) => ({
            name: entry.ingredient?.name || entry.name,
            ingredientColor: entry.ingredient?.color || '#6B7280',
        }));

        setPendingBlendCartItem({
            listingId: listing.id,
            name: listing.title,
            ingredientIds,
            ingredients: ingredientsSnapshot,
            price: getBlendListingPriceByFormatCents(listing, DEFAULT_BLEND_FORMAT) / 100,
            priceByFormatCents: {
                POUCH_100G: getBlendListingPriceByFormatCents(listing, 'POUCH_100G'),
                MUSLIN_20: getBlendListingPriceByFormatCents(listing, 'MUSLIN_20'),
            },
            color: listing.blend?.color || '#C4A77D',
        });
        setSelectedBlendFormat(DEFAULT_BLEND_FORMAT);
    };

    const closeBlendFormatModal = () => {
        setPendingBlendCartItem(null);
    };

    const confirmAddBlendToCart = (quantity: number) => {
        if (!pendingBlendCartItem) {
            return;
        }

        const selectedPriceCents = pendingBlendCartItem.priceByFormatCents?.[selectedBlendFormat];

        addToCart({
            ...pendingBlendCartItem,
            price: typeof selectedPriceCents === 'number'
                ? selectedPriceCents / 100
                : pendingBlendCartItem.price,
            blendFormat: selectedBlendFormat,
            quantity,
        });
        closeBlendFormatModal();
    };
    const confirmAddBlendSubscriptionToCart = async (intervalCount: 1 | 2 | 3) => {
        if (!pendingBlendCartItem) {
            return;
        }

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

    return (
        <>
            <div className="rounded-2xl bg-white p-6 shadow">
                <div className="mb-5 flex flex-col gap-3">
                    <h3 className="font-medium text-[var(--sage-deep)]">{props.title}</h3>
                    <Link
                        to={props.ctaHref}
                        className="mx-auto rounded-full border border-[var(--sage-deep)]/15 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-[var(--sage-deep)] transition hover:border-[var(--gold-antique)] hover:text-[var(--gold-antique)]"
                    >
                        {props.ctaLabel}
                    </Link>
                </div>
                <Carousel
                    className="w-full"
                    setApi={setApiInstance}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    opts={{
                        align: 'start',
                        loop: props.items.length > 2,
                        dragFree: true,
                    }}
                >
                    <CarouselContent className="-ml-3">
                        {props.items.map((item) => (
                            <CarouselItem key={item.id} className="basis-1/2 pl-3">
                                {props.kind === 'blend' ? (
                                    <BlendRecommendationCard
                                        listing={item as BlendListing}
                                        onOpenBlendModal={openBlendFormatModal}
                                    />
                                ) : (
                                    <AccessoryRecommendationCard product={item as Product} />
                                )}
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                </Carousel>
                {snapCount > 1 ? (
                    <div className="mt-5 flex items-center justify-center gap-2">
                        {Array.from({ length: snapCount }).map((_, index) => {
                            const isActive = index === selectedIndex;
                            return (
                                <button
                                    key={`${props.title}-dot-${index}`}
                                    type="button"
                                    onClick={() => apiInstance?.scrollTo(index)}
                                    aria-label={`Aller au slide ${index + 1}`}
                                    className={`h-2.5 rounded-full transition-all duration-300 ${
                                        isActive
                                            ? 'w-7 bg-[var(--gold-antique)]'
                                            : 'w-2.5 border border-[var(--gold-antique)] bg-transparent hover:bg-[var(--gold-antique)]/18'
                                    }`}
                                />
                            );
                        })}
                    </div>
                ) : null}
            </div>

            {props.kind === 'blend' && pendingBlendCartItem ? (
                <div
                    className="fixed inset-0 z-50 flex cursor-close-cross items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
                    onClick={closeBlendFormatModal}
                >
                    <div
                        className="w-full max-w-xl cursor-default rounded-3xl bg-white p-6"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h3 className="mb-5 text-center font-display text-2xl text-[var(--sage-deep)]">
                            {t("app.sections.creations_page.choisissez_format")}
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            {BLEND_FORMAT_OPTIONS.map((option) => {
                                const isSelected = selectedBlendFormat === option.code;

                                return (
                                    <button
                                        key={option.code}
                                        type="button"
                                        onClick={() => setSelectedBlendFormat(option.code)}
                                        className={`rounded-xl border p-3 text-center transition ${
                                            isSelected
                                                ? 'border-[var(--gold-antique)] bg-[var(--cream-apothecary)]'
                                                : 'border-[#E5E0D5] bg-white hover:border-[var(--gold-antique)]/50'
                                        }`}
                                    >
                                        <img src={blendFormatIconMap[option.code]} alt="" className="mx-auto mb-2 h-8 w-8 object-contain" />
                                        <span className="block text-sm font-medium text-[var(--sage-deep)] px-6">{option.label}</span>
                                    </button>
                                );
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
                </div>
            ) : null}
        </>
    );
}

export default function CartPage() {
    const [accessories, setAccessories] = useState<Product[]>([]);
    const [blendListings, setBlendListings] = useState<BlendListing[]>([]);

    useEffect(() => {
        let isCancelled = false;

        Promise.all([
            api.getProducts('ACCESSORY'),
            api.getBlendListings(),
        ])
            .then(([nextAccessories, nextBlendListings]) => {
                if (isCancelled) {
                    return;
                }

                setAccessories(Array.isArray(nextAccessories) ? nextAccessories : []);
                setBlendListings(
                    Array.isArray(nextBlendListings)
                        ? nextBlendListings.filter((listing) => listing.isActive !== false)
                        : [],
                );
            })
            .catch((error) => {
                console.error('Failed to load cart recommendations', error);
            });

        return () => {
            isCancelled = true;
        };
    }, []);

    const accessoryCards = useMemo(() => shuffleAndTake(accessories, 4), [accessories]);
    const blendCards = useMemo(() => shuffleAndTake(blendListings, 4), [blendListings]);

    return (
        <div className="min-h-screen bg-[var(--cream-apothecary)]">
            <Navigation hidePrimaryNav />

            <main>
                <Cart />


                {(blendCards.length > 0 || accessoryCards.length > 0) && (
                    <section className="mx-auto mb-6 mt-8 max-w-5xl px-6">
                        <div className="grid gap-6 lg:grid-cols-2">
                            {blendCards.length > 0 ? (
                                <AutoCarouselColumn
                                    kind="blend"
                                    title={t("app.sections.cart_page.cart_creations_title")}
                                    ctaLabel={t("app.sections.cart_page.view_all_creations")}
                                    ctaHref="/creations"
                                    items={blendCards}
                                />
                            ) : null}
                            {accessoryCards.length > 0 ? (
                                <AutoCarouselColumn
                                    kind="accessory"
                                    title={t("app.sections.cart_page.cart_accessories_title")}
                                    ctaLabel={t("app.sections.cart_page.view_all_accessories")}
                                    ctaHref="/accessoires"
                                    items={accessoryCards}
                                />
                            ) : null}
                        </div>
                    </section>
                )}
            </main>

            <Footer hideMainSection hideNewsletterSection />
        </div>
    );
}
