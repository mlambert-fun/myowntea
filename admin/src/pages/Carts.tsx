import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { t } from "../lib/i18n";
interface CartItem {
    id: string;
    itemType: string;
    qty: number;
    unitPriceCents: number;
    snapshot?: any;
    subscriptionPlanId?: string | null;
}
interface Cart {
    id: string;
    status: string;
    createdAt?: string;
    updatedAt?: string;
    customer?: {
        email?: string | null;
        firstName?: string | null;
        lastName?: string | null;
    } | null;
    items?: CartItem[];
}
const resolveItemLabel = (item: CartItem) => {
    const snapshot = item.snapshot || {};
    return snapshot.title || snapshot.name || snapshot.productTitle || item.itemType || 'Article';
};
export default function Carts() {
    const [carts, setCarts] = useState<Cart[]>([]);
    useEffect(() => {
        loadCarts();
        const intervalId = window.setInterval(() => {
            loadCarts();
        }, 8000);
        return () => window.clearInterval(intervalId);
    }, []);
    async function loadCarts() {
        try {
            const data = await api.getCarts();
            setCarts(Array.isArray(data) ? data : []);
        }
        catch (error) {
            console.error('Failed to load carts', error);
        }
    }
    return (<Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">Paniers actifs</h1>
            <p className="admin-subtitle">{t("admin.pages.carts.tracking_carts_customers")}</p>
          </div>
          <button className="admin-btn admin-btn-secondary" onClick={loadCarts} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M20 4v5h-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Actualiser
          </button>
        </div>

        <div className="admin-card">
          <div className="admin-table-wrapper">
            <table className="admin-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Type</th>
                <th>{t("admin.pages.carts.email")}</th>
                <th>Statut</th>
                <th>Articles</th>
                <th>Contenu</th>
                <th>{t("admin.pages.carts.total_estime")}</th>
                <th>{t("admin.pages.carts.last_update")}</th>
              </tr>
            </thead>
            <tbody>
              {carts.map((cart) => {
            const itemCount = (cart.items || []).reduce((sum, item) => sum + (item.qty || 0), 0);
            const totalCents = (cart.items || []).reduce((sum, item) => sum + item.qty * item.unitPriceCents, 0);
            const name = [cart.customer?.firstName, cart.customer?.lastName]
                .filter(Boolean)
                .join(' ');
            const typeLabel = cart.customer?.email ? t("admin.pages.carts.account") : t("admin.pages.carts.guest");
            const itemSummary = (cart.items || [])
                .slice(0, 2)
                .map((item) => `${resolveItemLabel(item)} x${item.qty}`)
                .join(', ');
            return (<tr key={cart.id}>
                    <td>{name || '—'}</td>
                    <td>{typeLabel}</td>
                    <td>{cart.customer?.email || '—'}</td>
                    <td>{cart.status}</td>
                    <td>{itemCount}</td>
                    <td>{itemSummary || '—'}</td>
                    <td>{(totalCents / 100).toFixed(2)} €</td>
                    <td>{cart.updatedAt ? new Date(cart.updatedAt).toLocaleDateString('fr-FR') : '—'}</td>
                  </tr>);
        })}
            </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>);
}

