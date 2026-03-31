import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { t } from "../lib/i18n";
interface Product {
    id: string;
    title: string;
    slug: string;
    type: string;
    ranking: number;
    description?: string | null;
    isActive: boolean;
    variants?: Array<{
        id: string;
    }>;
}
export default function Products() {
    const [products, setProducts] = useState<Product[]>([]);
    useEffect(() => {
        loadProducts();
    }, []);
    async function loadProducts() {
        try {
            const data = await api.getAdminProducts();
            setProducts(Array.isArray(data) ? data : []);
        }
        catch (error) {
            console.error('Failed to load products', error);
        }
    }
    async function handleDelete(productId: string) {
        if (!window.confirm(t("admin.pages.products.delete_product")))
            return;
        try {
            const token = localStorage.getItem('adminToken') || '';
            await api.deleteProduct(productId, token);
            setProducts((prev) => prev.filter((item) => item.id !== productId));
        }
        catch (error) {
            console.error('Failed to delete product', error);
        }
    }
    return (<Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">Produits</h1>
            <p className="admin-subtitle">{t("admin.pages.products.manage_products_leur")}</p>
          </div>
          <div>
            <Link className="admin-btn admin-btn-primary" to="/products/new">{t("admin.pages.products.add_product")}</Link>
          </div>
        </div>

        <div className="admin-card">
          <h2 className="admin-card-title">{t("admin.pages.products.list_products")}</h2>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Titre</th>
                  <th>Slug</th>
                  <th>Type</th>
                  <th>Ranking</th>
                  <th>Variantes</th>
                  <th>Actif</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (<tr key={product.id}>
                    <td>
                      <Link to={`/products/${product.id}`} className="admin-link admin-link-gold">
                        {product.title}
                      </Link>
                    </td>
                    <td>{product.slug}</td>
                    <td>{product.type}</td>
                    <td>{product.ranking ?? 0}</td>
                    <td>{product.variants?.length ?? 0}</td>
                    <td>{product.isActive ? 'Oui' : 'Non'}</td>
                    <td style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="admin-icon-button admin-icon-button-danger" onClick={() => handleDelete(product.id)} title={`Supprimer ${product.title}`} aria-label={`Supprimer ${product.title}`}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M3 6h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M6 6l1 14h10l1-14" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                          <path d="M10 10v6M14 10v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
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
