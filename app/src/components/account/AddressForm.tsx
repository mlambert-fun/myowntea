import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AccountAddress } from '@/api/client';
import { InlineLoading } from '@/components/ui/loading-state';

const phoneRegex = /^\+[1-9]\d{1,14}$/;

const schema = z.object({
  salutation: z.enum(['MME', 'MR']).optional(),
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  countryCode: z.string().min(2, 'Pays requis'),
  postalCode: z.string().min(1, 'Code postal requis'),
  city: z.string().min(1, 'Ville requise'),
  hamlet: z.string().optional(),
  address1: z.string().min(1, 'Adresse requise'),
  address2: z.string().optional(),
  phoneE164: z.string().regex(phoneRegex, 'Format attendu : +33612345678'),
  isDefaultBilling: z.boolean().optional(),
  isDefaultShipping: z.boolean().optional(),
});

export type AddressFormValues = z.infer<typeof schema>;

interface AddressFormProps {
  defaultValues?: Partial<AccountAddress>;
  onSubmit: (values: AddressFormValues) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
}

interface AddressSuggestion {
  label: string;
  postcode: string;
  city: string;
  name: string;
}

const EUROPE_COUNTRIES = [
  { code: 'AL', name: 'Albanie', flag: '🇦🇱' },
  { code: 'AD', name: 'Andorre', flag: '🇦🇩' },
  { code: 'AM', name: 'Armenie', flag: '🇦🇲' },
  { code: 'AT', name: 'Autriche', flag: '🇦🇹' },
  { code: 'AZ', name: 'Azerbaidjan', flag: '🇦🇿' },
  { code: 'BY', name: 'Bielorussie', flag: '🇧🇾' },
  { code: 'BE', name: 'Belgique', flag: '🇧🇪' },
  { code: 'BA', name: 'Bosnie-Herzegovine', flag: '🇧🇦' },
  { code: 'BG', name: 'Bulgarie', flag: '🇧🇬' },
  { code: 'HR', name: 'Croatie', flag: '🇭🇷' },
  { code: 'CY', name: 'Chypre', flag: '🇨🇾' },
  { code: 'CZ', name: 'Tchequie', flag: '🇨🇿' },
  { code: 'DK', name: 'Danemark', flag: '🇩🇰' },
  { code: 'EE', name: 'Estonie', flag: '🇪🇪' },
  { code: 'FI', name: 'Finlande', flag: '🇫🇮' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'GE', name: 'Georgie', flag: '🇬🇪' },
  { code: 'DE', name: 'Allemagne', flag: '🇩🇪' },
  { code: 'GR', name: 'Grece', flag: '🇬🇷' },
  { code: 'HU', name: 'Hongrie', flag: '🇭🇺' },
  { code: 'IS', name: 'Islande', flag: '🇮🇸' },
  { code: 'IE', name: 'Irlande', flag: '🇮🇪' },
  { code: 'IT', name: 'Italie', flag: '🇮🇹' },
  { code: 'XK', name: 'Kosovo', flag: '🇽🇰' },
  { code: 'LV', name: 'Lettonie', flag: '🇱🇻' },
  { code: 'LI', name: 'Liechtenstein', flag: '🇱🇮' },
  { code: 'LT', name: 'Lituanie', flag: '🇱🇹' },
  { code: 'LU', name: 'Luxembourg', flag: '🇱🇺' },
  { code: 'MT', name: 'Malte', flag: '🇲🇹' },
  { code: 'MD', name: 'Moldavie', flag: '🇲🇩' },
  { code: 'MC', name: 'Monaco', flag: '🇲🇨' },
  { code: 'ME', name: 'Montenegro', flag: '🇲🇪' },
  { code: 'NL', name: 'Pays-Bas', flag: '🇳🇱' },
  { code: 'MK', name: 'Macedoine du Nord', flag: '🇲🇰' },
  { code: 'NO', name: 'Norvege', flag: '🇳🇴' },
  { code: 'PL', name: 'Pologne', flag: '🇵🇱' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'RO', name: 'Roumanie', flag: '🇷🇴' },
  { code: 'RU', name: 'Russie', flag: '🇷🇺' },
  { code: 'SM', name: 'Saint-Marin', flag: '🇸🇲' },
  { code: 'RS', name: 'Serbie', flag: '🇷🇸' },
  { code: 'SK', name: 'Slovaquie', flag: '🇸🇰' },
  { code: 'SI', name: 'Slovenie', flag: '🇸🇮' },
  { code: 'ES', name: 'Espagne', flag: '🇪🇸' },
  { code: 'SE', name: 'Suede', flag: '🇸🇪' },
  { code: 'CH', name: 'Suisse', flag: '🇨🇭' },
  { code: 'TR', name: 'Turquie', flag: '🇹🇷' },
  { code: 'UA', name: 'Ukraine', flag: '🇺🇦' },
  { code: 'GB', name: 'Royaume-Uni', flag: '🇬🇧' },
  { code: 'VA', name: 'Vatican', flag: '🇻🇦' },
];

