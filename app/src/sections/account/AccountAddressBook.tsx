import { Plus, SquarePen, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type AccountAddress } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { AddressForm, type AddressFormValues } from '@/components/account/AddressForm';
import { DataLoadingState } from '@/components/ui/loading-state';
import { t } from "@/lib/i18n";
const formatAddress = (address?: AccountAddress | null) => {
    if (!address)
        return t("app.sections.account.account_address_book.none_address_enregistree");
    return `${address.address1}${address.address2 ? `, ${address.address2}` : ''}, ${address.postalCode} ${address.city}`;
};
export default function AccountAddressBook() {
    const { customer } = useAuth();
    const [searchParams] = useSearchParams();
    const [addresses, setAddresses] = useState<AccountAddress[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [activeFormSection, setActiveFormSection] = useState<'defaults' | 'additional' | null>(null);
    const [activeDefaultRole, setActiveDefaultRole] = useState<'billing' | 'shipping' | null>(null);
    const [createDefaultValues, setCreateDefaultValues] = useState<Partial<AccountAddress>>({});
    const [editingAddress, setEditingAddress] = useState<AccountAddress | null>(null);
    const load = async () => {
        setIsLoading(true);
        try {
            const response = await api.getAccountAddresses();
            setAddresses(response.addresses || []);
        }
        finally {
            setIsLoading(false);
        }
    };
    useEffect(() => {
        void load();
    }, []);
    const defaultBilling = addresses.find((item) => item.isDefaultBilling) || null;
    const defaultShipping = addresses.find((item) => item.isDefaultShipping) || null;
    const additionalAddresses = addresses.filter((item) => !item.isDefaultBilling && !item.isDefaultShipping);
    const hasSharedDefaultAddress = Boolean(defaultBilling && defaultShipping && defaultBilling.id === defaultShipping.id);
    const baseCreateDefaultValues: Partial<AccountAddress> = {
        salutation: customer?.salutation || undefined,
        firstName: customer?.firstName || '',
        lastName: customer?.lastName || '',
        phoneE164: customer?.phoneE164 || '',
    };
    const closeActiveForm = () => {
        setIsCreating(false);
        setEditingAddress(null);
        setActiveFormSection(null);
        setActiveDefaultRole(null);
    };
    const openCreateForm = (overrides: Partial<AccountAddress> = {}, section: 'defaults' | 'additional' = 'additional', defaultRole: 'billing' | 'shipping' | null = null) => {
        setEditingAddress(null);
        setCreateDefaultValues({
            ...baseCreateDefaultValues,
            ...overrides,
        });
        setIsCreating(true);
        setActiveFormSection(section);
        setActiveDefaultRole(defaultRole);
    };
    const openEditForm = (address: AccountAddress, section: 'defaults' | 'additional', defaultRole: 'billing' | 'shipping' | null = null) => {
        setIsCreating(false);
        setEditingAddress(address);
        setActiveFormSection(section);
        setActiveDefaultRole(defaultRole);
    };
    useEffect(() => {
        const shouldOpenCreateForm = searchParams.get('create') === '1';
        if (shouldOpenCreateForm) {
            openCreateForm({}, 'additional');
        }
    }, [searchParams]);
    const handleCreate = async (values: AddressFormValues) => {
        await api.createAccountAddress(values);
        closeActiveForm();
        await load();
    };
    const handleUpdate = async (values: AddressFormValues) => {
        if (!editingAddress)
            return;
        await api.updateAccountAddress(editingAddress.id, values);
        closeActiveForm();
        await load();
    };
    const handleDelete = async (id: string) => {
        if (editingAddress?.id === id) {
            closeActiveForm();
        }
        await api.deleteAccountAddress(id);
        await load();
    };
    const handleDeleteDefaultBilling = async () => {
        if (!defaultBilling) {
            return;
        }
        if (hasSharedDefaultAddress) {
            if (editingAddress?.id === defaultBilling.id) {
                closeActiveForm();
            }
            await api.updateAccountAddress(defaultBilling.id, { isDefaultBilling: false });
            await load();
            return;
        }
        await handleDelete(defaultBilling.id);
    };
    const handleDeleteDefaultShipping = async () => {
        if (!defaultShipping) {
            return;
        }
        if (hasSharedDefaultAddress) {
            if (editingAddress?.id === defaultShipping.id) {
                closeActiveForm();
            }
            await api.updateAccountAddress(defaultShipping.id, { isDefaultShipping: false });
            await load();
            return;
        }
        await handleDelete(defaultShipping.id);
    };
    const showDefaultsForm = activeFormSection === 'defaults' && (isCreating || Boolean(editingAddress));
    const showAdditionalForm = activeFormSection === 'additional' && (isCreating || Boolean(editingAddress));
    const defaultsSubmitLabel = isCreating
        ? activeDefaultRole === 'billing'
            ? t("app.sections.account.account_address_book.add_billing_address")
            : activeDefaultRole === 'shipping'
                ? t("app.sections.account.account_address_book.add_shipping_address")
                : t("app.sections.account.account_address_book.add")
        : activeDefaultRole === 'billing'
            ? t("app.sections.account.account_address_book.edit_billing_address")
            : activeDefaultRole === 'shipping'
                ? t("app.sections.account.account_address_book.edit_shipping_address")
                : t("app.sections.account.account_address_book.mettre_day");
    return (<div className="space-y-6">
      <div className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow space-y-4">
        <div>
          <h2 className="font-display text-2xl text-[var(--sage-deep)]">{t("app.sections.account.account_address_book.my_addresses")}</h2>
          <p className="text-sm text-[var(--sage-deep)]/60">{t("app.sections.account.account_address_book.manage_addresses_default")}</p>
        </div>
        {isLoading ? (<DataLoadingState size="sm" className="py-4" titleClassName="text-sm text-[var(--sage-deep)]/60"/>) : (<div className="grid gap-4 sm:grid-cols-2">
            <div className="relative rounded-xl border border-[#EEE6D8] p-4 pr-20">
              <div className="absolute right-4 top-4 flex items-center gap-2">
                {defaultBilling ? (<>
                    <button type="button" className="grid h-8 w-8 place-items-center rounded-full border border-[#E5E0D5] bg-[var(--white-warm)] text-[var(--gold-antique)] transition hover:border-[var(--gold-antique)] hover:bg-[#F7F1E5]" onClick={() => openEditForm(defaultBilling, 'defaults', 'billing')} aria-label={t("app.sections.account.account_address_book.edit")} title={t("app.sections.account.account_address_book.edit")}>
                      <SquarePen className="h-3.5 w-3.5"/>
                    </button>
                    <button type="button" className="grid h-8 w-8 place-items-center rounded-full border border-[#F0D7D2] bg-[var(--white-warm)] text-red-600 transition hover:border-red-300 hover:bg-[#FFF1EE]" onClick={handleDeleteDefaultBilling} aria-label={t("app.sections.account.account_address_book.delete")} title={t("app.sections.account.account_address_book.delete")}>
                      <Trash2 className="h-3.5 w-3.5"/>
                    </button>
                  </>) : (<button type="button" className="grid h-8 w-8 place-items-center rounded-full border border-[#E5E0D5] bg-[var(--white-warm)] text-[var(--gold-antique)] transition hover:border-[var(--gold-antique)] hover:bg-[#F7F1E5]" onClick={() => openCreateForm({ isDefaultBilling: true }, 'defaults', 'billing')} aria-label={t("app.sections.account.account_address_book.add_new_address")} title={t("app.sections.account.account_address_book.add_new_address")}>
                    <Plus className="h-4 w-4"/>
                  </button>)}
              </div>
              <p className="text-sm font-medium text-[var(--sage-deep)]">Facturation</p>
              <p className="text-sm text-[var(--sage-deep)]/70 mt-2">{formatAddress(defaultBilling)}</p>
            </div>
            <div className="relative rounded-xl border border-[#EEE6D8] p-4 pr-20">
              <div className="absolute right-4 top-4 flex items-center gap-2">
                {defaultShipping ? (<>
                    <button type="button" className="grid h-8 w-8 place-items-center rounded-full border border-[#E5E0D5] bg-[var(--white-warm)] text-[var(--gold-antique)] transition hover:border-[var(--gold-antique)] hover:bg-[#F7F1E5]" onClick={() => openEditForm(defaultShipping, 'defaults', 'shipping')} aria-label={t("app.sections.account.account_address_book.edit")} title={t("app.sections.account.account_address_book.edit")}>
                      <SquarePen className="h-3.5 w-3.5"/>
                    </button>
                    <button type="button" className="grid h-8 w-8 place-items-center rounded-full border border-[#F0D7D2] bg-[var(--white-warm)] text-red-600 transition hover:border-red-300 hover:bg-[#FFF1EE]" onClick={handleDeleteDefaultShipping} aria-label={t("app.sections.account.account_address_book.delete")} title={t("app.sections.account.account_address_book.delete")}>
                      <Trash2 className="h-3.5 w-3.5"/>
                    </button>
                  </>) : (<button type="button" className="grid h-8 w-8 place-items-center rounded-full border border-[#E5E0D5] bg-[var(--white-warm)] text-[var(--gold-antique)] transition hover:border-[var(--gold-antique)] hover:bg-[#F7F1E5]" onClick={() => openCreateForm({ isDefaultShipping: true }, 'defaults', 'shipping')} aria-label={t("app.sections.account.account_address_book.add_new_address")} title={t("app.sections.account.account_address_book.add_new_address")}>
                    <Plus className="h-4 w-4"/>
                  </button>)}
              </div>
              <p className="text-sm font-medium text-[var(--sage-deep)]">{t("app.sections.account.account_address_book.shipping")}</p>
              <p className="text-sm text-[var(--sage-deep)]/70 mt-2">{formatAddress(defaultShipping)}</p>
            </div>
          </div>)}
        {showDefaultsForm && (<div className="mt-6 rounded-xl border border-[#EEE6D8] bg-[#FAF8F3] p-4">
            <AddressForm defaultValues={isCreating ? createDefaultValues : editingAddress || undefined} onSubmit={isCreating ? handleCreate : handleUpdate} onCancel={closeActiveForm} submitLabel={defaultsSubmitLabel}/>
          </div>)}
      </div>

      <div className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-xl text-[var(--sage-deep)]">{t("app.sections.account.account_address_book.my_addresses_supplementaires")}</h3>
            <p className="text-sm text-[var(--sage-deep)]/60">{t("app.sections.account.account_address_book.add_modifiez_addresses")}</p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => openCreateForm({}, 'additional')}>{t("app.sections.account.account_address_book.add_new_address")}</button>
        </div>

        {additionalAddresses.length === 0 && !isLoading && (<p className="text-sm text-[var(--sage-deep)]/60">
            {showAdditionalForm && isCreating
                ? t("app.sections.account.account_address_book.add_new_address_below")
                : t("app.sections.account.account_address_book.none_address_supplementaire")}
          </p>)}

        <div className="space-y-3">
          {additionalAddresses.map((address) => (<div key={address.id} className="relative rounded-xl border border-[#EEE6D8] p-4 pr-20 text-sm text-[var(--sage-deep)]">
              <div className="absolute right-4 top-4 flex items-center gap-2">
                <button type="button" className="grid h-8 w-8 place-items-center rounded-full border border-[#E5E0D5] bg-[var(--white-warm)] text-[var(--gold-antique)] transition hover:border-[var(--gold-antique)] hover:bg-[#F7F1E5]" onClick={() => openEditForm(address, 'additional')} aria-label={t("app.sections.account.account_address_book.edit")} title={t("app.sections.account.account_address_book.edit")}>
                  <SquarePen className="h-3.5 w-3.5"/>
                </button>
                <button type="button" className="grid h-8 w-8 place-items-center rounded-full border border-[#F0D7D2] bg-[var(--white-warm)] text-red-600 transition hover:border-red-300 hover:bg-[#FFF1EE]" onClick={() => handleDelete(address.id)} aria-label={t("app.sections.account.account_address_book.delete")} title={t("app.sections.account.account_address_book.delete")}>
                  <Trash2 className="h-3.5 w-3.5"/>
                </button>
              </div>
              <p className="font-medium">{address.firstName} {address.lastName}</p>
              <p className="text-[var(--sage-deep)]/70">{formatAddress(address)}</p>
            </div>))}
        </div>

        {showAdditionalForm && (<div className="mt-6 rounded-xl border border-[#EEE6D8] bg-[#FAF8F3] p-4">
            <AddressForm defaultValues={isCreating ? createDefaultValues : editingAddress || undefined} onSubmit={isCreating ? handleCreate : handleUpdate} onCancel={closeActiveForm} submitLabel={isCreating
                ? t("app.sections.account.account_address_book.add")
                : t("app.sections.account.account_address_book.mettre_day")}/>
          </div>)}
      </div>
    </div>);
}
