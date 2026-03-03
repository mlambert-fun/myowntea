import { Link } from 'react-router-dom';
import type { AccountOrderSummary } from '@/api/client';

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

const formatMoney = (cents: number) => `${(cents / 100).toFixed(2)} €`;

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  PROCESSING: 'En préparation',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  REFUNDED: 'Remboursée',
};

interface OrdersTableProps {
  orders: AccountOrderSummary[];
  emptyLabel?: string;
  actionLabel?: string;
}

export function OrdersTable({ orders, emptyLabel, actionLabel = 'Voir' }: OrdersTableProps) {
  if (!orders.length) {
    return <p className="text-sm text-[var(--sage-deep)]/60">{emptyLabel || 'Aucune commande pour le moment.'}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--sage-deep)]/60">
            <th className="py-2">Date</th>
            <th className="py-2">État</th>
            <th className="py-2">Total</th>
            <th className="py-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-t border-[#EEE6D8]">
              <td className="py-3 text-[var(--sage-deep)]">{formatDate(order.createdAt)}</td>
              <td className="py-3 text-[var(--sage-deep)]/80">{ORDER_STATUS_LABELS[order.status] || order.status}</td>
              <td className="py-3 text-[var(--sage-deep)]">{formatMoney(order.totalCents)}</td>
              <td className="py-3 text-right">
                <Link to={`/account/order/${order.id}`} className="text-[var(--gold-antique)] hover:underline">
                  {actionLabel}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
