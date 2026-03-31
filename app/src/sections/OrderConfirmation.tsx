import { useEffect, useMemo, useState } from 'react';
import { Truck } from 'lucide-react';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { api } from '@/api/client';
import { CreationCupLogo } from '@/components/creation/CreationCupLogo';
import { CreationCupThumbnail } from '@/components/creation/CreationCupThumbnail';
import { sortIngredientsByCategoryOrder } from '@/lib/ingredient-order';
import { getBlendFormatLabel } from '@/lib/blend-format';
import { clearPendingBlendSubscriptionCheckout } from '@/lib/blend-subscription-checkout';
import { t } from "@/lib/i18n";

type OrderItem = {
    id: string;
    itemType: 'BLEND' | 'VARIANT' | 'PACK' | 'SUBSCRIPTION';
    purchaseMode?: 'ONE_TIME' | 'SUBSCRIPTION';
    subscriptionIntervalCount?: 1 | 2 | 3;
    name: string;
    ingredients?: {
        name: string;
        ingredientColor: string;
    }[];
    ingredientIds?: string[];
    blendFormat?: 'POUCH_100G' | 'MUSLIN_20';
    imageUrl?: string | null;
    selectedOptions?: Array<{
        name: string;
        value: string;
    }>;
    packItems?: Array<{
        variantId: string;
        title: string;
        qty: number;
        imageUrl?: string | null;
    }>;
    price: number;
    basePrice?: number;
    quantity: number;
    color?: string;
};
type Order = {
    id: string;
    orderNumber?: string;
    items: OrderItem[];
    comment?: string;
    subtotal?: number;
    shipping?: number;
    discountTotal?: number;
    discountLines?: Array<{
        amountCents?: number;
        type?: string;
    }>;
    total: number;
    createdAt: string;
};
const normalizeOrderPurchaseMode = (value: unknown): 'ONE_TIME' | 'SUBSCRIPTION' => value === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'ONE_TIME';
const normalizeOrderSubscriptionIntervalCount = (value: unknown): 1 | 2 | 3 => {
    const normalized = Number(value);
    return normalized === 2 || normalized === 3 ? normalized : 1;
};
const isRecurringOrderItem = (item: OrderItem) => item.itemType === 'SUBSCRIPTION' || item.purchaseMode === 'SUBSCRIPTION';
const getSubscriptionCadenceLabel = (intervalCount?: 1 | 2 | 3) => intervalCount === 2
    ? t("app.sections.account.account_subscriptions.every_two_months")
    : intervalCount === 3
        ? t("app.sections.account.account_subscriptions.every_three_months")
        : t("app.sections.account.account_subscriptions.every_month");
