import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Minus, Trash, ShoppingCart, ChevronDown, TicketPercent, Check, ShieldCheck } from 'lucide-react';
import { useBlend } from '@/context/BlendContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/api/client';
import { CreationCupLogo } from '@/components/creation/CreationCupLogo';
import { CreationCupThumbnail } from '@/components/creation/CreationCupThumbnail';
import { ShippingInfoAccordion } from '@/components/ShippingInfoAccordion';
import { DataLoadingState, InlineLoading } from '@/components/ui/loading-state';
import { sortIngredientsByCategoryOrder } from '@/lib/ingredient-order';
import { getBlendFormatLabel } from '@/lib/blend-format';
import { showToast } from '@/lib/toast';
import { t } from "@/lib/i18n";
const FREE_SHIPPING_THRESHOLD_CENTS = 4500;
const PAYMENT_METHOD_CARDS = [
    { id: 'visa', src: '/assets/footer/visa.png', alt: 'Visa' },
    { id: 'mastercard', src: '/assets/footer/mastercard.png', alt: 'Mastercard' },
    { id: 'amex', src: '/assets/footer/amex.png', alt: 'American Express' },
    { id: 'discover', src: '/assets/footer/discover.png', alt: 'Discover' },
    { id: 'paypal', src: '/assets/footer/paypal.png', alt: 'PayPal' },
    { id: 'applepay', src: '/assets/footer/applepay.png', alt: 'Apple Pay' },
    { id: 'googlepay', src: '/assets/footer/googlepay.png', alt: 'Google Pay' }
];
const isRecurringCartItem = (item: {
    itemType: 'BLEND' | 'VARIANT' | 'PACK' | 'SUBSCRIPTION';
    purchaseMode?: 'ONE_TIME' | 'SUBSCRIPTION';
}) => item.itemType === 'SUBSCRIPTION' || item.purchaseMode === 'SUBSCRIPTION';
const formatRecurringCadence = (item: {
    subscriptionIntervalCount?: 1 | 2 | 3;
}) => {
    const intervalLabel = item.subscriptionIntervalCount === 2
        ? t("app.components.subscriptions.blend_subscription_card.interval_two_months")
        : item.subscriptionIntervalCount === 3
            ? t("app.components.subscriptions.blend_subscription_card.interval_three_months")
            : t("app.components.subscriptions.blend_subscription_card.interval_one_month");
    return `${t("app.components.subscriptions.blend_subscription_card.subscription_title")} · ${intervalLabel.toLowerCase()}`;
};
const formatRecurringCadenceLabel = (item: {
    subscriptionIntervalCount?: 1 | 2 | 3;
}) => {
    void formatRecurringCadence;
    const intervalLabel = item.subscriptionIntervalCount === 2
        ? t("app.sections.account.account_subscriptions.every_two_months")
        : item.subscriptionIntervalCount === 3
            ? t("app.sections.account.account_subscriptions.every_three_months")
            : t("app.sections.account.account_subscriptions.every_month");
    return `${t("app.components.subscriptions.blend_subscription_card.subscription_title")} · ${intervalLabel}`;
};
export function Cart() {
    const { cartItems, removeFromCart, updateCartItemQuantity, cartSubtotal, appliedDiscountCode, applyDiscountCode, removeDiscountCode, cartSummary, cartMessages, isCartSummaryLoading, pendingItemIds, } = useBlend();
    const { customer, isLoading: isAuthLoading } = useAuth();
    const [codeInput, setCodeInput] = useState(appliedDiscountCode || '');
    const [isDiscountCodeOpen, setIsDiscountCodeOpen] = useState(false);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    const [checkoutNeedsLogin, setCheckoutNeedsLogin] = useState(false);
    const [isCheckoutSubmitting, setIsCheckoutSubmitting] = useState(false);
    useEffect(() => {
        setCodeInput(appliedDiscountCode || '');
    }, [appliedDiscountCode]);
    const setCheckoutErrorFeedback = useCallback((message: string, options?: {
        needsLogin?: boolean;
    }) => {
        setCheckoutError(message);
        setCheckoutNeedsLogin(Boolean(options?.needsLogin));
        showToast(message, 'error');
    }, []);
    const formatCents = useCallback((cents: number) => (cents / 100).toFixed(2), []);
    const freeShipping = cartSummary?.freeShippingProgress;
    const summary = cartSummary;
    const subtotalCentsForProgress = summary?.subtotalCents ?? Math.round(cartSubtotal * 100);
    const freeShippingThresholdCents = freeShipping?.thresholdCents ?? FREE_SHIPPING_THRESHOLD_CENTS;
    const freeShippingRemainingCents = freeShipping?.remainingCents ?? Math.max(0, freeShippingThresholdCents - subtotalCentsForProgress);
    const freeShippingUnlocked = freeShipping?.isUnlocked ?? freeShippingRemainingCents === 0;
    const freeShippingProgress = freeShipping?.progress ??
        Math.min(1, freeShippingThresholdCents > 0 ? subtotalCentsForProgress / freeShippingThresholdCents : 1);
    const summaryShippingCents = summary?.shippingCents ?? 0;
    const summaryOriginalShippingCents = summary?.originalShippingCents ?? summaryShippingCents;
    const displayShippingCents = freeShippingUnlocked ? 0 : summaryShippingCents;
    const displayOriginalShippingCents = summaryOriginalShippingCents;
    const visibleDiscountLines = summary?.discountLines?.filter((line) => line.type !== 'FREE_SHIPPING') ?? [];
    const computedTotalCents = summary
        ? summary.totalCents
        : Math.round((cartSubtotal + displayShippingCents / 100) * 100);
    const [displayTotalCents, setDisplayTotalCents] = useState(computedTotalCents);
    useEffect(() => {
        if (!isCartSummaryLoading && pendingItemIds.size === 0) {
            setDisplayTotalCents(computedTotalCents);
        }
    }, [computedTotalCents, isCartSummaryLoading, pendingItemIds]);
    const hasDiscounts = visibleDiscountLines.length > 0;
    const isInitialCartLoading = isAuthLoading || (Boolean(customer?.id) && cartItems.length === 0 && !summary && cartMessages.length === 0);
    const normalizedAppliedDiscountCode = appliedDiscountCode?.trim().toUpperCase() || null;
    const hasMatchedCodeDiscount = Boolean(normalizedAppliedDiscountCode &&
        summary?.matchedDiscounts?.some((discount) => discount.method === 'CODE' && (discount.code || '').trim().toUpperCase() === normalizedAppliedDiscountCode));
    const isDiscountCodeApplied = Boolean(normalizedAppliedDiscountCode &&
        ((summary?.appliedCode || '').trim().toUpperCase() === normalizedAppliedDiscountCode || hasMatchedCodeDiscount));
    useEffect(() => {
        if (isDiscountCodeApplied) {
            setCodeInput('');
        }
    }, [isDiscountCodeApplied]);
    const effectiveCartMessages = useMemo(() => {
        if (Array.isArray(cartMessages) && cartMessages.length > 0)
            return cartMessages;
        if (Array.isArray(summary?.messages) && summary.messages.length > 0)
            return summary.messages;
        return [];
    }, [cartMessages, summary?.messages]);
    const codeMessage = useMemo(() => {
        const fromKeyword = effectiveCartMessages.find((msg) => {
            const normalized = msg.toLowerCase();
            return normalized.includes('code') || normalized.includes('reduction') || normalized.includes('remise');
        });
        if (fromKeyword)
            return fromKeyword;
        if (appliedDiscountCode && !isDiscountCodeApplied && effectiveCartMessages.length > 0) {
            return effectiveCartMessages[0];
        }
        return undefined;
    }, [appliedDiscountCode, effectiveCartMessages, isDiscountCodeApplied]);
    const hasExplicitNonAppliedReason = Boolean(codeMessage);
    if (isInitialCartLoading) {
        return (<section id="cart" className="min-h-screen flex items-center justify-center bg-[#FAF8F3] py-20">
        <div className="max-w-3xl mx-auto text-center px-6">
          <DataLoadingState size="lg" title={t("app.sections.cart.loading_cart")} description={t("app.sections.cart.recuperation_articles_cours")} titleClassName="font-display text-3xl text-[var(--sage-deep)] mb-3"/>
        </div>
      </section>);
    }
    if (!cartItems || cartItems.length === 0) {
        return (<section id="cart" className="min-h-screen flex items-center justify-center bg-[#FAF8F3] py-20">
        <div className="max-w-3xl mx-auto text-center px-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white shadow mb-6">
            <ShoppingCart className="w-8 h-8 text-[var(--sage-deep)]"/>
          </div>
          <h2 className="font-display text-3xl text-[var(--sage-deep)] mb-3">{t("app.sections.cart.cart_empty")}</h2>
          <p className="text-[var(--sage-deep)]/60 mb-6">{t("app.sections.cart.create_melange_unique")}</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => { window.location.href = '/?a=creator'; }} className="btn-primary">{t("app.sections.cart.create_my_melange")}</button>
          </div>
        </div>
      </section>);
    }
    return (<section id="cart" className="bg-[#FAF8F3] pt-28 pb-6 mb-6">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-3xl text-[var(--sage-deep)]">{t("app.sections.cart.cart_2")}</h2>
          <div className="text-sm text-[var(--sage-deep)]/60">
            {cartItems.reduce((sum, item) => sum + item.quantity, 0)} article
            {cartItems.reduce((sum, item) => sum + item.quantity, 0) > 1 ? 's' : ''}
          </div>
        </div>

        <div className="mb-6 mx-auto w-full max-w-4xl px-4">
          <div className="relative flex w-full items-center justify-center gap-[5rem]">
            <span className="pointer-events-none absolute left-10 right-10 top-1/2 -translate-y-1/2 border-t border-[#E5E0D5]"/>

            <span aria-current="step" className="relative z-10 inline-flex min-w-[11rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-[var(--gold-antique)] px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]">{t("app.sections.cart.cart")}</span>

            <a href="/checkout" className="relative z-10 inline-flex min-w-[15rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-white px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]/80 transition hover:border-[var(--gold-antique)] hover:text-[var(--sage-deep)]">{t("app.sections.cart.shipping_payment")}</a>

            <span className="relative z-10 inline-flex min-w-[11rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-white px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]/70">
              {t("app.sections.cart.confirmation_step")}
            </span>
          </div>
        </div>

        {freeShippingThresholdCents > 0 && (<div className="mb-6 bg-white rounded-2xl p-5 shadow">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-[var(--sage-deep)]">
                {freeShippingUnlocked
                ? t("app.sections.cart.shipping_free_debloquee") : t("app.sections.cart.remaining_free_shipping", undefined, { amount: formatCents(freeShippingRemainingCents) })}
              </div>
              <div className="text-xs text-[var(--sage-deep)]/60">{t("app.sections.cart.seuil_france")} {formatCents(freeShippingThresholdCents)} &euro;</div>
            </div>
            <div className="h-2 bg-[#F3F1EE] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--gold-antique)] transition-all" style={{ width: `${Math.round(freeShippingProgress * 100)}%` }}/>
            </div>
            <div className="mt-2 text-xs text-[var(--sage-deep)]/60">{t("app.sections.cart.shipping_rapide_france")}</div>
          </div>)}

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {cartItems.map(item => {
            const isPending = pendingItemIds.has(item.id);
            const isRecurring = isRecurringCartItem(item);
            const orderedBlendIngredients = item.itemType === 'BLEND'
                ? sortIngredientsByCategoryOrder(item.ingredients || [])
                : [];
            const visualFillColor = orderedBlendIngredients[0]?.ingredientColor ?? item.color ?? '#C4A77D';
            return (<div key={item.id} className="grid grid-cols-[4.25rem,minmax(0,1fr),auto,auto,auto] gap-4 items-center bg-white rounded-2xl p-4 shadow">
                {/* Swatch */}
                <div className="flex justify-start pl-1">
                  {(item.itemType === 'VARIANT' || item.itemType === 'PACK') && item.imageUrl ? (<div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                      <img src={item.imageUrl || undefined} alt={item.name} className="h-full w-full rounded-lg object-cover"/>
                    </div>) : (<CreationCupThumbnail fillColor={visualFillColor} ingredientCount={(item.ingredients || []).length} recurring={isRecurring} containerClassName="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0" cupClassName="w-full h-full"/>)}
                  {false && (<>
                  {(item.itemType === 'VARIANT' || item.itemType === 'PACK') && item.imageUrl ? (<div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                      <img src={item.imageUrl || undefined} alt={item.name} className="h-full w-full rounded-lg object-cover"/>
                    </div>) : item.itemType === 'SUBSCRIPTION' ? (<div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                      <div className="h-full w-full rounded-lg bg-[var(--cream-apothecary)] flex items-center justify-center text-[var(--sage-deep)] text-xs">
                      ♻️
                      </div>
                    </div>) : (<div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                      <CreationCupLogo fillColor={orderedBlendIngredients[0]?.ingredientColor || '#C4A77D'} ingredientCount={(item.ingredients || []).length} className="w-full h-full"/>
                    </div>)}
                  </>)}
                </div>

                {/* Name & Ingredients */}
                <div className="min-w-0">
                  <div className="font-medium text-[var(--sage-deep)] break-words">{item.name}</div>
                  {item.itemType === 'BLEND' && isRecurring && (<div className="text-xs font-semibold text-[var(--gold-antique)] break-words">
                      {formatRecurringCadenceLabel(item)}
                    </div>)}
                  {item.itemType === 'BLEND' && (<div className="text-xs text-[var(--sage-deep)]/60 break-words">
                      {orderedBlendIngredients.map(i => i.name).join(', ')}
                    </div>)}
                  {item.itemType === 'BLEND' && (<div className="text-xs text-[var(--sage-deep)]/60 break-words">
                      Format: {getBlendFormatLabel(item.blendFormat)}
                    </div>)}
                  {item.itemType === 'VARIANT' && item.selectedOptions && item.selectedOptions.length > 0 && (<div className="text-xs text-[var(--sage-deep)]/60 break-words">
                      {item.selectedOptions.map((opt) => `${opt.name}: ${opt.value}`).join(' • ')}
                    </div>)}
                  {item.itemType === 'PACK' && item.packItems && item.packItems.length > 0 && (<div className="text-xs text-[var(--sage-deep)]/60 break-words">
                      {item.packItems.map((pack) => `${pack.qty}× ${pack.title}`).join(' • ')}
                    </div>)}
                  {item.itemType === 'SUBSCRIPTION' && (<div className="text-xs text-[var(--sage-deep)]/60 break-words">
                      {t("app.components.subscriptions.blend_subscription_card.subscription_title")}
                    </div>)}
                </div>

                {/* Quantity Controls */}
                <div className="flex justify-center">
                  {isRecurring ? (<div className="flex h-10 w-24 items-center justify-center rounded-lg border border-[#E5E0D5] bg-[#FAF8F3] px-2 text-sm font-medium text-[var(--sage-deep)]/70">
                      {item.quantity}
                    </div>) : (<div className="flex items-center border rounded-lg overflow-hidden w-24">
                      <button onClick={() => {
                    if (isPending)
                        return;
                    updateCartItemQuantity(item.id, item.quantity - 1);
                }} className="p-2 hover:bg-[#F3F1EE] flex-1" disabled={isPending}>
                        <Minus className="w-4 h-4 mx-auto"/>
                      </button>
                      <div className="px-2 text-sm font-medium flex-1 text-center">{item.quantity}</div>
                      <button onClick={() => {
                    if (isPending)
                        return;
                    updateCartItemQuantity(item.id, item.quantity + 1);
                }} className="p-2 hover:bg-[#F3F1EE] flex-1" disabled={isPending}>
                        <Plus className="w-4 h-4 mx-auto"/>
                      </button>
                    </div>)}
                </div>

                {/* Price */}
                <div className="text-right">
                  {isRecurring && item.basePriceCents && item.basePriceCents > Math.round(item.price * 100) && (<div className="text-xs text-[var(--sage-deep)]/45 line-through">
                      {(item.basePriceCents / 100).toFixed(2)} €
                    </div>)}
                  <div className="font-display text-lg text-[var(--gold-antique)]">{(item.price * item.quantity).toFixed(2)} €</div>
                  <div className="text-xs text-[var(--sage-deep)]/60">{item.price.toFixed(2)}{t("app.sections.cart.unite")}</div>
                </div>

                {/* Delete Button */}
                <div className="flex justify-center">
                  <button onClick={() => {
                    if (isPending)
                        return;
                    removeFromCart(item.id);
                }} className="p-2 hover:bg-red-50 rounded" disabled={isPending}>
                    <Trash className="w-4 h-4 text-red-500"/>
                  </button>
                </div>
              </div>);
        })}
          </div>

          <aside className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-2xl p-6 shadow">
              <div className="space-y-3 mb-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-[var(--sage-deep)]/60">{t("app.sections.cart.subtotal")}</div>
                  <div className="font-medium text-[var(--sage-deep)]">
                    {summary ? formatCents(summary.subtotalCents) : cartSubtotal.toFixed(2)} €
                  </div>
                </div>

                {isCartSummaryLoading && (<InlineLoading label={t("app.sections.cart.calcul_discounts")} className="mb-6" textClassName="text-xs text-[var(--sage-deep)]/60"/>)}

                {hasDiscounts && summary && (<div className="space-y-2">
                  {visibleDiscountLines.map((line) => (<div key={line.discountId} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-[var(--sage-deep)]/70">
                        <TicketPercent className="h-4 w-4 text-[var(--gold-antique)]"/>
                        <span>{line.label}</span>
                      </div>
                      <div className="text-[var(--gold-antique)]">- {formatCents(line.amountCents)} €</div>
                    </div>))}
                  </div>)}

                <div className="flex items-center justify-between">
                  <div className="text-sm text-[var(--sage-deep)]/60">{t("app.sections.cart.shipping")}{displayShippingCents > 0 ? ' ' + t("app.sections.cart.estimee") : ''}</div>
                  <div className="text-sm font-medium text-[var(--sage-deep)]">
                    {summary ? (displayShippingCents === 0 ? (displayOriginalShippingCents > 0 ? (<span>
                            <span className="line-through text-[var(--sage-deep)]/40 mr-2">{formatCents(displayOriginalShippingCents)} €</span>
                            <span className="text-[var(--gold-antique)]">{t("app.sections.cart.free")}</span>
                          </span>) : (t("app.sections.cart.free"))) : (`${formatCents(displayShippingCents)} €`)) : isCartSummaryLoading ? (<InlineLoading label={t("app.sections.cart.calcul")} textClassName="text-xs text-[var(--sage-deep)]/60"/>) : (t("app.sections.cart.confirmer"))}
                  </div>
                </div>
              </div>

              <div className="border-t border-[#E5E0D5] pt-3 flex items-center justify-between mb-4">
                <div className="text-sm text-[var(--sage-deep)]/60">{t("app.sections.cart.total")}</div>
                <div className="font-display text-xl text-[var(--gold-antique)]">{formatCents(displayTotalCents)} €</div>
              </div>

              <button onClick={async () => {
            setCheckoutError(null);
            setCheckoutNeedsLogin(false);
            const hasLegacySubscription = cartItems.some((item) => item.itemType === 'SUBSCRIPTION');
            const hasBlendSubscription = cartItems.some((item) => item.itemType === 'BLEND' && item.purchaseMode === 'SUBSCRIPTION');
            const hasOneTime = cartItems.some((item) => item.itemType !== 'SUBSCRIPTION' && item.purchaseMode !== 'SUBSCRIPTION');
            if (hasLegacySubscription && hasOneTime) {
                setCheckoutErrorFeedback(t("app.sections.cart.please_separer_abonnements"));
                return;
            }
            if ((!customer?.email && hasBlendSubscription) ||
                (!customer?.id && cartItems.some((item) => item.itemType === 'VARIANT' || item.itemType === 'PACK' || item.itemType === 'SUBSCRIPTION'))) {
                setCheckoutErrorFeedback(t("app.sections.cart.please_vous_connecter"), { needsLogin: true });
                return;
            }
            if (hasLegacySubscription && !hasBlendSubscription) {
                const planId = cartItems.find((item) => item.itemType === 'SUBSCRIPTION')?.subscriptionPlanId;
                if (!planId) {
                    setCheckoutErrorFeedback("Plan d'abonnement introuvable.");
                    return;
                }
                try {
                    setIsCheckoutSubmitting(true);
                    const session = await api.checkoutSubscription({ planId });
                    if (session?.url) {
                        window.location.href = session.url;
                        return;
                    }
                    setCheckoutErrorFeedback(t("app.sections.cart.failed_create_session"));
                }
                catch (e: any) {
                    setCheckoutErrorFeedback(e?.message || t("app.sections.cart.failed_create_session"));
                }
                finally {
                    setIsCheckoutSubmitting(false);
                }
                return;
            }
            window.location.href = '/checkout';
        }} className="w-full btn-primary mb-5" disabled={isCheckoutSubmitting}>
                {t("app.sections.cart.checkout_cta")}
              </button>

              {checkoutError && (<div className="mb-3 text-xs text-red-600" role="alert">
                  {checkoutError}
                  {checkoutNeedsLogin && (<a href="/login" className="ml-1 text-[var(--gold-antique)] hover:underline">
                      {t("app.sections.cart.login_cta")}
                    </a>)}
                </div>)}

              <>
                {summary && (<div className="text-xs text-[var(--sage-deep)]/60 mb-3">{t("app.sections.cart.taxes_incluses")} {displayShippingCents !== 0 ? (<>{t("app.sections.cart.fees_shipping_recalcules")}</>) : '.'}
                </div>)}

                <div className="border-t border-[#E5E0D5] pt-3 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--gold-antique)]"/>
                  <span className="text-xs text-[var(--sage-deep)]">{t("app.sections.cart.secure_payment_full")}</span>
                </div>
                <div className="mt-2 grid grid-cols-7 gap-1.5">
                  {PAYMENT_METHOD_CARDS.map((card) => (<img key={card.id} src={card.src} alt={card.alt} loading="lazy" className="h-5 w-full min-w-0 object-contain rounded-[12%] sm:h-6"/>))}
                </div>
              </>
            </div>
            
            <div className="bg-white rounded-2xl p-5 shadow">
              <button type="button" onClick={() => setIsDiscountCodeOpen((prev) => !prev)} className="relative flex w-full items-center pr-10 text-left text-sm text-[var(--sage-deep)]">
                <span className="text-sm text-[var(--sage-deep)]/60">{t("app.sections.cart.add_code_discount")}</span>
                <ChevronDown className={`absolute right-0 top-1/2 h-5 w-5 shrink-0 -translate-y-1/2 text-[var(--gold-antique)] transition-transform duration-200 ${isDiscountCodeOpen ? 'rotate-180' : ''}`}/>
              </button>
              {isDiscountCodeOpen && (<>
                  <div className="mt-2 flex items-center gap-2">
                    <input className="flex-1 rounded-md border border-[#E5E0D5] p-3 text-sm uppercase" style={{ width: '180px' }} value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())} placeholder={t("app.sections.cart.entrez_code")}/>
                    <button className="btn-primary px-4 py-3 whitespace-nowrap" onClick={() => {
                if (codeInput.trim().length === 0) {
                    removeDiscountCode();
                    return;
                }
                applyDiscountCode(codeInput);
            }} aria-label={t("app.sections.cart.add_code_discount")}>
                      <Check className="h-4 w-4"/>
                    </button>
                  </div>
                  {appliedDiscountCode && (<div className="flex items-center justify-between text-xs text-[var(--sage-deep)]/70 mt-2">
                      <span>
                        {isDiscountCodeApplied ? t("app.sections.cart.code_applique") : hasExplicitNonAppliedReason ? t("app.sections.cart.code_non_applique") : 'Code:'}{' '}
                        <strong>{appliedDiscountCode}</strong>
                      </span>
                      <button className="text-[var(--gold-antique)]" onClick={removeDiscountCode}>Retirer</button>
                    </div>)}
                  {codeMessage && (<div className="text-xs text-red-600 mt-2">{codeMessage}</div>)}
                  {effectiveCartMessages
                .filter((msg) => msg !== codeMessage)
                .map((msg) => (<div key={msg} className="text-xs text-[var(--sage-deep)]/60 mt-2">{msg}</div>))}
                </>)}
            </div>
            
            <ShippingInfoAccordion />

          </aside>
        </div>
      </div>
    </section>);
}

