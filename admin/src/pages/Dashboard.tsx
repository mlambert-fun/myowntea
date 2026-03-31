import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { api, type AutomationJobConfig, type EmailMetricsResponse } from '../api/client';
import { t } from "../lib/i18n";
interface DashboardIngredient {
    id: string;
    category?: string | null;
    isActive?: boolean | null;
}
interface DashboardOrder {
    id: string;
    orderNumber: string;
    status: string;
    createdAt: string;
    totalAmount?: number | null;
    total?: number | null;
    totalCents?: number | null;
    paymentStatus?: string | null;
    customer?: {
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
    } | null;
    shipment?: {
        id: string;
        labelUrl?: string | null;
        trackingNumber?: string | null;
        statusInternal?: string | null;
    } | null;
}
interface DashboardShipment {
    id: string;
    statusInternal?: string | null;
    trackingNumber?: string | null;
}
interface DashboardCustomer {
    id: string;
}
interface DashboardCart {
    id: string;
    items?: Array<{
        qty?: number | null;
    }>;
}
const ORDER_STATUS_LABELS_FR: Record<string, string> = {
    PENDING: 'En attente',
    CONFIRMED: t("admin.pages.dashboard.confirmed"),
    PROCESSING: t("admin.pages.dashboard.preparation"),
    SHIPPED: t("admin.pages.dashboard.shipped"),
    DELIVERED: t("admin.pages.dashboard.delivered"),
    CANCELLED: t("admin.pages.dashboard.canceled"),
    REFUNDED: t("admin.pages.dashboard.refunded"),
};
const ORDER_STATUS_COLORS: Record<string, string> = {
    PENDING: '#b45309',
    CONFIRMED: '#2563eb',
    PROCESSING: '#7c3aed',
    SHIPPED: '#0891b2',
    DELIVERED: '#15803d',
    CANCELLED: '#b91c1c',
    REFUNDED: '#c2410c',
};
const ORDER_STATUS_PRIORITY = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
const CURRENCY_FORMATTER = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const NUMBER_FORMATTER = new Intl.NumberFormat('fr-FR');
function parseDate(value?: string | null): Date | null {
    if (!value)
        return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return null;
    return date;
}
function formatDateTime(value?: string | null): string {
    const date = parseDate(value);
    if (!date)
        return '-';
    return date.toLocaleString('fr-FR');
}
function resolveOrderAmount(order: DashboardOrder): number {
    if (typeof order.totalAmount === 'number')
        return order.totalAmount;
    if (typeof order.total === 'number')
        return order.total;
    if (typeof order.totalCents === 'number')
        return order.totalCents / 100;
    return 0;
}
function normalizeCode(value: string | null | undefined): string {
    return String(value || '').trim().toUpperCase();
}
export default function Dashboard() {
    const token = localStorage.getItem('adminToken') || '';
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
    const [ingredients, setIngredients] = useState<DashboardIngredient[]>([]);
    const [orders, setOrders] = useState<DashboardOrder[]>([]);
    const [shipments, setShipments] = useState<DashboardShipment[]>([]);
    const [jobs, setJobs] = useState<AutomationJobConfig[]>([]);
    const [emailMetrics, setEmailMetrics] = useState<EmailMetricsResponse | null>(null);
    const [customers, setCustomers] = useState<DashboardCustomer[]>([]);
    const [carts, setCarts] = useState<DashboardCart[]>([]);
    async function loadDashboard() {
        setLoading(true);
        setError(null);
        const settled = await Promise.allSettled([
            api.getIngredients(),
            api.getOrders(token),
            api.getShipments(token),
            api.getAutomationJobs(token),
            api.getEmailMetrics(30, token),
            api.getCustomers(),
            api.getCarts(),
        ]);
        const loadErrors: string[] = [];
        const ingredientsResult = settled[0];
        if (ingredientsResult.status === 'fulfilled' && Array.isArray(ingredientsResult.value)) {
            setIngredients(ingredientsResult.value as DashboardIngredient[]);
        }
        else {
            setIngredients([]);
            if (ingredientsResult.status === 'rejected')
                loadErrors.push(t("admin.pages.dashboard.ingredients"));
        }
        const ordersResult = settled[1];
        if (ordersResult.status === 'fulfilled' && Array.isArray(ordersResult.value)) {
            setOrders(ordersResult.value as DashboardOrder[]);
        }
        else {
            setOrders([]);
            if (ordersResult.status === 'rejected')
                loadErrors.push('commandes');
        }
        const shipmentsResult = settled[2];
        if (shipmentsResult.status === 'fulfilled' && Array.isArray(shipmentsResult.value)) {
            setShipments(shipmentsResult.value as DashboardShipment[]);
        }
        else {
            setShipments([]);
            if (shipmentsResult.status === 'rejected')
                loadErrors.push(t("admin.pages.dashboard.shipments"));
        }
        const jobsResult = settled[3];
        if (jobsResult.status === 'fulfilled' && Array.isArray(jobsResult.value)) {
            setJobs(jobsResult.value);
        }
        else {
            setJobs([]);
            if (jobsResult.status === 'rejected')
                loadErrors.push('jobs automatiques');
        }
        const emailMetricsResult = settled[4];
        if (emailMetricsResult.status === 'fulfilled') {
            setEmailMetrics(emailMetricsResult.value);
        }
        else {
            setEmailMetrics(null);
            loadErrors.push('emails');
        }
        const customersResult = settled[5];
        if (customersResult.status === 'fulfilled' && Array.isArray(customersResult.value)) {
            setCustomers(customersResult.value as DashboardCustomer[]);
        }
        else {
            setCustomers([]);
            if (customersResult.status === 'rejected')
                loadErrors.push('clients');
        }
        const cartsResult = settled[6];
        if (cartsResult.status === 'fulfilled' && Array.isArray(cartsResult.value)) {
            setCarts(cartsResult.value as DashboardCart[]);
        }
        else {
            setCarts([]);
            if (cartsResult.status === 'rejected')
                loadErrors.push('paniers');
        }
        if (loadErrors.length > 0) {
            setError(`Certaines données n'ont pas pu être chargées (${loadErrors.join(', ')}).`);
        }
        setLastUpdatedAt(new Date().toISOString());
        setLoading(false);
    }
    useEffect(() => {
        void loadDashboard();
    }, []);
    const dashboard = useMemo(() => {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const statusCounts = orders.reduce<Record<string, number>>((acc, order) => {
            const status = normalizeCode(order.status);
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});
        const monthOrders = orders.filter((order) => {
            const date = parseDate(order.createdAt);
            return Boolean(date && date >= monthStart);
        });
        const todayOrders = orders.filter((order) => {
            const date = parseDate(order.createdAt);
            return Boolean(date && date >= todayStart);
        });
        const monthRevenue = monthOrders.reduce((sum, order) => sum + resolveOrderAmount(order), 0);
        const todayRevenue = todayOrders.reduce((sum, order) => sum + resolveOrderAmount(order), 0);
        const paidOrders = orders.filter((order) => {
            const status = normalizeCode(order.status);
            const paymentStatus = normalizeCode(order.paymentStatus);
            return (status === 'CONFIRMED' ||
                status === 'PROCESSING' ||
                status === 'SHIPPED' ||
                status === 'DELIVERED' ||
                paymentStatus === 'PAID' ||
                paymentStatus === 'SUCCEEDED' ||
                paymentStatus === 'COMPLETED');
        });
        const averageBasket = paidOrders.length > 0
            ? paidOrders.reduce((sum, order) => sum + resolveOrderAmount(order), 0) / paidOrders.length
            : 0;
        const activeIngredients = ingredients.filter((ingredient) => ingredient.isActive !== false);
        const ingredientsByCategory = activeIngredients.reduce<Record<string, number>>((acc, ingredient) => {
            const category = String(ingredient.category || 'autre').toLowerCase();
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, {});
        const processingWithoutLabel = orders.filter((order) => {
            const status = normalizeCode(order.status);
            return status === 'PROCESSING' && !order.shipment?.labelUrl;
        }).length;
        const shipmentsWithoutTracking = shipments.filter((shipment) => !shipment.trackingNumber).length;
        const jobsInError = jobs.filter((job) => job.enabled && (job.lastStatus === 'ERROR' || Boolean(job.lastError))).length;
        const emailsFailed = emailMetrics?.summary.failed || 0;
        const emailsRetry = emailMetrics?.summary.retry || 0;
        const emailsPending = emailMetrics?.summary.pending || 0;
        const cartItemCount = carts.reduce((sum, cart) => {
            const itemCount = Array.isArray(cart.items)
                ? cart.items.reduce((inner, item) => inner + (typeof item.qty === 'number' ? item.qty : 0), 0)
                : 0;
            return sum + itemCount;
        }, 0);
        const trend = Array.from({ length: 7 }).map((_, index) => {
            const dayDate = new Date(todayStart);
            dayDate.setDate(todayStart.getDate() - (6 - index));
            const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate());
            const dayEnd = new Date(dayStart);
            dayEnd.setDate(dayStart.getDate() + 1);
            const dayOrders = orders.filter((order) => {
                const date = parseDate(order.createdAt);
                return Boolean(date && date >= dayStart && date < dayEnd);
            });
            return {
                key: dayStart.toISOString(),
                label: dayStart
                    .toLocaleDateString('fr-FR', { weekday: 'short' })
                    .replace('.', '')
                    .toUpperCase(),
                orderCount: dayOrders.length,
                revenue: dayOrders.reduce((sum, order) => sum + resolveOrderAmount(order), 0),
            };
        });
        return {
            statusCounts,
            monthRevenue,
            todayRevenue,
            monthOrderCount: monthOrders.length,
            todayOrderCount: todayOrders.length,
            averageBasket,
            activeIngredientsCount: activeIngredients.length,
            ingredientsByCategory,
            ordersToProcess: (statusCounts.PENDING || 0) + (statusCounts.CONFIRMED || 0) + (statusCounts.PROCESSING || 0),
            processingWithoutLabel,
            shipmentsInTransit: statusCounts.SHIPPED || 0,
            shipmentsWithoutTracking,
            jobsInError,
            emailsFailed,
            emailsRetry,
            emailsPending,
            customerCount: customers.length,
            activeCartCount: carts.length,
            cartItemCount,
            trend,
            recentOrders: orders.slice(0, 6),
        };
    }, [carts, customers.length, emailMetrics, ingredients, jobs, orders, shipments]);
    const trendMax = Math.max(1, ...dashboard.trend.map((point) => point.orderCount));
    const chartConfig = useMemo(() => {
        const width = 760;
        const height = 420;
        const marginTop = 20;
        const marginRight = 16;
        const marginBottom = 64;
        const marginLeft = 40;
        const plotWidth = width - marginLeft - marginRight;
        const plotHeight = height - marginTop - marginBottom;
        const barCount = Math.max(dashboard.trend.length, 1);
        const slotWidth = plotWidth / barCount;
        const barWidth = Math.min(46, slotWidth * 0.56);
        const tickCount = 4;
        const yMax = Math.max(1, trendMax);
        const ticks = Array.from({ length: tickCount + 1 }, (_, index) => (index / tickCount) * yMax);
        const bars = dashboard.trend.map((point, index) => {
            const ratio = point.orderCount / yMax;
            const barHeight = Math.max(0, Math.round(ratio * plotHeight));
            const slotX = marginLeft + index * slotWidth;
            const x = slotX + (slotWidth - barWidth) / 2;
            const y = marginTop + plotHeight - barHeight;
            const centerX = slotX + slotWidth / 2;
            return {
                ...point,
                x,
                y,
                barWidth,
                barHeight,
                centerX,
            };
        });
        return {
            width,
            height,
            marginTop,
            marginLeft,
            plotHeight,
            plotWidth,
            yMax,
            ticks,
            bars,
        };
    }, [dashboard.trend, trendMax]);
    return (<Layout>
      <div className="admin-page admin-dashboard">
        <section className="admin-card dashboard-hero">
          <div>
            <h1 className="admin-title">{t("admin.pages.dashboard.dashboard")}</h1>
            <p className="admin-subtitle">{t("admin.pages.dashboard.vue_pilotage_orders")}</p>
            <p className="dashboard-meta">{t("admin.pages.dashboard.last_refresh")}{formatDateTime(lastUpdatedAt)}</p>
          </div>
          <button className="admin-btn admin-btn-secondary" onClick={() => void loadDashboard()} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M20 4v5h-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {loading ? 'Actualisation...' : 'Actualiser'}
          </button>
        </section>

        {error && <div className="admin-alert admin-alert-error">{error}</div>}

        <section className="dashboard-kpi-grid">
          <article className="dashboard-kpi-card">
            <p className="dashboard-kpi-label">{t("admin.pages.dashboard.month")}</p>
            <p className="dashboard-kpi-value">{CURRENCY_FORMATTER.format(dashboard.monthRevenue)}</p>
            <p className="dashboard-kpi-meta">{NUMBER_FORMATTER.format(dashboard.monthOrderCount)} commandes</p>
          </article>
          <article className="dashboard-kpi-card">
            <p className="dashboard-kpi-label">Aujourd'hui</p>
            <p className="dashboard-kpi-value">{NUMBER_FORMATTER.format(dashboard.todayOrderCount)}</p>
            <p className="dashboard-kpi-meta">{CURRENCY_FORMATTER.format(dashboard.todayRevenue)}</p>
          </article>
          <article className="dashboard-kpi-card dashboard-kpi-warning">
            <p className="dashboard-kpi-label">{t("admin.pages.dashboard.to_process")}</p>
            <p className="dashboard-kpi-value">{NUMBER_FORMATTER.format(dashboard.ordersToProcess)}</p>
            <p className="dashboard-kpi-meta">PENDING + CONFIRMED + PROCESSING</p>
          </article>
          <article className="dashboard-kpi-card">
            <p className="dashboard-kpi-label">{t("admin.pages.dashboard.cart_method")}</p>
            <p className="dashboard-kpi-value">{CURRENCY_FORMATTER.format(dashboard.averageBasket)}</p>
            <p className="dashboard-kpi-meta">{t("admin.pages.dashboard.orders_payees")}</p>
          </article>
          <article className="dashboard-kpi-card">
            <p className="dashboard-kpi-label">Clients</p>
            <p className="dashboard-kpi-value">{NUMBER_FORMATTER.format(dashboard.customerCount)}</p>
            <p className="dashboard-kpi-meta">
              {NUMBER_FORMATTER.format(dashboard.activeCartCount)} paniers actifs ({NUMBER_FORMATTER.format(dashboard.cartItemCount)}{' '}
              articles)
            </p>
          </article>
          <article className="dashboard-kpi-card">
            <p className="dashboard-kpi-label">{t("admin.pages.dashboard.ingredients_active")}</p>
            <p className="dashboard-kpi-value">{NUMBER_FORMATTER.format(dashboard.activeIngredientsCount)}</p>
            <p className="dashboard-kpi-meta">
              {Object.entries(dashboard.ingredientsByCategory)
            .slice(0, 3)
            .map(([category, count]) => `${category}: ${count}`)
            .join(' | ') || t("admin.pages.dashboard.none_category")}
            </p>
          </article>
          <article className="dashboard-kpi-card dashboard-kpi-info">
            <p className="dashboard-kpi-label">{t("admin.pages.dashboard.shipments_transit")}</p>
            <p className="dashboard-kpi-value">{NUMBER_FORMATTER.format(dashboard.shipmentsInTransit)}</p>
            <p className="dashboard-kpi-meta">{NUMBER_FORMATTER.format(dashboard.shipmentsWithoutTracking)}{t("admin.pages.dashboard.tracking")}</p>
          </article>
          <article className="dashboard-kpi-card dashboard-kpi-danger">
            <p className="dashboard-kpi-label">{t("admin.pages.dashboard.alerts_operational")}</p>
            <p className="dashboard-kpi-value">
              {NUMBER_FORMATTER.format(dashboard.jobsInError + dashboard.emailsFailed + dashboard.emailsRetry)}
            </p>
            <p className="dashboard-kpi-meta">
              jobs: {dashboard.jobsInError} | email fail/retry: {dashboard.emailsFailed + dashboard.emailsRetry}
            </p>
          </article>
        </section>

        <section className="dashboard-grid">
          <article className="admin-card dashboard-panel dashboard-panel-chart">
            <h2 className="admin-card-title">{t("admin.pages.dashboard.priorites_day")}</h2>
            <ul className="dashboard-priority-list">
              <li className={dashboard.statusCounts.PENDING ? 'is-urgent' : ''}>
                <span>Paiements / confirmations en attente</span>
                <strong>{dashboard.statusCounts.PENDING || 0}</strong>
              </li>
              <li className={dashboard.processingWithoutLabel ? 'is-urgent' : ''}>
                <span>{t("admin.pages.dashboard.preparations_label_boxtal")}</span>
                <strong>{dashboard.processingWithoutLabel}</strong>
              </li>
              <li className={dashboard.shipmentsWithoutTracking ? 'is-urgent' : ''}>
                <span>{t("admin.pages.dashboard.shipments_numero_tracking")}</span>
                <strong>{dashboard.shipmentsWithoutTracking}</strong>
              </li>
              <li className={dashboard.emailsRetry ? 'is-urgent' : ''}>
                <span>{t("admin.pages.dashboard.emails_file_retry")}</span>
                <strong>{dashboard.emailsRetry}</strong>
              </li>
              <li className={dashboard.jobsInError ? 'is-urgent' : ''}>
                <span>Jobs automatiques en erreur</span>
                <strong>{dashboard.jobsInError}</strong>
              </li>
            </ul>
            <div className="dashboard-actions">
              <Link to="/orders" className="admin-btn admin-btn-primary">{t("admin.pages.dashboard.view_orders")}</Link>
              <Link to="/shipments" className="admin-btn admin-btn-secondary">{t("admin.pages.dashboard.view_shipments")}</Link>
              <Link to="/automation-jobs" className="admin-btn admin-btn-secondary">{t("admin.pages.dashboard.view_jobs")}</Link>
              <Link to="/emails" className="admin-btn admin-btn-secondary">{t("admin.pages.dashboard.view_emails")}</Link>
            </div>
          </article>

          <article className="admin-card dashboard-panel">
            <h2 className="admin-card-title">Pipeline commandes</h2>
            <div className="dashboard-status-grid">
              {ORDER_STATUS_PRIORITY.map((statusCode) => (<div key={statusCode} className="dashboard-status-card">
                  <span className="dashboard-status-label">
                    <span className="dashboard-status-dot" style={{ backgroundColor: ORDER_STATUS_COLORS[statusCode] || '#64748b' }}/>
                    {ORDER_STATUS_LABELS_FR[statusCode] || statusCode}
                  </span>
                  <strong>{NUMBER_FORMATTER.format(dashboard.statusCounts[statusCode] || 0)}</strong>
                </div>))}
            </div>
          </article>
        </section>

        <section className="dashboard-grid dashboard-grid-large">
          <article className="admin-card dashboard-panel">
            <h2 className="admin-card-title">{t("admin.pages.dashboard.activite_latest_jours")}</h2>
            <div className="dashboard-chart-wrap">
              <svg className="dashboard-chart" viewBox={`0 0 ${chartConfig.width} ${chartConfig.height}`} role="img" aria-label={t("admin.pages.dashboard.graphique_barres_orders")}>
                <defs>
                  <linearGradient id="dashboardTrendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C9A962"/>
                    <stop offset="100%" stopColor="#B28D42"/>
                  </linearGradient>
                </defs>
                {chartConfig.ticks.map((tickValue) => {
            const y = chartConfig.marginTop + chartConfig.plotHeight - (tickValue / chartConfig.yMax) * chartConfig.plotHeight;
            return (<g key={tickValue}>
                      <line x1={chartConfig.marginLeft} y1={y} x2={chartConfig.marginLeft + chartConfig.plotWidth} y2={y} stroke="rgba(65, 76, 22, 0.14)" strokeWidth="1"/>
                      <text x={chartConfig.marginLeft - 8} y={y + 4} textAnchor="end" className="dashboard-chart-ylabel">
                        {Number.isInteger(tickValue) ? tickValue : tickValue.toFixed(1)}
                      </text>
                    </g>);
        })}
                {chartConfig.bars.map((bar) => (<g key={bar.key}>
                    <rect x={bar.x} y={bar.y} width={bar.barWidth} height={bar.barHeight} rx="7" fill="url(#dashboardTrendGradient)">
                      <title>{`${bar.label}: ${bar.orderCount} commandes - ${CURRENCY_FORMATTER.format(bar.revenue)}`}</title>
                    </rect>
                    <text x={bar.centerX} y={bar.y - 6} textAnchor="middle" className="dashboard-chart-value">
                      {bar.orderCount}
                    </text>
                    <text x={bar.centerX} y={chartConfig.marginTop + chartConfig.plotHeight + 22} textAnchor="middle" className="dashboard-chart-xlabel">
                      {bar.label}
                    </text>
                  </g>))}
              </svg>
            </div>
          </article>

          <article className="admin-card dashboard-panel">
            <h2 className="admin-card-title">{t("admin.pages.dashboard.latest_orders")}</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table dashboard-orders-table">
                <thead>
                  <tr>
                    <th>{t("admin.pages.dashboard.order")}</th>
                    <th>Client</th>
                    <th>Montant</th>
                    <th>Statut</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.recentOrders.map((order) => {
            const customerName = [order.customer?.firstName, order.customer?.lastName]
                .filter(Boolean)
                .join(' ');
            const status = normalizeCode(order.status);
            const label = ORDER_STATUS_LABELS_FR[status] || order.status;
            return (<tr key={order.id}>
                        <td>
                          <Link className="admin-link-inline" to={`/orders/${order.id}`}>
                            {order.orderNumber}
                          </Link>
                        </td>
                        <td>{customerName || order.customer?.email || t("admin.pages.dashboard.guest")}</td>
                        <td>{CURRENCY_FORMATTER.format(resolveOrderAmount(order))}</td>
                        <td>
                          <span className="admin-badge" style={{ backgroundColor: ORDER_STATUS_COLORS[status] || '#64748b', color: '#fff' }}>
                            {label}
                          </span>
                        </td>
                        <td>{formatDateTime(order.createdAt)}</td>
                      </tr>);
        })}
                  {dashboard.recentOrders.length === 0 && (<tr>
                      <td colSpan={5} className="admin-muted" style={{ textAlign: 'center' }}>{t("admin.pages.dashboard.none_order_moment")}</td>
                    </tr>)}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section className="admin-card dashboard-panel">
          <h2 className="admin-card-title">{t("admin.pages.dashboard.sante_automatisations")}</h2>
          <div className="dashboard-health-grid">
            <div className="dashboard-health-item">
              <p className="dashboard-health-label">Jobs en erreur</p>
              <p className="dashboard-health-value">{dashboard.jobsInError}</p>
            </div>
            <div className="dashboard-health-item">
              <p className="dashboard-health-label">{t("admin.pages.dashboard.emails_failure")}</p>
              <p className="dashboard-health-value">{dashboard.emailsFailed}</p>
            </div>
            <div className="dashboard-health-item">
              <p className="dashboard-health-label">Emails en retry</p>
              <p className="dashboard-health-value">{dashboard.emailsRetry}</p>
            </div>
            <div className="dashboard-health-item">
              <p className="dashboard-health-label">Emails en attente</p>
              <p className="dashboard-health-value">{dashboard.emailsPending}</p>
            </div>
          </div>
        </section>
      </div>
    </Layout>);
}

