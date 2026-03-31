import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { t } from "../lib/i18n";
interface Product {
    id: string;
    title: string;
}
interface OptionValue {
    id: string;
    value: string;
    optionId: string;
    optionName?: string;
}
interface ProductOption {
    id: string;
    name: string;
    values: OptionValue[];
}
interface Variant {
    id: string;
    sku?: string | null;
    priceCents: number;
    stockQty?: number | null;
    imageUrl?: string | null;
    isActive: boolean;
    optionValues?: OptionValue[];
}
export default function Variants() {
    const [products, setProducts] = useState<Product[]>([]);
    const [productId, setProductId] = useState('');
    const [variants, setVariants] = useState<Variant[]>([]);
    const [options, setOptions] = useState<ProductOption[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        sku: '',
        priceCents: '',
        stockQty: '',
        imageUrl: '',
        isActive: true,
        optionValueIds: [] as string[],
    });
    const token = localStorage.getItem('adminToken') || '';
    useEffect(() => {
        loadProducts();
    }, []);
    useEffect(() => {
        if (productId) {
            loadVariants(productId);
            loadOptions(productId);
        }
        else {
            setVariants([]);
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
        }
        catch (error) {
            console.error('Failed to load products', error);
        }
    }
    async function loadVariants(targetId: string) {
        try {
            const data = await api.getProductVariants(targetId);
            setVariants(Array.isArray(data) ? data : []);
        }
        catch (error) {
            console.error('Failed to load variants', error);
        }
    }
    async function loadOptions(targetId: string) {
        try {
            const data = await api.getProductOptions(targetId);
            setOptions(Array.isArray(data) ? data : []);
        }
        catch (error) {
            console.error('Failed to load options', error);
        }
    }
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!productId)
            return;
        try {
            const payload = {
                sku: formData.sku || null,
                priceCents: Number(formData.priceCents),
                stockQty: formData.stockQty ? Number(formData.stockQty) : null,
                imageUrl: formData.imageUrl || null,
                isActive: formData.isActive,
                optionValueIds: formData.optionValueIds,
            };
            if (editingId) {
                await api.updateVariant(editingId, payload, token);
            }
            else {
                await api.createVariant(productId, payload, token);
            }
            resetForm();
            loadVariants(productId);
        }
        catch (error) {
            console.error('Failed to save variant', error);
        }
    }
    function resetForm() {
        setEditingId(null);
        setFormData({ sku: '', priceCents: '', stockQty: '', imageUrl: '', isActive: true, optionValueIds: [] });
    }
    function startEdit(variant: Variant) {
        setEditingId(variant.id);
        setFormData({
            sku: variant.sku || '',
            priceCents: String(variant.priceCents),
            stockQty: variant.stockQty !== null && variant.stockQty !== undefined ? String(variant.stockQty) : '',
            imageUrl: variant.imageUrl || '',
            isActive: variant.isActive,
            optionValueIds: (variant.optionValues || []).map((val) => val.id),
        });
    }
    async function handleDelete(variantId: string) {
        if (!window.confirm(t("admin.pages.variants.delete_variant")))
            return;
        try {
            await api.deleteVariant(variantId, token);
            setVariants((prev) => prev.filter((item) => item.id !== variantId));
        }
        catch (error) {
            console.error('Failed to delete variant', error);
        }
    }
    function toggleOptionValue(valueId: string) {
        setFormData((prev) => {
            const exists = prev.optionValueIds.includes(valueId);
            return {
                ...prev,
                optionValueIds: exists
                    ? prev.optionValueIds.filter((id) => id !== valueId)
                    : [...prev.optionValueIds, valueId],
            };
        });
    }
    return (<Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">Variantes</h1>
            <p className="admin-subtitle">G?rez les variantes de produits</p>
          </div>
        </div>

        <div className="admin-card">
          <h2 className="admin-card-title">Choisir un produit</h2>
          <select className="admin-input" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((product) => (<option key={product.id} value={product.id}>
                {product.title}
              </option>))}
          </select>
        </div>

        <div className="admin-card">
          <h2 className="admin-card-title">{editingId ? t("admin.pages.variants.edit_variant") : 'Nouvelle variante'}</h2>
          <form onSubmit={handleSubmit} className="admin-form-grid">
          <div>
            <label className="admin-label">SKU</label>
            <input className="admin-input" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })}/>
          </div>
          <div>
            <label className="admin-label">Prix (cents)</label>
            <input className="admin-input" type="number" value={formData.priceCents} onChange={(e) => setFormData({ ...formData, priceCents: e.target.value })} required/>
          </div>
          <div>
            <label className="admin-label">Stock</label>
            <input className="admin-input" type="number" value={formData.stockQty} onChange={(e) => setFormData({ ...formData, stockQty: e.target.value })}/>
          </div>
          <div>
            <label className="admin-label">Image</label>
            <input className="admin-input" value={formData.imageUrl} onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}/>
          </div>
          <div>
            <label className="admin-label">Actif</label>
            <select className="admin-input" value={formData.isActive ? 'true' : 'false'} onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="admin-label">Options</label>
            <div className="admin-grid-2">
              {options.map((option) => (<div key={option.id} className="admin-card" style={{ background: '#fff' }}>
                  <p style={{ fontWeight: 600 }}>{option.name}</p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                    {option.values.map((value) => (<label key={value.id} className="admin-chip">
                        <input type="checkbox" checked={formData.optionValueIds.includes(value.id)} onChange={() => toggleOptionValue(value.id)}/>
                        <span>{value.value}</span>
                      </label>))}
                  </div>
                </div>))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="admin-btn admin-btn-primary" type="submit">
              {editingId ? 'Mettre ? jour' : 'Cr?er'}
            </button>
            {editingId && (<button className="admin-btn" type="button" onClick={resetForm}>
                Annuler
              </button>)}
          </div>
        </form>
      </div>

        <div className="admin-card">
          <h2 className="admin-card-title">Variantes existantes</h2>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Prix</th>
                  <th>Stock</th>
                  <th>Options</th>
                  <th>Actif</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant) => (<tr key={variant.id}>
                    <td>{variant.sku || '-'}</td>
                    <td>{(variant.priceCents / 100).toFixed(2)} ?</td>
                    <td>{variant.stockQty === null ? '?' : variant.stockQty}</td>
                    <td>
                      {(variant.optionValues || [])
                .map((value) => `${value.optionName || 'Option'}: ${value.value}`)
                .join(' ? ') || '?'}
                    </td>
                    <td>{variant.isActive ? 'Oui' : 'Non'}</td>
                    <td style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="admin-btn admin-btn-secondary" onClick={() => startEdit(variant)}>{t("admin.pages.variants.edit")}</button>
                      <button className="admin-icon-button admin-icon-button-danger" onClick={() => handleDelete(variant.id)} title={t("admin.pages.variants.delete")} aria-label={t("admin.pages.variants.delete")}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M3 6h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>);
}

