import { useEffect, useMemo } from 'react';
import { useBlend } from '@/context/BlendContext';
import { CartDrawerHeader } from './CartDrawerHeader';
import { CartDrawerItems } from './CartDrawerItems';
import { CartDrawerActions } from './CartDrawerActions';
import { CartDrawerAccessories } from './CartDrawerAccessories';

const FREE_SHIPPING_THRESHOLD_CENTS = 4500;

const formatCents = (cents: number) => (cents / 100).toFixed(2);

export function CartDrawer() {
  const {
    isCartDrawerOpen,
    closeCartDrawer,
    lastAddedCartItem,
    cartItems,
    cartSummary,
    cartSubtotal,
    removeFromCart,
    updateCartItemQuantity,
    pendingItemIds,
  } = useBlend();

  useEffect(() => {
    if (!isCartDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeCartDrawer();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isCartDrawerOpen, closeCartDrawer]);

  const freeShipping = cartSummary?.freeShippingProgress || null;
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCents = cartSummary?.subtotalCents ?? Math.round(cartSubtotal * 100);
  const effectiveSubtotalCents = itemCount > 0 ? subtotalCents : 0;
  const thresholdCents = freeShipping?.thresholdCents ?? FREE_SHIPPING_THRESHOLD_CENTS;
  const remainingCents = Math.max(0, thresholdCents - effectiveSubtotalCents);
  const isUnlocked = itemCount > 0 && (freeShipping?.isUnlocked ?? remainingCents <= 0);
  const progress =
    itemCount > 0
      ? (freeShipping?.progress ?? Math.min(1, thresholdCents > 0 ? effectiveSubtotalCents / thresholdCents : 1))
      : 0;

  const title = lastAddedCartItem
    ? `Votre création ${lastAddedCartItem.name} a été ajoutée au panier`
    : itemCount > 0
      ? `Votre panier (${itemCount})`
      : 'Votre panier';

  const progressLabel = useMemo(() => {
    if (isUnlocked) return 'Félicitations, vous bénéficiez de la livraison offerte !';
    return `Plus que ${formatCents(remainingCents)} € pour la Livraison Gratuite`;
  }, [isUnlocked, remainingCents]);

  return (
    <div
      className={`fixed inset-0 z-[510] ${isCartDrawerOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!isCartDrawerOpen}
    >
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 cursor-close-cross ${
          isCartDrawerOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={closeCartDrawer}
      />
      <aside
        className={`absolute right-0 top-0 h-full w-full sm:w-[480px] bg-white shadow-2xl transition-transform duration-300 ${
          isCartDrawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-full flex-col">
          <CartDrawerHeader title={title} onClose={closeCartDrawer} />
          <div className="flex-1 overflow-y-auto px-6 pb-8 pt-6 space-y-6">
            <div className="rounded-2xl border border-[#EEE6D8] bg-[#FAF8F3] p-4">
              <div className="text-sm font-medium text-[var(--sage-deep)]">{progressLabel}</div>
              <div className="mt-3 h-2 w-full rounded-full bg-[#F3F1EE] overflow-hidden">
                <div
                  className="h-full bg-[var(--gold-antique)] transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-[var(--sage-deep)]/60">Livraison offerte dès 45 € d'achat</div>
            </div>

            <CartDrawerItems
              items={cartItems}
              onRemove={removeFromCart}
              onUpdateQuantity={updateCartItemQuantity}
              pendingItemIds={pendingItemIds}
            />

            <CartDrawerActions
              onCreateBlend={() => {
                closeCartDrawer();
                window.location.href = '/?scroll=creator';
              }}
              onCheckout={() => {
                closeCartDrawer();
                window.location.href = '/cart';
              }}
              showCheckout={itemCount > 0}
            />

            <CartDrawerAccessories />
          </div>
        </div>
      </aside>
    </div>
  );
}
