import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { api, type AccountOrderDetail } from '@/api/client';
import { DataLoadingState } from '@/components/ui/loading-state';
import { sortIngredientsByCategoryOrder } from '@/lib/ingredient-order';

const formatMoney = (cents: number) => `${(cents / 100).toFixed(2)} €`;

const formatDateTime = (value: string) => {
  const date = new Date(value);
  const dateLabel = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeLabel = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${dateLabel} à ${timeLabel}`;
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

const normalizeText = (value?: string | null) => {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : null;
};

const toOrderStatusLabel = (value?: string | null) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return '—';
  return ORDER_STATUS_LABELS[normalized] || value || '—';
};

const toPaymentStatusLabel = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '—';
  return PAYMENT_STATUS_LABELS[normalized] || value || '—';
};

const toPaymentMethodLabel = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '—';
  if (normalized === 'stripe') return 'Stripe';
  if (normalized === 'paypal') return 'PayPal';
  if (normalized === 'apple_pay') return 'Apple Pay';
  if (normalized === 'google_pay') return 'Google Pay';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const toPaymentMethodDetail = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Information indisponible';
  if (normalized === 'stripe') return 'Carte bancaire sécurisée (via Stripe)';
  if (normalized === 'paypal') return 'Paiement via portefeuille PayPal';
  if (normalized === 'apple_pay') return 'Paiement via Apple Pay';
  if (normalized === 'google_pay') return 'Paiement via Google Pay';
  return toPaymentMethodLabel(value);
};

const toShippingCarrierLabel = (shipping: AccountOrderDetail['shipping']) => {
  const rawCarrier = String(shipping.carrier || '').trim().toUpperCase();
  if (rawCarrier === 'BOXTAL' || (!rawCarrier && shipping.mode)) return 'Mondial Relay';
  return normalizeText(shipping.carrier) || '—';
};

const toShippingModeLabel = (mode?: string | null) => {
  const normalized = String(mode || '').trim().toUpperCase();
  if (normalized === 'RELAY') return 'Point relais';
  if (normalized === 'HOME') return 'Domicile';
  return '—';
};

const resolveItemTitle = (snapshot?: any) => {
  if (!snapshot) return 'Article';
  return snapshot.title || snapshot.name || snapshot.productTitle || 'Article';
};

const resolveItemDetailLines = (snapshot?: any) => {
  if (!snapshot) return [];
  const lines: string[] = [];
  if (Array.isArray(snapshot.options) && snapshot.options.length) {
    lines.push(snapshot.options.map((opt: any) => `${opt.name}: ${opt.value}`).join(' • '));
  }
  if (Array.isArray(snapshot.selectedOptions) && snapshot.selectedOptions.length) {
    lines.push(snapshot.selectedOptions.map((opt: any) => `${opt.name}: ${opt.value}`).join(' • '));
  }
  if (Array.isArray(snapshot.ingredients) && snapshot.ingredients.length) {
    const orderedIngredients = sortIngredientsByCategoryOrder(snapshot.ingredients);
    lines.push(orderedIngredients.map((ing: any) => ing.name).join(', '));
  }
  if (Array.isArray(snapshot.packItems) && snapshot.packItems.length) {
    lines.push(snapshot.packItems.map((pack: any) => `${pack.qty}× ${pack.title}`).join(' • '));
  }
  if (snapshot.blendFormatLabel) {
    lines.push(`Format : ${snapshot.blendFormatLabel}`);
  }
  return lines;
};

const formatAddressLines = (address?: AccountOrderDetail['billingAddress'] | null) => {
  if (!address) return ['Adresse indisponible'];
  const lines: string[] = [];
  const salutation = address.salutation === 'MME' ? 'Mme' : address.salutation === 'MR' ? 'M.' : null;
  const fullName = [salutation, normalizeText(address.firstName), normalizeText(address.lastName)].filter(Boolean).join(' ');
  if (fullName) lines.push(fullName);

  const address1 = normalizeText(address.address1);
  const address2 = normalizeText(address.address2);
  const cityLine = [normalizeText(address.postalCode), normalizeText(address.city)].filter(Boolean).join(' ');
  const country = normalizeText(address.countryCode);
  const phone = normalizeText(address.phoneE164);

  if (address1) lines.push(address1);
  if (address2) lines.push(address2);
  if (cityLine) lines.push(cityLine);
  if (country) lines.push(country);
  if (phone) lines.push(`Tél. : ${phone}`);

  return lines.length > 0 ? lines : ['Adresse indisponible'];
};

const buildInvoiceNumber = (reference?: string | null) => {
  const base = String(reference || '').trim();
  if (!base) return 'FAC-—';
  return `FAC-${base.replace(/^ORD-/, '')}`;
};

export default function AccountInvoice() {
  const { orderId } = useParams();
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

  const invoiceMeta = useMemo(() => {
    if (!order) return null;
    return {
      invoiceNumber: buildInvoiceNumber(order.reference),
      issueDate: formatDateTime(order.createdAt),
      orderStatus: toOrderStatusLabel(order.status),
      paymentStatus: toPaymentStatusLabel(order.payment.status),
    };
  }, [order]);

  return (
    <div className="invoice-print-root space-y-4">
      <style>
        {`@page { size: A4; margin: 14mm; }
@media print {
  body {
    background: #ffffff !important;
  }
  body * {
    visibility: hidden !important;
  }
  .invoice-print-root,
  .invoice-print-root * {
    visibility: visible !important;
  }
  .invoice-print-root {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    margin: 0 !important;
    padding: 0 !important;
  }
  .invoice-print-actions {
    display: none !important;
  }
  .invoice-paper {
    border: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    padding: 0 !important;
  }
  .invoice-avoid-break {
    page-break-inside: avoid;
    break-inside: avoid;
  }
}`}
      </style>

      <div className="invoice-print-actions flex justify-end">
        <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Imprimer la facture
        </button>
      </div>

      <div className="invoice-paper rounded-2xl border border-[#E9E0D0] bg-white p-8 shadow">
        {isLoading ? (
          <DataLoadingState size="sm" className="py-8" titleClassName="text-sm text-[var(--sage-deep)]/60" />
        ) : order && invoiceMeta ? (
          <div className="space-y-8 text-[var(--sage-deep)]">
            <header className="border-b border-[#EEE6D8] pb-6">
              <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-start">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-[var(--gold-antique)]">My Own Tea</p>
                  <h1 className="font-display text-3xl text-[var(--sage-deep)]">Facture</h1>
                  <p className="mt-2 text-sm text-[var(--sage-deep)]/70">
                    Document de facturation client pour la commande {order.reference}.
                  </p>
                </div>
                <div className="rounded-xl border border-[#EEE6D8] bg-[#FBF8F2] p-4 text-sm">
                  <dl className="grid grid-cols-[auto_auto] gap-x-5 gap-y-1">
                    <dt className="text-[var(--sage-deep)]/60">Facture n°</dt>
                    <dd className="text-right font-medium">{invoiceMeta.invoiceNumber}</dd>
                    <dt className="text-[var(--sage-deep)]/60">Référence commande</dt>
                    <dd className="text-right font-medium">{order.reference}</dd>
                    <dt className="text-[var(--sage-deep)]/60">Date d'émission</dt>
                    <dd className="text-right font-medium">{invoiceMeta.issueDate}</dd>
                    <dt className="text-[var(--sage-deep)]/60">Statut commande</dt>
                    <dd className="text-right font-medium">{invoiceMeta.orderStatus}</dd>
                  </dl>
                </div>
              </div>
            </header>

            <section className="invoice-avoid-break grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-[#EEE6D8] p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--sage-deep)]/60">Émetteur</p>
                <div className="mt-2 space-y-1 text-sm">
                  <p className="font-medium text-[var(--sage-deep)]">My Own Tea</p>
                  <p className="text-[var(--sage-deep)]/70">Boutique en ligne de thés & infusions</p>
                  <p className="text-[var(--sage-deep)]/70">France</p>
                </div>
              </div>
              <div className="rounded-xl border border-[#EEE6D8] p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--sage-deep)]/60">Facturé à</p>
                <div className="mt-2 space-y-1 text-sm text-[var(--sage-deep)]/80">
                  {formatAddressLines(order.billingAddress).map((line) => (
                    <p key={`billing-${line}`}>{line}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-[#EEE6D8] p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--sage-deep)]/60">Livré à</p>
                <div className="mt-2 space-y-1 text-sm text-[var(--sage-deep)]/80">
                  {formatAddressLines(order.shippingAddress).map((line) => (
                    <p key={`shipping-${line}`}>{line}</p>
                  ))}
                </div>
              </div>
            </section>

            <section className="invoice-avoid-break overflow-x-auto rounded-xl border border-[#EEE6D8]">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-[#FBF8F2] text-[11px] uppercase tracking-[0.15em] text-[var(--sage-deep)]/70">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Désignation</th>
                    <th className="px-4 py-3 text-center font-medium">Qté</th>
                    <th className="px-4 py-3 text-right font-medium">Prix unitaire</th>
                    <th className="px-4 py-3 text-right font-medium">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => {
                    const detailLines = resolveItemDetailLines(item.snapshot);
                    return (
                      <tr key={item.id} className="border-t border-[#EEE6D8] align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium text-[var(--sage-deep)]">{resolveItemTitle(item.snapshot)}</p>
                          {detailLines.length > 0 && (
                            <div className="mt-1 space-y-0.5 text-xs text-[var(--sage-deep)]/65">
                              {detailLines.map((line) => (
                                <p key={`${item.id}-${line}`}>{line}</p>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-[var(--sage-deep)]">{item.qty}</td>
                        <td className="px-4 py-3 text-right text-[var(--sage-deep)]">{formatMoney(item.unitPriceCents)}</td>
                        <td className="px-4 py-3 text-right font-medium text-[var(--sage-deep)]">{formatMoney(item.lineTotalCents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section className="grid gap-6 md:grid-cols-[1fr_320px]">
              <div className="invoice-avoid-break space-y-3 rounded-xl border border-[#EEE6D8] p-4 text-sm">
                <h2 className="font-display text-lg text-[var(--sage-deep)]">Paiement et livraison</h2>
                <p className="text-[var(--sage-deep)]/80">
                  <span className="text-[var(--sage-deep)]/60">Méthode :</span> {toPaymentMethodLabel(order.payment.method)}
                </p>
                <p className="text-[var(--sage-deep)]/80">
                  <span className="text-[var(--sage-deep)]/60">Moyen détaillé :</span> {toPaymentMethodDetail(order.payment.method)}
                </p>
                <p className="text-[var(--sage-deep)]/80">
                  <span className="text-[var(--sage-deep)]/60">Statut de paiement :</span> {toPaymentStatusLabel(order.payment.status)}
                </p>
                <p className="text-[var(--sage-deep)]/80">
                  <span className="text-[var(--sage-deep)]/60">Transporteur :</span> {toShippingCarrierLabel(order.shipping)}
                </p>
                <p className="text-[var(--sage-deep)]/80">
                  <span className="text-[var(--sage-deep)]/60">Mode de livraison :</span> {toShippingModeLabel(order.shipping.mode)}
                </p>
                <p className="text-[var(--sage-deep)]/80">
                  <span className="text-[var(--sage-deep)]/60">Référence transport :</span> {normalizeText(order.shipping.trackingNumber) || '—'}
                </p>
              </div>

              <div className="invoice-avoid-break rounded-xl border border-[#E2D6C4] bg-[#FBF8F2] p-4 text-sm">
                <h2 className="font-display text-lg text-[var(--sage-deep)]">Totaux</h2>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--sage-deep)]/70">Sous-total</span>
                    <span className="text-[var(--sage-deep)]">{formatMoney(order.totals.subtotalCents)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--sage-deep)]/70">Livraison</span>
                    <span className="text-[var(--sage-deep)]">{formatMoney(order.totals.shippingCents)}</span>
                  </div>
                  {order.totals.discountTotalCents > 0 && (
                    <div className="flex items-center justify-between text-[var(--gold-antique)]">
                      <span>Réductions</span>
                      <span>- {formatMoney(order.totals.discountTotalCents)}</span>
                    </div>
                  )}
                  <div className="mt-2 border-t border-[#E2D6C4] pt-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[var(--sage-deep)]">Total TTC</span>
                      <span className="font-display text-xl text-[var(--gold-antique)]">
                        {formatMoney(order.totals.totalCents)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <footer className="border-t border-[#EEE6D8] pt-4 text-xs text-[var(--sage-deep)]/60">
              <p>Facture générée automatiquement depuis votre espace client le {formatDateTime(new Date().toISOString())}.</p>
              <p>Conservez ce document pour votre comptabilité et vos archives.</p>
            </footer>
          </div>
        ) : (
          <p className="text-sm text-[var(--sage-deep)]/60">Commande introuvable.</p>
        )}
      </div>
    </div>
  );
}
