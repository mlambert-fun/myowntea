import { useEffect, useMemo, useState } from 'react';
import { Heart, Minus, Plus, Truck } from 'lucide-react';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { api, type Product, type ProductVariant } from '@/api/client';
import { useBlend } from '@/context/BlendContext';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { DataLoadingState } from '@/components/ui/loading-state';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';
import { buildAccessoryWishlistItemIdMap, findMatchingAccessoryWishlistItemId } from '@/lib/accessory-wishlist';
import NotFoundPage from './NotFoundPage';
import { t } from "@/lib/i18n";
const getSlugFromPath = () => {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts[1] || '';
};
const sanitizeRichText = (rawHtml: string): string => {
    if (!rawHtml)
        return '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((node) => {
        node.remove();
    });
    doc.querySelectorAll('*').forEach((element) => {
        Array.from(element.attributes).forEach((attribute) => {
            const name = attribute.name.toLowerCase();
            const value = attribute.value;
            if (name.startsWith('on')) {
                element.removeAttribute(attribute.name);
                return;
            }
            if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(value)) {
                element.removeAttribute(attribute.name);
            }
        });
    });
    return doc.body.innerHTML;
};
const extractPlainText = (rawHtml?: string | null) => {
    if (!rawHtml) {
        return '';
    }
    const parser = new DOMParser();
    return parser
        .parseFromString(sanitizeRichText(rawHtml), 'text/html')
        .body.textContent?.replace(/\s+/g, ' ')
        .trim() || '';
};
const formatThresholdEuros = (cents: number) => {
    const euros = cents / 100;
    if (Number.isInteger(euros)) {
        return String(euros);
    }
    return euros.toFixed(2).replace('.', ',');
};
const truncateRichText = (rawHtml: string, maxChars: number) => {
    const sanitized = sanitizeRichText(rawHtml);
    if (!sanitized.trim()) {
        return '';
    }

    const parser = new DOMParser();
    const sourceDoc = parser.parseFromString(sanitized, 'text/html');
    const targetDoc = parser.parseFromString('', 'text/html');
    let remaining = maxChars;
    let isTruncated = false;

    const appendNode = (node: Node, parent: Node) => {
        if (remaining <= 0) {
            isTruncated = true;
            return;
        }

        if (node.nodeType === Node.TEXT_NODE) {
            const textContent = node.textContent || '';
            if (!textContent) {
                return;
            }

            if (textContent.length <= remaining) {
                parent.appendChild(targetDoc.createTextNode(textContent));
                remaining -= textContent.length;
                return;
            }

            parent.appendChild(targetDoc.createTextNode(`${textContent.slice(0, remaining)}...`));
            remaining = 0;
            isTruncated = true;
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
        }

        const sourceElement = node as Element;
        const targetElement = targetDoc.createElement(sourceElement.tagName.toLowerCase());
        Array.from(sourceElement.attributes).forEach((attribute) => {
            targetElement.setAttribute(attribute.name, attribute.value);
        });

        parent.appendChild(targetElement);
        Array.from(sourceElement.childNodes).forEach((childNode) => {
            if (remaining > 0) {
                appendNode(childNode, targetElement);
            }
        });
    };

    Array.from(sourceDoc.body.childNodes).forEach((childNode) => {
        if (remaining > 0) {
            appendNode(childNode, targetDoc.body);
        }
    });

    return isTruncated ? targetDoc.body.innerHTML : sanitized;
};
const RichHtml = ({ value, className }: {
    value?: string | null;
    className?: string;
}) => {
    const sanitized = useMemo(() => sanitizeRichText(value || ''), [value]);
    if (!sanitized.trim())
        return null;
    return <div className={className} dangerouslySetInnerHTML={{ __html: sanitized }}/>;
};
const SingleAccordionSection = ({ label, value }: {
    label: string;
    value?: string | null;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const hasContent = typeof value === 'string' && value.trim().length > 0;
    if (!hasContent)
        return null;
    return (<div className="mt-7 w-full bg-white border border-[#E5E0D5] rounded-lg overflow-hidden">
      <div className="w-full" style={{ flex: 'none' }}>
        <button className={`w-full flex items-center justify-between px-4 py-3 text-left text-[var(--sage-deep)] text-sm hover:bg-[var(--cream-apothecary)] transition-colors ${isOpen ? 'bg-[var(--cream-apothecary)]' : ''}`} onClick={() => setIsOpen((prev) => !prev)} aria-expanded={isOpen} aria-controls="accessory-extra-details-content" style={{ minHeight: 48 }}>
          <span>{label}</span>
          {isOpen ? <Minus className="w-5 h-5"/> : <Plus className="w-5 h-5"/>}
        </button>
        {isOpen && (<div id="accessory-extra-details-content" className="p-4" style={{ maxHeight: 276, overflowY: 'auto' }}>
            <RichHtml value={value} className="text-[var(--sage-deep)]/80 text-sm"/>
          </div>)}
      </div>
    </div>);
};
export default function AccessoryDetailPage() {
    const { settings } = useStoreSettings();
    const [item, setItem] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const { addVariantToCart, addAccessoryToWishlist, wishlistItems, removeWishlistItem } = useBlend();
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
    const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [zoomOrigin, setZoomOrigin] = useState('50% 50%');
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const [pendingWishlistRemovalItemId, setPendingWishlistRemovalItemId] = useState<string | null>(null);
    const wishlistItemIdsByKey = useMemo(() => buildAccessoryWishlistItemIdMap(wishlistItems), [wishlistItems]);
    const getPriceDisplay = (product: Product, variant: ProductVariant | null, selectedQuantity: number) => {
        const normalizedQuantity = Math.max(1, selectedQuantity);
        const prices = (product.variants || [])
            .map((v) => v.priceCents)
            .filter((price) => typeof price === 'number');
        if (prices.length > 1) {
            const min = Math.min(...prices);
            const max = Math.max(...prices);
            if (min !== max) {
                return t("app.sections.accessory_detail_page.from_price", undefined, { price: ((min * normalizedQuantity) / 100).toFixed(2) });
            }
        }
        const unitPriceCents = variant?.priceCents ??
            product.defaultVariant?.priceCents ??
            (typeof product.priceCents === 'number' ? product.priceCents : null);
        if (unitPriceCents !== null) {
            return `${((unitPriceCents * normalizedQuantity) / 100).toFixed(2)} \u20AC`;
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
    const getVariantPrimaryImage = (variant?: ProductVariant | null) => {
        return getVariantImages(variant)[0] || null;
    };
    const productImages = (() => {
        const urls = new Set<string>();
        getVariantImages(selectedVariant).forEach((imageUrl) => urls.add(imageUrl));
        getVariantImages(item?.defaultVariant).forEach((imageUrl) => urls.add(imageUrl));
        (item?.variants || []).forEach((variant) => {
            getVariantImages(variant).forEach((imageUrl) => urls.add(imageUrl));
        });
        (item?.images || []).forEach((imageUrl) => {
            if (imageUrl)
                urls.add(imageUrl);
        });
        if (urls.size === 0)
            urls.add('/assets/misc/ingredient_placeholder.png');
        return Array.from(urls);
    })();
    const openLightbox = () => {
        const currentUrl = getVariantPrimaryImage(selectedVariant) ||
            getVariantPrimaryImage(item?.defaultVariant) ||
            item?.images?.[0] ||
            '/assets/misc/ingredient_placeholder.png';
        const index = Math.max(0, productImages.indexOf(currentUrl));
        setLightboxIndex(index);
        setIsLightboxOpen(true);
    };
    const handleNextImage = () => {
        if (productImages.length <= 1)
            return;
        setLightboxIndex((prev) => (prev + 1) % productImages.length);
    };
    const handlePrevImage = () => {
        if (productImages.length <= 1)
            return;
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
                if (!selectedValueId)
                    return false;
                return optionValues.some((value) => value.optionId === option.id && value.id === selectedValueId);
            });
        });
        setSelectedVariant(matching || item.defaultVariant || variants[0] || null);
    }, [item, selectedOptions]);
    useEffect(() => {
        setQuantity(1);
    }, [item?.id]);
    useEffect(() => {
        setIsDescriptionExpanded(false);
    }, [item?.id]);
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (!isLightboxOpen)
                return;
            if (event.key === 'Escape')
                setIsLightboxOpen(false);
            if (event.key === 'ArrowRight')
                handleNextImage();
            if (event.key === 'ArrowLeft')
                handlePrevImage();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isLightboxOpen, productImages.length]);
    if (loading) {
        return (<div className="min-h-screen bg-[var(--cream-apothecary)]">
        <Navigation />
        <main className="pt-28 pb-16">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <PageBreadcrumb />
            <DataLoadingState size="sm" className="py-8" titleClassName="text-sm text-[var(--sage-deep)]/60"/>
          </div>
        </main>
        <Footer />
      </div>);
    }
    if (!item) {
        return <NotFoundPage />;
    }
    const accessoryDescription = extractPlainText(item.description);
    const isDescriptionLong = accessoryDescription.length > 200;
    const visibleDescriptionHtml = isDescriptionLong && !isDescriptionExpanded
        ? truncateRichText(item.description || '', 200)
        : item.description || '';
    const freeShippingThresholdLabel = (() => {
        const thresholdCents = Number(settings?.freeShippingThresholdCents);
        if (Number.isFinite(thresholdCents) && thresholdCents > 0) {
            return formatThresholdEuros(thresholdCents);
        }
        return '45';
    })();
    const currentStockQty = selectedVariant?.stockQty ?? item.stockQty;
    const isOutOfStock = typeof currentStockQty === 'number' && currentStockQty <= 0;
    const currentSku = selectedVariant?.sku || item.defaultVariant?.sku || item.variants?.[0]?.sku || item.sku || '-';
    const matchingWishlistItemId = findMatchingAccessoryWishlistItemId(wishlistItemIdsByKey, {
        variantId: selectedVariant?.id,
        productId: item.id,
    });
    const isWishlistRemovalPending = Boolean(matchingWishlistItemId) && pendingWishlistRemovalItemId === matchingWishlistItemId;
    const isWishlisted = Boolean(matchingWishlistItemId) && !isWishlistRemovalPending;
    return (<div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />
      <main className="pt-28 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <PageBreadcrumb />
          <div className="grid md:grid-cols-2 gap-0 bg-white rounded-2xl shadow overflow-hidden">
              <div className="space-y-3">
                <button type="button" className="h-[fit-content] bg-[#F3F1EE] overflow-hidden group cursor-zoom-in w-full" onMouseMove={handleZoomMove} onMouseLeave={handleZoomLeave} onClick={openLightbox} aria-label={t("app.sections.accessory_detail_page.ouvrir_galerie")}>
                  <img src={getVariantPrimaryImage(selectedVariant) ||
            getVariantPrimaryImage(item.defaultVariant) ||
            item.images?.[0] ||
            '/assets/misc/ingredient_placeholder.png'} alt={item.title} className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-150" style={{ transformOrigin: zoomOrigin }}/>
                </button>
                {productImages.length > 1 && (<div className="flex w-full flex-wrap justify-center gap-2 px-4 pb-4 pt-1">
                    {productImages
                .filter((imageUrl) => imageUrl !==
                (getVariantPrimaryImage(selectedVariant) ||
                    getVariantPrimaryImage(item.defaultVariant) ||
                    item.images?.[0] ||
                    '/assets/misc/ingredient_placeholder.png'))
                .map((imageUrl) => (<button key={imageUrl} type="button" className={`h-16 w-16 rounded-xl overflow-hidden border transition ${'border-[var(--border)] hover:border-[var(--gold-antique)]'}`} onClick={() => {
                    const targetIndex = productImages.indexOf(imageUrl);
                    setLightboxIndex(targetIndex >= 0 ? targetIndex : 0);
                    setIsLightboxOpen(true);
                }} aria-label="Voir l'image">
                        <img src={imageUrl} alt={item.title} className="h-full w-full object-cover"/>
                      </button>))}
                  </div>)}
              </div>
              <div className="space-y-4 p-8">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="font-display text-3xl text-[var(--sage-deep)]">{item.title}</h2>
                  <span className="shrink-0 whitespace-nowrap font-display text-[2rem] text-[var(--gold-antique)]">
                    {getPriceDisplay(item, selectedVariant, quantity)}
                  </span>
                </div>
                {accessoryDescription ? (<div className="w-full">
                    <RichHtml value={visibleDescriptionHtml} className="text-[var(--sage-deep)]/70"/>
                    {isDescriptionLong && (<button type="button" className="ml-1 text-[var(--gold-antique)] hover:underline" onClick={() => setIsDescriptionExpanded((prev) => !prev)}>
                        {isDescriptionExpanded
                            ? t("app.sections.accessory_detail_page.view_less")
                            : t("app.sections.accessory_detail_page.view_more")}
                      </button>)}
                  </div>) : null}
                {item.tags && item.tags.length > 0 && (<div className="flex flex-wrap gap-2">
                    {item.tags.map((tag) => (<span key={tag} className="px-3 py-1.5 bg-[var(--cream-apothecary)] rounded-full text-sm text-[var(--sage-deep)]">
                        {tag}
                      </span>))}
                  </div>)}
                <SingleAccordionSection label={t("app.sections.accessory_detail_page.details_supplementaires")} value={item.additionalDetails}/>
                {item.options && item.options.length > 0 && (<div className="space-y-3">
                    {item.options.map((option) => (<div key={option.id} className="space-y-2">
                        <h4 className="font-medium text-[var(--sage-deep)] mb-3">{t("app.sections.accessory_detail_page.choose_your")} {option.name}</h4>
                        <div className="flex flex-wrap gap-3">
                          {option.values.map((value) => {
                    const isSelected = selectedOptions[option.id] === value.id;
                    return (<button key={value.id} className={`min-w-[7.5rem] rounded-xl border px-4 py-3 text-center text-sm transition ${isSelected
                            ? 'border-[var(--gold-antique)] bg-[var(--cream-apothecary)] text-[var(--sage-deep)]'
                            : 'border-[#E5E0D5] bg-white text-[var(--sage-deep)]/70 hover:border-[var(--gold-antique)]/50'}`} onClick={() => setSelectedOptions((prev) => ({
                            ...prev,
                            [option.id]: value.id,
                        }))}>
                                {value.value}
                              </button>);
                })}
                        </div>
                      </div>))}
                  </div>)}
                <div className="flex flex-wrap gap-3 pt-4">
                  <div className="inline-flex items-stretch overflow-hidden rounded-2xl border border-[#D8CCB5] bg-white shadow-sm">
                    <button type="button" className="flex h-11 w-11 items-center justify-center text-[var(--sage-deep)] transition hover:bg-[var(--cream-apothecary)] disabled:cursor-not-allowed disabled:opacity-45" onClick={() => setQuantity((prev) => Math.max(1, prev - 1))} aria-label={t("app.components.cart_drawer.cart_drawer_items.diminuer_quantity")} disabled={quantity <= 1}>
                      <Minus className="h-4 w-4"/>
                    </button>
                    <div className="flex min-w-[4.5rem] flex-col items-center justify-center border-x border-[#E5E0D5] px-3">
                      <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--sage-deep)]/45">{t("app.sections.accessory_detail_page.quantity")}</span>
                      <span className="text-sm font-medium text-[var(--sage-deep)]">{quantity}</span>
                    </div>
                    <button type="button" className="flex h-11 w-11 items-center justify-center text-[var(--sage-deep)] transition hover:bg-[var(--cream-apothecary)]" onClick={() => setQuantity((prev) => prev + 1)} aria-label={t("app.components.cart_drawer.cart_drawer_items.augmenter_quantity")}>
                      <Plus className="h-4 w-4"/>
                    </button>
                  </div>
                  <button type="button" className="group flex h-[3.125rem] w-[3.125rem] shrink-0 items-center justify-center rounded-xl border border-[#E5E0D5] bg-white text-[var(--gold-antique)] transition hover:border-[var(--gold-antique)] hover:bg-[var(--cream-apothecary)] hover:text-[var(--gold-antique)]" onClick={() => {
            if (isWishlistRemovalPending) {
                return;
            }
            if (matchingWishlistItemId) {
                setPendingWishlistRemovalItemId(matchingWishlistItemId);
                void removeWishlistItem(matchingWishlistItemId).finally(() => {
                    setPendingWishlistRemovalItemId((current) => current === matchingWishlistItemId ? null : current);
                });
                return;
            }
            void addAccessoryToWishlist({
                name: item.title,
                productId: item.id,
                variantId: selectedVariant?.id,
            });
        }} aria-label={isWishlisted
            ? t("app.components.wishlist_drawer.wishlist_drawer.delete")
            : t("app.components.wishlist_drawer.wishlist_drawer.wishlist")} aria-pressed={isWishlisted}>
                    <Heart className={`h-4 w-4 transition-colors ${isWishlisted
                ? 'fill-[var(--gold-antique)] text-[var(--gold-antique)]'
                : 'fill-transparent group-hover:fill-[var(--gold-antique)]'}`}/>
                  </button>
                  <button type="button" className="btn-primary w-full" disabled={!selectedVariant && !item.defaultVariant && (item.variants && item.variants.length > 0)} onClick={() => {
            const variantToAdd = selectedVariant || item.defaultVariant || item.variants?.[0] || null;
            if (variantToAdd) {
                addVariantToCart({
                    variantId: variantToAdd.id,
                    name: item.title,
                    priceCents: variantToAdd.priceCents,
                    imageUrl: variantToAdd.imageUrl || null,
                    quantity,
                    selectedOptions: variantToAdd.optionValues?.map((value) => ({
                        name: value.optionName || 'Option',
                        value: value.value,
                    })),
                });
                return;
            }
            addVariantToCart({
                productId: item.id,
                name: item.title,
                priceCents: typeof item.priceCents === 'number' ? item.priceCents : 0,
                imageUrl: item.images?.[0] || '/assets/misc/ingredient_placeholder.png',
                quantity,
                selectedOptions: [],
            });
        }}>{t("app.sections.accessory_detail_page.add_cart")}</button>
                </div>
                <div className="space-y-1 text-sm text-[var(--sage-deep)]/70">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 shrink-0 text-[var(--gold-antique)]"/>
                    <span>{t("app.sections.hero.shipping_offerte")} {freeShippingThresholdLabel} € {t("app.sections.accessory_detail_page.purchase_suffix")}</span>
                  </div>
                  <div>
                    <span className="text-[var(--sage-deep)]">{t("app.sections.accessory_detail_page.availability")} : </span>
                    <span>{isOutOfStock
                        ? t("app.sections.accessory_detail_page.out_of_stock")
                        : t("app.sections.accessory_detail_page.in_stock")}</span>
                  </div>
                  <div>
                    <span className="text-[var(--sage-deep)]">{t("app.sections.accessory_detail_page.ref_label")} : </span>
                    <span>{currentSku}</span>
                  </div>
                </div>
              </div>
            </div>
        </div>
      </main>
      <Footer />

      {isLightboxOpen && (<div className="fixed inset-0 z-[501] flex items-center justify-center bg-black/60 backdrop-blur" onClick={() => setIsLightboxOpen(false)}>
          <div className="relative max-w-5xl w-[90vw] max-h-[85vh]" onClick={(event) => event.stopPropagation()}>
            <img src={productImages[lightboxIndex]} alt={item?.title || t("app.sections.accessory_detail_page.product")} className="w-full h-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"/>
            <button type="button" className="absolute -top-4 -right-4 w-10 h-10 rounded-full bg-white text-[var(--sage-deep)] shadow flex items-center justify-center" onClick={() => setIsLightboxOpen(false)} aria-label={t("app.sections.accessory_detail_page.close")}>
              ×
            </button>
            {productImages.length > 1 && (<>
                <button type="button" className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-[var(--sage-deep)] shadow flex items-center justify-center" onClick={handlePrevImage} aria-label={t("app.sections.accessory_detail_page.image_prev")}>
                  ‹
                </button>
                <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-[var(--sage-deep)] shadow flex items-center justify-center" onClick={handleNextImage} aria-label={t("app.sections.accessory_detail_page.image_next")}>
                  ›
                </button>
                <div className="absolute bottom-4 right-4 text-xs text-white/80">
                  {lightboxIndex + 1} / {productImages.length}
                </div>
              </>)}
          </div>
        </div>)}
    </div>);
}
