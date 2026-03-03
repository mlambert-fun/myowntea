import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../api/client';

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  ingredientName: string;
  ingredientColor?: string | null;
  qty?: number;
  unitPriceCents?: number;
  lineTotalCents?: number;
  snapshot?: any;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  shippingCost: number;
  tax: number;
  total: number;
  subtotalCents?: number;
  discountTotalCents?: number;
  totalCents?: number;
  shippingCents?: number;
  appliedDiscounts?: Array<{ label: string; amountCents: number; type: string }>;
  appliedDiscountCode?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  shippingProvider?: string | null;
  shippingOfferLabel?: string | null;
  shippingMode?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  shippingAddress?: string | null;
  createdAt: string;
  customer?: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    phoneE164?: string | null;
    address?: string | null;
    city?: string | null;
    postalCode?: string | null;
    country?: string | null;
  };
  billingAddressSnapshot?: {
    salutation?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    address1?: string | null;
    address2?: string | null;
    postalCode?: string | null;
    city?: string | null;
    countryCode?: string | null;
    phoneE164?: string | null;
  } | null;
  shippingAddressSnapshot?: {
    salutation?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    address1?: string | null;
    address2?: string | null;
    postalCode?: string | null;
    city?: string | null;
    countryCode?: string | null;
    phoneE164?: string | null;
  } | null;
  items: OrderItem[];
}

const formatAddress = (
  address?: OrderDetail['billingAddressSnapshot'] | null,
  fallback?: string | null
) => {
  if (!address) return fallback || '?';
  const line = [address.address1, address.address2].filter(Boolean).join(', ');
  const city = [address.postalCode, address.city].filter(Boolean).join(' ');
  const country = address.countryCode || '';
  return [line, city, country].filter(Boolean).join(', ');
};

const resolveItemTitle = (item: OrderItem) => {
  const snapshot = item.snapshot || {};
  return snapshot.title || snapshot.name || snapshot.productTitle || item.ingredientName || 'Article';
};

const resolveItemDetails = (item: OrderItem) => {
  const snapshot = item.snapshot || {};
  if (Array.isArray(snapshot.options) && snapshot.options.length) {
    return snapshot.options.map((opt: any) => `${opt.name}: ${opt.value}`).join(' · ');
  }
  if (Array.isArray(snapshot.selectedOptions) && snapshot.selectedOptions.length) {
    return snapshot.selectedOptions.map((opt: any) => `${opt.name}: ${opt.value}`).join(' · ');
  }
  if (Array.isArray(snapshot.ingredients) && snapshot.ingredients.length) {
    return snapshot.ingredients.map((ing: any) => ing.name).join(', ');
  }
  return null;
};

export default function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = localStorage.getItem('adminToken') || '';

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        const data = await api.getOrder(id, token);
        setOrder(data);
      } catch (e) {
        setError('Impossible de charger la commande');
      }
    };
    load();
  }, [id, token]);

  const subtotal = order
    ? typeof order.subtotalCents === 'number'
      ? order.subtotalCents / 100
      : order.subtotal
    : 0;
  const shipping = order
    ? typeof order.shippingCents === 'number'
      ? order.shippingCents / 100
      : order.shippingCost
    : 0;
  const discount = order ? (order.discountTotalCents || 0) / 100 : 0;
  const total = order
    ? typeof order.totalCents === 'number'
      ? order.totalCents / 100
      : order.total
    : 0;

  return (
    <Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <div>
            <h2 className="admin-title">Commande</h2>
            <p className="admin-subtitle">D?tails de la commande {order?.orderNumber}</p>
          </div>
          <Link className="admin-btn admin-btn-secondary" to="/orders">Retour</Link>
        </div>

        {error && <div className="admin-alert admin-alert-error">{error}</div>}

        {order && (
          <div className="admin-card">
            <div className="admin-grid-2">
              <div>
                <h4 className="admin-card-title">Client</h4>
                <p className="admin-muted">
                  {order.customer
                    ? `${order.customer.firstName} ${order.customer.lastName}`
                    : 'Invit?'}
                </p>
                {order.customer?.email && <p className="admin-muted">{order.customer.email}</p>}
                {order.customer?.phoneE164 && <p className="admin-muted">{order.customer.phoneE164}</p>}
              </div>

              <div>
                <h4 className="admin-card-title">Statut</h4>
                <p className="admin-muted">{order.status}</p>
                <p className="admin-muted">Paiement: {order.paymentStatus || '?'}</p>
                <p className="admin-muted">M?thode: {order.paymentMethod || '?'}</p>
              </div>
            </div>

            <div className="admin-section">
              <h4 className="admin-card-title">Articles</h4>
              <div className="admin-table">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Quantit?</th>
                      <th>Prix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span
                              style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '999px',
                                backgroundColor: item.ingredientColor || '#6B7280',
                                display: 'inline-block',
                              }}
                            />
                            <div>
                              <div>{resolveItemTitle(item)}</div>
                              {resolveItemDetails(item) && (
                                <div className="admin-muted" style={{ fontSize: '0.85rem' }}>
                                  {resolveItemDetails(item)}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>{item.qty ?? item.quantity}</td>
                        <td>
                          ?{
                            typeof item.lineTotalCents === 'number'
                              ? (item.lineTotalCents / 100).toFixed(2)
                              : item.price.toFixed(2)
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="admin-section">
              <h4 className="admin-card-title">R?sum?</h4>
              <div className="admin-grid-2">
                <div className="admin-muted">Sous-total</div>
                <div>?{subtotal.toFixed(2)}</div>
                <div className="admin-muted">Livraison</div>
                <div>?{shipping.toFixed(2)}</div>
                {discount > 0 && (
                  <>
                    <div className="admin-muted">R?duction</div>
                    <div>- ?{discount.toFixed(2)}</div>
                  </>
                )}
                <div className="admin-muted">Total</div>
                <div>?{total.toFixed(2)}</div>
              </div>
            </div>

            {order.appliedDiscounts && order.appliedDiscounts.length > 0 && (
              <div className="admin-section">
                <h4 className="admin-card-title">R?ductions appliqu?es</h4>
                <ul className="admin-muted">
                  {order.appliedDiscounts.map((discount, index) => (
                    <li key={`${discount.label}-${index}`}>
                      {discount.label} - ?{(discount.amountCents / 100).toFixed(2)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="admin-section">
              <h4 className="admin-card-title">Livraison</h4>
              <div className="admin-grid-2">
                <div className="admin-muted">Transporteur</div>
                <div>{order.shippingProvider || '?'}</div>
                <div className="admin-muted">Mode</div>
                <div>{order.shippingMode || '?'}</div>
                <div className="admin-muted">Offre</div>
                <div>{order.shippingOfferLabel || '?'}</div>
                <div className="admin-muted">Suivi</div>
                <div>{order.trackingNumber || '?'}</div>
                {order.trackingUrl && (
                  <>
                    <div className="admin-muted">Lien suivi</div>
                    <div>
                      <a className="admin-link-inline" href={order.trackingUrl} target="_blank" rel="noreferrer">
                        Ouvrir
                      </a>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="admin-section">
              <h4 className="admin-card-title">Adresses</h4>
              <div className="admin-grid-2">
                <div className="admin-muted">Facturation</div>
                <div>{formatAddress(order.billingAddressSnapshot, null)}</div>
                <div className="admin-muted">Livraison</div>
                <div>{formatAddress(order.shippingAddressSnapshot, order.shippingAddress)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

