import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../api/client';

interface Address {
  id: string;
  address1: string;
  address2?: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  phoneE164?: string | null;
  isDefaultBilling: boolean;
  isDefaultShipping: boolean;
}

interface CustomerDetail {
  id: string;
  email?: string | null;
  authProvider?: 'PASSWORD' | 'GOOGLE' | null;
  salutation?: 'MME' | 'MR' | null;
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  phoneE164?: string | null;
  createdAt?: string;
  carts?: Array<{ id: string; status: string }>;
  orders?: Array<{ id: string; status: string }>;
  addresses?: Address[];
  wishlistsCount?: number;
}

const formatSalutation = (value?: 'MME' | 'MR' | null) => {
  if (value === 'MME') return 'Mme';
  if (value === 'MR') return 'M.';
  return '-';
};

const formatAddress = (address: Address) => {
  const line = [address.address1, address.address2].filter(Boolean).join(', ');
  const city = `${address.postalCode} ${address.city}`.trim();
  return `${line}, ${city} (${address.countryCode})`;
};

export default function CustomerDetail() {
  const { id } = useParams();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    loadCustomer(id);
  }, [id]);

  async function loadCustomer(customerId: string) {
    try {
      setLoading(true);
      const data = await api.getCustomer(customerId);
      setCustomer(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load customer', err);
      setError('Impossible de charger le client.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <Link to="/customers" className="admin-link-inline">
              Retour aux clients
            </Link>
            <h1 className="admin-title" style={{ marginTop: '0.5rem' }}>Dossier client</h1>
            <p className="admin-subtitle">Toutes les informations personnelles et adresses</p>
          </div>
        </div>

        {loading && <p>Chargement...</p>}
        {!loading && error && <p>{error}</p>}

        {!loading && !error && customer && (
          <div className="admin-card">
            <h2 className="admin-card-title">Informations personnelles</h2>
            <div className="admin-grid" style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div>
                <div className="admin-muted">Type de compte</div>
                <div>{customer.email ? 'Compte' : 'Invit?'}</div>
              </div>
              <div>
                <div className="admin-muted">Email</div>
                <div>{customer.email || '-'}</div>
              </div>
              <div>
                <div className="admin-muted">Nom</div>
                <div>
                  {formatSalutation(customer.salutation)} {customer.firstName || ''} {customer.lastName || ''}
                </div>
              </div>
              <div>
                <div className="admin-muted">Date de naissance</div>
                <div>{customer.birthDate ? new Date(customer.birthDate).toLocaleDateString('fr-FR') : '-'}</div>
              </div>
              <div>
                <div className="admin-muted">T?l?phone</div>
                <div>{customer.phoneE164 || '-'}</div>
              </div>
              <div>
                <div className="admin-muted">Cr?? le</div>
                <div>{customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('fr-FR') : '-'}</div>
              </div>
              <div>
                <div className="admin-muted">Auth provider</div>
                <div>{customer.authProvider || '-'}</div>
              </div>
              <div>
                <div className="admin-muted">Commandes</div>
                <div>{customer.orders?.length ?? 0}</div>
              </div>
              <div>
                <div className="admin-muted">Paniers</div>
                <div>{customer.carts?.length ?? 0}</div>
              </div>
              <div>
                <div className="admin-muted">Wishlists</div>
                <div>
                  <Link to={`/customers/${customer.id}/wishlists`} className="admin-link-inline">
                    {customer.wishlistsCount ?? 0}
                  </Link>
                </div>
              </div>
            </div>

            <h2 className="admin-card-title" style={{ marginTop: '1.5rem' }}>Adresses</h2>
            {customer.addresses && customer.addresses.length > 0 ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {customer.addresses.map((address) => (
                  <div key={address.id} className="admin-card" style={{ margin: 0 }}>
                    <div>{formatAddress(address)}</div>
                    <div className="admin-muted" style={{ marginTop: '0.25rem' }}>
                      {address.phoneE164 ? `Tel: ${address.phoneE164}` : 'Tel: -'}
                    </div>
                    <div className="admin-muted" style={{ marginTop: '0.25rem' }}>
                      {address.isDefaultBilling && 'Facturation par defaut'}
                      {address.isDefaultBilling && address.isDefaultShipping && ' · '}
                      {address.isDefaultShipping && 'Livraison par defaut'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="admin-muted">Aucune adresse enregistree.</p>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

