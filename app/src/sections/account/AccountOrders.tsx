import { useEffect, useState } from 'react';
import { OrdersTable } from '@/components/account/OrdersTable';
import { api, type AccountOrderSummary } from '@/api/client';
import { DataLoadingState } from '@/components/ui/loading-state';
import { t } from "@/lib/i18n";
export default function AccountOrders() {
    const [orders, setOrders] = useState<AccountOrderSummary[]>([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            try {
                setIsLoading(true);
                const response = await api.getAccountOrders(page, pageSize);
                if (!isMounted)
                    return;
                setOrders(response.orders || []);
                setTotalPages(response.totalPages || 1);
            }
            finally {
                if (isMounted)
                    setIsLoading(false);
            }
        };
        load();
        return () => {
            isMounted = false;
        };
    }, [page, pageSize]);
    return (<div className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow space-y-6">
      <div>
        <h2 className="font-display text-2xl text-[var(--sage-deep)]">{t("app.sections.account.account_orders.my_orders")}</h2>
        <p className="text-sm text-[var(--sage-deep)]/60">{t("app.sections.account.account_orders.retrouvez_history_complet")}</p>
      </div>

      {isLoading ? (<DataLoadingState size="sm" className="py-4" titleClassName="text-sm text-[var(--sage-deep)]/60"/>) : (<OrdersTable orders={orders} emptyLabel={t("app.sections.account.account_orders.none_order_trouvee")} actionLabel={t("app.sections.account.account_orders.view_order")}/>)}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
          <span>{t("app.sections.account.account_orders.resultats_page")}</span>
          <select className="input-elegant" value={pageSize} onChange={(event) => {
            setPage(1);
            setPageSize(Number(event.target.value));
        }}>
            {[5, 10, 20].map((size) => (<option key={size} value={size}>
                {size}
              </option>))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>{t("app.sections.account.account_orders.prev")}</button>
          <span className="text-sm text-[var(--sage-deep)]/70">
            Page {page} / {totalPages}
          </span>
          <button type="button" className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
            Suivant
          </button>
        </div>
      </div>
    </div>);
}

