import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type AccountAddress } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { AddressForm, type AddressFormValues } from '@/components/account/AddressForm';
import { DataLoadingState } from '@/components/ui/loading-state';

const formatAddress = (address?: AccountAddress | null) => {
  if (!address) return 'Aucune adresse enregistrée.';
  return `${address.address1}${address.address2 ? `, ${address.address2}` : ''}, ${address.postalCode} ${address.city}`;
};

export default function AccountAddressBook() {
  const { customer } = useAuth();
  const [searchParams] = useSearchParams();
  const [addresses, setAddresses] = useState<AccountAddress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingAddress, setEditingAddress] = useState<AccountAddress | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const response = await api.getAccountAddresses();
      setAddresses(response.addresses || []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const shouldOpenCreateForm = searchParams.get('create') === '1';
    if (shouldOpenCreateForm) {
      setEditingAddress(null);
      setIsCreating(true);
    }
  }, [searchParams]);

  const defaultBilling = addresses.find((item) => item.isDefaultBilling) || null;
  const defaultShipping = addresses.find((item) => item.isDefaultShipping) || null;
  const additionalAddresses = addresses.filter((item) => !item.isDefaultBilling && !item.isDefaultShipping);

  const handleCreate = async (values: AddressFormValues) => {
    await api.createAccountAddress(values);
    setIsCreating(false);
    await load();
  };

  const handleUpdate = async (values: AddressFormValues) => {
    if (!editingAddress) return;
    await api.updateAccountAddress(editingAddress.id, values);
    setEditingAddress(null);
    await load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteAccountAddress(id);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow space-y-4">
        <div>
          <h2 className="font-display text-2xl text-[var(--sage-deep)]">Mes adresses</h2>
          <p className="text-sm text-[var(--sage-deep)]/60">Gérez vos adresses par défaut.</p>
        </div>
        {isLoading ? (
          <DataLoadingState size="sm" className="py-4" titleClassName="text-sm text-[var(--sage-deep)]/60" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[#EEE6D8] p-4">
              <p className="text-sm font-medium text-[var(--sage-deep)]">Facturation</p>
              <p className="text-sm text-[var(--sage-deep)]/70 mt-2">{formatAddress(defaultBilling)}</p>
              {defaultBilling && (
                <button
                  type="button"
                  className="text-sm text-[var(--gold-antique)] hover:underline mt-2"
                  onClick={() => setEditingAddress(defaultBilling)}
                >
                  Modifier
                </button>
              )}
            </div>
            <div className="rounded-xl border border-[#EEE6D8] p-4">
              <p className="text-sm font-medium text-[var(--sage-deep)]">Livraison</p>
              <p className="text-sm text-[var(--sage-deep)]/70 mt-2">{formatAddress(defaultShipping)}</p>
              {defaultShipping && (
                <button
                  type="button"
                  className="text-sm text-[var(--gold-antique)] hover:underline mt-2"
                  onClick={() => setEditingAddress(defaultShipping)}
                >
                  Modifier
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-xl text-[var(--sage-deep)]">Mes adresses supplémentaires</h3>
            <p className="text-sm text-[var(--sage-deep)]/60">Ajoutez ou modifiez des adresses complémentaires.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => setIsCreating(true)}>
            Ajouter une nouvelle adresse
          </button>
        </div>

        {additionalAddresses.length === 0 && !isLoading && (
          <p className="text-sm text-[var(--sage-deep)]/60">Aucune adresse supplémentaire.</p>
        )}

        <div className="space-y-3">
          {additionalAddresses.map((address) => (
            <div key={address.id} className="rounded-xl border border-[#EEE6D8] p-4 text-sm text-[var(--sage-deep)]">
              <p className="font-medium">{address.firstName} {address.lastName}</p>
              <p className="text-[var(--sage-deep)]/70">{formatAddress(address)}</p>
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  className="text-[var(--gold-antique)] hover:underline"
                  onClick={() => setEditingAddress(address)}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  className="text-red-600 hover:underline"
                  onClick={() => handleDelete(address.id)}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>

        {isCreating && (
          <div className="mt-6 rounded-xl border border-[#EEE6D8] bg-[#FAF8F3] p-4">
            <AddressForm
              defaultValues={{
                salutation: customer?.salutation || undefined,
                firstName: customer?.firstName || '',
                lastName: customer?.lastName || '',
                phoneE164: customer?.phoneE164 || '',
              }}
              onSubmit={handleCreate}
              onCancel={() => setIsCreating(false)}
              submitLabel="Ajouter"
            />
          </div>
        )}

        {editingAddress && (
          <div className="mt-6 rounded-xl border border-[#EEE6D8] bg-[#FAF8F3] p-4">
            <AddressForm
              defaultValues={editingAddress}
              onSubmit={handleUpdate}
              onCancel={() => setEditingAddress(null)}
              submitLabel="Mettre à jour"
            />
          </div>
        )}
      </div>
    </div>
  );
}
