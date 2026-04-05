import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { t } from "../lib/i18n";
interface Shipment {
    id: string;
    provider: string;
    providerOrderId?: string | null;
    offerCode?: string | null;
    offerLabel?: string | null;
    status?: string | null;
    statusInternal?: string | null;
    trackingNumber?: string | null;
    labelUrl?: string | null;
    createdAt: string;
    order?: {
        id: string;
        orderNumber: string;
        createdAt: string;
        customer?: {
            firstName: string;
            lastName: string;
            email: string;
        };
    };
}
export default function Shipments() {
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const load = async () => {
        try {
            setLoading(true);
            const data = await api.getShipments();
            setShipments(Array.isArray(data) ? data : []);
        }
        catch (e) {
            setError(t("admin.pages.shipments.failed_load_shipments"));
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        load();
    }, []);
    return (<Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">{t("admin.pages.shipments.shipments")}</h1>
            <p className="admin-subtitle">{t("admin.pages.shipments.management_envois_etiquettes")}</p>
          </div>
          <button className="admin-btn admin-btn-secondary" onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M20 4v5h-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t("admin.pages.shipments.refresh")}
          </button>
        </div>

        {error && <div className="admin-alert admin-alert-error">{error}</div>}
        {loading && <div className="admin-loading">{t("admin.pages.translations.loading")}</div>}

        <div className="admin-card">
          <div className="admin-table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="admin-table">
            <thead>
              <tr>
                <th>{t("admin.pages.shipments.order")}</th>
                <th>{t("admin.pages.shipments.customer")}</th>
                <th>{t("admin.pages.shipments.offer")}</th>
                <th>{t("admin.pages.shipments.status")}</th>
                <th>{t("admin.pages.shipments.tracking")}</th>
                <th>{t("admin.pages.shipments.label")}</th>
                <th>{t("admin.pages.shipments.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((shipment) => (<tr key={shipment.id}>
                  <td>{shipment.order?.orderNumber || '—'}</td>
                  <td>
                    {shipment.order?.customer
                ? `${shipment.order.customer.firstName} ${shipment.order.customer.lastName}`
                : t("admin.pages.shipments.guest")}
                  </td>
                  <td>{shipment.offerLabel || shipment.offerCode || '—'}</td>
                  <td>
                    <div className="admin-muted" style={{ fontSize: '0.85rem' }}>
                      {shipment.statusInternal || '—'}
                    </div>
                    <div className="admin-muted" style={{ fontSize: '0.75rem' }}>
                      {shipment.status || ''}
                    </div>
                  </td>
                  <td>{shipment.trackingNumber || '—'}</td>
                  <td>
                    {shipment.labelUrl ? (<a className="admin-link-inline" href={shipment.labelUrl} target="_blank" rel="noreferrer">{t("admin.pages.shipments.download")}</a>) : ('—')}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="admin-icon-button admin-btn-secondary" title={t("admin.pages.shipments.rafraichir_label")} aria-label={`Rafraîchir l'étiquette pour ${shipment.order?.orderNumber || t("admin.pages.shipments.shipment")}`} onClick={async () => {
                await api.refreshShipmentLabel(shipment.id);
                load();
            }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M9 4h10a1 1 0 0 1 1 1v10l-6 6H5a1 1 0 0 1-1-1V9l5-5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                          <circle cx="14.5" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
                        </svg>
                      </button>
                      <button className="admin-icon-button admin-btn-secondary" title={t("admin.pages.shipments.rafraichir_tracking")} aria-label={`Rafraîchir le suivi pour ${shipment.order?.orderNumber || t("admin.pages.shipments.shipment")}`} onClick={async () => {
                await api.refreshShipmentTracking(shipment.id);
                load();
            }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M3 7h11v8H3V7Zm11 2h3l3 3v3h-6V9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                          <circle cx="7.5" cy="17.5" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
                          <circle cx="17.5" cy="17.5" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>))}
              {shipments.length === 0 && !loading && (<tr>
                  <td colSpan={7} className="admin-muted" style={{ textAlign: 'center' }}>{t("admin.pages.shipments.none_shipment_moment")}</td>
                </tr>)}
            </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>);
}
