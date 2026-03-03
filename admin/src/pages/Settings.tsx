import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const formatEuro = (cents: number, currency: string) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format((cents || 0) / 100);

export default function Settings() {
  const [formData, setFormData] = useState({
    freeShippingThresholdCents: '4500',
    defaultShippingCents: '590',
    currency: 'EUR',
  });

  const token = localStorage.getItem('adminToken') || '';

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const data = await api.getStoreSettings();
      if (data) {
        setFormData({
          freeShippingThresholdCents: String(data.freeShippingThresholdCents ?? 4500),
          defaultShippingCents: String(data.defaultShippingCents ?? 590),
          currency: data.currency || 'EUR',
        });
      }
    } catch (error) {
      console.error('Failed to load settings', error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.updateStoreSettings(
        {
          freeShippingThresholdCents: Number(formData.freeShippingThresholdCents),
          defaultShippingCents: Number(formData.defaultShippingCents),
          currency: formData.currency,
        },
        token
      );
      loadSettings();
    } catch (error) {
      console.error('Failed to update settings', error);
    }
  }

  const thresholdCents = useMemo(
    () => Math.max(0, Number(formData.freeShippingThresholdCents) || 0),
    [formData.freeShippingThresholdCents]
  );

  const shippingCents = useMemo(
    () => Math.max(0, Number(formData.defaultShippingCents) || 0),
    [formData.defaultShippingCents]
  );

  const currency = (formData.currency || 'EUR').toUpperCase();

  return (
    <Layout>
      <div className="admin-page admin-page-premium">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">Paramètres boutique</h1>
            <p className="admin-subtitle">
              Pilotez la politique de livraison et les règles tarifaires globales.
            </p>
          </div>
        </div>

        <section className="admin-premium-kpis">
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">Seuil livraison gratuite</p>
            <p className="admin-premium-kpi-value">{formatEuro(thresholdCents, currency)}</p>
          </article>
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">Frais par défaut</p>
            <p className="admin-premium-kpi-value">{formatEuro(shippingCents, currency)}</p>
          </article>
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">Devise active</p>
            <p className="admin-premium-kpi-value">{currency}</p>
          </article>
        </section>

        <div className="admin-card admin-premium-card">
          <h2 className="admin-card-title">Réglages livraison</h2>
          <p className="admin-muted admin-premium-card-subtitle">
            Ces paramètres impactent automatiquement le panier et le checkout.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="admin-premium-form-grid">
              <div>
                <label className="admin-label">Seuil livraison gratuite (centimes)</label>
                <input
                  className="admin-input"
                  type="number"
                  min={0}
                  value={formData.freeShippingThresholdCents}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      freeShippingThresholdCents: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="admin-label">Frais livraison par défaut (centimes)</label>
                <input
                  className="admin-input"
                  type="number"
                  min={0}
                  value={formData.defaultShippingCents}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      defaultShippingCents: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="admin-label">Devise</label>
                <input
                  className="admin-input"
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                  maxLength={3}
                />
              </div>
            </div>

            <div className="admin-settings-preview">
              <p className="admin-settings-preview-label">Aperçu</p>
              <p className="admin-settings-preview-value">
                Livraison offerte dès <strong>{formatEuro(thresholdCents, currency)}</strong>, sinon{' '}
                <strong>{formatEuro(shippingCents, currency)}</strong> de frais.
              </p>
            </div>

            <div className="admin-premium-actions">
              <button className="admin-btn admin-btn-primary" type="submit">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 3h11l3 3v15H5V3Zm3 0v5h7V3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <rect x="8" y="13" width="8" height="6" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
