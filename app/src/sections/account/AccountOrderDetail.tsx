import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Printer, Truck } from 'lucide-react';
import { api, type AccountOrderDetail } from '@/api/client';
import { CreationCupThumbnail } from '@/components/creation/CreationCupThumbnail';
import { DataLoadingState } from '@/components/ui/loading-state';
import { StripeWordmark } from '@/components/ui/StripeWordmark';
import { sortIngredientsByCategoryOrder } from '@/lib/ingredient-order';
import { t } from "@/lib/i18n";
const formatDateTime = (value: string) => {
    const date = new Date(value);
    const dateLabel = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeLabel = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return t("app.sections.account.account_order_detail.date_time", undefined, { date: dateLabel, time: timeLabel });
};
const formatMoney = (cents: number) => `${(cents / 100).toFixed(2)} \u20AC`;
const formatAddress = (address?: AccountOrderDetail['shippingAddress'] | null) => {
    if (!address)
        return t("app.sections.account.account_order_detail.address_indisponible");
    const line = [address.address1, address.address2].filter(Boolean).join(', ');
    const city = [address.postalCode, address.city].filter(Boolean).join(' ');
    const country = address.countryCode || '';
    return [line, city, country].filter(Boolean).join(', ');
};
const ORDER_STATUS_LABELS: Record<string, string> = {
    PENDING: t("app.sections.account.account_order_detail.pending"),
    CONFIRMED: t("app.sections.account.account_order_detail.confirmed"),
    PROCESSING: t("app.sections.account.account_order_detail.preparation"),
    SHIPPED: t("app.sections.account.account_order_detail.shipped"),
    DELIVERED: t("app.sections.account.account_order_detail.delivered"),
    CANCELLED: t("app.sections.account.account_order_detail.canceled_2"),
    REFUNDED: t("app.sections.account.account_order_detail.refunded"),
};
const PAYMENT_STATUS_LABELS: Record<string, string> = {
    pending: t("app.sections.account.account_order_detail.pending"),
    completed: t("app.sections.account.account_order_detail.paye"),
    paid: t("app.sections.account.account_order_detail.paye"),
    processing: t("app.sections.account.account_order_detail.processing"),
    failed: t("app.sections.account.account_order_detail.echoue"),
    canceled: t("app.sections.account.account_order_detail.canceled"),
    cancelled: t("app.sections.account.account_order_detail.canceled"),
    refunded: t("app.sections.account.account_order_detail.refund"),
    requires_action: t("app.sections.account.account_order_detail.requires_action"),
};
const toOrderStatusLabel = (value?: string | null) => {
    if (!value)
        return '\u2014';
    const normalized = value.trim().toUpperCase();
    return ORDER_STATUS_LABELS[normalized] || value;
};
const toPaymentStatusLabel = (value?: string | null) => {
    if (!value)
        return '\u2014';
    const normalized = value.trim().toLowerCase();
    return PAYMENT_STATUS_LABELS[normalized] || value;
};
const capitalizeFirst = (value?: string | null) => {
    if (!value)
        return '\u2014';
    const normalized = value.trim();
    if (!normalized)
        return '\u2014';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
};
const resolvePaymentMethodDetail = (value?: string | null) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized)
        return t("app.sections.account.account_order_detail.information_unavailable");
    if (normalized === 'stripe')
        return t("app.sections.account.account_order_detail.carte_bancaire_secure");
    if (normalized === 'paypal')
        return t("app.sections.account.account_order_detail.payment_paypal");
    if (normalized === 'apple_pay')
        return 'Apple Pay';
    if (normalized === 'google_pay')
        return 'Google Pay';
    return capitalizeFirst(value);
};
const isStripePaymentMethod = (value?: string | null) => String(value || '').trim().toLowerCase() === 'stripe';
const toShippingModeLabel = (mode?: string | null) => {
    const normalized = String(mode || '').toUpperCase();
    if (normalized === 'RELAY')
        return t("app.sections.account.account_order_detail.relay_point");
    if (normalized === 'HOME')
        return t("app.sections.account.account_order_detail.home_delivery");
    return '\u2014';
};
const resolveShippingCarrierLabel = (shipping: AccountOrderDetail['shipping']) => {
    const normalizedCarrier = String(shipping.carrier || '').trim().toUpperCase();
    if (normalizedCarrier === 'BOXTAL' || (!normalizedCarrier && shipping.mode)) {
        return t("app.sections.account.account_order_detail.carrier_mondial_relay");
    }
    return capitalizeFirst(shipping.carrier);
};
type AccountOrderItem = AccountOrderDetail['items'][number];
const resolveItemType = (item: AccountOrderItem): 'BLEND' | 'VARIANT' | 'PACK' | 'SUBSCRIPTION' => {
    const explicitType = String((item as any).itemType || '').toUpperCase();
    if (explicitType === 'BLEND' || explicitType === 'VARIANT' || explicitType === 'PACK' || explicitType === 'SUBSCRIPTION') {
        return explicitType;
    }
    const snapshot = item.snapshot || {};
    if (String(snapshot.purchaseMode || '').toUpperCase() === 'SUBSCRIPTION') {
        return 'SUBSCRIPTION';
    }
    if (snapshot.subscriptionSetup) {
        return 'SUBSCRIPTION';
    }
    if (Array.isArray(snapshot.ingredients) && snapshot.ingredients.length > 0)
        return 'BLEND';
    if (Array.isArray(snapshot.packItems) && snapshot.packItems.length > 0)
        return 'PACK';
    if (snapshot.subscriptionPlanId || snapshot.interval)
        return 'SUBSCRIPTION';
    if (snapshot.variantId || snapshot.productId || (Array.isArray(snapshot.selectedOptions) && snapshot.selectedOptions.length > 0)) {
        return 'VARIANT';
    }
    return 'BLEND';
};
const resolveItemImageUrl = (snapshot?: any) => {
    if (!snapshot)
        return null;
    return snapshot.imageUrl || snapshot.image || snapshot.productImage || snapshot.variantImage || null;
};
const resolveBlendColor = (snapshot?: any) => {
    if (!snapshot)
        return '#C4A77D';
    const orderedIngredients = Array.isArray(snapshot.ingredients)
        ? sortIngredientsByCategoryOrder(snapshot.ingredients)
        : [];
    const firstIngredient = (orderedIngredients[0] || null) as any;
    return firstIngredient?.ingredientColor || firstIngredient?.color || '#C4A77D';
};
const resolveItemTitle = (snapshot?: any) => {
    if (!snapshot)
        return t("app.sections.account.account_order_detail.item");
    return snapshot.title || snapshot.name || snapshot.productTitle || t("app.sections.account.account_order_detail.item");
};
const resolveItemDetails = (snapshot?: any) => {
    if (!snapshot)
        return null;
    if (Array.isArray(snapshot.options) && snapshot.options.length) {
        return snapshot.options.map((opt: any) => `${opt.name}: ${opt.value}`).join(' \u2022 ');
    }
    if (Array.isArray(snapshot.selectedOptions) && snapshot.selectedOptions.length) {
        return snapshot.selectedOptions.map((opt: any) => `${opt.name}: ${opt.value}`).join(' \u2022 ');
    }
    if (Array.isArray(snapshot.ingredients) && snapshot.ingredients.length) {
        return sortIngredientsByCategoryOrder(snapshot.ingredients).map((ing: any) => ing.name).join(', ');
    }
    if (Array.isArray(snapshot.packItems) && snapshot.packItems.length) {
        return snapshot.packItems.map((pack: any) => `${pack.qty}\u00D7 ${pack.title}`).join(' \u2022 ');
    }
    if (snapshot.subscriptionPlanName || snapshot.planName) {
        return snapshot.subscriptionPlanName || snapshot.planName;
    }
    return null;
};
export default function AccountOrderDetail() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const [order, setOrder] = useState<AccountOrderDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            if (!orderId)
                return;
            try {
                setIsLoading(true);
                const response = await api.getAccountOrder(orderId);
                if (isMounted)
                    setOrder(response);
            }
            finally {
                if (isMounted)
                    setIsLoading(false);
            }
        };
        load();
        return () => {
            isMounted = false;
        };
    }, [orderId]);
    const totals = useMemo(() => order?.totals, [order]);
    const visibleDiscountCents = totals?.subtotalDiscountCents ?? totals?.discountTotalCents ?? 0;
    const subscriptionItems = useMemo(() => (order?.items || []).filter((item) => resolveItemType(item) === 'SUBSCRIPTION'), [order]);
    const otherItems = useMemo(() => (order?.items || []).filter((item) => resolveItemType(item) !== 'SUBSCRIPTION'), [order]);
    return (<div className="space-y-6">
      <div className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
        {isLoading ? (<DataLoadingState size="sm" className="py-4" titleClassName="text-sm text-[var(--sage-deep)]/60"/>) : order ? (<div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E0D5] pb-4">
              <div>
                <p className="text-sm text-[var(--sage-deep)]/60">{t("app.sections.account.account_order_detail.order")} {order.reference}</p>
                <h2 className="font-display text-2xl text-[var(--sage-deep)]">{toOrderStatusLabel(order.status)}</h2>
                <p className="text-sm text-[var(--sage-deep)]/60">{t("app.sections.account.account_order_detail.passee")} {formatDateTime(order.createdAt)}</p>
              </div>
              <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => navigate(`/account/order/${order.id}/invoice`)}>
                <Printer className="h-4 w-4"/>
                <span>{t("app.sections.account.account_order_detail.print_invoice")}</span>
              </button>
            </div>

            <div className="text-left mb-4">
              <div className="space-y-4">
                {subscriptionItems.length > 0 && (<div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold-antique)]">
                      {t("app.sections.checkout_page.subscription_items_title")}
                    </div>
                    <div className="space-y-2 rounded-xl bg-[#FCFAF7] px-2 py-2 text-[var(--sage-deep)]/75">
                      {subscriptionItems.map((item) => {
                    const itemType = resolveItemType(item);
                    const details = resolveItemDetails(item.snapshot);
                    const imageUrl = resolveItemImageUrl(item.snapshot);
                    return (<div key={item.id} className="flex items-start justify-between gap-3 px-1 py-2">
                            <div className="flex w-20 shrink-0 justify-center">
                              {(itemType === 'VARIANT' || itemType === 'PACK') && imageUrl ? (<div className="h-16 w-16 shrink-0 rounded-xl bg-[#F3F1EE] p-1.5">
                                  <img src={imageUrl} alt={resolveItemTitle(item.snapshot)} className="h-full w-full rounded-lg object-cover"/>
                                </div>) : (<CreationCupThumbnail fillColor={resolveBlendColor(item.snapshot)} ingredientCount={Array.isArray(item.snapshot?.ingredients) ? item.snapshot.ingredients.length : 0} recurring={itemType === 'SUBSCRIPTION'} containerClassName="h-16 w-16 shrink-0 rounded-xl bg-[#F3F1EE] p-1.5" cupClassName="h-full w-full"/>)}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-[var(--sage-deep)] break-words">
                                {`${resolveItemTitle(item.snapshot)} \u00D7 ${item.qty}`}
                              </p>
                              {details && <p className="mt-1 text-[11px] text-[var(--sage-deep)]/55 break-words">{details}</p>}
                            </div>

                            <div className="shrink-0 whitespace-nowrap text-right">
                              <p className="font-display text-lg text-[var(--gold-antique)]">{formatMoney(item.lineTotalCents)}</p>
                              <p className="text-xs text-[var(--sage-deep)]/60 break-words">{formatMoney(item.unitPriceCents)} / {t("app.sections.account.account_order_detail.unit")}</p>
                            </div>
                          </div>);
                })}
                    </div>
                  </div>)}
                {otherItems.length > 0 && (<div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--sage-deep)]/55">
                      {t("app.sections.checkout_page.other_items_title")}
                    </div>
                    <div className="space-y-2 rounded-xl bg-[#FCFAF7] px-2 py-2 text-[var(--sage-deep)]/75">
                      {otherItems.map((item) => {
                    const itemType = resolveItemType(item);
                    const details = resolveItemDetails(item.snapshot);
                    const imageUrl = resolveItemImageUrl(item.snapshot);
                    return (<div key={item.id} className="flex items-start justify-between gap-3 px-1 py-2">
                      <div className="flex w-20 shrink-0 justify-center">
                        {(itemType === 'VARIANT' || itemType === 'PACK') && imageUrl ? (<div className="h-16 w-16 shrink-0 rounded-xl bg-[#F3F1EE] p-1.5">
                            <img src={imageUrl} alt={resolveItemTitle(item.snapshot)} className="h-full w-full rounded-lg object-cover"/>
                          </div>) : (<CreationCupThumbnail fillColor={resolveBlendColor(item.snapshot)} ingredientCount={Array.isArray(item.snapshot?.ingredients) ? item.snapshot.ingredients.length : 0} recurring={itemType === 'SUBSCRIPTION'} containerClassName="h-16 w-16 shrink-0 rounded-xl bg-[#F3F1EE] p-1.5" cupClassName="h-full w-full"/>)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[var(--sage-deep)] break-words">
                          {`${resolveItemTitle(item.snapshot)} \u00D7 ${item.qty}`}
                        </p>
                        {details && <p className="mt-1 text-[11px] text-[var(--sage-deep)]/55 break-words">{details}</p>}
                      </div>

                      <div className="shrink-0 whitespace-nowrap text-right">
                        <p className="font-display text-lg text-[var(--gold-antique)]">{formatMoney(item.lineTotalCents)}</p>
                            <p className="text-xs text-[var(--sage-deep)]/60 break-words">{formatMoney(item.unitPriceCents)} / {t("app.sections.account.account_order_detail.unit")}</p>
                          </div>
                        </div>);
                })}
                    </div>
                  </div>)}
              </div>
            </div>

            {totals && (<div className="border-t border-[#E5E0D5] mt-4 pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--sage-deep)]/60">{t("app.sections.account.account_order_detail.subtotal")}</span>
                  <span className="text-[var(--sage-deep)]">{formatMoney(totals.subtotalCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--sage-deep)]/60">{t("app.sections.account.account_order_detail.shipping")}</span>
                  <span className="text-[var(--sage-deep)]">{totals.shippingCents <= 0 ? t("app.sections.account.account_order_detail.free") : formatMoney(totals.shippingCents)}</span>
                </div>
                {visibleDiscountCents > 0 && (<div className="flex justify-between">
                    <span className="text-[var(--sage-deep)]/60">{t("app.sections.account.account_order_detail.discounts")}</span>
                    <span>- {formatMoney(visibleDiscountCents)}</span>
                  </div>)}
                <div className="border-t border-[#E5E0D5] mt-4 pt-4 flex justify-between font-medium">
                  <span className="text-[var(--sage-deep)]/60">{t("app.sections.account.account_order_detail.total_incl_tax")}</span>
                  <span className="font-display text-xl text-[var(--gold-antique)]">{formatMoney(totals.totalCents)}</span>
                </div>
              </div>)}
          </div>) : (<p className="text-sm text-[var(--sage-deep)]/60">{t("app.sections.account.account_order_detail.order_not_found")}</p>)}
      </div>

      {order && (<div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
            <h3 className="font-display text-lg text-[var(--sage-deep)]">{t("app.sections.account.account_order_detail.payment")}</h3>
            <p className="flex items-center gap-2 text-sm text-[var(--sage-deep)]/70">
              <span>{t("app.sections.account.account_order_detail.method")} {capitalizeFirst(order.payment.method)}</span>
              {isStripePaymentMethod(order.payment.method) ? <StripeWordmark /> : null}
            </p>
            <p className="text-sm text-[var(--sage-deep)]/70">{t("app.sections.account.account_order_detail.method_payment")} {resolvePaymentMethodDetail(order.payment.method)}</p>
            <p className="text-sm text-[var(--sage-deep)]/70">Statut : {toPaymentStatusLabel(order.payment.status)}</p>
          </div>
          <div className="space-y-3 rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
            <h3 className="font-display text-lg text-[var(--sage-deep)]">{t("app.sections.account.account_order_detail.shipping")}</h3>
            <p className="text-sm text-[var(--sage-deep)]/70">Transporteur : {resolveShippingCarrierLabel(order.shipping)}</p>
            <p className="text-sm text-[var(--sage-deep)]/70">Mode : {toShippingModeLabel(order.shipping.mode)}</p>
            <p className="text-sm text-[var(--sage-deep)]/70">{t("app.sections.account.account_order_detail.reference_tracking_carrier")} {order.shipping.trackingNumber || '\u2014'}</p>
            {order.shipping.trackingUrl && (<a className="inline-flex items-center gap-1.5 text-sm text-[var(--gold-antique)] hover:underline" href={order.shipping.trackingUrl} target="_blank" rel="noopener noreferrer">
                <Truck className="h-4 w-4"/>
                <span>{t("app.sections.account.account_order_detail.suivre_parcel")}</span>
              </a>)}
          </div>
          <div className="space-y-3 rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
            <h3 className="font-display text-lg text-[var(--sage-deep)]">{t("app.sections.account.account_order_detail.address_billing")}</h3>
            <p className="text-sm text-[var(--sage-deep)]/70">{formatAddress(order.billingAddress)}</p>
          </div>
          <div className="space-y-3 rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
            <h3 className="font-display text-lg text-[var(--sage-deep)]">{t("app.sections.account.account_order_detail.address_shipping")}</h3>
            <p className="text-sm text-[var(--sage-deep)]/70">{formatAddress(order.shippingAddress)}</p>
          </div>
        </div>)}
    </div>);
}
