import { useEffect, useState } from 'react';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { api } from '@/api/client';
import { CreationCupLogo } from '@/components/creation/CreationCupLogo';
import { sortIngredientsByCategoryOrder } from '@/lib/ingredient-order';

type Order = {
  id: string;
  orderNumber?: string;
  items: {
    id: string;
    itemType: 'BLEND' | 'VARIANT' | 'PACK' | 'SUBSCRIPTION';
    name: string;
    ingredients?: { name: string; ingredientColor: string }[];
    ingredientIds?: string[];
    imageUrl?: string | null;
    price: number;
    quantity: number;
    color?: string;
  }[];
  comment?: string;
  subtotal?: number;
  shipping?: number;
  discountTotal?: number;
  total: number;
  createdAt: string;
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

export default function OrderConfirmation() {
  const [order, setOrder] = useState<Order | null>(null);
  const formatMoney = (value: number) => value.toFixed(2);
  const [isCreating, setIsCreating] = useState(false);
  const clearClientCartState = () => {
    try {
      localStorage.removeItem('tea_cart');
      localStorage.removeItem('tea_cart_meta');
      localStorage.removeItem('tea_shipping');
      window.dispatchEvent(new Event('cart-cleared'));
    } catch {
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
          const items = (response.items || []).map((item: any) => ({
            id: item.id,
            itemType: resolveOrderItemType(item),
            name: item.snapshot?.title || 'Article',
            ingredients: item.snapshot?.ingredients || [],
            imageUrl: item.snapshot?.imageUrl || null,
            price: (item.unitPriceCents || 0) / 100,
            quantity: item.qty || 1,
            color: item.snapshot?.color || item.snapshot?.blendColor || undefined,
          }));
          clearClientCartState();
          setOrder({
            id: response.id,
            orderNumber: response.orderNumber,
            items,
            subtotal: (response.subtotalCents || 0) / 100,
            shipping: (response.shippingCents || 0) / 100,
            discountTotal: (response.discountTotalCents || 0) / 100,
            total: (response.totalCents || 0) / 100,
            createdAt: response.createdAt || new Date().toISOString(),
          });
          setIsCreating(false);
        } catch {
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
            const items = (response.items || []).map((item: any) => ({
              id: item.id,
              itemType: resolveOrderItemType(item),
              name: item.snapshot?.title || 'Article',
              ingredients: item.snapshot?.ingredients || [],
              imageUrl: item.snapshot?.imageUrl || null,
              price: (item.unitPriceCents || 0) / 100,
              quantity: item.qty || 1,
              color: item.snapshot?.color || item.snapshot?.blendColor || undefined,
            }));
            setOrder({
              id: response.id,
              orderNumber: response.orderNumber,
              items,
              subtotal: (response.subtotalCents || 0) / 100,
              shipping: (response.shippingCents || 0) / 100,
              discountTotal: (response.discountTotalCents || 0) / 100,
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
        const meta = rawMeta ? (JSON.parse(rawMeta) as { appliedDiscountCode?: string | null }) : null;
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
            quantity: item.quantity,
          })),
        }).then((response) => {
          const createdOrder: Order = {
            id: response.id,
            orderNumber: response.orderNumber,
            items: cartItems,
            subtotal: response.subtotalCents / 100,
            shipping: response.shippingCents / 100,
            discountTotal: response.discountTotalCents / 100,
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
      } catch (e) {
        setOrder(null);
        setIsCreating(false);
      }
      return;
    }
    if (!id) return;

    try {
      const raw = localStorage.getItem('tea_orders');
      if (!raw) return;
      const arr = JSON.parse(raw) as Order[];
      const found = arr.find(o => o.id === id) || null;
      setOrder(found);
    } catch (e) {
      setOrder(null);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />

      <main className="pt-28 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="mb-6">
            <div className="mt-6 mx-auto w-full max-w-4xl px-4">
              <div className="relative flex w-full items-center justify-center gap-[5rem]">
                <span className="pointer-events-none absolute left-10 right-10 top-1/2 -translate-y-1/2 border-t border-[#E5E0D5]" />

                <a
                  href="/cart"
                  className="relative z-10 inline-flex min-w-[11rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-white px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]/80 transition hover:border-[var(--gold-antique)] hover:text-[var(--sage-deep)]"
                >
                  1. Panier
                </a>

                <a
                  href="/checkout"
                  className="relative z-10 inline-flex min-w-[15rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-white px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]/80 transition hover:border-[var(--gold-antique)] hover:text-[var(--sage-deep)]"
                >
                  2. Livraison et paiement
                </a>

                <span
                  aria-current="step"
                  className="relative z-10 inline-flex min-w-[11rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-[var(--gold-antique)] px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]"
                >
                  3. Confirmation
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow text-center">
            {order ? (
              <>
                <h2 className="font-display text-2xl text-[var(--sage-deep)] mb-2">Merci pour votre commande !</h2>
                <p className="text-sm text-[var(--sage-deep)]/70 mb-4">Numéro de commande <strong>{order.orderNumber || order.id}</strong></p>

                <div className="text-left mb-4">
                  <h4 className="font-medium text-[var(--sage-deep)] mb-2">Récapitulatif</h4>
                  <div className="space-y-3">
                    {order.items.map(it => {
                      const orderedIngredients = it.itemType === 'BLEND'
                        ? sortIngredientsByCategoryOrder(it.ingredients || [])
                        : (it.ingredients || []);
                      return (
                      <div key={it.id} className="flex items-center justify-between">
                        <div className="flex items-start gap-3">
                          <div className="shrink-0">
                            {(it.itemType === 'VARIANT' || it.itemType === 'PACK') && it.imageUrl ? (
                              <div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                                <img
                                  src={it.imageUrl}
                                  alt={it.name}
                                  className="h-full w-full rounded-lg object-cover"
                                />
                              </div>
                            ) : it.itemType === 'SUBSCRIPTION' ? (
                              <div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                                <div className="h-full w-full rounded-lg bg-[var(--cream-apothecary)] flex items-center justify-center text-xs">
                                  ?
                                </div>
                              </div>
                            ) : (
                              <div className="w-16 h-16 rounded-xl bg-[#F3F1EE] p-1.5 shrink-0">
                                <CreationCupLogo
                                  fillColor={orderedIngredients[0]?.ingredientColor || '#C4A77D'}
                                  ingredientCount={(it.ingredients || []).length}
                                  className="w-full h-full"
                                />
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-medium">{it.name} × {it.quantity}</div>
                            {it.ingredients && it.ingredients.length > 0 && (
                              <div className="text-xs text-[var(--sage-deep)]/60">
                                {orderedIngredients.map(i => i.name).join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="font-display text-[var(--gold-antique)]">{formatMoney(it.price * it.quantity)} €</div>
                      </div>
                    )})}
                  </div>

                  <div className="border-t border-[#E5E0D5] mt-4 pt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--sage-deep)]/60">Sous-total</span>
                      <span className="text-[var(--sage-deep)]">
                        {formatMoney(order.subtotal ?? order.items.reduce((sum, item) => sum + item.price * item.quantity, 0))} €
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--sage-deep)]/60">Livraison</span>
                      <span className="text-[var(--sage-deep)]">
                        {(order.shipping ?? 0) === 0 ? 'Gratuite' : `${formatMoney(order.shipping ?? 0)} €`}
                      </span>
                    </div>
                    {(order.discountTotal ?? 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--sage-deep)]/60">Réduction</span>
                        <span className="text-[var(--gold-antique)]">- {formatMoney(order.discountTotal || 0)} €</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-[#E5E0D5] mt-4 pt-4 flex items-center justify-between">
                    <div className="text-sm text-[var(--sage-deep)]/60">Total</div>
                    <div className="font-display text-xl text-[var(--gold-antique)]">{formatMoney(order.total)} €</div>
                  </div>

                  {order.comment && (
                    <div className="mt-4 text-sm">
                      <div className="font-medium">Instruction spéciale</div>
                      <div className="text-[var(--sage-deep)]/80 text-sm mt-1">{order.comment}</div>
                    </div>
                  )}

                  <div className="mt-6">
                    <button onClick={() => (window.location.href = '/')} className="btn-primary">Retour à l'accueil</button>
                  </div>
                </div>
              </>
            ) : isCreating ? (
              <>
                <h2 className="font-display text-2xl text-[var(--sage-deep)] mb-2">Finalisation de votre commande…</h2>
                <p className="text-[var(--sage-deep)]/60 mb-4">Veuillez patienter quelques secondes.</p>
              </>
            ) : (
              <>
                <h2 className="font-display text-2xl text-[var(--sage-deep)] mb-2">Commande introuvable</h2>
                <p className="text-[var(--sage-deep)]/60 mb-4">Nous n'avons pas trouvé cette commande. Vérifiez votre URL ou retournez à l'accueil.</p>
                <button onClick={() => (window.location.href = '/')} className="btn-primary">Retour à l'accueil</button>
              </>
            )}
          </div>

          <div className="mt-8 bg-white rounded-2xl p-6 shadow">
            <h4 className="font-medium text-[var(--sage-deep)] mb-4">Besoin d'aide ?</h4>
            <p className="text-sm text-[var(--sage-deep)]/70">Contactez-nous avec votre numéro de commande pour toute demande.</p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
