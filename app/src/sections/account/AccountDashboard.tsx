import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';
import { AccountCard } from '@/components/account/AccountCard';
import { OrdersTable } from '@/components/account/OrdersTable';
import { api, type AccountOrderSummary, type AccountAddress } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { DataLoadingState } from '@/components/ui/loading-state';
import { t } from "@/lib/i18n";
const formatSalutation = (value?: string | null) => {
    if (value === 'MME')
        return 'Mme';
    if (value === 'MR')
        return 'M.';
    return '—';
};
const formatAddress = (address?: AccountAddress | null) => {
    if (!address)
        return t("app.sections.account.account_dashboard.none_address_enregistree");
    return `${address.address1}${address.address2 ? `, ${address.address2}` : ''}, ${address.postalCode} ${address.city}`;
};
export default function AccountDashboard() {
    const { customer } = useAuth();
    const { settings } = useStoreSettings();
    const [orders, setOrders] = useState<AccountOrderSummary[]>([]);
    const [addresses, setAddresses] = useState<AccountAddress[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            try {
                setIsLoading(true);
                const [ordersResponse, addressResponse] = await Promise.all([
                    api.getAccountOrders(1, 5),
                    api.getAccountAddresses(),
                ]);
                if (!isMounted)
                    return;
                setOrders(ordersResponse.orders || []);
                setAddresses(addressResponse.addresses || []);
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
    }, []);
    const defaultBilling = addresses.find((item) => item.isDefaultBilling) || null;
    const defaultShipping = addresses.find((item) => item.isDefaultShipping) || null;
    const shouldPromptCreateAddress = !isLoading && !defaultBilling && !defaultShipping;
    return (<div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <AccountCard title={t("app.sections.account.account_dashboard.my_orders")} description={t("app.sections.account.account_dashboard.latest_orders_passees")}>
          {isLoading ? (<DataLoadingState size="sm" className="py-2" titleClassName="text-sm text-[var(--sage-deep)]/60"/>) : (<OrdersTable orders={orders} emptyLabel={t("app.sections.account.account_dashboard.none_order_recente")}/>)}
          {!isLoading && orders.length > 0 ? (<div className="mt-4">
              <Link className="text-sm text-[var(--gold-antique)] hover:underline" to="/account/orders">{t("app.sections.account.account_dashboard.view_all_my")}</Link>
            </div>) : null}
        </AccountCard>

        <AccountCard title={t("app.sections.account.account_dashboard.my_informations_personnelles")} description={t("app.sections.account.account_dashboard.informations_associees_account")}>
          <div className="space-y-2 text-sm text-[var(--sage-deep)]">
            <div>{t("app.sections.account.account_dashboard.title")} {formatSalutation(customer?.salutation)}</div>
            <div>{t("app.sections.account.account_dashboard.last_name")} {customer?.lastName || '—'}</div>
            <div>{t("app.sections.account.account_dashboard.first_name")} {customer?.firstName || '—'}</div>
            <div>{t("app.sections.account.account_dashboard.email")} {customer?.email || '—'}</div>
          </div>
          <div className="mt-4">
            <Link className="text-sm text-[var(--gold-antique)] hover:underline" to="/account/edit">{t("app.sections.account.account_dashboard.edit")}</Link>
          </div>
        </AccountCard>

        <AccountCard title={t("app.sections.account.account_dashboard.my_carnet_addresses")} description={t("app.sections.account.account_dashboard.addresses_shipping_billing")}>
          <div className="space-y-4 text-sm text-[var(--sage-deep)]">
            <div>
              <p className="font-medium">{t("app.sections.account.account_dashboard.address_billing")}</p>
              <p className="text-[var(--sage-deep)]/70">{formatAddress(defaultBilling)}</p>
            </div>
            <div>
              <p className="font-medium">{t("app.sections.account.account_dashboard.address_shipping")}</p>
              <p className="text-[var(--sage-deep)]/70">{formatAddress(defaultShipping)}</p>
            </div>
          </div>
          <div className="mt-4">
            <Link className="text-sm text-[var(--gold-antique)] hover:underline" to={shouldPromptCreateAddress ? '/account/address?create=1' : '/account/address'}>
              {shouldPromptCreateAddress ? t("app.sections.account.account_dashboard.add_new_address") : t("app.sections.account.account_dashboard.edit")}
            </Link>
          </div>
        </AccountCard>

        <AccountCard title="Service client" description={t("app.sections.account.account_dashboard.nous_sommes_vous")}>
          <div className="space-y-2 text-sm text-[var(--sage-deep)]">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-[var(--gold-antique)]"/>
              <span>{settings.shopPhone}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-[var(--gold-antique)]"/>
              <span>{settings.contactEmail}</span>
            </div>
            <div className="text-[var(--sage-deep)]/60">{t("app.sections.account.account_dashboard.service_hours")}</div>
          </div>
          <div className="mt-4">
            <Link
              to="/contact"
              className="inline-flex items-center justify-center rounded-full border border-[#E8DDCB] px-4 py-2 text-xs font-medium text-[var(--sage-deep)]/75 transition-colors hover:border-[var(--gold-antique)] hover:text-[var(--gold-antique)]"
              style={{ width: '260px' }}
            >
              {t("app.sections.account.account_dashboard.contact_cta")}
            </Link>
          </div>
        </AccountCard>
      </div>
    </div>);
}
