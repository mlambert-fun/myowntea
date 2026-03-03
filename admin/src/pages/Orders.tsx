import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { showToast } from '../lib/toast';

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  availableTransitions?: string[];
  totalAmount?: number;
  total?: number;
  totalCents?: number;
  paymentStatus?: string | null;
  createdAt: string;
  customer?: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const token = localStorage.getItem('adminToken') || '';

  useEffect(() => {
    void loadOrders();
  }, []);

  async function loadOrders() {
    try {
      const data = await api.getOrders(token);
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load orders', error);
    }
  }

  async function updateStatus(orderId: string, newStatus: string) {
    try {
      setUpdatingId(orderId);
      await api.updateOrderStatus(orderId, newStatus, token);
      showToast('Statut commande mis a jour', 'success');
      await loadOrders();
    } catch (error) {
      console.error('Failed to update order status', error);
      showToast(error instanceof Error ? error.message : 'Mise a jour du statut impossible', 'error');
    } finally {
      setUpdatingId(null);
    }
  }

  const statusColors: Record<string, string> = {
    PENDING: '#fbbf24',
    CONFIRMED: '#3b82f6',
    PROCESSING: '#8b5cf6',
    SHIPPED: '#10b981',
    DELIVERED: '#22c55e',
    CANCELLED: '#ef4444',
    REFUNDED: '#f97316',
  };

  const statusLabels: Record<string, string> = {
    PENDING: 'En attente',
    CONFIRMED: 'Confirmée',
    PROCESSING: 'En préparation',
    SHIPPED: 'Expédiée',
    DELIVERED: 'Livrée',
    CANCELLED: 'Annulée',
    REFUNDED: 'Remboursée',
  };

  return (
    <Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">Commandes</h1>
            <p className="admin-subtitle">Suivi et gestion des commandes clients</p>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="admin-table">
            <thead>
              <tr>
                <th>No Commande</th>
                <th>Client</th>
                <th>Montant</th>
                <th>Paiement</th>
                <th>Statut</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const amount =
                  typeof order.totalAmount === 'number'
                    ? order.totalAmount
                    : typeof order.total === 'number'
                      ? order.total
                      : typeof order.totalCents === 'number'
                        ? order.totalCents / 100
                        : 0;

                const availableStatusOptions = Array.from(
                  new Set([
                    order.status,
                    ...(Array.isArray(order.availableTransitions) ? order.availableTransitions : []),
                  ])
                );

                return (
                  <tr key={order.id}>
                    <td style={{ fontWeight: 600 }}>
                      <Link className="admin-link-inline" to={`/orders/${order.id}`}>
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td>
                      {order.customer ? (
                        <>
                          {[order.customer.firstName, order.customer.lastName].filter(Boolean).join(' ') || 'Invité'}
                          <br />
                          <span className="admin-muted" style={{ fontSize: '0.85rem' }}>
                            {order.customer.email || '-'}
                          </span>
                        </>
                      ) : (
                        'Invité'
                      )}
                    </td>
                    <td>{amount.toFixed(2)} EUR</td>
                    <td>{order.paymentStatus || '-'}</td>
                    <td>
                      <span className="admin-badge" style={{ background: statusColors[order.status] || '#666' }}>
                        {order.status}
                      </span>
                    </td>
                    <td>{new Date(order.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td>
                      <select
                        className="admin-input"
                        value={order.status}
                        disabled={updatingId === order.id}
                        onChange={(e) => void updateStatus(order.id, e.target.value)}
                        style={{ width: 'auto' }}
                      >
                        {availableStatusOptions.map((status) => (
                          <option key={status} value={status}>
                            {statusLabels[status] || status}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
