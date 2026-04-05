import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { t } from "../lib/i18n";

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
    appliedDiscounts?: Array<{
        label: string;
        amountCents: number;
        type: string;
    }>;
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

const EMPTY_VALUE = '-';

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
});

const formatPrice = (amount: number) => currencyFormatter.format(Number.isFinite(amount) ? amount : 0);

const resolveTranslatedValue = (value?: string | null, fallback = EMPTY_VALUE) => {
    if (typeof value !== 'string') {
        return fallback;
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'null') {
        return fallback;
    }

    return trimmed.includes('.') ? t(trimmed, trimmed) : trimmed;
};

const formatAddress = (address?: OrderDetail['billingAddressSnapshot'] | null, fallback?: string | null) => {
    if (!address) {
        return fallback || EMPTY_VALUE;
    }

    const line = [address.address1, address.address2].filter(Boolean).join(', ');
    const city = [address.postalCode, address.city].filter(Boolean).join(' ');
    const country = address.countryCode || '';
    return [line, city, country].filter(Boolean).join(', ') || fallback || EMPTY_VALUE;
};

const resolveItemTitle = (item: OrderItem) => {
    const snapshot = item.snapshot || {};
    return snapshot.title || snapshot.name || snapshot.productTitle || item.ingredientName || t("admin.pages.order_detail.product");
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

    useEffect(() => {
        const load = async () => {
            if (!id) {
                return;
            }

            try {
                const data = await api.getOrder(id);
                setOrder(data);
            } catch (e) {
                setError(t("admin.pages.order_detail.failed_load_order"));
            }
        };

        void load();
    }, [id]);

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

    const statusLabels: Record<string, string> = {
        PENDING: t("admin.pages.orders.pending"),
        CONFIRMED: t("admin.pages.orders.confirmed"),
        PROCESSING: t("admin.pages.orders.preparation"),
        SHIPPED: t("admin.pages.orders.shipped"),
        DELIVERED: t("admin.pages.orders.delivered"),
        CANCELLED: t("admin.pages.orders.canceled"),
        REFUNDED: t("admin.pages.orders.refunded"),
    };

    const customerName = order?.customer
        ? [
            resolveTranslatedValue(order.customer.firstName, ''),
            resolveTranslatedValue(order.customer.lastName, ''),
        ]
            .filter(Boolean)
            .join(' ')
        : '';
    const customerLabel = customerName || order?.customer?.email || t("admin.pages.order_detail.guest");

    return (<Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <div>
            <h2 className="admin-title">{t("admin.pages.order_detail.order")}</h2>
            <p className="admin-subtitle">{t("admin.pages.order_detail.details_order")} {order?.orderNumber}</p>
          </div>
          <Link className="admin-btn admin-btn-secondary" to="/orders">{t("admin.pages.order_detail.back")}</Link>
        </div>

        {error && <div className="admin-alert admin-alert-error">{error}</div>}

        {order && (<div className="admin-card">
            <div className="admin-grid-2">
              <div>
                <h4 className="admin-card-title">{t("admin.pages.order_detail.customer")}</h4>
                <p className="admin-muted">{customerLabel}</p>
                {order.customer?.email && <p className="admin-muted">{order.customer.email}</p>}
                {order.customer?.phoneE164 && <p className="admin-muted">{order.customer.phoneE164}</p>}
              </div>

              <div>
                <h4 className="admin-card-title">{t("admin.pages.order_detail.status")}</h4>
                <p className="admin-muted">{statusLabels[order.status] || order.status}</p>
                <p className="admin-muted">{t("admin.pages.order_detail.payment")}{resolveTranslatedValue(order.paymentStatus)}</p>
                <p className="admin-muted">{t("admin.pages.order_detail.method")}{resolveTranslatedValue(order.paymentMethod)}</p>
              </div>
            </div>

            <div className="admin-section">
              <h4 className="admin-card-title">{t("admin.pages.order_detail.items")}</h4>
              <div className="admin-table">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t("admin.pages.order_detail.product")}</th>
                      <th>{t("admin.pages.order_detail.quantity")}</th>
                      <th>{t("admin.pages.order_detail.price")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (<tr key={item.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '999px',
                    backgroundColor: item.ingredientColor || '#6B7280',
                    display: 'inline-block',
                }}/>
                            <div>
                              <div>{resolveItemTitle(item)}</div>
                              {resolveItemDetails(item) && (<div className="admin-muted" style={{ fontSize: '0.85rem' }}>
                                  {resolveItemDetails(item)}
                                </div>)}
                            </div>
                          </div>
                        </td>
                        <td>{item.qty ?? item.quantity}</td>
                        <td>
                          {formatPrice(typeof item.lineTotalCents === 'number'
                    ? item.lineTotalCents / 100
                    : item.price)}
                        </td>
                      </tr>))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="admin-section">
              <h4 className="admin-card-title">{t("admin.pages.order_detail.summary")}</h4>
              <div className="admin-grid-2">
                <div className="admin-muted">{t("admin.pages.order_detail.subtotal")}</div>
                <div>{formatPrice(subtotal)}</div>
                <div className="admin-muted">{t("admin.pages.order_detail.shipping")}</div>
                <div>{formatPrice(shipping)}</div>
                {discount > 0 && (<>
                    <div className="admin-muted">{t("admin.pages.order_detail.discount")}</div>
                    <div>- {formatPrice(discount)}</div>
                  </>)}
                <div className="admin-muted">{t("admin.pages.order_detail.total")}</div>
                <div>{formatPrice(total)}</div>
              </div>
            </div>

            {order.appliedDiscounts && order.appliedDiscounts.length > 0 && (<div className="admin-section">
                <h4 className="admin-card-title">{t("admin.pages.order_detail.applied_discounts")}</h4>
                <ul className="admin-muted">
                  {order.appliedDiscounts.map((discountItem, index) => (<li key={`${discountItem.label}-${index}`}>
                      {discountItem.label} - {formatPrice(discountItem.amountCents / 100)}
                    </li>))}
                </ul>
              </div>)}

            <div className="admin-section">
              <h4 className="admin-card-title">{t("admin.pages.order_detail.shipping")}</h4>
              <div className="admin-grid-2">
                <div className="admin-muted">{t("admin.pages.order_detail.carrier")}</div>
                <div>{resolveTranslatedValue(order.shippingProvider)}</div>
                <div className="admin-muted">{t("admin.pages.order_detail.mode")}</div>
                <div>{resolveTranslatedValue(order.shippingMode)}</div>
                <div className="admin-muted">{t("admin.pages.order_detail.offer")}</div>
                <div>{resolveTranslatedValue(order.shippingOfferLabel)}</div>
                <div className="admin-muted">{t("admin.pages.order_detail.tracking")}</div>
                <div>{resolveTranslatedValue(order.trackingNumber)}</div>
                {order.trackingUrl && (<>
                    <div className="admin-muted">{t("admin.pages.order_detail.tracking_link")}</div>
                    <div>
                      <a className="admin-link-inline" href={order.trackingUrl} target="_blank" rel="noreferrer">
                        {t("admin.pages.order_detail.open")}
                      </a>
                    </div>
                  </>)}
              </div>
            </div>

            <div className="admin-section">
              <h4 className="admin-card-title">{t("admin.pages.order_detail.addresses")}</h4>
              <div className="admin-grid-2">
                <div className="admin-muted">{t("admin.pages.order_detail.billing")}</div>
                <div>{formatAddress(order.billingAddressSnapshot, null)}</div>
                <div className="admin-muted">{t("admin.pages.order_detail.shipping")}</div>
                <div>{formatAddress(order.shippingAddressSnapshot, order.shippingAddress)}</div>
              </div>
            </div>
          </div>)}
      </div>
    </Layout>);
}
