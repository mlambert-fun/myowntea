import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { api, type EmailDeliveryRow, type EmailMetricsResponse } from '../api/client';
import { showToast } from '../lib/toast';

const KNOWN_EMAIL_STATUSES = ['PENDING', 'RETRY', 'SENT', 'FAILED'] as const;

const KNOWN_EMAIL_TYPES = [
  'ORDER_CONFIRMED',
  'ORDER_PROCESSING',
  'ORDER_SHIPPED',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED',
  'ORDER_REFUNDED',
  'PASSWORD_RESET',
  'ACCOUNT_PASSWORD_CHANGED',
  'ACCOUNT_EMAIL_CHANGED',
  'WELCOME_J0',
  'WELCOME_J3',
  'ABANDONED_CART_H1',
  'ABANDONED_CART_H24',
  'POST_PURCHASE_CROSSSELL_J3',
  'POST_PURCHASE_REVIEW_J7',
  'REORDER_J21',
  'REORDER_J35',
  'WINBACK_45',
  'WINBACK_90',
  'ADMIN_TEST_EMAIL',
] as const;

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('fr-FR');
};

const formatEuro = (valueCents: number) => {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format((valueCents || 0) / 100);
};

export default function Emails() {
  const token = localStorage.getItem('adminToken') || '';
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<EmailMetricsResponse | null>(null);
  const [rows, setRows] = useState<EmailDeliveryRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [recipientFilter, setRecipientFilter] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [resendingId, setResendingId] = useState<string | null>(null);

  const summary = useMemo(
    () =>
      metrics?.summary || {
        total: 0,
        sent: 0,
        failed: 0,
        retry: 0,
        pending: 0,
      },
    [metrics]
  );

  const statusOptions = useMemo(() => {
    const unique = new Set<string>(KNOWN_EMAIL_STATUSES);
    rows.forEach((row) => {
      if (row.status) unique.add(row.status);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [rows]);

  const typeOptions = useMemo(() => {
    const unique = new Set<string>(KNOWN_EMAIL_TYPES);
    rows.forEach((row) => {
      if (row.type) unique.add(row.type);
    });
    metrics?.campaigns?.forEach((campaign) => {
      if (campaign.type) unique.add(campaign.type);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [metrics?.campaigns, rows]);

  async function loadAll() {
    try {
      setLoading(true);
      const [deliveries, emailMetrics] = await Promise.all([
        api.getEmailDeliveries(
          {
            page,
            pageSize,
            status: statusFilter || undefined,
            type: typeFilter || undefined,
            recipient: recipientFilter || undefined,
          },
          token
        ),
        api.getEmailMetrics(30, token),
      ]);
      setRows(Array.isArray(deliveries.items) ? deliveries.items : []);
      setTotalPages(Math.max(1, deliveries.totalPages || 1));
      setMetrics(emailMetrics);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Impossible de charger les emails', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [page, pageSize, statusFilter, typeFilter, recipientFilter]);

  async function handleResend(id: string) {
    try {
      setResendingId(id);
      await api.resendEmailDelivery(id, token);
      showToast('Email relance avec succes', 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Relance impossible', 'error');
    } finally {
      setResendingId(null);
    }
  }

  async function handleSendTest() {
    if (!testTo.trim()) {
      showToast('Renseigne un email de test', 'error');
      return;
    }
    try {
      setSendingTest(true);
      await api.sendAdminTestEmail(
        {
          to: testTo.trim(),
          subject: 'Test email My Own Tea',
          text: 'Email de test envoye depuis le back-office.',
          html: '<p>Email de test envoye depuis le back-office.</p>',
        },
        token
      );
      showToast('Email de test envoye', 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Echec de l'envoi test", 'error');
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">Emails</h1>
            <p className="admin-subtitle">Historique, relance et KPI des emails transactionnels et marketing</p>
          </div>
          <button
            className="admin-btn admin-btn-secondary"
            onClick={() => void loadAll()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M20 4v5h-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Actualiser
          </button>
        </div>

        <div className="admin-grid-2" style={{ marginBottom: '1rem' }}>
          <div className="admin-card">
            <p className="admin-muted">Emails (30 jours)</p>
            <p className="dashboard-kpi-value">{summary.total}</p>
            <p className="admin-muted" style={{ marginTop: '0.25rem' }}>
              Sent: {summary.sent} | Pending: {summary.pending} | Retry: {summary.retry} | Failed: {summary.failed}
            </p>
          </div>
          <div className="admin-card">
            <p className="admin-muted">Performance campagnes (7 jours post-touch)</p>
            <p className="dashboard-kpi-value">
              {Math.round((metrics?.conversion.conversionRate || 0) * 1000) / 10}%
            </p>
            <p className="admin-muted" style={{ marginTop: '0.25rem' }}>
              Touches: {metrics?.conversion.touches || 0} | Conversions: {metrics?.conversion.conversions || 0} | CA:{' '}
              {formatEuro(metrics?.conversion.revenueCents || 0)}
            </p>
          </div>
        </div>

        <div className="admin-card" style={{ marginBottom: '1rem' }}>
          <h2 className="admin-card-title">Envoi test</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'nowrap', marginTop: '0.75rem' }}>
            <input
              className="admin-input"
              placeholder="email@domaine.com"
              value={testTo}
              onChange={(event) => setTestTo(event.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button
              className="admin-btn admin-btn-primary"
              onClick={() => void handleSendTest()}
              disabled={sendingTest}
              style={{ flexShrink: 0 }}
            >
              {sendingTest ? 'Envoi...' : 'Envoyer test'}
            </button>
          </div>
        </div>

        <div className="admin-card" style={{ marginBottom: '1rem' }}>
          <h2 className="admin-card-title">Filtres</h2>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <select
              className="admin-input"
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value);
              }}
            >
              <option value="">Tous les statuts</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              className="admin-input"
              value={typeFilter}
              onChange={(event) => {
                setPage(1);
                setTypeFilter(event.target.value);
              }}
            >
              <option value="">Tous les types</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              className="admin-input"
              placeholder="Destinataire"
              value={recipientFilter}
              onChange={(event) => {
                setPage(1);
                setRecipientFilter(event.target.value);
              }}
            />
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Destinataire</th>
                  <th>Sujet</th>
                  <th>Commande</th>
                  <th>Statut</th>
                  <th>Tentatives</th>
                  <th>Erreur</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td>{row.type}</td>
                    <td>{row.recipient}</td>
                    <td>{row.subject}</td>
                    <td>{row.orderNumber || '-'}</td>
                    <td>{row.status}</td>
                    <td>{row.attemptCount}</td>
                    <td style={{ maxWidth: '240px', whiteSpace: 'normal' }}>{row.error || '-'}</td>
                    <td>
                      <button
                        className="admin-icon-button admin-btn-secondary"
                        title="Renvoyer"
                        aria-label={`Renvoyer l'email ${row.id}`}
                        onClick={() => void handleResend(row.id)}
                        disabled={resendingId === row.id}
                      >
                        {resendingId === row.id ? (
                          '...'
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="M4 12l7-7v4h4a5 5 0 0 1 0 10h-1"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center' }} className="admin-muted">
                      Aucun email trouvé
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', gap: '0.75rem' }}>
            <button
              className="admin-btn admin-btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Précédent
            </button>
            <div className="admin-muted">
              Page {page} / {totalPages}
            </div>
            <button
              className="admin-btn admin-btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              Suivant
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

