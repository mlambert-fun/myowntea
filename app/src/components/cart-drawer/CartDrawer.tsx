import { useEffect, useMemo } from 'react';
import { useBlend } from '@/context/BlendContext';
import { CartDrawerHeader } from './CartDrawerHeader';
import { CartDrawerItemsUnified } from './CartDrawerItemsUnified';
import { CartDrawerActions } from './CartDrawerActions';
import { CartDrawerAccessories } from './CartDrawerAccessories';
import { t } from "@/lib/i18n";
const FREE_SHIPPING_THRESHOLD_CENTS = 4500;
const formatCents = (cents: number) => (cents / 100).toFixed(2);
export function CartDrawer() {
    const { isCartDrawerOpen, closeCartDrawer, lastAddedCartItem, cartItems, cartSummary, cartSubtotal, removeFromCart, updateCartItemQuantity, pendingItemIds, } = useBlend();
    useEffect(() => {
        if (!isCartDrawerOpen)
            return;
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
    const progress = itemCount > 0
        ? (freeShipping?.progress ?? Math.min(1, thresholdCents > 0 ? effectiveSubtotalCents / thresholdCents : 1))
        : 0;
    const title = lastAddedCartItem
        ? t("app.components.cart_drawer.cart_drawer.creation_added", undefined, { name: lastAddedCartItem.name })
        : itemCount > 0
            ? t("app.components.cart_drawer.cart_drawer.cart_count", undefined, { count: itemCount })
            : t("app.components.cart_drawer.cart_drawer.cart");
    const progressLabel = useMemo(() => {
        if (isUnlocked)
            return t("app.components.cart_drawer.cart_drawer.felicitations_vous_beneficiez");
        return t("app.components.cart_drawer.cart_drawer.remaining_for_free_shipping", undefined, {
            amount: formatCents(remainingCents),
        });
    }, [isUnlocked, remainingCents]);
    return (<div className={`fixed inset-0 z-[510] ${isCartDrawerOpen ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!isCartDrawerOpen}>
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 cursor-close-cross ${isCartDrawerOpen ? 'opacity-100' : 'opacity-0'}`} onClick={closeCartDrawer}/>
      <aside className={`absolute right-0 top-0 h-full w-full sm:w-[480px] bg-white shadow-2xl transition-transform duration-300 ${isCartDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`} onClick={(event) => event.stopPropagation()}>
        <div className="flex h-full flex-col">
          <CartDrawerHeader title={title} onClose={closeCartDrawer}/>
          <div className="flex-1 overflow-y-auto px-6 pb-8 pt-6 space-y-6">
            <div className="rounded-2xl border border-[#EEE6D8] bg-[#FAF8F3] p-4">
              <div className="text-sm font-medium text-[var(--sage-deep)]">{progressLabel}</div>
              <div className="mt-3 h-2 w-full rounded-full bg-[#F3F1EE] overflow-hidden">
                <div className="h-full bg-[var(--gold-antique)] transition-all" style={{ width: `${Math.round(progress * 100)}%` }}/>
              </div>
              <div className="mt-2 text-xs text-[var(--sage-deep)]/60">{t("app.components.cart_drawer.cart_drawer.shipping_offerte_achat")}</div>
            </div>

            <CartDrawerItemsUnified items={cartItems} onRemove={removeFromCart} onUpdateQuantity={updateCartItemQuantity} pendingItemIds={pendingItemIds}/>

            <CartDrawerActions onCreateBlend={() => {
            closeCartDrawer();
            window.location.href = '/?a=creator';
        }} onCheckout={() => {
            closeCartDrawer();
            window.location.href = '/cart';
        }} showCheckout={itemCount > 0}/>

            <CartDrawerAccessories />
          </div>
        </div>
      </aside>
    </div>);
}
