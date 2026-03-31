import { Link } from 'react-router-dom';
import type { AccountOrderSummary } from '@/api/client';
import { t } from "@/lib/i18n";
const formatDate = (value: string) => new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const formatMoney = (cents: number) => `${(cents / 100).toFixed(2)} €`;
const ORDER_STATUS_LABELS: Record<string, string> = {
    PENDING: t("app.components.account.orders_table.pending"),
    CONFIRMED: t("app.components.account.orders_table.confirmed"),
    PROCESSING: t("app.components.account.orders_table.preparation"),
    SHIPPED: t("app.components.account.orders_table.shipped"),
    DELIVERED: t("app.components.account.orders_table.delivered"),
    CANCELLED: t("app.components.account.orders_table.canceled"),
    REFUNDED: t("app.components.account.orders_table.refunded"),
};
interface OrdersTableProps {
    orders: AccountOrderSummary[];
    emptyLabel?: string;
    actionLabel?: string;
}
export function OrdersTable({ orders, emptyLabel, actionLabel = t("app.components.account.orders_table.view") }: OrdersTableProps) {
    if (!orders.length) {
        return <p className="text-sm text-[var(--sage-deep)]/60">{emptyLabel || t("app.components.account.orders_table.none_order_moment")}</p>;
    }
    return (<div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--sage-deep)]/60">
            <th className="py-2">{t("app.components.account.orders_table.date")}</th>
            <th className="py-2">{t("app.components.account.orders_table.status")}</th>
            <th className="py-2">{t("app.components.account.orders_table.total")}</th>
            <th className="py-2 text-right">{t("app.components.account.orders_table.action")}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (<tr key={order.id} className="border-t border-[#EEE6D8]">
              <td className="py-3 text-[var(--sage-deep)]">{formatDate(order.createdAt)}</td>
              <td className="py-3 text-[var(--sage-deep)]/80">{ORDER_STATUS_LABELS[order.status] || order.status}</td>
              <td className="py-3 text-[var(--sage-deep)]">{formatMoney(order.totalCents)}</td>
              <td className="py-3 text-right">
                <Link to={`/account/order/${order.id}`} className="text-[var(--gold-antique)] hover:underline">
                  {actionLabel}
                </Link>
              </td>
            </tr>))}
        </tbody>
      </table>
    </div>);
}