export function AddressForm({ defaultValues, onSubmit, onCancel, submitLabel }: AddressFormProps) {
  const form = useForm<AddressFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      salutation: defaultValues?.salutation || undefined,
      firstName: defaultValues?.firstName || '',
      lastName: defaultValues?.lastName || '',
      countryCode: defaultValues?.countryCode || 'FR',
      postalCode: defaultValues?.postalCode || '',
      city: defaultValues?.city || '',
      hamlet: defaultValues?.hamlet || '',
      address1: defaultValues?.address1 || '',
      address2: defaultValues?.address2 || '',
      phoneE164: defaultValues?.phoneE164 || '',
      isDefaultBilling: Boolean(defaultValues?.isDefaultBilling),
      isDefaultShipping: Boolean(defaultValues?.isDefaultShipping),
    },
  });

  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const addressQuery = form.watch('address1');
  const countryCode = form.watch('countryCode');

  const showSuggestions = useMemo(() => countryCode === 'FR' && addressQuery.length > 4, [countryCode, addressQuery]);

  useEffect(() => {
    if (!showSuggestions) {
      setSuggestions([]);
      return;
    }

    const handler = window.setTimeout(async () => {
      try {
        setIsLoadingSuggestions(true);
        const params = new URLSearchParams({ q: addressQuery, limit: '5', autocomplete: '1' });
        const response = await fetch(`https://api-adresse.data.gouv.fr/search/?${params.toString()}`);
        const data = (await response.json()) as { features?: Array<{ properties?: any }> };
        const items = (data.features || []).map((feature) => ({
          label: feature.properties?.label || '',
          postcode: feature.properties?.postcode || '',
          city: feature.properties?.city || '',
          name: feature.properties?.name || '',
        }));
        setSuggestions(items.filter((item) => item.label));
      } catch {
        setSuggestions([]);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 350);

    return () => window.clearTimeout(handler);
  }, [addressQuery, showSuggestions]);

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        await onSubmit(values);
      })}
    >
      <div>
        <p className="text-sm font-medium text-[var(--sage-deep)]">Civilité *</p>
        <div className="mt-2 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" value="MME" {...form.register('salutation')} /> Mme
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" value="MR" {...form.register('salutation')} /> M.
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm text-[var(--sage-deep)]">Prénom *</label>
          <input className="input-elegant w-full" {...form.register('firstName')} />
          {form.formState.errors.firstName && (
            <p className="text-xs text-red-600 mt-1">{form.formState.errors.firstName.message}</p>
          )}
        </div>
        <div>
          <label className="text-sm text-[var(--sage-deep)]">Nom *</label>
          <input className="input-elegant w-full" {...form.register('lastName')} />
          {form.formState.errors.lastName && (
            <p className="text-xs text-red-600 mt-1">{form.formState.errors.lastName.message}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm text-[var(--sage-deep)]">Pays *</label>
          <select className="input-elegant w-full" {...form.register('countryCode')}>
            {EUROPE_COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.flag} {country.name}
              </option>
            ))}
          </select>
          {form.formState.errors.countryCode && (
            <p className="text-xs text-red-600 mt-1">{form.formState.errors.countryCode.message}</p>
          )}
        </div>
        <div>
          <label className="text-sm text-[var(--sage-deep)]">Code postal *</label>
          <input className="input-elegant w-full" {...form.register('postalCode')} />
          {form.formState.errors.postalCode && (
            <p className="text-xs text-red-600 mt-1">{form.formState.errors.postalCode.message}</p>
          )}
        </div>
      </div>

      <div className="relative">
        <label className="text-sm text-[var(--sage-deep)]">Adresse *</label>
        <input
          className="input-elegant w-full"
          placeholder="Numéro de voie et voirie"
          {...form.register('address1')}
        />
        {form.formState.errors.address1 && (
          <p className="text-xs text-red-600 mt-1">{form.formState.errors.address1.message}</p>
        )}
        {showSuggestions && (suggestions.length > 0 || isLoadingSuggestions) && (
          <div className="absolute z-10 mt-2 w-full rounded-xl border border-[#EEE6D8] bg-white p-2 shadow">
            {isLoadingSuggestions && (
              <InlineLoading
                label="Recherche..."
                textClassName="text-xs text-[var(--sage-deep)]/60"
              />
            )}
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                className="block w-full rounded-lg px-3 py-2 text-left text-xs text-[var(--sage-deep)] hover:bg-[#F6F2EA]"
                onClick={() => {
                  form.setValue('address1', suggestion.name || suggestion.label, { shouldValidate: true });
                  form.setValue('postalCode', suggestion.postcode || '', { shouldValidate: true });
                  form.setValue('city', suggestion.city || '', { shouldValidate: true });
                  setSuggestions([]);
                }}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm text-[var(--sage-deep)]">Ville *</label>
          <input className="input-elegant w-full" {...form.register('city')} />
          {form.formState.errors.city && (
            <p className="text-xs text-red-600 mt-1">{form.formState.errors.city.message}</p>
          )}
        </div>
        <div>
          <label className="text-sm text-[var(--sage-deep)]">Lieu-dit</label>
          <input className="input-elegant w-full" {...form.register('hamlet')} />
        </div>
      </div>

      <div>
        <label className="text-sm text-[var(--sage-deep)]">Complément / entreprise</label>
        <input
          className="input-elegant w-full"
          placeholder="Entreprise / batiment / etage / digicode / BP"
          {...form.register('address2')}
        />
      </div>

      <div>
        <label className="text-sm text-[var(--sage-deep)]">Téléphone portable *</label>
        <input
          className="input-elegant w-full"
          {...form.register('phoneE164')}
          placeholder="Exemple +33612345678"
        />
        {form.formState.errors.phoneE164 && (
          <p className="text-xs text-red-600 mt-1">{form.formState.errors.phoneE164.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
          <input type="checkbox" {...form.register('isDefaultBilling')} />
          Utiliser comme adresse de facturation par défaut
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
          <input type="checkbox" {...form.register('isDefaultShipping')} />
          Utiliser comme adresse de livraison par défaut
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary">
          {submitLabel || 'Enregistrer'}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