const renderOrderItemVisual = (item: OrderItem) => {
    const orderedIngredients = sortIngredientsByCategoryOrder(item.ingredients || []);
    const cupFillColor = orderedIngredients[0]?.ingredientColor || item.color || '#C4A77D';
    if ((item.itemType === 'VARIANT' || item.itemType === 'PACK') && item.imageUrl) {
        return (<div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
            <img src={item.imageUrl} alt={item.name} className="h-full w-full rounded-lg object-cover"/>
        </div>);
    }
    if (isRecurringOrderItem(item)) {
        return (<CreationCupThumbnail fillColor={cupFillColor} ingredientCount={(item.ingredients || []).length} recurring containerClassName="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0" cupClassName="w-full h-full"/>);
    }
    return (<div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
        <CreationCupLogo fillColor={cupFillColor} ingredientCount={(item.ingredients || []).length} className="w-full h-full"/>
    </div>);
};
const resolveOrderItemType = (item: any): Order['items'][number]['itemType'] => {
    const directType = String(item?.itemType || '').toUpperCase();
    if (directType === 'BLEND' || directType === 'VARIANT' || directType === 'PACK' || directType === 'SUBSCRIPTION') {
        return directType;
    }
    const snapshotType = String(item?.snapshot?.itemType || '').toUpperCase();
    if (snapshotType === 'BLEND' || snapshotType === 'VARIANT' || snapshotType === 'PACK' || snapshotType === 'SUBSCRIPTION') {
        return snapshotType;
    }
    if (item?.snapshot?.variantId || item?.snapshot?.productId || item?.snapshot?.imageUrl) {
        return 'VARIANT';
    }
    return 'BLEND';
};
const mapOrderApiItem = (item: any): OrderItem => {
    const itemType = resolveOrderItemType(item);
    const purchaseMode = itemType === 'SUBSCRIPTION'
        ? 'SUBSCRIPTION'
        : normalizeOrderPurchaseMode(item?.snapshot?.purchaseMode);
    const subscriptionIntervalCount = purchaseMode === 'SUBSCRIPTION'
        ? normalizeOrderSubscriptionIntervalCount(item?.snapshot?.subscriptionSetup?.intervalCount ?? item?.snapshot?.intervalCount)
        : undefined;
    const unitPrice = (item.unitPriceCents || 0) / 100;
    return {
        id: item.id,
        itemType,
        purchaseMode,
        subscriptionIntervalCount,
        name: item.snapshot?.title || t("app.sections.order_confirmation.item"),
        ingredients: item.snapshot?.ingredients || [],
        ingredientIds: item.snapshot?.ingredientIds || [],
        blendFormat: item.snapshot?.blendFormat,
        imageUrl: item.snapshot?.imageUrl || null,
        selectedOptions: item.snapshot?.options || item.snapshot?.selectedOptions || [],
        packItems: item.snapshot?.packItems || [],
        price: unitPrice,
        basePrice: item?.snapshot?.basePriceCents !== undefined
            ? Math.max(0, Number(item.snapshot.basePriceCents) || 0) / 100
            : unitPrice,
        quantity: item.qty || 1,
        color: item.snapshot?.color || item.snapshot?.blendColor || undefined,
    };
};
const resolveSubtotalDiscountCents = (source: any): number => {
    const directSubtotalDiscount = Number(source?.subtotalDiscountCents);
    if (Number.isFinite(directSubtotalDiscount) && directSubtotalDiscount > 0) {
        return Math.max(0, Math.round(directSubtotalDiscount));
    }
    const rawDiscountLines = Array.isArray(source?.appliedDiscounts)
        ? source.appliedDiscounts
        : Array.isArray(source?.discountLines)
            ? source.discountLines
            : [];
    if (rawDiscountLines.length > 0) {
        return rawDiscountLines.reduce((sum: number, line: any) => {
            const type = String(line?.type || '').toUpperCase();
            if (type === 'FREE_SHIPPING') {
                return sum;
            }
            const amountCents = Number(line?.amountCents);
            return sum + Math.max(0, Math.round(Number.isFinite(amountCents) ? amountCents : 0));
        }, 0);
    }
    const fallbackDiscountTotal = Number(source?.discountTotalCents);
    if (Number.isFinite(fallbackDiscountTotal) && fallbackDiscountTotal > 0) {
        return Math.max(0, Math.round(fallbackDiscountTotal));
    }
    const fallbackDiscountTotalEuros = Number(source?.discountTotal);
    if (Number.isFinite(fallbackDiscountTotalEuros) && fallbackDiscountTotalEuros > 0) {
        return Math.max(0, Math.round(fallbackDiscountTotalEuros * 100));
    }
    return 0;
};
const normalizeStoredOrder = (rawOrder: any): Order | null => {
    if (!rawOrder || typeof rawOrder !== 'object') {
        return null;
    }
    return {
        ...rawOrder,
        discountTotal: resolveSubtotalDiscountCents(rawOrder) / 100,
    };
};
export default function OrderConfirmation() {
    const [order, setOrder] = useState<Order | null>(null);
    const formatMoney = (value: number) => value.toFixed(2);
    const [isCreating, setIsCreating] = useState(false);
    const subscriptionItems = useMemo(() => (order?.items || []).filter(isRecurringOrderItem), [order]);
    const otherItems = useMemo(() => (order?.items || []).filter((item) => !isRecurringOrderItem(item)), [order]);
    const contactHref = useMemo(() => {
        const params = new URLSearchParams({ subject: 'ORDER' });
        const orderReference = order?.orderNumber || order?.id || '';
        if (orderReference) {
            params.set('orderNumber', orderReference);
        }
        return `/contact?${params.toString()}`;
    }, [order?.id, order?.orderNumber]);
    const clearClientCartState = () => {
        try {
            localStorage.removeItem('tea_cart');
            localStorage.removeItem('tea_cart_meta');
            localStorage.removeItem('tea_shipping');
            clearPendingBlendSubscriptionCheckout();
            window.dispatchEvent(new Event('cart-cleared'));
        }
        catch {
            // ignore
        }
    };
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        const stripeSuccess = params.get('stripe');
        const sessionId = params.get('session_id');
        const paymentIntentId = params.get('payment_intent');
        const paymentStatus = params.get('redirect_status');
        const paymentSuccess = params.get('payment');
        if ((paymentIntentId && paymentStatus === 'succeeded') || (paymentIntentId && paymentSuccess === 'success')) {
            setIsCreating(true);
            let attempt = 0;
            const maxAttempts = 8;
            const loadByPaymentIntent = async () => {
                try {
                    const response = await api.getOrderByPaymentIntent(paymentIntentId!);
                    const items = (response.items || []).map(mapOrderApiItem);
                    clearClientCartState();
                    setOrder({
                        id: response.id,
                        orderNumber: response.orderNumber,
                        items,
                        subtotal: (response.subtotalCents || 0) / 100,
                        shipping: (response.shippingCents || 0) / 100,
                        discountTotal: resolveSubtotalDiscountCents(response) / 100,
                        discountLines: Array.isArray(response.appliedDiscounts) ? response.appliedDiscounts : [],
                        total: (response.totalCents || 0) / 100,
                        createdAt: response.createdAt || new Date().toISOString(),
                    });
                    setIsCreating(false);
                }
                catch {
                    attempt += 1;
                    if (attempt >= maxAttempts) {
                        setOrder(null);
                        setIsCreating(false);
                        return;
                    }
                    window.setTimeout(loadByPaymentIntent, 1000);
                }
            };
            loadByPaymentIntent();
            return;
        }
        if (stripeSuccess === 'success' && sessionId) {
            setIsCreating(true);
            const rawCart = localStorage.getItem('tea_cart');
            const rawMeta = localStorage.getItem('tea_cart_meta');
            if (!rawCart) {
                api.getOrderBySession(sessionId)
                    .then((response) => {
                    const items = (response.items || []).map(mapOrderApiItem);
                    setOrder({
                        id: response.id,
                        orderNumber: response.orderNumber,
                        items,
                        subtotal: (response.subtotalCents || 0) / 100,
                        shipping: (response.shippingCents || 0) / 100,
                        discountTotal: resolveSubtotalDiscountCents(response) / 100,
                        discountLines: Array.isArray(response.appliedDiscounts) ? response.appliedDiscounts : [],
                        total: (response.totalCents || 0) / 100,
                        createdAt: response.createdAt || new Date().toISOString(),
                    });
                    clearClientCartState();
                    setIsCreating(false);
                })
                    .catch(() => {
                    setOrder(null);
                    setIsCreating(false);
                });
                return;
            }
            try {
                const cartItems = JSON.parse(rawCart) as Order['items'];
                const meta = rawMeta ? (JSON.parse(rawMeta) as {
                    appliedDiscountCode?: string | null;
                }) : null;
                const rawShipping = localStorage.getItem('tea_shipping');
                const shippingSelection = rawShipping ? JSON.parse(rawShipping) : null;
                api.createStripeOrder({
                    sessionId,
                    appliedDiscountCode: meta?.appliedDiscountCode || null,
                    shippingSelection,
                    items: cartItems.map((item) => ({
                        name: item.name,
                        ingredientIds: item.ingredientIds || [],
                        ingredientNames: (item.ingredients || []).map((ingredient) => ingredient.name),
                        blendFormat: item.blendFormat,
                        quantity: item.quantity,
                    })),
                }).then((response) => {
                    const createdOrder: Order = {
                        id: response.id,
                        orderNumber: response.orderNumber,
                        items: cartItems,
                        subtotal: response.subtotalCents / 100,
                        shipping: response.shippingCents / 100,
                        discountTotal: resolveSubtotalDiscountCents(response) / 100,
                        total: response.totalCents / 100,
                        createdAt: new Date().toISOString(),
                    };
                    clearClientCartState();
                    setOrder(createdOrder);
                    setIsCreating(false);
                }).catch(() => {
                    setOrder(null);
                    setIsCreating(false);
                });
            }
            catch (e) {
                setOrder(null);
                setIsCreating(false);
            }
            return;
        }
        if (!id)
            return;
        try {
            const raw = localStorage.getItem('tea_orders');
            if (!raw)
                return;
            const arr = JSON.parse(raw) as Order[];
            const found = normalizeStoredOrder(arr.find(o => o.id === id)) || null;
            setOrder(found);
        }
        catch (e) {
            setOrder(null);
        }
    }, []);
    return (<div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />

      <main className="pt-28 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="mb-6">
            <div className="mt-6 mx-auto w-full max-w-4xl px-4">
              <div className="relative flex w-full items-center justify-center gap-[5rem]">
                <span className="pointer-events-none absolute left-10 right-10 top-1/2 -translate-y-1/2 border-t border-[#E5E0D5]"/>

                <a href="/cart" className="relative z-10 inline-flex min-w-[11rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-white px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]/80 transition hover:border-[var(--gold-antique)] hover:text-[var(--sage-deep)]">{t("app.sections.order_confirmation.cart")}</a>

                <a href="/checkout" className="relative z-10 inline-flex min-w-[15rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-white px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]/80 transition hover:border-[var(--gold-antique)] hover:text-[var(--sage-deep)]">{t("app.sections.order_confirmation.shipping_payment")}</a>

                <span aria-current="step" className="relative z-10 inline-flex min-w-[11rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-[var(--gold-antique)] px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]">
                  {t("app.sections.order_confirmation.confirmation_step")}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow text-center">
            {order ? (<>
                <h2 className="font-display text-2xl text-[var(--sage-deep)] mb-2">{t("app.sections.order_confirmation.please_order")}</h2>
                <p className="text-sm text-[var(--sage-deep)]/70 mb-4">{t("app.sections.order_confirmation.numero_order")} <strong>{order.orderNumber || order.id}</strong></p>

                <div className="text-left mb-4">
                  <h4 className="font-medium text-[var(--sage-deep)] mb-2">{t("app.sections.order_confirmation.summary")}</h4>
                  <div className="space-y-4">
                    {subscriptionItems.length > 0 && (<div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold-antique)]">
                          {t("app.sections.checkout_page.subscription_items_title")}
                        </div>
                        <div className="text-[var(--sage-deep)]/75 rounded-xl bg-[#FCFAF7] px-2 py-2">
                          {subscriptionItems.map((item) => {
                        const orderedIngredients = sortIngredientsByCategoryOrder(item.ingredients || []);
                        const totalPrice = item.price * Math.max(1, item.quantity || 1);
                        const baseTotalPrice = (item.basePrice || item.price) * Math.max(1, item.quantity || 1);
                        return (<div key={item.id} className="flex items-start justify-between gap-3 px-1 py-2">
                                <div className="flex min-w-0 items-start gap-3">
                                  {renderOrderItemVisual(item)}
                                  <div className="min-w-0">
                                    <div className="font-medium text-[var(--sage-deep)]">{item.name}</div>
                                    <div className='text-xs font-semibold text-[var(--gold-antique)] break-words'>{getSubscriptionCadenceLabel(item.subscriptionIntervalCount)}</div>
                                    {orderedIngredients.length > 0 && (<div className="mt-1 text-[11px] text-[var(--sage-deep)]/55">
                                        {orderedIngredients.map((ingredient) => ingredient.name).join(', ')}
                                      </div>)}
                                    {item.blendFormat && (<div className="mt-1 text-[11px] text-[var(--sage-deep)]/55">
                                        Format: {getBlendFormatLabel(item.blendFormat)}
                                      </div>)}
                                    {item.selectedOptions && item.selectedOptions.length > 0 && (<div className="mt-1 text-[11px] text-[var(--sage-deep)]/55">
                                        {item.selectedOptions.map((option) => `${option.name}: ${option.value}`).join(' • ')}
                                      </div>)}
                                  </div>
                                </div>
                                <div className="shrink-0 whitespace-nowrap text-right">
                                  {baseTotalPrice > totalPrice && (<div className="text-[11px] text-[var(--sage-deep)]/45 line-through">
                                      {formatMoney(baseTotalPrice)} &euro;
                                    </div>)}
                                  <div className="font-display text-lg text-[var(--gold-antique)]">{formatMoney(totalPrice)} &euro;</div>
                                  <div className="text-xs text-[var(--sage-deep)]/60">{formatMoney(item.price)}{t("app.sections.cart.unite")}</div>
                                </div>
                              </div>);
                    })}
                        </div>
                      </div>)}
                    {otherItems.length > 0 && (<div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--sage-deep)]/55">
                          {t("app.sections.checkout_page.other_items_title")}
                        </div>
                        <div className="text-[var(--sage-deep)]/75 rounded-xl bg-[#FCFAF7] px-2 py-2">
                          {otherItems.map((item) => {
                        const orderedIngredients = item.itemType === 'BLEND'
                            ? sortIngredientsByCategoryOrder(item.ingredients || [])
                            : (item.ingredients || []);
                        return (<div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2">
                                <div className="flex min-w-0 items-start gap-3">
                                  {renderOrderItemVisual(item)}
                                  <div className="min-w-0">
                                    <div className="font-medium text-[var(--sage-deep)]">
                                      {item.name} &times; {item.quantity}
                                    </div>
                                    {orderedIngredients.length > 0 && (<div className="mt-1 text-[11px] text-[var(--sage-deep)]/55">
                                        {orderedIngredients.map((ingredient) => ingredient.name).join(', ')}
                                      </div>)}
                                    {item.itemType === 'BLEND' && item.blendFormat && (<div className="mt-1 text-[11px] text-[var(--sage-deep)]/55">
                                        Format: {getBlendFormatLabel(item.blendFormat)}
                                      </div>)}
                                    {item.selectedOptions && item.selectedOptions.length > 0 && (<div className="mt-1 text-[11px] text-[var(--sage-deep)]/55">
                                        {item.selectedOptions.map((option) => `${option.name}: ${option.value}`).join(' • ')}
                                      </div>)}
                                    {item.packItems && item.packItems.length > 0 && (<div className="mt-1 text-[11px] text-[var(--sage-deep)]/55">
                                        {item.packItems.map((packItem) => `${packItem.qty}× ${packItem.title}`).join(' • ')}
                                      </div>)}
                                  </div>
                                </div>
                                <div className="shrink-0 whitespace-nowrap text-right">
                                  <div className="font-display text-lg text-[var(--gold-antique)]">{formatMoney(item.price * item.quantity)} &euro;</div>
                                  <div className="text-xs text-[var(--sage-deep)]/60">{formatMoney(item.price)}{t("app.sections.cart.unite")}</div>
                                </div>
                              </div>);
                    })}
                        </div>
                      </div>)}
                  </div>
                  {false && (<>
                  <div className="space-y-3">
                    {order?.items.map(it => {
                const orderedIngredients = it.itemType === 'BLEND'
                    ? sortIngredientsByCategoryOrder(it.ingredients || [])
                    : (it.ingredients || []);
                return (<div key={it.id} className="flex items-center justify-between">
                        <div className="flex items-start gap-3">
                          <div className="shrink-0">
                            {(it.itemType === 'VARIANT' || it.itemType === 'PACK') && it.imageUrl ? (<div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                                <img src={it.imageUrl} alt={it.name} className="h-full w-full rounded-lg object-cover"/>
                              </div>) : it.itemType === 'SUBSCRIPTION' ? (<div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                                <div className="h-full w-full rounded-lg bg-[var(--cream-apothecary)] flex items-center justify-center text-xs">
                                  ?
                                </div>
                              </div>) : (<div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                                <CreationCupLogo fillColor={orderedIngredients[0]?.ingredientColor || '#C4A77D'} ingredientCount={(it.ingredients || []).length} className="w-full h-full"/>
                              </div>)}
                          </div>
                          <div>
                            <div className="font-medium">{it.name} × {it.quantity}</div>
                            {it.ingredients && it.ingredients.length > 0 && (<div className="text-xs text-[var(--sage-deep)]/60">
                                {orderedIngredients.map(i => i.name).join(', ')}
                              </div>)}
                          </div>
                        </div>
                        <div className="font-display text-[var(--gold-antique)]">{formatMoney(it.price * it.quantity)} €</div>
                      </div>);
            })}
                  </div>
                  </>)}

                  <div className="border-t border-[#E5E0D5] mt-4 pt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--sage-deep)]/60">{t("app.sections.order_confirmation.subtotal")}</span>
                      <span className="text-[var(--sage-deep)]">
                        {formatMoney(order.subtotal ?? order.items.reduce((sum, item) => sum + item.price * item.quantity, 0))} €
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--sage-deep)]/60">{t("app.sections.order_confirmation.shipping")}</span>
                      <span className="text-[var(--sage-deep)]">
                        {(order.shipping ?? 0) === 0 ? t("app.sections.order_confirmation.free") : `${formatMoney(order.shipping ?? 0)} €`}
                      </span>
                    </div>
                    {(order.discountTotal ?? 0) > 0 && (<div className="flex items-center justify-between">
                        <span className="text-[var(--sage-deep)]/60">{t("app.sections.order_confirmation.discount")}</span>
                        <span className="text-[var(--sage-deep)]">- {formatMoney(order.discountTotal || 0)} €</span>
                      </div>)}
                  </div>

                  <div className="border-t border-[#E5E0D5] mt-4 pt-4 flex items-center justify-between">
                    <div className="text-sm text-[var(--sage-deep)]/60">{t("app.sections.checkout_page.total_incl_tax")}</div>
                    <div className="font-display text-xl text-[var(--gold-antique)]">{formatMoney(order.total)} €</div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-[#E7DFD0] bg-[#FCFAF7] px-4 py-4 text-left">
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--sage-deep)]">
                      <Truck className="h-5 w-5 shrink-0 text-[var(--gold-antique)]" />
                      {t("app.sections.order_confirmation.shipping_reassurance_title")}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-[var(--sage-deep)]/72">
                      {t("app.sections.order_confirmation.shipping_reassurance_body")}
                    </p>
                  </div>

                  {order.comment && (<div className="mt-4 text-sm">
                      <div className="font-medium">{t("app.sections.order_confirmation.instruction_special")}</div>
                      <div className="text-[var(--sage-deep)]/80 text-sm mt-1">{order.comment}</div>
                    </div>)}

                  <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                    <button onClick={() => (window.location.href = '/?a=creator')} className="btn-primary">
                      {t("app.sections.order_confirmation.create_new_blend_cta")}
                    </button>
                    <button onClick={() => (window.location.href = '/')} className="btn-secondary">
                      {t("app.sections.order_confirmation.back_home")}
                    </button>
                  </div>
                </div>
              </>) : isCreating ? (<>
                <h2 className="font-display text-2xl text-[var(--sage-deep)] mb-2">{t("app.sections.order_confirmation.finalisation_order")}</h2>
                <p className="text-[var(--sage-deep)]/60 mb-4">{t("app.sections.order_confirmation.please_wait_message")}</p>
              </>) : (<>
                <h2 className="font-display text-2xl text-[var(--sage-deep)] mb-2">{t("app.sections.order_confirmation.order_not_found")}</h2>
                <p className="text-[var(--sage-deep)]/60 mb-4">{t("app.sections.order_confirmation.nous_avons_pas")}</p>
                <button onClick={() => (window.location.href = '/')} className="btn-primary">{t("app.sections.order_confirmation.back_home")}</button>
              </>)}
          </div>

          <div className="mt-8 bg-white rounded-2xl p-6 shadow">
            <h4 className="font-medium text-[var(--sage-deep)]">{t("app.sections.order_confirmation.need_help_title")}</h4>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <p className="text-sm text-[var(--sage-deep)]/70 sm:max-w-[32rem]">{t("app.sections.order_confirmation.contactez_nous_numero")}</p>
              <a href={contactHref} className="btn-secondary inline-flex items-center justify-center sm:shrink-0">
                {t("app.sections.order_confirmation.contact_about_order_cta")}
              </a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>);
}
