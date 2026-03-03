import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../api/client';

interface Product {
  id: string;
  title: string;
  type: string;
}

interface Variant {
  id: string;
  productId: string;
  priceCents: number;
  sku?: string | null;
}

interface PackItem {
  id: string;
  qty: number;
  componentVariantId: string;
  componentVariant?: {
    id: string;
    product?: { title: string };
  };
}

export default function Packs() {
  const token = localStorage.getItem('adminToken') || '';
  const [packProducts, setPackProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string>('');
  const [packItems, setPackItems] = useState<PackItem[]>([]);
  const [componentProductId, setComponentProductId] = useState<string>('');
  const [componentVariants, setComponentVariants] = useState<Variant[]>([]);
  const [componentVariantId, setComponentVariantId] = useState<string>('');
  const [qty, setQty] = useState('1');

  useEffect(() => {
    loadPacks();
    loadProducts();
  }, []);

  useEffect(() => {
    if (!selectedPackId) return;
    loadPackItems(selectedPackId);
  }, [selectedPackId]);

  useEffect(() => {
    if (!componentProductId) {
      setComponentVariants([]);
      setComponentVariantId('');
      return;
    }
    api
      .getProductVariants(componentProductId)
      .then((data) => setComponentVariants(Array.isArray(data) ? data : []))
      .catch((error) => console.error('Failed to load variants', error));
  }, [componentProductId]);

  async function loadPacks() {
    try {
      const data = await api.getAdminPacks();
      setPackProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load packs', error);
    }
  }

  async function loadProducts() {
    try {
      const data = await api.getAdminProducts();
      setAllProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load products', error);
    }
  }

  async function loadPackItems(packId: string) {
    try {
      const data = await api.getPackItems(packId);
      setPackItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load pack items', error);
    }
  }

  async function addPackItem() {
    if (!selectedPackId || !componentVariantId) return;
    try {
      await api.createPackItem(
        selectedPackId,
        { componentVariantId, qty: Math.max(1, Number(qty)) },
        token
      );
      await loadPackItems(selectedPackId);
    } catch (error) {
      console.error('Failed to create pack item', error);
    }
  }

  async function updatePackItem(id: string, nextQty: number) {
    try {
      await api.updatePackItem(id, { qty: Math.max(1, nextQty) }, token);
      await loadPackItems(selectedPackId);
    } catch (error) {
      console.error('Failed to update pack item', error);
    }
  }

  async function removePackItem(id: string) {
    if (!window.confirm('Supprimer cet élément ?')) return;
    try {
      await api.deletePackItem(id, token);
      await loadPackItems(selectedPackId);
    } catch (error) {
      console.error('Failed to delete pack item', error);
    }
  }

  const componentProducts = useMemo(
    () => allProducts.filter((product) => product.type !== 'PACK' && product.type !== 'SUBSCRIPTION'),
    [allProducts]
  );

  const selectedPack = useMemo(
    () => packProducts.find((pack) => pack.id === selectedPackId) || null,
    [packProducts, selectedPackId]
  );

  const totalUnits = useMemo(
    () => packItems.reduce((sum, item) => sum + Number(item.qty || 0), 0),
    [packItems]
  );

  return (
    <Layout>
      <div className="admin-page admin-page-premium">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">Packs</h1>
            <p className="admin-subtitle">
              Composez vos packs avec précision en définissant les variantes et quantités incluses.
            </p>
          </div>
        </div>

        <section className="admin-premium-kpis">
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">Pack sélectionné</p>
            <p className="admin-premium-kpi-value">{selectedPack?.title || 'Aucun pack'}</p>
          </article>
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">Composants</p>
            <p className="admin-premium-kpi-value">{packItems.length}</p>
          </article>
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">Unités totales</p>
            <p className="admin-premium-kpi-value">{totalUnits}</p>
          </article>
        </section>

        <div className="admin-card admin-premium-card">
          <h2 className="admin-card-title">Configurer un pack</h2>
          <p className="admin-muted admin-premium-card-subtitle">
            Sélectionnez un pack, puis ajoutez les variantes à inclure dans son contenu.
          </p>

          <div className="admin-premium-form-grid">
            <div>
              <label className="admin-label">Pack</label>
              <select
                className="admin-input"
                value={selectedPackId}
                onChange={(e) => setSelectedPackId(e.target.value)}
              >
                <option value="">Sélectionnez un pack</option>
                {packProducts.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="admin-label">Produit composant</label>
              <select
                className="admin-input"
                value={componentProductId}
                onChange={(e) => setComponentProductId(e.target.value)}
              >
                <option value="">Sélectionnez un produit</option>
                {componentProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="admin-label">Variante</label>
              <select
                className="admin-input"
                value={componentVariantId}
                onChange={(e) => setComponentVariantId(e.target.value)}
              >
                <option value="">Sélectionnez une variante</option>
                {componentVariants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.sku || variant.id} • {(variant.priceCents / 100).toFixed(2)} €
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="admin-label">Quantité</label>
              <input
                className="admin-input"
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
          </div>

          <div className="admin-premium-actions">
            <button
              className="admin-btn admin-btn-primary"
              onClick={addPackItem}
              disabled={!selectedPackId || !componentVariantId}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Ajouter au pack
            </button>
          </div>
        </div>

        {selectedPackId && (
          <div className="admin-card admin-premium-card">
            <h2 className="admin-card-title">Composants du pack</h2>
            <p className="admin-muted admin-premium-card-subtitle">
              {selectedPack?.title || 'Pack sélectionné'} • {packItems.length} composant(s)
            </p>

            {packItems.length === 0 ? (
              <div className="admin-empty-state">
                Aucun composant pour ce pack. Ajoutez une variante depuis le formulaire ci-dessus.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Variante</th>
                      <th>Quantité</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.componentVariant?.product?.title || item.componentVariantId}</td>
                        <td>
                          <input
                            className="admin-input"
                            type="number"
                            min={1}
                            value={item.qty}
                            onChange={(e) => updatePackItem(item.id, Number(e.target.value))}
                            style={{ width: '110px' }}
                          />
                        </td>
                        <td>
                          <button
                            className="admin-icon-button admin-icon-button-danger"
                            onClick={() => removePackItem(item.id)}
                            title="Supprimer"
                            aria-label="Supprimer"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path
                                d="M3 6h18"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M8 6V4h8v2"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M19 6l-1 14H6L5 6"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
