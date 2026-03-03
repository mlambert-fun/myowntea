import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Minus, Trash, ShoppingCart, ChevronDown, TicketPercent } from 'lucide-react';
import { useBlend } from '@/context/BlendContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/api/client';
import { CreationCupLogo } from '@/components/creation/CreationCupLogo';
import { ShippingInfoAccordion } from '@/components/ShippingInfoAccordion';
import { DataLoadingState, InlineLoading } from '@/components/ui/loading-state';
import { sortIngredientsByCategoryOrder } from '@/lib/ingredient-order';
import { getBlendFormatLabel } from '@/lib/blend-format';
import { showToast } from '@/lib/toast';
const FREE_SHIPPING_THRESHOLD_CENTS = 4500;

export function Cart() {
  const {
    cartItems,
    removeFromCart,
    updateCartItemQuantity,
    cartSubtotal,
    appliedDiscountCode,
    applyDiscountCode,
    removeDiscountCode,
    cartSummary,
    cartMessages,
    isCartSummaryLoading,
    pendingItemIds,
  } = useBlend();
  const { customer, isLoading: isAuthLoading } = useAuth();

  const [codeInput, setCodeInput] = useState(appliedDiscountCode || '');
  const [isDiscountCodeOpen, setIsDiscountCodeOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutNeedsLogin, setCheckoutNeedsLogin] = useState(false);
  const [isCheckoutSubmitting, setIsCheckoutSubmitting] = useState(false);

  useEffect(() => {
    setCodeInput(appliedDiscountCode || '');
  }, [appliedDiscountCode]);

  const setCheckoutErrorFeedback = useCallback(
    (message: string, options?: { needsLogin?: boolean }) => {
      setCheckoutError(message);
      setCheckoutNeedsLogin(Boolean(options?.needsLogin));
      showToast(message, 'error');
    },
    []
  );

  const formatCents = useCallback((cents: number) => (cents / 100).toFixed(2), []);

  const freeShipping = cartSummary?.freeShippingProgress;
  const summary = cartSummary;
  const subtotalCentsForProgress = summary?.subtotalCents ?? Math.round(cartSubtotal * 100);
  const freeShippingThresholdCents = freeShipping?.thresholdCents ?? FREE_SHIPPING_THRESHOLD_CENTS;
  const freeShippingRemainingCents =
    freeShipping?.remainingCents ?? Math.max(0, freeShippingThresholdCents - subtotalCentsForProgress);
  const freeShippingUnlocked = freeShipping?.isUnlocked ?? freeShippingRemainingCents === 0;
  const freeShippingProgress =
    freeShipping?.progress ??
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
  const isInitialCartLoading =
    isAuthLoading || (Boolean(customer?.id) && cartItems.length === 0 && !summary && cartMessages.length === 0);
  const normalizedAppliedDiscountCode = appliedDiscountCode?.trim().toUpperCase() || null;
  const hasMatchedCodeDiscount = Boolean(
    normalizedAppliedDiscountCode &&
      summary?.matchedDiscounts?.some(
        (discount) =>
          discount.method === 'CODE' && (discount.code || '').trim().toUpperCase() === normalizedAppliedDiscountCode
      )
  );
  const isDiscountCodeApplied = Boolean(
    normalizedAppliedDiscountCode &&
      ((summary?.appliedCode || '').trim().toUpperCase() === normalizedAppliedDiscountCode || hasMatchedCodeDiscount)
  );

  useEffect(() => {
    if (isDiscountCodeApplied) {
      setCodeInput('');
    }
  }, [isDiscountCodeApplied]);

  const effectiveCartMessages = useMemo(() => {
    if (Array.isArray(cartMessages) && cartMessages.length > 0) return cartMessages;
    if (Array.isArray(summary?.messages) && summary.messages.length > 0) return summary.messages;
    return [];
  }, [cartMessages, summary?.messages]);
  const codeMessage = useMemo(() => {
    const fromKeyword = effectiveCartMessages.find((msg) => {
      const normalized = msg.toLowerCase();
      return normalized.includes('code') || normalized.includes('reduction') || normalized.includes('remise');
    });
    if (fromKeyword) return fromKeyword;
    if (appliedDiscountCode && !isDiscountCodeApplied && effectiveCartMessages.length > 0) {
      return effectiveCartMessages[0];
    }
    return undefined;
  }, [appliedDiscountCode, effectiveCartMessages, isDiscountCodeApplied]);
  const hasExplicitNonAppliedReason = Boolean(codeMessage);

  if (isInitialCartLoading) {
    return (
      <section id="cart" className="min-h-screen flex items-center justify-center bg-[#FAF8F3] py-20">
        <div className="max-w-3xl mx-auto text-center px-6">
          <DataLoadingState
            size="lg"
            title="Chargement du panier"
            description="Récupération de vos articles en cours..."
            titleClassName="font-display text-3xl text-[var(--sage-deep)] mb-3"
          />
        </div>
      </section>
    );
  }

  if (!cartItems || cartItems.length === 0) {
    return (
      <section id="cart" className="min-h-screen flex items-center justify-center bg-[#FAF8F3] py-20">
        <div className="max-w-3xl mx-auto text-center px-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white shadow mb-6">
            <ShoppingCart className="w-8 h-8 text-[var(--sage-deep)]" />
          </div>
          <h2 className="font-display text-3xl text-[var(--sage-deep)] mb-3">Votre panier est vide</h2>
          <p className="text-[var(--sage-deep)]/60 mb-6">Créez un thé unique et ajoutez-le ici pour le commander plus tard.</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => { window.location.href = '/?scroll=creator'; }} className="btn-primary">Créer Mon Thé</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="cart" className="bg-[#FAF8F3] pt-28 pb-6 mb-6">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-3xl text-[var(--sage-deep)]">Votre Panier</h2>
          <div className="text-sm text-[var(--sage-deep)]/60">
            {cartItems.reduce((sum, item) => sum + item.quantity, 0)} article
            {cartItems.reduce((sum, item) => sum + item.quantity, 0) > 1 ? 's' : ''}
          </div>
        </div>

        <div className="mb-6 mx-auto w-full max-w-4xl px-4">
          <div className="relative flex w-full items-center justify-center gap-[5rem]">
            <span className="pointer-events-none absolute left-10 right-10 top-1/2 -translate-y-1/2 border-t border-[#E5E0D5]" />

            <span
              aria-current="step"
              className="relative z-10 inline-flex min-w-[11rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-[var(--gold-antique)] px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]"
            >
              1. Panier
            </span>

            <a
              href="/checkout"
              className="relative z-10 inline-flex min-w-[15rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-white px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]/80 transition hover:border-[var(--gold-antique)] hover:text-[var(--sage-deep)]"
            >
              2. Livraison et paiement
            </a>

            <span className="relative z-10 inline-flex min-w-[11rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-white px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]/70">
              3. Confirmation
            </span>
          </div>
        </div>

        {freeShippingThresholdCents > 0 && (
          <div className="mb-6 bg-white rounded-2xl p-5 shadow">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-[var(--sage-deep)]">
                {freeShippingUnlocked
                  ? 'Livraison gratuite débloquée'
                  : `Plus que ${formatCents(freeShippingRemainingCents)} € pour la Livraison Gratuite`}
              </div>
              <div className="text-xs text-[var(--sage-deep)]/60">Seuil France: {formatCents(freeShippingThresholdCents)} EUR</div>
            </div>
            <div className="h-2 bg-[#F3F1EE] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--gold-antique)] transition-all"
                style={{ width: `${Math.round(freeShippingProgress * 100)}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-[var(--sage-deep)]/60">Livraison rapide en France et en Belgique</div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {cartItems.map(item => {
              const isPending = pendingItemIds.has(item.id);
              const orderedBlendIngredients =
                item.itemType === 'BLEND'
                  ? sortIngredientsByCategoryOrder(item.ingredients || [])
                  : [];
              return (
              <div key={item.id} className="grid grid-cols-[4.25rem,minmax(0,1fr),auto,auto,auto] gap-4 items-center bg-white rounded-2xl p-4 shadow">
                {/* Swatch */}
                <div className="flex justify-start pl-1">
                  {(item.itemType === 'VARIANT' || item.itemType === 'PACK') && item.imageUrl ? (
                    <div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                      <img src={item.imageUrl} alt={item.name} className="h-full w-full rounded-lg object-cover" />
                    </div>
                  ) : item.itemType === 'SUBSCRIPTION' ? (
                    <div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                      <div className="h-full w-full rounded-lg bg-[var(--cream-apothecary)] flex items-center justify-center text-[var(--sage-deep)] text-xs">
                      ♻️
                      </div>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                      <CreationCupLogo
                        fillColor={orderedBlendIngredients[0]?.ingredientColor || '#C4A77D'}
                        ingredientCount={(item.ingredients || []).length}
                        className="w-full h-full"
                      />
                    </div>
                  )}
                </div>

                {/* Name & Ingredients */}
                <div className="min-w-0">
                  <div className="font-medium text-[var(--sage-deep)] break-words">{item.name}</div>
                  {item.itemType === 'BLEND' && (
                    <div className="text-xs text-[var(--sage-deep)]/60 break-words">
                      {orderedBlendIngredients.map(i => i.name).join(', ')}
                    </div>
                  )}
                  {item.itemType === 'BLEND' && (
                    <div className="text-xs text-[var(--sage-deep)]/60 break-words">
                      Format: {getBlendFormatLabel(item.blendFormat)}
                    </div>
                  )}
                  {item.itemType === 'VARIANT' && item.selectedOptions && item.selectedOptions.length > 0 && (
                    <div className="text-xs text-[var(--sage-deep)]/60 break-words">
                      {item.selectedOptions.map((opt) => `${opt.name}: ${opt.value}`).join(' • ')}
                    </div>
                  )}
                  {item.itemType === 'PACK' && item.packItems && item.packItems.length > 0 && (
                    <div className="text-xs text-[var(--sage-deep)]/60 break-words">
                      {item.packItems.map((pack) => `${pack.qty}× ${pack.title}`).join(' • ')}
                    </div>
                  )}
                  {item.itemType === 'SUBSCRIPTION' && (
                    <div className="text-xs text-[var(--sage-deep)]/60 break-words">
                      Abonnement mensuel • renouvellement automatique
                    </div>
                  )}
                </div>

                {/* Quantity Controls */}
                <div className="flex justify-center">
                  <div className="flex items-center border rounded-lg overflow-hidden w-24">
                    <button
                      onClick={() => {
                        if (item.itemType === 'SUBSCRIPTION') return;
                        if (isPending) return;
                        updateCartItemQuantity(item.id, item.quantity - 1);
                      }}
                      className="p-2 hover:bg-[#F3F1EE] flex-1"
                      disabled={item.itemType === 'SUBSCRIPTION' || isPending}
                    >
                      <Minus className="w-4 h-4 mx-auto" />
                    </button>
                    <div className="px-2 text-sm font-medium flex-1 text-center">{item.quantity}</div>
                    <button
                      onClick={() => {
                        if (item.itemType === 'SUBSCRIPTION') return;
                        if (isPending) return;
                        updateCartItemQuantity(item.id, item.quantity + 1);
                      }}
                      className="p-2 hover:bg-[#F3F1EE] flex-1"
                      disabled={item.itemType === 'SUBSCRIPTION' || isPending}
                    >
                      <Plus className="w-4 h-4 mx-auto" />
                    </button>
                  </div>
                </div>

                {/* Price */}
                <div className="text-right">
                  <div className="font-display text-lg text-[var(--gold-antique)]">{(item.price * item.quantity).toFixed(2)} €</div>
                  <div className="text-xs text-[var(--sage-deep)]/60">{item.price.toFixed(2)} € / unité</div>
                </div>

                {/* Delete Button */}
                <div className="flex justify-center">
                  <button
                    onClick={() => {
                      if (isPending) return;
                      removeFromCart(item.id);
                    }}
                    className="p-2 hover:bg-red-50 rounded"
                    disabled={isPending}
                  >
                    <Trash className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
              );
            })}
          </div>

          <aside className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-2xl p-6 shadow">
              <div className="space-y-3 mb-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-[var(--sage-deep)]/60">Sous-total</div>
                  <div className="font-medium text-[var(--sage-deep)]">
                    {summary ? formatCents(summary.subtotalCents) : cartSubtotal.toFixed(2)} €
                  </div>
                </div>

                {isCartSummaryLoading && (
                  <InlineLoading
                    label="Calcul des réductions..."
                    className="mb-6"
                    textClassName="text-xs text-[var(--sage-deep)]/60"
                  />
                )}

                {hasDiscounts && summary && (
                  <div className="space-y-2">
                  {visibleDiscountLines.map((line) => (
                    <div key={line.discountId} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-[var(--sage-deep)]/70">
                        <TicketPercent className="h-4 w-4 text-[var(--gold-antique)]" />
                        <span>{line.label}</span>
                      </div>
                      <div className="text-[var(--gold-antique)]">- {formatCents(line.amountCents)} €</div>
                    </div>
                  ))}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="text-sm text-[var(--sage-deep)]/60">Livraison{displayShippingCents > 0 ? ' (estimée)' : ''}</div>
                  <div className="text-sm font-medium text-[var(--sage-deep)]">
                    {summary ? (
                      displayShippingCents === 0 ? (
                        displayOriginalShippingCents > 0 ? (
                          <span>
                            <span className="line-through text-[var(--sage-deep)]/40 mr-2">{formatCents(displayOriginalShippingCents)} €</span>
                            <span className="text-[var(--gold-antique)]">Gratuite</span>
                          </span>
                        ) : (
                          'Gratuite'
                        )
                      ) : (
                        `${formatCents(displayShippingCents)} €`
                      )
                    ) : isCartSummaryLoading ? (
                      <InlineLoading label="Calcul..." textClassName="text-xs text-[var(--sage-deep)]/60" />
                    ) : (
                      'À confirmer'
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-[#E5E0D5] pt-3 flex items-center justify-between mb-4">
                <div className="text-sm text-[var(--sage-deep)]/60">Total</div>
                <div className="font-display text-xl text-[var(--gold-antique)]">{formatCents(displayTotalCents)} €</div>
              </div>

              {summary && (
                <div className="text-xs text-[var(--sage-deep)]/60 mb-6">
                  Les taxes sont incluses{displayShippingCents !== 0 ? (<> et les frais de port sont recalculés à l'étape suivante.</>) : '.'}
                </div>
              )}
              
              <button
                onClick={async () => {
                  setCheckoutError(null);
                  setCheckoutNeedsLogin(false);
                  const hasSubscription = cartItems.some((item) => item.itemType === 'SUBSCRIPTION');
                  const hasOneTime = cartItems.some((item) => item.itemType !== 'SUBSCRIPTION');
                  if (hasSubscription && hasOneTime) {
                    setCheckoutErrorFeedback('Veuillez séparer les abonnements des autres articles pour le paiement.');
                    return;
                  }
                  if (!customer?.id && cartItems.some((item) => item.itemType === 'VARIANT' || item.itemType === 'PACK' || item.itemType === 'SUBSCRIPTION')) {
                    setCheckoutErrorFeedback(
                      'Veuillez vous connecter pour acheter des accessoires ou des abonnements.',
                      { needsLogin: true }
                    );
                    return;
                  }

                  if (hasSubscription) {
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
                      setCheckoutErrorFeedback("Impossible de créer la session d'abonnement.");
                    } catch (e: any) {
                      setCheckoutErrorFeedback(e?.message || "Impossible de créer la session d'abonnement.");
                    } finally {
                      setIsCheckoutSubmitting(false);
                    }
                    return;
                  }

                  window.location.href = '/checkout';
                }}
                className="w-full btn-primary mb-3"
                disabled={isCheckoutSubmitting}
              >
                Commander
              </button>

              {checkoutError && (
                <div className="mb-3 text-xs text-red-600" role="alert">
                  {checkoutError}
                  {checkoutNeedsLogin && (
                    <a href="/login" className="ml-1 text-[var(--gold-antique)] hover:underline">
                      Se connecter
                    </a>
                  )}
                </div>
              )}

              <button onClick={() => {
                window.location.href = '/?scroll=creator';
              }} className="w-full btn-secondary">Continuer à créer</button>
            </div>
            
            <div className="bg-white rounded-2xl p-5 shadow">
              <button
                type="button"
                onClick={() => setIsDiscountCodeOpen((prev) => !prev)}
                className="relative flex w-full items-center pr-10 text-left text-sm font-medium text-[var(--sage-deep)]"
              >
                <span className="text-sm text-[var(--sage-deep)]/60">Ajouter un code de réduction</span>
                <ChevronDown
                  className={`absolute right-0 top-1/2 h-[1.4rem] w-[1.4rem] -translate-y-1/2 text-[var(--sage-deep)] transition-transform ${
                    isDiscountCodeOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {isDiscountCodeOpen && (
                <>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      className="flex-1 p-3 border border-[#E5E0D5] rounded-md"
                      style={{ width: '180px' }}
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      placeholder="Entrez votre code"
                    />
                    <button
                      className="btn-secondary px-4 py-3 whitespace-nowrap"
                      onClick={() => {
                        if (codeInput.trim().length === 0) {
                          removeDiscountCode();
                          return;
                        }
                        applyDiscountCode(codeInput);
                      }}
                    >
                      OK
                    </button>
                  </div>
                  {appliedDiscountCode && (
                    <div className="flex items-center justify-between text-xs text-[var(--sage-deep)]/70 mt-2">
                      <span>
                        {isDiscountCodeApplied ? 'Code appliqué:' : hasExplicitNonAppliedReason ? 'Code non appliqué:' : 'Code:'}{' '}
                        <strong>{appliedDiscountCode}</strong>
                      </span>
                      <button className="text-[var(--gold-antique)]" onClick={removeDiscountCode}>Retirer</button>
                    </div>
                  )}
                  {codeMessage && (
                    <div className="text-xs text-red-600 mt-2">{codeMessage}</div>
                  )}
                  {effectiveCartMessages
                    .filter((msg) => msg !== codeMessage)
                    .map((msg) => (
                      <div key={msg} className="text-xs text-[var(--sage-deep)]/60 mt-2">{msg}</div>
                    ))}
                </>
              )}
            </div>
            
            <ShippingInfoAccordion />

          </aside>
        </div>
      </div>
    </section>
  );
}

