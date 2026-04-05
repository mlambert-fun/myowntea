import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { t } from "../lib/i18n";
interface WishlistIngredient {
    id: string;
    name: string;
    color: string;
    category: string;
}
interface WishlistCreation {
    id: string;
    createdAt: string;
    name: string;
    ingredientIds: string[];
    ingredients: WishlistIngredient[];
    base?: {
        colors?: Array<{
            hex: string;
        }>;
    };
    blendColor?: string;
    priceCents: number;
}
interface CustomerSummary {
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
}
interface CustomerWishlistsResponse {
    customer: CustomerSummary;
    wishlists: WishlistCreation[];
}
export default function CustomerWishlists() {
    const { id } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [customer, setCustomer] = useState<CustomerSummary | null>(null);
    const [wishlists, setWishlists] = useState<WishlistCreation[]>([]);
    useEffect(() => {
        if (!id)
            return;
        void loadCustomerWishlists(id);
    }, [id]);
    async function loadCustomerWishlists(customerId: string) {
        try {
            setLoading(true);
            const data = (await api.getCustomerWishlists(customerId)) as CustomerWishlistsResponse;
            setCustomer(data?.customer || null);
            setWishlists(Array.isArray(data?.wishlists) ? data.wishlists : []);
            setError(null);
        }
        catch (err) {
            console.error('Failed to load customer wishlists', err);
            setError(t("admin.pages.customer_wishlists.failed_load_wishlists"));
        }
        finally {
            setLoading(false);
        }
    }
    const customerName = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ').trim();
    const wishlistCountLabel = wishlists.length > 1 ? t("admin.pages.customer_wishlists.wishlists") : t("admin.pages.customer_wishlists.wishlist");
    return (<Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link to="/customers" className="admin-link-inline">{t("admin.pages.customer_wishlists.back_customers")}</Link>
              {id ? (<Link to={`/customers/${id}`} className="admin-link-inline">{t("admin.pages.customer_wishlists.back_record_customer")}</Link>) : null}
            </div>
            <h1 className="admin-title" style={{ marginTop: '0.5rem' }}>{t("admin.pages.customer_wishlists.title")}</h1>
            <p className="admin-subtitle">
              {customerName || customer?.email || t("admin.pages.customer_wishlists.customer")} - {wishlists.length} {wishlistCountLabel}
            </p>
          </div>
        </div>

        {loading && <p>{t("admin.pages.translations.loading")}</p>}
        {!loading && error && <p>{error}</p>}

        {!loading && !error && (<div className="admin-card">
            <h2 className="admin-card-title">{t("admin.pages.customer_wishlists.list_wishlists")}</h2>
            {wishlists.length === 0 ? (<p className="admin-muted">{t("admin.pages.customer_wishlists.none_wishlist_customer")}</p>) : (<div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t("admin.pages.customer_wishlists.creation")}</th>
                      <th>{t("admin.pages.customer_wishlists.ingredients")}</th>
                      <th>{t("admin.pages.customer_wishlists.price")}</th>
                      <th>{t("admin.pages.customer_wishlists.created_at")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wishlists.map((wishlist) => (<tr key={wishlist.id}>
                        <td>{wishlist.name || t("admin.pages.customer_wishlists.my_creation")}</td>
                        <td>
                          {wishlist.ingredients?.length
                        ? wishlist.ingredients.map((ingredient) => ingredient.name).join(', ')
                        : '-'}
                        </td>
                        <td>{(wishlist.priceCents / 100).toFixed(2)} €</td>
                        <td>{wishlist.createdAt ? new Date(wishlist.createdAt).toLocaleString('fr-FR') : '-'}</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>)}
          </div>)}
      </div>
    </Layout>);
}
