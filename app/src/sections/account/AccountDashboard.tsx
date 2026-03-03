import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';
import { AccountCard } from '@/components/account/AccountCard';
import { OrdersTable } from '@/components/account/OrdersTable';
import { api, type AccountOrderSummary, type AccountAddress } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { DataLoadingState } from '@/components/ui/loading-state';

const formatSalutation = (value?: string | null) => {
  if (value === 'MME') return 'Mme';
  if (value === 'MR') return 'M.';
  return '—';
};

const formatAddress = (address?: AccountAddress | null) => {
  if (!address) return 'Aucune adresse enregistrée.';
  return `${address.address1}${address.address2 ? `, ${address.address2}` : ''}, ${address.postalCode} ${address.city}`;
};

export default function AccountDashboard() {
  const { customer } = useAuth();
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
        if (!isMounted) return;
        setOrders(ordersResponse.orders || []);
        setAddresses(addressResponse.addresses || []);
      } finally {
        if (isMounted) setIsLoading(false);
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

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <AccountCard
          title="Mes commandes"
          description="Dernières commandes passées sur My Own Tea."
        >
          {isLoading ? (
            <DataLoadingState size="sm" className="py-2" titleClassName="text-sm text-[var(--sage-deep)]/60" />
          ) : (
            <OrdersTable orders={orders} emptyLabel="Aucune commande récente." />
          )}
          {!isLoading && orders.length > 0 ? (
            <div className="mt-4">
              <Link className="text-sm text-[var(--gold-antique)] hover:underline" to="/account/orders">
                Voir toutes mes commandes
              </Link>
            </div>
          ) : null}
        </AccountCard>

        <AccountCard
          title="Mes informations personnelles"
          description="Informations associées à votre compte."
        >
          <div className="space-y-2 text-sm text-[var(--sage-deep)]">
            <div>Civilité : {formatSalutation(customer?.salutation)}</div>
            <div>Nom : {customer?.lastName || '—'}</div>
            <div>Prénom : {customer?.firstName || '—'}</div>
            <div>Email : {customer?.email || '—'}</div>
          </div>
          <div className="mt-4">
            <Link className="text-sm text-[var(--gold-antique)] hover:underline" to="/account/edit">
              Modifier
            </Link>
          </div>
        </AccountCard>

        <AccountCard
          title="Mon carnet d'adresses"
          description="Vos adresses de livraison et de facturation par défaut."
        >
          <div className="space-y-4 text-sm text-[var(--sage-deep)]">
            <div>
              <p className="font-medium">Adresse de facturation</p>
              <p className="text-[var(--sage-deep)]/70">{formatAddress(defaultBilling)}</p>
            </div>
            <div>
              <p className="font-medium">Adresse de livraison</p>
              <p className="text-[var(--sage-deep)]/70">{formatAddress(defaultShipping)}</p>
            </div>
          </div>
          <div className="mt-4">
            <Link
              className="text-sm text-[var(--gold-antique)] hover:underline"
              to={shouldPromptCreateAddress ? '/account/address?create=1' : '/account/address'}
            >
              {shouldPromptCreateAddress ? 'Ajouter une nouvelle adresse' : 'Modifier'}
            </Link>
          </div>
        </AccountCard>

        <AccountCard title="Service client" description="Nous sommes là pour vous aider.">
          <div className="space-y-2 text-sm text-[var(--sage-deep)]">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-[var(--gold-antique)]" />
              <span>01 02 03 04 05</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-[var(--gold-antique)]" />
              <span>contact@myowntea.com</span>
            </div>
            <div className="text-[var(--sage-deep)]/60">Lun - Ven, 9h00 - 18h00</div>
          </div>
        </AccountCard>
      </div>
    </div>
  );
}
