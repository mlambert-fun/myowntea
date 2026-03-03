import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Printer, Truck } from 'lucide-react';
import { api, type AccountOrderDetail } from '@/api/client';
import { CreationCupLogo } from '@/components/creation/CreationCupLogo';
import { DataLoadingState } from '@/components/ui/loading-state';
import { sortIngredientsByCategoryOrder } from '@/lib/ingredient-order';

const formatDateTime = (value: string) => {
  const date = new Date(value);
  const dateLabel = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeLabel = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${dateLabel} à ${timeLabel}`;
};

const formatMoney = (cents: number) => `${(cents / 100).toFixed(2)} €`;

const formatAddress = (address?: AccountOrderDetail['shippingAddress'] | null) => {
  if (!address) return 'Adresse indisponible';
  const line = [address.address1, address.address2].filter(Boolean).join(', ');
  const city = [address.postalCode, address.city].filter(Boolean).join(' ');
  const country = address.countryCode || '';
  return [line, city, country].filter(Boolean).join(', ');
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  PROCESSING: 'En préparation',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  REFUNDED: 'Remboursée',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  completed: 'Payé',
  paid: 'Payé',
  processing: 'En cours',
  failed: 'Échoué',
  canceled: 'Annulé',
  cancelled: 'Annulé',
  refunded: 'Remboursé',
  requires_action: 'Action requise',
};

const toOrderStatusLabel = (value?: string | null) => {
  if (!value) return '—';
  const normalized = value.trim().toUpperCase();
  return ORDER_STATUS_LABELS[normalized] || value;
};

const toPaymentStatusLabel = (value?: string | null) => {
  if (!value) return '—';
  const normalized = value.trim().toLowerCase();
  return PAYMENT_STATUS_LABELS[normalized] || value;
};

const capitalizeFirst = (value?: string | null) => {
  if (!value) return '—';
  const normalized = value.trim();
  if (!normalized) return '—';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
};

const resolvePaymentMethodDetail = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Information indisponible';
  if (normalized === 'stripe') return 'Carte bancaire sécurisée (via Stripe)';
  if (normalized === 'paypal') return 'Portefeuille PayPal';
  if (normalized === 'apple_pay') return 'Apple Pay';
  if (normalized === 'google_pay') return 'Google Pay';
  return capitalizeFirst(value);
};

const toShippingModeLabel = (mode?: string | null) => {
  const normalized = String(mode || '').toUpperCase();
  if (normalized === 'RELAY') return 'Point relais';
  if (normalized === 'HOME') return 'Domicile';
  return '—';
};

const resolveShippingCarrierLabel = (shipping: AccountOrderDetail['shipping']) => {
  const normalizedCarrier = String(shipping.carrier || '').trim().toUpperCase();
  if (normalizedCarrier === 'BOXTAL' || (!normalizedCarrier && shipping.mode)) {
    return 'Mondial Relay';
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
  if (Array.isArray(snapshot.ingredients) && snapshot.ingredients.length > 0) return 'BLEND';
  if (Array.isArray(snapshot.packItems) && snapshot.packItems.length > 0) return 'PACK';
  if (snapshot.subscriptionPlanId || snapshot.interval) return 'SUBSCRIPTION';
  if (snapshot.variantId || snapshot.productId || (Array.isArray(snapshot.selectedOptions) && snapshot.selectedOptions.length > 0)) {
    return 'VARIANT';
  }
  return 'BLEND';
};

const resolveItemImageUrl = (snapshot?: any) => {
  if (!snapshot) return null;
  return snapshot.imageUrl || snapshot.image || snapshot.productImage || snapshot.variantImage || null;
};

const resolveBlendColor = (snapshot?: any) => {
  if (!snapshot) return '#C4A77D';
  const orderedIngredients = Array.isArray(snapshot.ingredients)
    ? sortIngredientsByCategoryOrder(snapshot.ingredients)
    : [];
  const firstIngredient = (orderedIngredients[0] || null) as any;
  return firstIngredient?.ingredientColor || firstIngredient?.color || '#C4A77D';
};

const resolveItemTitle = (snapshot?: any) => {
  if (!snapshot) return 'Article';
  return snapshot.title || snapshot.name || snapshot.productTitle || 'Article';
};

const resolveItemDetails = (snapshot?: any) => {
  if (!snapshot) return null;
  if (Array.isArray(snapshot.options) && snapshot.options.length) {
    return snapshot.options.map((opt: any) => `${opt.name}: ${opt.value}`).join(' • ');
  }
  if (Array.isArray(snapshot.selectedOptions) && snapshot.selectedOptions.length) {
    return snapshot.selectedOptions.map((opt: any) => `${opt.name}: ${opt.value}`).join(' • ');
  }
  if (Array.isArray(snapshot.ingredients) && snapshot.ingredients.length) {
    return sortIngredientsByCategoryOrder(snapshot.ingredients).map((ing: any) => ing.name).join(', ');
  }
  if (Array.isArray(snapshot.packItems) && snapshot.packItems.length) {
    return snapshot.packItems.map((pack: any) => `${pack.qty}× ${pack.title}`).join(' • ');
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
      if (!orderId) return;
      try {
        setIsLoading(true);
        const response = await api.getAccountOrder(orderId);
        if (isMounted) setOrder(response);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [orderId]);

  const totals = useMemo(() => order?.totals, [order]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
        {isLoading ? (
          <DataLoadingState size="sm" className="py-4" titleClassName="text-sm text-[var(--sage-deep)]/60" />
        ) : order ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-[var(--sage-deep)]/60">Commande {order.reference}</p>
                <h2 className="font-display text-2xl text-[var(--sage-deep)]">{toOrderStatusLabel(order.status)}</h2>
                <p className="text-sm text-[var(--sage-deep)]/60">Passée le {formatDateTime(order.createdAt)}</p>
              </div>
              <button
                type="button"
                className="btn-secondary inline-flex items-center gap-2"
                onClick={() => navigate(`/account/order/${order.id}/invoice`)}
              >
                <Printer className="h-4 w-4" />
                <span>Imprimer la facture</span>
              </button>
            </div>

            <div className="border-t border-[#EEE6D8] pt-4">
              <h3 className="mb-3 text-sm font-medium text-[var(--sage-deep)]">Articles</h3>
              <div className="space-y-3">
                {order.items.map((item) => {
                  const itemType = resolveItemType(item);
                  const details = resolveItemDetails(item.snapshot);
                  const imageUrl = resolveItemImageUrl(item.snapshot);
                  return (
                    <div key={item.id} className="flex items-center gap-6 rounded-xl bg-[#FCFAF7] px-4 py-2.5">
                      <div className="flex w-20 shrink-0 justify-center">
                        {(itemType === 'VARIANT' || itemType === 'PACK') && imageUrl ? (
                          <div className="h-16 w-16 shrink-0 rounded-xl bg-[#F3F1EE] p-1.5">
                            <img src={imageUrl} alt={resolveItemTitle(item.snapshot)} className="h-full w-full rounded-lg object-cover" />
                          </div>
                        ) : itemType === 'SUBSCRIPTION' ? (
                          <div className="h-16 w-16 shrink-0 rounded-xl bg-[#F3F1EE] p-1.5">
                            <div className="flex h-full w-full items-center justify-center rounded-lg bg-[var(--cream-apothecary)] text-xs text-[var(--sage-deep)]">
                              ♻️
                            </div>
                          </div>
                        ) : (
                          <div className="h-16 w-16 shrink-0 rounded-xl bg-[#F3F1EE] p-1.5">
                            <CreationCupLogo
                              fillColor={resolveBlendColor(item.snapshot)}
                              ingredientCount={Array.isArray(item.snapshot?.ingredients) ? item.snapshot.ingredients.length : 0}
                              className="h-full w-full"
                            />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[var(--sage-deep)] break-words">
                          {resolveItemTitle(item.snapshot)} × {item.qty}
                        </p>
                        {details && <p className="text-xs text-[var(--sage-deep)]/60 break-words">{details}</p>}
                      </div>

                      <div className="flex w-44 shrink-0 flex-col items-end justify-center text-right">
                        <p className="font-display text-lg text-[var(--gold-antique)]">{formatMoney(item.lineTotalCents)}</p>
                        <p className="text-xs text-[var(--sage-deep)]/60 break-words">{formatMoney(item.unitPriceCents)} / unité</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {totals && (
              <div className="grid gap-2 border-t border-[#EEE6D8] pt-4 text-sm text-[var(--sage-deep)]">
                <div className="flex justify-between">
                  <span>Sous-total</span>
                  <span>{formatMoney(totals.subtotalCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Livraison</span>
                  <span>{totals.shippingCents <= 0 ? 'Gratuite' : formatMoney(totals.shippingCents)}</span>
                </div>
                {totals.discountTotalCents > 0 && (
                  <div className="flex justify-between text-[var(--gold-antique)]">
                    <span>Réductions</span>
                    <span>- {formatMoney(totals.discountTotalCents)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span className="font-display text-xl text-[var(--gold-antique)]">{formatMoney(totals.totalCents)}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--sage-deep)]/60">Commande introuvable.</p>
        )}
      </div>

      {order && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
            <h3 className="font-display text-lg text-[var(--sage-deep)]">Paiement</h3>
            <p className="text-sm text-[var(--sage-deep)]/70">Méthode : {capitalizeFirst(order.payment.method)}</p>
            <p className="text-sm text-[var(--sage-deep)]/70">Moyen de paiement : {resolvePaymentMethodDetail(order.payment.method)}</p>
            <p className="text-sm text-[var(--sage-deep)]/70">Statut : {toPaymentStatusLabel(order.payment.status)}</p>
          </div>
          <div className="space-y-3 rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
            <h3 className="font-display text-lg text-[var(--sage-deep)]">Livraison</h3>
            <p className="text-sm text-[var(--sage-deep)]/70">Transporteur : {resolveShippingCarrierLabel(order.shipping)}</p>
            <p className="text-sm text-[var(--sage-deep)]/70">Mode : {toShippingModeLabel(order.shipping.mode)}</p>
            <p className="text-sm text-[var(--sage-deep)]/70">Référence et suivi transporteur : {order.shipping.trackingNumber || '—'}</p>
            {order.shipping.trackingUrl && (
              <a
                className="inline-flex items-center gap-1.5 text-sm text-[var(--gold-antique)] hover:underline"
                href={order.shipping.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Truck className="h-4 w-4" />
                <span>Suivre le colis</span>
              </a>
            )}
          </div>
          <div className="space-y-3 rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
            <h3 className="font-display text-lg text-[var(--sage-deep)]">Adresse de facturation</h3>
            <p className="text-sm text-[var(--sage-deep)]/70">{formatAddress(order.billingAddress)}</p>
          </div>
          <div className="space-y-3 rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
            <h3 className="font-display text-lg text-[var(--sage-deep)]">Adresse de livraison</h3>
            <p className="text-sm text-[var(--sage-deep)]/70">{formatAddress(order.shippingAddress)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
