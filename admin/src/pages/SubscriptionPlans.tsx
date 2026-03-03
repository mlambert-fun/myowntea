import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../api/client';

interface Product {
  id: string;
  title: string;
  type: string;
  priceCents: number;
}

interface SubscriptionPlan {
  id: string;
  productId: string;
  interval: string;
  intervalCount: number;
  stripePriceId: string;
  isActive: boolean;
  product?: Product;
}

const formatEuro = (cents: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100);

export default function SubscriptionPlans() {
  const token = localStorage.getItem('adminToken') || '';
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [formData, setFormData] = useState({
    productId: '',
    interval: 'month',
    intervalCount: '1',
    stripePriceId: '',
    isActive: true,
  });

  useEffect(() => {
    loadPlans();
    loadProducts();
  }, []);

  async function loadPlans() {
    try {
      const data = await api.getAdminSubscriptionPlans();
      setPlans(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load plans', error);
    }
  }

  async function loadProducts() {
    try {
      const data = await api.getAdminProducts();
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load products', error);
    }
  }

  async function createPlan() {
    if (!formData.productId || !formData.stripePriceId) return;
    try {
      await api.createSubscriptionPlan(
        {
          productId: formData.productId,
          interval: formData.interval,
          intervalCount: Number(formData.intervalCount) || 1,
          stripePriceId: formData.stripePriceId,
          isActive: formData.isActive,
        },
        token
      );
      setFormData({
        productId: '',
        interval: 'month',
        intervalCount: '1',
        stripePriceId: '',
        isActive: true,
      });
      await loadPlans();
    } catch (error) {
      console.error('Failed to create plan', error);
    }
  }

  async function updatePlan(plan: SubscriptionPlan) {
    try {
      await api.updateSubscriptionPlan(
        plan.id,
        {
          interval: plan.interval,
          intervalCount: plan.intervalCount,
          stripePriceId: plan.stripePriceId,
          isActive: plan.isActive,
        },
        token
      );
      await loadPlans();
    } catch (error) {
      console.error('Failed to update plan', error);
    }
  }

  async function deletePlan(id: string) {
    if (!window.confirm('Supprimer ce plan ?')) return;
    try {
      await api.deleteSubscriptionPlan(id, token);
      await loadPlans();
    } catch (error) {
      console.error('Failed to delete plan', error);
    }
  }

  const subscriptionProducts = useMemo(
    () => products.filter((product) => product.type === 'SUBSCRIPTION'),
    [products]
  );

  const activePlansCount = useMemo(
    () => plans.filter((plan) => plan.isActive).length,
    [plans]
  );

  const linkedProductCount = useMemo(() => {
    const unique = new Set(plans.map((plan) => plan.productId));
    return unique.size;
  }, [plans]);

  return (
    <Layout>
      <div className="admin-page admin-page-premium">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">Plans d’abonnement</h1>
            <p className="admin-subtitle">
              Reliez vos produits abonnables à Stripe pour activer un parcours récurrent clair et fiable.
            </p>
          </div>
        </div>

        <section className="admin-premium-kpis">
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">Plans configurés</p>
            <p className="admin-premium-kpi-value">{plans.length}</p>
          </article>
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">Plans actifs</p>
            <p className="admin-premium-kpi-value">{activePlansCount}</p>
          </article>
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">Produits liés</p>
            <p className="admin-premium-kpi-value">{linkedProductCount}</p>
          </article>
        </section>

        <div className="admin-card admin-premium-card">
          <h2 className="admin-card-title">Créer un plan</h2>
          <p className="admin-muted admin-premium-card-subtitle">
            Définissez l’intervalle de facturation et associez le Stripe Price ID correspondant.
          </p>

          <div className="admin-premium-form-grid">
            <div>
              <label className="admin-label">Produit abonnable</label>
              <select
                className="admin-input"
                value={formData.productId}
                onChange={(e) => setFormData((prev) => ({ ...prev, productId: e.target.value }))}
              >
                <option value="">Sélectionnez un produit</option>
                {subscriptionProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title} • {formatEuro(product.priceCents)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="admin-label">Intervalle</label>
              <select
                className="admin-input"
                value={formData.interval}
                onChange={(e) => setFormData((prev) => ({ ...prev, interval: e.target.value }))}
              >
                <option value="day">jour</option>
                <option value="week">semaine</option>
                <option value="month">mois</option>
                <option value="year">année</option>
              </select>
            </div>

            <div>
              <label className="admin-label">Tous les (nombre)</label>
              <input
                className="admin-input"
                type="number"
                min={1}
                value={formData.intervalCount}
                onChange={(e) => setFormData((prev) => ({ ...prev, intervalCount: e.target.value }))}
              />
            </div>

            <div>
              <label className="admin-label">Stripe Price ID</label>
              <input
                className="admin-input"
                value={formData.stripePriceId}
                onChange={(e) => setFormData((prev) => ({ ...prev, stripePriceId: e.target.value }))}
                placeholder="price_..."
              />
            </div>

            <div>
              <label className="admin-label">Actif</label>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                <span>{formData.isActive ? 'Oui' : 'Non'}</span>
              </label>
            </div>
          </div>

          <div className="admin-premium-actions">
            <button className="admin-btn admin-btn-primary" onClick={createPlan}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Créer le plan
            </button>
          </div>
        </div>

        <div className="admin-card admin-premium-card">
          <h2 className="admin-card-title">Plans existants</h2>
          <p className="admin-muted admin-premium-card-subtitle">
            Mettez à jour les plans en place et gérez leur activation.
          </p>

          {plans.length === 0 ? (
            <div className="admin-empty-state">
              Aucun plan configuré pour le moment.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Intervalle</th>
                    <th>Stripe Price ID</th>
                    <th>Actif</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id}>
                      <td>
                        <div style={{ display: 'grid', gap: '0.2rem' }}>
                          <strong>{plan.product?.title || plan.productId}</strong>
                          {plan.product && (
                            <span className="admin-muted" style={{ fontSize: '0.78rem' }}>
                              {formatEuro(plan.product.priceCents)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <input
                          className="admin-input"
                          value={`${plan.intervalCount} ${plan.interval}`}
                          onChange={(e) => {
                            const [count, interval] = e.target.value.split(' ');
                            setPlans((prev) =>
                              prev.map((item) =>
                                item.id === plan.id
                                  ? { ...item, intervalCount: Number(count) || 1, interval: interval || 'month' }
                                  : item
                              )
                            );
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-input"
                          value={plan.stripePriceId}
                          onChange={(e) =>
                            setPlans((prev) =>
                              prev.map((item) =>
                                item.id === plan.id ? { ...item, stripePriceId: e.target.value } : item
                              )
                            )
                          }
                        />
                      </td>
                      <td>
                        <label className="admin-checkbox">
                          <input
                            type="checkbox"
                            checked={plan.isActive}
                            onChange={(e) =>
                              setPlans((prev) =>
                                prev.map((item) =>
                                  item.id === plan.id ? { ...item, isActive: e.target.checked } : item
                                )
                              )
                            }
                          />
                          <span>{plan.isActive ? 'Oui' : 'Non'}</span>
                        </label>
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          <button className="admin-btn admin-btn-secondary" onClick={() => updatePlan(plan)}>
                            Sauvegarder
                          </button>
                          <button
                            className="admin-icon-button admin-icon-button-danger"
                            onClick={() => deletePlan(plan.id)}
                            title={`Supprimer le plan ${plan.product?.title || plan.productId}`}
                            aria-label={`Supprimer le plan ${plan.product?.title || plan.productId}`}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M3 6h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
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
