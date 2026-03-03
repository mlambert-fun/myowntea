import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../api/client';

interface Discount {
  id: string;
  title: string;
  method: 'AUTOMATIC' | 'CODE';
  code: string | null;
  type: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING' | 'BOGO' | 'TIERED' | 'BUNDLE' | 'SALE_PRICE' | 'SUBSCRIPTION' | 'GIFT';
  status: 'ACTIVE' | 'DRAFT' | 'EXPIRED';
  startAt: string | null;
  endAt: string | null;
  usageLimitTotal: number | null;
  redemptionCount: number;
  firstOrderOnly: boolean;
}

export default function Discounts() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem('adminToken') || '';

  const fetchDiscounts = async () => {
    try {
      setLoading(true);
      const data = await api.getDiscounts();
      setDiscounts(data || []);
      setError(null);
    } catch (e) {
      setError('Impossible de charger les réductions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiscounts();
  }, []);

  const toggleStatus = async (discount: Discount) => {
    const nextStatus = discount.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE';
    try {
      await api.updateDiscountStatus(discount.id, nextStatus, token);
      await fetchDiscounts();
    } catch (e) {
      setError('Échec de la mise à jour');
    }
  };

  const rows = useMemo(() => discounts, [discounts]);
  const formatDiscountType = (type: Discount['type']) => {
    if (type === 'PERCENTAGE') return 'Pourcentage';
    if (type === 'FIXED') return 'Montant fixe';
    if (type === 'FREE_SHIPPING') return 'Livraison gratuite';
    if (type === 'BOGO') return 'BOGO / 1 acheté = 1 offert';
    if (type === 'TIERED') return 'Remise par paliers';
    if (type === 'BUNDLE') return 'Bundle / lot';
    if (type === 'SALE_PRICE') return 'Prix barré (sale price)';
    if (type === 'SUBSCRIPTION') return 'Abonnement (subscribe & save)';
    if (type === 'GIFT') return 'Cadeau offert';
    return type;
  };

  return (
    <Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <div>
            <h2 className="admin-title">Réductions</h2>
            <p className="admin-subtitle">Gérez les promotions et codes de réduction.</p>
          </div>
          <Link className="admin-btn admin-btn-primary" to="/discounts/new">Nouvelle réduction</Link>
        </div>

        {error && <div className="admin-alert admin-alert-error">{error}</div>}

        <div className="admin-card">
          {loading ? (
            <div className="admin-loading">Chargement...</div>
          ) : (
            <div className="admin-table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Titre</th>
                    <th>Type</th>
                    <th>Code / Méthode</th>
                    <th>Statut</th>
                    <th>Période</th>
                    <th>Usage</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((discount) => (
                    <tr key={discount.id}>
                      <td>
                        <div className="font-medium">{discount.title}</div>
                        {discount.firstOrderOnly && (
                          <div className="text-xs opacity-70">Première commande uniquement</div>
                        )}
                        <Link className="admin-link-inline" to={`/discounts/${discount.id}/edit`}>Modifier</Link>
                      </td>
                      <td>{formatDiscountType(discount.type)}</td>
                      <td>{discount.method === 'CODE' ? discount.code : 'Automatique'}</td>
                      <td>
                        <span
                          className="admin-badge"
                          style={{
                            color: '#ffffff',
                            background:
                              discount.status === 'ACTIVE'
                                ? '#14803c'
                                : discount.status === 'DRAFT'
                                ? '#8B9388'
                                : '#A85C4B',
                          }}
                        >
                          {discount.status}
                        </span>
                      </td>
                      <td>
                        <div className="text-xs">
                          {discount.startAt ? new Date(discount.startAt).toLocaleDateString('fr-FR') : '—'}
                          {' → '}
                          {discount.endAt ? new Date(discount.endAt).toLocaleDateString('fr-FR') : '—'}
                        </div>
                      </td>
                      <td>
                        {discount.usageLimitTotal ? `${discount.redemptionCount}/${discount.usageLimitTotal}` : `${discount.redemptionCount}`}
                      </td>
                      <td className="text-right">
                        {discount.status === 'ACTIVE' ? (
                          <button
                            className="admin-icon-button admin-btn-secondary"
                            onClick={() => toggleStatus(discount)}
                            title="Désactiver"
                            aria-label={`Désactiver ${discount.title}`}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          </button>
                        ) : (
                          <button className="admin-btn admin-btn-secondary" onClick={() => toggleStatus(discount)}>
                            Activer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}


