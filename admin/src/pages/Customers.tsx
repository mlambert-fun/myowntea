import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../api/client';

interface Customer {
  id: string;
  email?: string | null;
  authProvider?: 'PASSWORD' | 'GOOGLE' | null;
  salutation?: 'MME' | 'MR' | null;
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  createdAt?: string;
  carts?: Array<{ id: string }>;
  orders?: Array<{ id: string }>;
}

const formatSalutation = (value?: 'MME' | 'MR' | null) => {
  if (value === 'MME') return 'Mme';
  if (value === 'MR') return 'M.';
  return '-';
};

const toDateAtStart = (value: string) => (value ? new Date(`${value}T00:00:00`) : null);
const toDateAtEnd = (value: string) => (value ? new Date(`${value}T23:59:59.999`) : null);

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    accountType: 'account',
    createdFrom: '',
    createdTo: '',
  });

  const token = localStorage.getItem('adminToken') || '';

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    try {
      const data = await api.getCustomers();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load customers', error);
    }
  }

  const getCustomerLabel = (customer: Customer) => {
    const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
    if (fullName) return fullName;
    if (customer.email) return customer.email;
    return 'Invité';
  };

  async function confirmDeleteCustomer() {
    if (!deleteTarget || isDeleting) return;
    try {
      setDeleteError(null);
      setIsDeleting(true);
      await api.deleteCustomer(deleteTarget.id, token);
      setCustomers((prev) => prev.filter((customer) => customer.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      console.error('Failed to delete customer', error);
      setDeleteError('Impossible de supprimer ce client.');
    } finally {
      setIsDeleting(false);
    }
  }

  const filteredCustomers = customers.filter((customer) => {
    const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim().toLowerCase();
    if (searchQuery.trim() && !fullName.includes(searchQuery.trim().toLowerCase())) {
      return false;
    }

    if (filters.accountType === 'account' && !customer.email) return false;
    if (filters.accountType === 'guest' && customer.email) return false;

    const createdAt = customer.createdAt ? new Date(customer.createdAt) : null;
    const createdFrom = toDateAtStart(filters.createdFrom);
    const createdTo = toDateAtEnd(filters.createdTo);
    if ((createdFrom || createdTo) && !createdAt) return false;
    if (createdFrom && createdAt && createdAt < createdFrom) return false;
    if (createdTo && createdAt && createdAt > createdTo) return false;

    return true;
  });

  return (
    <Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">Clients</h1>
            <p className="admin-subtitle">Gérez les comptes clients</p>
          </div>
        </div>

        <div className="admin-card">
        {deleteError && (
          <div className="admin-alert admin-alert-error" style={{ marginBottom: '0.75rem' }}>
            {deleteError}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <input
              type="text"
              className="admin-input"
              placeholder="Rechercher par nom..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className="admin-btn admin-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            title={showFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
            aria-label={showFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M7 12H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M10 18H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Filtres
          </button>
        </div>

        {showFilters && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
              <span className="admin-muted">Type :</span>
              <select
                className="admin-input"
                value={filters.accountType}
                onChange={(e) => setFilters({ ...filters, accountType: e.target.value })}
                style={{ width: '245px' }}
              >
                <option value="account">Comptes (hors invités)</option>
                <option value="guest">Invités uniquement</option>
                <option value="">Tous les types</option>
              </select>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                flexWrap: 'nowrap',
                whiteSpace: 'nowrap',
                flexBasis: '100%',
              }}
            >
              <span className="admin-muted">Date de création : du</span>
              <input
                type="date"
                className="admin-input"
                value={filters.createdFrom}
                onChange={(e) => setFilters({ ...filters, createdFrom: e.target.value })}
                style={{ width: '140px' }}
              />
              <span className="admin-muted">au</span>
              <input
                type="date"
                className="admin-input"
                value={filters.createdTo}
                onChange={(e) => setFilters({ ...filters, createdTo: e.target.value })}
                style={{ width: '140px' }}
              />
            </div>
          </div>
        )}

        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Email</th>
                <th>Nom</th>
                <th>Commandes</th>
                <th>Paniers</th>
                <th>Créé le</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => {
                const typeLabel = customer.email ? 'Compte' : 'Invité';
                return (
                  <tr key={customer.id}>
                    <td>{typeLabel}</td>
                    <td>
                      {customer.email ? (
                        <Link to={`/customers/${customer.id}`} className="admin-link-inline">
                          {customer.email}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <Link to={`/customers/${customer.id}`} className="admin-link-inline">
                        {formatSalutation(customer.salutation)} {customer.firstName || ''} {customer.lastName || ''}
                        {!customer.firstName && !customer.lastName ? 'Invité' : ''}
                      </Link>
                    </td>
                    <td>{customer.orders?.length ?? 0}</td>
                    <td>{customer.carts?.length ?? 0}</td>
                    <td>{customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('fr-FR') : '-'}</td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(customer)}
                          className="admin-icon-button admin-icon-button-danger"
                          aria-label={`Supprimer ${getCustomerLabel(customer)}`}
                          title="Supprimer"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M3 6h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M10 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M14 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    Aucun client trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>

        {deleteTarget && (
          <div className="admin-modal-backdrop" onClick={() => !isDeleting && setDeleteTarget(null)}>
            <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <h2 className="admin-card-title" style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>
              Supprimer le client
            </h2>
            <p style={{ marginBottom: '1.5rem', color: 'var(--muted)' }}>
              Êtes-vous sûr de vouloir supprimer <strong>{getCustomerLabel(deleteTarget)}</strong> ? Cette action est irréversible et supprimera en cascade ses paniers, commandes, créations, wishlists, adresses, sessions et données liées.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
              >
                Annuler
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                onClick={confirmDeleteCustomer}
                disabled={isDeleting}
              >
                {isDeleting ? 'Suppression...' : 'Supprimer définitivement'}
              </button>
            </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
