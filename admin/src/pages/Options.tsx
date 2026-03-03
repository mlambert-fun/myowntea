import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../api/client';

interface Product {
  id: string;
  title: string;
}

interface OptionValue {
  id: string;
  value: string;
  position: number;
}

interface ProductOption {
  id: string;
  name: string;
  position: number;
  values: OptionValue[];
}

export default function Options() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionPosition, setNewOptionPosition] = useState('0');
  const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({});

  const token = localStorage.getItem('adminToken') || '';

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (productId) {
      loadOptions(productId);
    } else {
      setOptions([]);
    }
  }, [productId]);

  async function loadProducts() {
    try {
      const data = await api.getAdminProducts();
      setProducts(Array.isArray(data) ? data : []);
      if (!productId && Array.isArray(data) && data.length > 0) {
        setProductId(data[0].id);
      }
    } catch (error) {
      console.error('Failed to load products', error);
    }
  }

  async function loadOptions(targetId: string) {
    try {
      const data = await api.getProductOptions(targetId);
      setOptions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load options', error);
    }
  }

  async function handleCreateOption(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) return;
    try {
      await api.createOption(productId, { name: newOptionName, position: Number(newOptionPosition) }, token);
      setNewOptionName('');
      setNewOptionPosition('0');
      loadOptions(productId);
    } catch (error) {
      console.error('Failed to create option', error);
    }
  }

  async function handleDeleteOption(optionId: string) {
    if (!window.confirm('Supprimer cette option ?')) return;
    try {
      await api.deleteOption(optionId, token);
      loadOptions(productId);
    } catch (error) {
      console.error('Failed to delete option', error);
    }
  }

  async function handleCreateValue(optionId: string) {
    const value = valueDrafts[optionId];
    if (!value) return;
    try {
      await api.createOptionValue(optionId, { value, position: 0 }, token);
      setValueDrafts((prev) => ({ ...prev, [optionId]: '' }));
      loadOptions(productId);
    } catch (error) {
      console.error('Failed to create value', error);
    }
  }

  async function handleDeleteValue(valueId: string) {
    if (!window.confirm('Supprimer cette valeur ?')) return;
    try {
      await api.deleteOptionValue(valueId, token);
      loadOptions(productId);
    } catch (error) {
      console.error('Failed to delete value', error);
    }
  }

  return (
    <Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">Options</h1>
            <p className="admin-subtitle">G?rez les options et valeurs des produits</p>
          </div>
        </div>

        <div className="admin-card">
          <h2 className="admin-card-title">Choisir un produit</h2>
          <select
            className="admin-input"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.title}
              </option>
            ))}
          </select>
        </div>

        <div className="admin-card">
          <h2 className="admin-card-title">Cr?er une option</h2>
          <form onSubmit={handleCreateOption} className="admin-form-grid">
          <div>
            <label className="admin-label">Nom</label>
            <input
              className="admin-input"
              value={newOptionName}
              onChange={(e) => setNewOptionName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="admin-label">Position</label>
            <input
              className="admin-input"
              type="number"
              value={newOptionPosition}
              onChange={(e) => setNewOptionPosition(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="admin-btn admin-btn-primary" type="submit">
              Ajouter
            </button>
          </div>
        </form>
      </div>

        <div className="admin-card">
          <h2 className="admin-card-title">Options existantes</h2>
          <div className="admin-grid-2">
            {options.map((option) => (
              <div key={option.id} className="admin-card" style={{ background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{option.name}</p>
                    <p className="admin-muted">Position {option.position}</p>
                  </div>
                  <button className="admin-icon-button admin-icon-button-danger" onClick={() => handleDeleteOption(option.id)} title="Supprimer" aria-label="Supprimer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></button>
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <p className="admin-muted">Valeurs</p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {option.values.map((value) => (
                      <span
                        key={value.id}
                        className="admin-badge"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        {value.value}
                        <button className="admin-icon-button admin-icon-button-danger" style={{ width: '22px', height: '22px' }} onClick={() => handleDeleteValue(value.id)} type="button" title="Supprimer" aria-label="Supprimer">×</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <input
                      className="admin-input"
                      placeholder="Nouvelle valeur"
                      value={valueDrafts[option.id] || ''}
                      onChange={(e) =>
                        setValueDrafts((prev) => ({
                          ...prev,
                          [option.id]: e.target.value,
                        }))
                      }
                    />
                    <button className="admin-btn admin-btn-secondary" type="button" onClick={() => handleCreateValue(option.id)}>
                      Ajouter
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}


