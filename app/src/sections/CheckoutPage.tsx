import { useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import { Home, MapPin } from 'lucide-react';
import { Footer } from '@/sections/Footer';
import { Navigation } from '@/sections/Navigation';
import {
  api,
  type AccountAddress,
  type AccountAddressPayload,
  type RelayPoint,
  type ShippingOffer,
  type ShippingSelection,
} from '@/api/client';
import { useBlend } from '@/context/BlendContext';
import { useAuth } from '@/context/AuthContext';
import { ShippingInfoAccordion } from '@/components/ShippingInfoAccordion';
import { InlineLoading } from '@/components/ui/loading-state';

type ShippingZone = 'FR_METRO' | 'EUROPE_DOM_TOM' | 'INTERNATIONAL';
type ShippingMode = 'HOME' | 'RELAY';
type FrMetroShippingRates = {
  homeCents: number;
  relayCents: number;
};

type CheckoutAddress = {
  salutation?: 'MME' | 'MR';
  firstName: string;
  lastName: string;
  countryCode: string;
  postalCode: string;
  city: string;
  address1: string;
  address2?: string;
  phoneE164: string;
};

type CountryOption = {
  code: string;
  name: string;
};

type OpeningRange = {
  openingTime?: string;
  closingTime?: string;
};

type RelayOpeningDays = Record<string, OpeningRange[]>;

type RelayPointDetails = RelayPoint & {
  status?: string;
  openingDays?: RelayOpeningDays;
  distanceFromSearchLocation?: number;
};

type AddressSuggestion = {
  label: string;
  postcode: string;
  city: string;
  name: string;
};

type StripeElement = {
  mount: (domElement: HTMLElement) => void;
  unmount?: () => void;
  destroy?: () => void;
  on?: (eventName: string, handler: (event: any) => void) => void;
};

type StripeElementsInstance = {
  create: (type: 'payment' | 'expressCheckout', options?: Record<string, unknown>) => StripeElement;
};

type StripeInstance = {
  elements: (options: { clientSecret: string; locale?: string }) => StripeElementsInstance;
  confirmPayment: (options: {
    elements: StripeElementsInstance;
    confirmParams: { return_url: string };
  }) => Promise<{ error?: { message?: string } }>;
};

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeInstance;
  }
}

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

const loadStripeJs = async (): Promise<void> => {
  if (window.Stripe) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-stripe-js="true"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Stripe JS failed to load')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.setAttribute('data-stripe-js', 'true');
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Stripe JS failed to load'));
    document.head.appendChild(script);
  });
};

const defaultAddress = (): CheckoutAddress => ({
  salutation: undefined,
  firstName: '',
  lastName: '',
  countryCode: 'FR',
  postalCode: '',
  city: '',
  address1: '',
  address2: '',
  phoneE164: '',
});

const EUROPE_COUNTRIES: CountryOption[] = [
  { code: 'AL', name: 'Albanie' },
  { code: 'AD', name: 'Andorre' },
  { code: 'AM', name: 'Armenie' },
  { code: 'AT', name: 'Autriche' },
  { code: 'AZ', name: 'Azerbaidjan' },
  { code: 'BE', name: 'Belgique' },
  { code: 'BA', name: 'Bosnie-Herzegovine' },
  { code: 'BG', name: 'Bulgarie' },
  { code: 'HR', name: 'Croatie' },
  { code: 'CY', name: 'Chypre' },
  { code: 'CZ', name: 'Tchequie' },
  { code: 'DK', name: 'Danemark' },
  { code: 'EE', name: 'Estonie' },
  { code: 'FI', name: 'Finlande' },
  { code: 'FR', name: 'France' },
  { code: 'GE', name: 'Georgie' },
  { code: 'DE', name: 'Allemagne' },
  { code: 'GR', name: 'Grece' },
  { code: 'HU', name: 'Hongrie' },
  { code: 'IS', name: 'Islande' },
  { code: 'IE', name: 'Irlande' },
  { code: 'IT', name: 'Italie' },
  { code: 'LV', name: 'Lettonie' },
  { code: 'LI', name: 'Liechtenstein' },
  { code: 'LT', name: 'Lituanie' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MT', name: 'Malte' },
  { code: 'MD', name: 'Moldavie' },
  { code: 'MC', name: 'Monaco' },
  { code: 'ME', name: 'Montenegro' },
  { code: 'NL', name: 'Pays-Bas' },
  { code: 'MK', name: 'Macedoine du Nord' },
  { code: 'NO', name: 'Norvege' },
  { code: 'PL', name: 'Pologne' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Roumanie' },
  { code: 'SM', name: 'Saint-Marin' },
  { code: 'RS', name: 'Serbie' },
  { code: 'SK', name: 'Slovaquie' },
  { code: 'SI', name: 'Slovenie' },
  { code: 'ES', name: 'Espagne' },
  { code: 'SE', name: 'Suede' },
  { code: 'CH', name: 'Suisse' },
  { code: 'TR', name: 'Turquie' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'GB', name: 'Royaume-Uni' },
  { code: 'VA', name: 'Vatican' },
];

const countryCodeToFlag = (code: string) => {
  const normalized = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return '🏳️';
  return String.fromCodePoint(...normalized.split('').map((char) => 127397 + char.charCodeAt(0)));
};

const OPENING_DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;

const OPENING_DAY_LABELS: Record<(typeof OPENING_DAY_ORDER)[number], string> = {
  MONDAY: 'Lundi',
  TUESDAY: 'Mardi',
  WEDNESDAY: 'Mercredi',
  THURSDAY: 'Jeudi',
  FRIDAY: 'Vendredi',
  SATURDAY: 'Samedi',
  SUNDAY: 'Dimanche',
};

const mapAccountAddress = (address: AccountAddress): CheckoutAddress => ({
  salutation: address.salutation || undefined,
  firstName: address.firstName || '',
  lastName: address.lastName || '',
  countryCode: address.countryCode || 'FR',
  postalCode: address.postalCode || '',
  city: address.city || '',
  address1: address.address1 || '',
  address2: address.address2 || '',
  phoneE164: address.phoneE164 || '',
});

const isDomTomPostalCode = (postalCode?: string) => {
  const normalized = String(postalCode || '').replace(/\s+/g, '');
  return /^97|^98/.test(normalized);
};

const inferZone = (address: CheckoutAddress): ShippingZone => {
  const countryCode = String(address.countryCode || '').toUpperCase();
  if (countryCode === 'FR') {
    return isDomTomPostalCode(address.postalCode) ? 'EUROPE_DOM_TOM' : 'FR_METRO';
  }
  if (countryCode === 'BE') return 'EUROPE_DOM_TOM';
  return 'INTERNATIONAL';
};

const DEFAULT_FR_METRO_SHIPPING_RATES: FrMetroShippingRates = {
  homeCents: 550,
  relayCents: 460,
};

const quoteShipping = (
  zone: ShippingZone,
  mode: ShippingMode,
  subtotalCents: number,
  frMetroRates: FrMetroShippingRates = DEFAULT_FR_METRO_SHIPPING_RATES
) => {
  if (zone === 'FR_METRO') {
    const shippingCents = mode === 'RELAY' ? frMetroRates.relayCents : frMetroRates.homeCents;
    if (subtotalCents >= 4500) return { shippingCents: 0, thresholdCents: 4500, supportsRelay: true };
    return { shippingCents, thresholdCents: 4500, supportsRelay: true };
  }
  if (zone === 'EUROPE_DOM_TOM') {
    return { shippingCents: 750, thresholdCents: null, supportsRelay: false };
  }
  return { shippingCents: 1590, thresholdCents: null, supportsRelay: false };
};
const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizeRelayPoint = (raw: any, index: number): RelayPointDetails | null => {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw.parcelPoint && typeof raw.parcelPoint === 'object' ? raw.parcelPoint : raw;
  const location = source.location || raw.location || {};
  const position = location.position || source.position || raw.position || {};
  const address = source.address || raw.address || {};

  const latitude =
    toNumber(source.latitude) ??
    toNumber(source.lat) ??
    toNumber(source.y) ??
    toNumber(position.latitude) ??
    toNumber(position.lat) ??
    toNumber(location.latitude) ??
    toNumber(location.lat) ??
    (Array.isArray(location) ? toNumber(location[1]) : undefined);
  const longitude =
    toNumber(source.longitude) ??
    toNumber(source.lng) ??
    toNumber(source.lon) ??
    toNumber(source.x) ??
    toNumber(position.longitude) ??
    toNumber(position.lng) ??
    toNumber(position.lon) ??
    toNumber(location.longitude) ??
    toNumber(location.lng) ??
    toNumber(location.lon) ??
    (Array.isArray(location) ? toNumber(location[0]) : undefined);

  const id =
    String(source.id || source.parcelPointId || source.code || source.uuid || raw.id || raw.code || '').trim() ||
    `${latitude ?? 'na'}-${longitude ?? 'na'}-${index}`;

  return {
    id,
    network: source.network || source.partner || source.carrier || undefined,
    name: source.name || source.label || source.company || source.parcelPointName || undefined,
    address1:
      source.address1 ||
      source.street ||
      location.street ||
      address.address1 ||
      address.line1 ||
      undefined,
    address2: source.address2 || location.street2 || address.address2 || address.line2 || undefined,
    postalCode:
      source.postalCode ||
      source.zipCode ||
      location.postalCode ||
      address.postalCode ||
      address.zipCode ||
      undefined,
    city: source.city || location.city || address.city || undefined,
    countryCode: source.countryCode || source.country || location.countryIsoCode || address.countryCode || undefined,
    latitude,
    longitude,
    status: typeof source.status === 'string' ? source.status.toUpperCase() : undefined,
    openingDays: source.openingDays && typeof source.openingDays === 'object' ? (source.openingDays as RelayOpeningDays) : undefined,
    distanceFromSearchLocation: toNumber(raw.distanceFromSearchLocation),
  };
};

const formatOpeningDaySlots = (slots?: OpeningRange[]) => {
  if (!slots || slots.length === 0) return 'Fermé';
  const ranges = slots
    .map((slot) => {
      const start = String(slot.openingTime || '').slice(0, 5);
      const end = String(slot.closingTime || '').slice(0, 5);
      if (!start || !end) return null;
      return `${start} - ${end}`;
    })
    .filter((value): value is string => Boolean(value));
  return ranges.length > 0 ? ranges.join(' / ') : 'Fermé';
};

const validateAddress = (
  address: CheckoutAddress,
  label: 'livraison' | 'facturation',
  options?: { requireAddress1?: boolean; requireLocation?: boolean }
) => {
  const requireAddress1 = options?.requireAddress1 ?? true;
  const requireLocation = options?.requireLocation ?? true;
  if (!address.firstName.trim()) return `Le prénom de ${label} est requis.`;
  if (!address.lastName.trim()) return `Le nom de ${label} est requis.`;
  if (requireLocation && !address.countryCode.trim()) return `Le pays de ${label} est requis.`;
  if (requireLocation && !address.postalCode.trim()) return `Le code postal de ${label} est requis.`;
  if (requireLocation && !address.city.trim()) return `La ville de ${label} est requise.`;
  if (requireAddress1 && !address.address1.trim()) return `L'adresse de ${label} est requise.`;
  if (!/^\+[1-9]\d{1,14}$/.test(address.phoneE164.trim())) return 'Le téléphone doit être au format +33612345678.';
  return null;
};

const toAccountAddressPayload = (
  address: CheckoutAddress,
  defaults?: { isDefaultBilling?: boolean; isDefaultShipping?: boolean }
): AccountAddressPayload => {
  const payload: AccountAddressPayload = {
    salutation: address.salutation || null,
    firstName: address.firstName.trim(),
    lastName: address.lastName.trim(),
    countryCode: address.countryCode.trim().toUpperCase(),
    postalCode: address.postalCode.trim(),
    city: address.city.trim(),
    address1: address.address1.trim(),
    address2: address.address2?.trim() ? address.address2.trim() : null,
    phoneE164: address.phoneE164.trim(),
  };
  if (typeof defaults?.isDefaultBilling === 'boolean') {
    payload.isDefaultBilling = defaults.isDefaultBilling;
  }
  if (typeof defaults?.isDefaultShipping === 'boolean') {
    payload.isDefaultShipping = defaults.isDefaultShipping;
  }
  return payload;
};

const buildRelayShippingAddress = (address: CheckoutAddress, relayPoint: RelayPointDetails | null): CheckoutAddress => {
  const relayLabel = String(relayPoint?.name || relayPoint?.id || 'Point relais').trim();
  return {
    ...address,
    countryCode: String(relayPoint?.countryCode || address.countryCode || 'FR').trim().toUpperCase(),
    postalCode: String(relayPoint?.postalCode || address.postalCode || '').trim(),
    city: String(relayPoint?.city || address.city || '').trim(),
    address1: String(relayPoint?.address1 || `Point relais ${relayLabel}`).trim(),
    address2:
      String(
        relayPoint?.address2 ||
          (relayPoint?.name ? `Retrait chez ${relayPoint.name}` : '') ||
          address.address2 ||
          ''
      ).trim(),
  };
};

const CHECKOUT_SHIPPING_STORAGE_KEY = 'tea_shipping';

const readStoredShippingSelection = (): ShippingSelection | null => {
  try {
    const raw = localStorage.getItem(CHECKOUT_SHIPPING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShippingSelection;
    return {
      mode: parsed.mode === 'RELAY' ? 'RELAY' : 'HOME',
      offerId: parsed.offerId,
      offerCode: parsed.offerCode,
      offerLabel: parsed.offerLabel,
      relayPoint: parsed.relayPoint || null,
    };
  } catch {
    return null;
  }
};

type CountrySelectProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowedCountryCodes?: string[];
};

const CountrySelect = ({
  value,
  onChange,
  placeholder = 'Sélectionnez un pays',
  allowedCountryCodes,
}: CountrySelectProps) => {
  const normalizedValue = String(value || '').toUpperCase();
  const normalizedAllowed = Array.isArray(allowedCountryCodes)
    ? allowedCountryCodes.map((country) => String(country || '').trim().toUpperCase()).filter(Boolean)
    : [];
  const availableCountries =
    normalizedAllowed.length > 0
      ? EUROPE_COUNTRIES.filter((country) => normalizedAllowed.includes(country.code))
      : EUROPE_COUNTRIES;
  const hasCurrentValue = availableCountries.some((country) => country.code === normalizedValue);

  return (
    <select
      className="input-elegant w-full"
      value={normalizedValue}
      onChange={(e) => onChange(e.target.value.toUpperCase())}
    >
      {!hasCurrentValue && normalizedValue && (
        <option value={normalizedValue}>
          {countryCodeToFlag(normalizedValue)} {normalizedValue}
        </option>
      )}
      <option value="">{placeholder}</option>
      {availableCountries.map((country) => (
        <option key={country.code} value={country.code}>
          {countryCodeToFlag(country.code)} {country.name} ({country.code})
        </option>
      ))}
    </select>
  );
};

type CheckoutAddressFormProps = {
  title: string;
  description?: string;
  value: CheckoutAddress;
  onFieldChange: (key: keyof CheckoutAddress, value: string | undefined) => void;
  onValueChange?: () => void;
  showLocationFields?: boolean;
  showAddressFields?: boolean;
  suppressInitialAddressSuggestions?: boolean;
  allowedCountryCodes?: string[];
};

const CheckoutAddressForm = ({
  title,
  description,
  value,
  onFieldChange,
  onValueChange,
  showLocationFields = true,
  showAddressFields = true,
  suppressInitialAddressSuggestions = false,
  allowedCountryCodes,
}: CheckoutAddressFormProps) => {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isAddressEdited, setIsAddressEdited] = useState(false);
  const normalizedCountryCode = String(value.countryCode || '').trim().toUpperCase();
  const addressQuery = String(value.address1 || '').trim();
  const canShowAddressSuggestions = !suppressInitialAddressSuggestions || isAddressEdited;
  const showSuggestions =
    showAddressFields &&
    normalizedCountryCode === 'FR' &&
    addressQuery.length > 4 &&
    canShowAddressSuggestions;

  useEffect(() => {
    if (!showSuggestions) {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLoadingSuggestions(true);
      try {
        const params = new URLSearchParams({ q: addressQuery, limit: '5', autocomplete: '1' });
        const response = await fetch(`https://api-adresse.data.gouv.fr/search/?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          setSuggestions([]);
          return;
        }
        const payload = (await response.json()) as {
          features?: Array<{
            properties?: {
              label?: string;
              postcode?: string;
              city?: string;
              name?: string;
            };
          }>;
        };
        const nextSuggestions = (payload.features || [])
          .map((feature) => ({
            label: String(feature.properties?.label || '').trim(),
            postcode: String(feature.properties?.postcode || '').trim(),
            city: String(feature.properties?.city || '').trim(),
            name: String(feature.properties?.name || '').trim(),
          }))
          .filter((item) => item.label);
        setSuggestions(nextSuggestions);
      } catch {
        setSuggestions([]);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [addressQuery, showSuggestions]);

  const handleFieldChange = (key: keyof CheckoutAddress, nextValue: string | undefined) => {
    onFieldChange(key, nextValue);
    onValueChange?.();
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium text-[var(--sage-deep)]">{title}</h4>
        {description && <p className="mt-1 text-xs text-[var(--sage-deep)]/60">{description}</p>}
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--sage-deep)]">Civilite *</p>
        <div className="mt-2 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
            <input
              type="radio"
              checked={value.salutation === 'MME'}
              onChange={() => handleFieldChange('salutation', 'MME')}
            />
            Mme
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
            <input
              type="radio"
              checked={value.salutation === 'MR'}
              onChange={() => handleFieldChange('salutation', 'MR')}
            />
            M.
          </label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className="input-elegant w-full"
          placeholder="Prénom *"
          value={value.firstName}
          onChange={(e) => handleFieldChange('firstName', e.target.value)}
        />
        <input
          className="input-elegant w-full"
          placeholder="Nom *"
          value={value.lastName}
          onChange={(e) => handleFieldChange('lastName', e.target.value)}
        />
      </div>

      {showLocationFields && (
        <div className="grid gap-3 sm:grid-cols-2">
          <CountrySelect
            value={value.countryCode}
            placeholder="Sélectionnez un pays d'Europe *"
            allowedCountryCodes={allowedCountryCodes}
            onChange={(nextValue) => handleFieldChange('countryCode', nextValue)}
          />
          <input
            className="input-elegant w-full"
            placeholder="Code postal *"
            value={value.postalCode}
            onChange={(e) => handleFieldChange('postalCode', e.target.value)}
          />
        </div>
      )}

      {showAddressFields && (
        <div className="relative">
          <input
            className="input-elegant w-full"
            placeholder="Adresse *"
            value={value.address1}
            onChange={(e) => {
              setIsAddressEdited(true);
              handleFieldChange('address1', e.target.value);
            }}
          />
          {showSuggestions && (isLoadingSuggestions || suggestions.length > 0) && (
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
                    handleFieldChange('address1', suggestion.name || suggestion.label);
                    if (showLocationFields) {
                      handleFieldChange('postalCode', suggestion.postcode || value.postalCode);
                      handleFieldChange('city', suggestion.city || value.city);
                    }
                    setSuggestions([]);
                  }}
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showLocationFields && (
        <input
          className="input-elegant w-full"
          placeholder="Ville *"
          value={value.city}
          onChange={(e) => handleFieldChange('city', e.target.value)}
        />
      )}

      {showAddressFields && (
        <input
          className="input-elegant w-full"
          placeholder="Complement (optionnel)"
          value={value.address2 || ''}
          onChange={(e) => handleFieldChange('address2', e.target.value)}
        />
      )}

      <input
        className="input-elegant w-full"
        placeholder="Téléphone (+336...) *"
        value={value.phoneE164}
        onChange={(e) => handleFieldChange('phoneE164', e.target.value)}
      />

      <p className="text-[11px] text-[var(--sage-deep)]/55">(*) champs obligatoires</p>
    </div>
  );
};

export default function CheckoutPage() {
  const { customer, isLoading: isAuthLoading } = useAuth();
  const { cartItems, cartSubtotal, cartSummary, appliedDiscountCode, cartMessages } = useBlend();
  const [shippingAddress, setShippingAddress] = useState<CheckoutAddress>(defaultAddress);
  const [billingAddress, setBillingAddress] = useState<CheckoutAddress>(defaultAddress);
  const [useSameBilling, setUseSameBilling] = useState(true);
  const [comment, setComment] = useState('');
  const [shippingMode, setShippingMode] = useState<ShippingMode>('HOME');
  const [shippingOffers, setShippingOffers] = useState<ShippingOffer[]>([]);
  const [relayPoints, setRelayPoints] = useState<RelayPointDetails[]>([]);
  const [selectedRelay, setSelectedRelay] = useState<RelayPointDetails | null>(null);
  const [relayLoading, setRelayLoading] = useState(false);
  const [hasSearchedRelayPoints, setHasSearchedRelayPoints] = useState(false);
  const [relayCitySuggestions, setRelayCitySuggestions] = useState<string[]>([]);
  const [isRelayCitySuggestionsLoading, setIsRelayCitySuggestionsLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [isStripeReady, setIsStripeReady] = useState(false);
  const [hasExpressMethods, setHasExpressMethods] = useState<boolean | null>(null);
  const [shouldScrollToPaymentSection, setShouldScrollToPaymentSection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultShippingAddressId, setDefaultShippingAddressId] = useState<string | null>(null);
  const [defaultBillingAddressId, setDefaultBillingAddressId] = useState<string | null>(null);
  const [saveHomeShippingAddress, setSaveHomeShippingAddress] = useState(false);
  const [saveBillingAddress, setSaveBillingAddress] = useState(false);
  const [isShippingSelectionHydrated, setIsShippingSelectionHydrated] = useState(false);
  const [frMetroShippingRates, setFrMetroShippingRates] = useState<FrMetroShippingRates>(
    DEFAULT_FR_METRO_SHIPPING_RATES
  );
  const [allowedShippingCountries, setAllowedShippingCountries] = useState<string[]>(['FR']);

  const paymentContainerRef = useRef<HTMLDivElement | null>(null);
  const expressContainerRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<StripeInstance | null>(null);
  const stripeElementsRef = useRef<StripeElementsInstance | null>(null);
  const paymentElementRef = useRef<StripeElement | null>(null);
  const expressElementRef = useRef<StripeElement | null>(null);
  const relayMapContainerRef = useRef<HTMLDivElement | null>(null);
  const relayMapRef = useRef<L.Map | null>(null);
  const relayMarkersLayerRef = useRef<L.LayerGroup | null>(null);
  const paymentSectionRef = useRef<HTMLDivElement | null>(null);

  const subtotalCents = cartSummary?.subtotalCents ?? Math.round(cartSubtotal * 100);
  const subtotalDiscountCents =
    cartSummary?.discountLines
      ?.filter((line) => line.type !== 'FREE_SHIPPING')
      ?.reduce((sum, line) => sum + line.amountCents, 0) ?? 0;
  const shippingDiscountCents =
    cartSummary?.discountLines
      ?.filter((line) => line.type === 'FREE_SHIPPING')
      ?.reduce((sum, line) => sum + line.amountCents, 0) ?? 0;
  const isInitialCartLoading =
    isAuthLoading || (Boolean(customer?.id) && cartItems.length === 0 && !cartSummary && cartMessages.length === 0);
  const zone = useMemo(() => inferZone(shippingAddress), [shippingAddress]);
  const shippingQuote = useMemo(
    () => quoteShipping(zone, shippingMode, subtotalCents, frMetroShippingRates),
    [frMetroShippingRates, zone, shippingMode, subtotalCents]
  );
  const effectiveShippingCents = Math.max(0, shippingQuote.shippingCents - shippingDiscountCents);
  const originalShippingCents = Math.max(0, effectiveShippingCents + shippingDiscountCents);
  const previewTotalCents = Math.max(0, subtotalCents + effectiveShippingCents - subtotalDiscountCents);
  const shouldUseSameBilling = shippingMode === 'HOME' && useSameBilling;
  const mappableRelayPoints = useMemo(
    () =>
      relayPoints.filter(
        (point) =>
          typeof point.latitude === 'number' &&
          Number.isFinite(point.latitude) &&
          typeof point.longitude === 'number' &&
          Number.isFinite(point.longitude)
      ),
    [relayPoints]
  );
  const selectedOffer = useMemo(
    () => shippingOffers.find((offer) => offer.mode === shippingMode) || null,
    [shippingMode, shippingOffers]
  );

  useEffect(() => {
    const storedSelection = readStoredShippingSelection();
    if (storedSelection?.mode === 'HOME' || storedSelection?.mode === 'RELAY') {
      setShippingMode(storedSelection.mode);
    }

    const storedRelay = normalizeRelayPoint(storedSelection?.relayPoint, 0);
    if (storedRelay) {
      setSelectedRelay(storedRelay);
      if (storedSelection?.mode === 'RELAY') {
        setShippingAddress((prev) => ({
          ...prev,
          countryCode: String(storedRelay.countryCode || prev.countryCode || 'FR').toUpperCase(),
          postalCode: String(storedRelay.postalCode || prev.postalCode || '').trim(),
          city: String(storedRelay.city || prev.city || '').trim(),
        }));
      }
    }

    setIsShippingSelectionHydrated(true);
  }, []);

  useEffect(() => {
    if (!isShippingSelectionHydrated) return;
    try {
      const payload: ShippingSelection = {
        mode: shippingMode,
        offerId: selectedOffer?.id || undefined,
        offerCode: selectedOffer?.code,
        offerLabel: selectedOffer?.label,
        relayPoint: selectedRelay || null,
      };
      localStorage.setItem(CHECKOUT_SHIPPING_STORAGE_KEY, JSON.stringify(payload));
      window.dispatchEvent(new Event('shipping-changed'));
    } catch {
      // ignore
    }
  }, [isShippingSelectionHydrated, selectedOffer?.id, selectedOffer?.code, selectedOffer?.label, selectedRelay, shippingMode]);

  useEffect(() => {
    if (shippingMode !== 'RELAY' || !selectedRelay) return;
    setShippingAddress((prev) => {
      const nextCountryCode = String(selectedRelay.countryCode || prev.countryCode || 'FR').toUpperCase();
      const nextPostalCode = String(selectedRelay.postalCode || prev.postalCode || '').trim();
      const nextCity = String(selectedRelay.city || prev.city || '').trim();
      if (prev.countryCode === nextCountryCode && prev.postalCode === nextPostalCode && prev.city === nextCity) {
        return prev;
      }
      return {
        ...prev,
        countryCode: nextCountryCode,
        postalCode: nextPostalCode,
        city: nextCity,
      };
    });
  }, [selectedRelay, shippingMode]);

  useEffect(() => {
    if (!shippingQuote.supportsRelay && shippingMode === 'RELAY' && !selectedRelay) {
      setShippingMode('HOME');
      setSelectedRelay(null);
      setRelayPoints([]);
      setHasSearchedRelayPoints(false);
    }
  }, [selectedRelay, shippingMode, shippingQuote.supportsRelay]);

  useEffect(() => {
    if (shippingMode === 'RELAY' && useSameBilling) {
      setUseSameBilling(false);
    }
  }, [shippingMode, useSameBilling]);

  useEffect(() => {
    if (isInitialCartLoading) return;
    if (cartItems.length === 0) {
      window.location.href = '/cart';
    }
  }, [cartItems.length, isInitialCartLoading]);

  useEffect(() => {
    let isCancelled = false;
    const loadData = async () => {
      try {
        const [offers, allowedCountriesResponse] = await Promise.all([
          api.getShippingOffers(),
          api.getShippingAllowedCountries(),
        ]);
        if (!isCancelled) {
          setShippingOffers(Array.isArray(offers) ? offers : []);
          const normalizedAllowedCountries = Array.isArray(allowedCountriesResponse?.allowedCountries)
            ? allowedCountriesResponse.allowedCountries
                .map((country) => String(country || '').trim().toUpperCase())
                .filter(Boolean)
            : [];
          setAllowedShippingCountries(normalizedAllowedCountries.length > 0 ? normalizedAllowedCountries : ['FR']);
        }
      } catch {
        if (!isCancelled) {
          setShippingOffers([]);
          setAllowedShippingCountries(['FR']);
        }
      }

      if (!customer?.email) return;
      try {
        const response = await api.getAccountAddresses();
        if (isCancelled) return;
        const addresses = response?.addresses || [];
        const shipping = addresses.find((item) => item.isDefaultShipping) || addresses[0];
        const billing = addresses.find((item) => item.isDefaultBilling) || shipping;
        if (shipping) setShippingAddress(mapAccountAddress(shipping));
        if (billing) setBillingAddress(mapAccountAddress(billing));
        setDefaultShippingAddressId(shipping?.id || null);
        setDefaultBillingAddressId(billing?.id || shipping?.id || null);
      } catch {
        // ignore
      }
    };
    loadData();
    return () => {
      isCancelled = true;
    };
  }, [customer?.email]);

  useEffect(() => {
    let isCancelled = false;
    const relayOffer = shippingOffers.find((offer) => offer.mode === 'RELAY') || null;

    const loadShippingRates = async () => {
      try {
        const [homeQuote, relayQuote] = await Promise.all([
          api.getShippingQuote({ mode: 'HOME' }),
          api.getShippingQuote({ mode: 'RELAY', offerCode: relayOffer?.code }),
        ]);
        if (isCancelled) return;
        setFrMetroShippingRates({
          homeCents: Math.max(0, homeQuote?.shippingCents ?? DEFAULT_FR_METRO_SHIPPING_RATES.homeCents),
          relayCents: Math.max(0, relayQuote?.shippingCents ?? DEFAULT_FR_METRO_SHIPPING_RATES.relayCents),
        });
      } catch {
        if (!isCancelled) {
          setFrMetroShippingRates(DEFAULT_FR_METRO_SHIPPING_RATES);
        }
      }
    };

    void loadShippingRates();
    return () => {
      isCancelled = true;
    };
  }, [shippingOffers]);

  useEffect(() => {
    if (shippingMode !== 'RELAY') {
      setRelayCitySuggestions([]);
      setIsRelayCitySuggestionsLoading(false);
      return;
    }

    const countryCode = String(shippingAddress.countryCode || '').trim().toUpperCase();
    const postalCode = String(shippingAddress.postalCode || '').replace(/\s+/g, '');
    if (countryCode !== 'FR' || postalCode.length < 5) {
      setRelayCitySuggestions([]);
      setIsRelayCitySuggestionsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsRelayCitySuggestionsLoading(true);
      try {
        const response = await fetch(
          `https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(postalCode)}&fields=nom&format=json&geometry=centre`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          setRelayCitySuggestions([]);
          return;
        }
        const payload = (await response.json()) as Array<{ nom?: string }>;
        const suggestions = Array.from(
          new Set(
            (Array.isArray(payload) ? payload : [])
              .map((item) => String(item?.nom || '').trim())
              .filter(Boolean)
          )
        );
        setRelayCitySuggestions(suggestions);
        if (suggestions.length > 0) {
          setShippingAddress((prev) => ({ ...prev, city: suggestions[0] }));
        }
      } catch {
        setRelayCitySuggestions([]);
      } finally {
        setIsRelayCitySuggestionsLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [shippingMode, shippingAddress.countryCode, shippingAddress.postalCode]);

  useEffect(() => {
    if (shippingMode !== 'RELAY') return;
    if (!relayMapContainerRef.current) return;

    if (!relayMapRef.current) {
      const map = L.map(relayMapContainerRef.current, {
        scrollWheelZoom: false,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      relayMapRef.current = map;
      relayMarkersLayerRef.current = L.layerGroup().addTo(map);
    }

    const map = relayMapRef.current;
    const markers = relayMarkersLayerRef.current;
    if (!map || !markers) return;

    markers.clearLayers();
    if (mappableRelayPoints.length === 0) {
      window.setTimeout(() => map.invalidateSize(), 0);
      return;
    }

    const latLngs: L.LatLngTuple[] = [];
    mappableRelayPoints.forEach((point) => {
      const latLng: L.LatLngTuple = [point.latitude as number, point.longitude as number];
      latLngs.push(latLng);
      const isSelected = selectedRelay?.id === point.id;
      const marker = L.circleMarker(latLng, {
        radius: isSelected ? 9 : 7,
        weight: 2,
        color: isSelected ? '#C4A77D' : '#4B6B58',
        fillColor: isSelected ? '#C4A77D' : '#FFFFFF',
        fillOpacity: 1,
      });
      marker.on('click', () => {
        setSelectedRelay(point);
        setClientSecret(null);
        setError(null);
      });
      marker.addTo(markers);
    });

    if (latLngs.length === 1) {
      map.setView(latLngs[0], 13);
    } else {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24] });
    }
    window.setTimeout(() => map.invalidateSize(), 0);
  }, [mappableRelayPoints, selectedRelay?.id, shippingMode]);

  useEffect(
    () => () => {
      if (relayMapRef.current) {
        relayMapRef.current.remove();
        relayMapRef.current = null;
      }
      relayMarkersLayerRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (!clientSecret) {
      setIsStripeReady(false);
      setHasExpressMethods(null);
      return;
    }
    let isCancelled = false;

    const setupStripe = async () => {
      try {
        if (!stripePublishableKey) {
          setError('Stripe publishable key manquante (VITE_STRIPE_PUBLISHABLE_KEY).');
          return;
        }
        await loadStripeJs();
        if (isCancelled) return;
        if (!window.Stripe) {
          setError('Impossible de charger Stripe.');
          return;
        }
        const stripe = window.Stripe(stripePublishableKey);
        const elements = stripe.elements({ clientSecret, locale: 'fr' });
        stripeRef.current = stripe;
        stripeElementsRef.current = elements;

        if (paymentContainerRef.current) {
          const paymentElement = elements.create('payment');
          paymentElement.mount(paymentContainerRef.current);
          paymentElementRef.current = paymentElement;
        }

        if (expressContainerRef.current) {
          try {
            const expressElement = elements.create('expressCheckout', {
              paymentMethods: {
                applePay: 'always',
                googlePay: 'always',
              },
            });
            expressElement.on?.('ready', (event: { availablePaymentMethods?: Record<string, unknown> | null }) => {
              if (isCancelled) return;
              const available = event?.availablePaymentMethods;
              const hasMethods = Boolean(available && Object.keys(available).length > 0);
              setHasExpressMethods(hasMethods);
            });
            expressElement.on?.('confirm', async () => {
              if (isCancelled) return;
              if (!stripeRef.current || !stripeElementsRef.current) return;
              setError(null);
              setIsSubmittingPayment(true);
              try {
                const result = await stripeRef.current.confirmPayment({
                  elements: stripeElementsRef.current,
                  confirmParams: {
                    return_url: `${window.location.origin}/order?payment=success`,
                  },
                });
                if (result.error) {
                  setError(result.error.message || 'Le paiement a échoué.');
                }
              } finally {
                if (!isCancelled) {
                  setIsSubmittingPayment(false);
                }
              }
            });
            expressElement.mount(expressContainerRef.current);
            expressElementRef.current = expressElement;
          } catch {
            expressElementRef.current = null;
            setHasExpressMethods(false);
          }
        }

        setIsStripeReady(true);
      } catch {
        if (!isCancelled) {
          setError('Impossible de charger Stripe.');
          setIsStripeReady(false);
        }
      }
    };

    setupStripe();

    return () => {
      isCancelled = true;
      try {
        expressElementRef.current?.unmount?.();
        expressElementRef.current?.destroy?.();
      } catch {
        // ignore
      }
      expressElementRef.current = null;
      try {
        paymentElementRef.current?.unmount?.();
        paymentElementRef.current?.destroy?.();
      } catch {
        // ignore
      }
      paymentElementRef.current = null;
      stripeElementsRef.current = null;
      stripeRef.current = null;
      setIsStripeReady(false);
      setHasExpressMethods(null);
    };
  }, [clientSecret]);

  useEffect(() => {
    if (!shouldScrollToPaymentSection || !clientSecret || !isStripeReady) return;
    const timeoutId = window.setTimeout(() => {
      const section = paymentSectionRef.current;
      if (!section) return;
      const targetTop = Math.max(0, section.getBoundingClientRect().top + window.scrollY - 110);
      window.scrollTo({ top: targetTop, behavior: 'smooth' });
      setShouldScrollToPaymentSection(false);
    }, 80);
    return () => window.clearTimeout(timeoutId);
  }, [clientSecret, isStripeReady, shouldScrollToPaymentSection]);

  const updateShippingField = (key: keyof CheckoutAddress, value: string | undefined) => {
    const nextValue = key === 'salutation' ? value : value ?? '';
    setShippingAddress((prev) => ({ ...prev, [key]: nextValue } as CheckoutAddress));
  };

  const updateBillingField = (key: keyof CheckoutAddress, value: string | undefined) => {
    const nextValue = key === 'salutation' ? value : value ?? '';
    setBillingAddress((prev) => ({ ...prev, [key]: nextValue } as CheckoutAddress));
  };

  const resetPayment = () => {
    setClientSecret(null);
    setError(null);
  };

  const upsertPreferredAddress = async (params: {
    address: CheckoutAddress;
    currentId: string | null;
    setId: (id: string | null) => void;
    isDefaultShipping?: boolean;
    isDefaultBilling?: boolean;
  }) => {
    const payload = toAccountAddressPayload(params.address, {
      isDefaultShipping: params.isDefaultShipping,
      isDefaultBilling: params.isDefaultBilling,
    });
    if (params.currentId) {
      const updated = await api.updateAccountAddress(params.currentId, payload);
      const nextId = updated?.address?.id || params.currentId;
      params.setId(nextId);
      return nextId;
    }
    const created = await api.createAccountAddress(payload);
    const nextId = created?.address?.id || null;
    if (nextId) {
      params.setId(nextId);
    }
    return nextId;
  };

  const searchRelayPoints = async () => {
    if (!selectedOffer?.code) {
      setError("La livraison en point relais est indisponible pour le moment.");
      return;
    }
    if (!shippingAddress.postalCode.trim() || !shippingAddress.countryCode.trim()) {
      setError('Code postal et pays requis pour rechercher un point relais.');
      return;
    }
    const normalizedCountryCode = String(shippingAddress.countryCode || '').trim().toUpperCase();
    if (!allowedShippingCountries.includes(normalizedCountryCode)) {
      setError(
        `La livraison n'est pas disponible pour ce pays. Pays autorisés: ${allowedShippingCountries.join(', ')}`
      );
      return;
    }
    setError(null);
    setHasSearchedRelayPoints(true);
    setSelectedRelay(null);
    setRelayLoading(true);
    try {
      const response = await api.getRelayPoints({
        postalCode: shippingAddress.postalCode.trim(),
        city: shippingAddress.city.trim(),
        countryCode: shippingAddress.countryCode.trim().toUpperCase(),
        shippingOfferCode: selectedOffer?.code,
      });
      const points =
        response?.data ||
        response?.items ||
        response?.content ||
        response?.parcelPoints ||
        response?.nearbyParcelPoints ||
        response;
      const normalized = Array.isArray(points)
        ? points
            .map((point, index) => normalizeRelayPoint(point, index))
            .filter((point): point is RelayPointDetails => Boolean(point))
        : [];
      const availablePoints = normalized.filter((point) => {
        const status = String(point.status || '').trim().toUpperCase();
        // Boxtal may omit per-point status in some responses; in that case, keep the point.
        return !status || status === 'AVAILABLE';
      });
      setRelayPoints(availablePoints);
    } catch {
      setRelayPoints([]);
      setError('Impossible de charger les points relais.');
    } finally {
      setRelayLoading(false);
    }
  };

  const preparePayment = async () => {
    const normalizedShippingCountryCode = String(shippingAddress.countryCode || '').trim().toUpperCase();
    if (!allowedShippingCountries.includes(normalizedShippingCountryCode)) {
      setError(
        `La livraison n'est pas disponible pour ce pays. Pays autorisés: ${allowedShippingCountries.join(', ')}`
      );
      return;
    }
    if (shippingMode === 'RELAY' && !selectedRelay) {
      setError('Veuillez sélectionner un point relais.');
      return;
    }
    if (shippingMode === 'RELAY' && !selectedOffer?.code) {
      setError("La livraison en point relais est indisponible pour le moment.");
      return;
    }

    const checkoutShippingAddress =
      shippingMode === 'RELAY'
        ? buildRelayShippingAddress(shippingAddress, selectedRelay)
        : shippingAddress;
    const checkoutBillingAddress = shouldUseSameBilling ? checkoutShippingAddress : billingAddress;

    const shippingValidationError = validateAddress(checkoutShippingAddress, 'livraison');
    if (shippingValidationError) {
      setError(shippingValidationError);
      return;
    }

    if (!shouldUseSameBilling) {
      const billingValidationError = validateAddress(checkoutBillingAddress, 'facturation');
      if (billingValidationError) {
        setError(billingValidationError);
        return;
      }
    }

    setError(null);
    setIsPreparingPayment(true);
    try {
      if (customer?.email) {
        try {
          if (shippingMode === 'HOME' && saveHomeShippingAddress) {
            const shippingId = await upsertPreferredAddress({
              address: checkoutShippingAddress,
              currentId: defaultShippingAddressId,
              setId: setDefaultShippingAddressId,
              isDefaultShipping: true,
              isDefaultBilling: shouldUseSameBilling && saveBillingAddress,
            });
            if (shouldUseSameBilling && saveBillingAddress) {
              setDefaultBillingAddressId(shippingId);
            }
          } else if (shouldUseSameBilling && saveBillingAddress) {
            await upsertPreferredAddress({
              address: checkoutShippingAddress,
              currentId: defaultBillingAddressId,
              setId: setDefaultBillingAddressId,
              isDefaultBilling: true,
            });
          }

          if (!shouldUseSameBilling && saveBillingAddress) {
            await upsertPreferredAddress({
              address: checkoutBillingAddress,
              currentId: defaultBillingAddressId,
              setId: setDefaultBillingAddressId,
              isDefaultBilling: true,
            });
          }
        } catch (saveError) {
          console.error('Failed to save preferred checkout addresses', saveError);
        }
      }

      const response = await api.createCheckoutPaymentIntent({
        appliedDiscountCode,
        comment: comment.trim() || undefined,
        shippingSelection: {
          mode: shippingMode,
          offerId: selectedOffer?.id || undefined,
          offerCode: selectedOffer?.code,
          offerLabel: selectedOffer?.label,
          relayPoint: shippingMode === 'RELAY' ? selectedRelay : null,
        },
        shippingAddress: checkoutShippingAddress,
        billingAddress: checkoutBillingAddress,
      });
      if (response.clientSecret) {
        setClientSecret(response.clientSecret);
        return;
      }
      if (response.paymentIntentId) {
        window.location.href = `/order?payment=success&payment_intent=${encodeURIComponent(response.paymentIntentId)}`;
        return;
      }
      setError('Impossible de préparer le paiement.');
    } catch (e: any) {
      setError(e?.message || 'Impossible de préparer le paiement.');
    } finally {
      setIsPreparingPayment(false);
    }
  };

  const submitPayment = async () => {
    if (isSubmittingPayment) return;
    if (!stripeRef.current || !stripeElementsRef.current || !isStripeReady) {
      setError('Stripe est en cours de chargement.');
      return;
    }
    setError(null);
    setIsSubmittingPayment(true);
    try {
      const result = await stripeRef.current.confirmPayment({
        elements: stripeElementsRef.current,
        confirmParams: {
          return_url: `${window.location.origin}/order?payment=success`,
        },
      });
      if (result.error) {
        setError(result.error.message || 'Le paiement a échoué.');
      }
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const renderContinueToPaymentButton = () => (
    <button
      type="button"
      className="w-full btn-primary"
      onClick={() => {
        setShouldScrollToPaymentSection(true);
        void preparePayment();
      }}
      disabled={isPreparingPayment}
    >
      {isPreparingPayment ? 'Préparation du paiement...' : 'Continuer vers le paiement'}
    </button>
  );

  return (
    <div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation hidePrimaryNav />
      <main className="pt-28 pb-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-6">
            <h2 className="font-display text-3xl text-[var(--sage-deep)]">Livraison et paiement</h2>
            <p className="text-sm text-[var(--sage-deep)]/70 mt-2">
              Renseignez vos adresses puis finalisez le paiement.
            </p>
            <div className="mt-6 mx-auto w-full max-w-4xl px-4">
              <div className="relative flex w-full items-center justify-center gap-[5rem]">
                <span className="pointer-events-none absolute left-10 right-10 top-1/2 -translate-y-1/2 border-t border-[#E5E0D5]" />

                <a
                  href="/cart"
                  className="relative z-10 inline-flex min-w-[11rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-white px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]/80 transition hover:border-[var(--gold-antique)] hover:text-[var(--sage-deep)]"
                >
                  1. Panier
                </a>

                <a
                  href="/checkout"
                  aria-current="step"
                  className="relative z-10 inline-flex min-w-[15rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-[var(--gold-antique)] px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]"
                >
                  2. Livraison et paiement
                </a>

                <span className="relative z-10 inline-flex min-w-[11rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-white px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]/70">
                  3. Confirmation
                </span>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <section className="lg:col-span-2 space-y-5">
              <div className="bg-white rounded-2xl p-5 shadow space-y-4">
                <h3 className="font-medium text-[var(--sage-deep)]">Mode de livraison</h3>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
                    <input
                      type="radio"
                      checked={shippingMode === 'HOME'}
                      onChange={() => {
                        setShippingMode('HOME');
                        setSelectedRelay(null);
                        setRelayPoints([]);
                        setHasSearchedRelayPoints(false);
                        resetPayment();
                      }}
                    />
                    <span className="inline-flex items-center gap-1.5">
                      <Home className="h-4 w-4 text-[var(--gold-antique)]" aria-hidden="true" />
                      Domicile
                    </span>
                  </label>
                  {shippingQuote.supportsRelay && (
                    <label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
                      <input
                        type="radio"
                        checked={shippingMode === 'RELAY'}
                        onChange={() => {
                          setShippingMode('RELAY');
                          setSelectedRelay(null);
                          setRelayPoints([]);
                          setHasSearchedRelayPoints(false);
                          resetPayment();
                        }}
                      />
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-[var(--gold-antique)]" aria-hidden="true" />
                        Point relais
                      </span>
                    </label>
                  )}
                </div>
                {shippingMode === 'RELAY' && (
                  <div className="space-y-3">
                    <div className="grid sm:grid-cols-3 gap-3">
                      <CountrySelect
                        value={shippingAddress.countryCode}
                        placeholder="Sélectionnez un pays d'Europe *"
                        allowedCountryCodes={allowedShippingCountries}
                        onChange={(value) => {
                          updateShippingField('countryCode', value);
                          setSelectedRelay(null);
                          setRelayPoints([]);
                          resetPayment();
                        }}
                      />
                      <input
                        className="input-elegant w-full"
                        placeholder="Code postal *"
                        value={shippingAddress.postalCode}
                        onChange={(e) => {
                          updateShippingField('postalCode', e.target.value);
                          setSelectedRelay(null);
                          setRelayPoints([]);
                          resetPayment();
                        }}
                      />
                      <input
                        className="input-elegant w-full"
                        placeholder="Ville (optionnel)"
                        list="relay-city-suggestions"
                        value={shippingAddress.city}
                        onChange={(e) => {
                          updateShippingField('city', e.target.value);
                          setSelectedRelay(null);
                          setRelayPoints([]);
                          resetPayment();
                        }}
                      />
                    </div>
                    <datalist id="relay-city-suggestions">
                      {relayCitySuggestions.map((city) => (
                        <option key={city} value={city} />
                      ))}
                    </datalist>
                    {isRelayCitySuggestionsLoading && (
                      <InlineLoading
                        label="Recherche des villes pour ce code postal..."
                        textClassName="text-xs text-[var(--sage-deep)]/60"
                      />
                    )}
                    <button type="button" className="btn-secondary" onClick={searchRelayPoints} disabled={relayLoading}>
                      {relayLoading ? (
                        <InlineLoading
                          label="Recherche..."
                          className="justify-center"
                          textClassName="text-sm text-[var(--sage-deep)]"
                        />
                      ) : (
                        'Rechercher un point relais'
                      )}
                    </button>
                    {mappableRelayPoints.length > 0 && (
                      <div className="h-64 w-full overflow-hidden rounded-xl border border-[#E5E0D5]">
                        <div ref={relayMapContainerRef} className="h-full w-full" />
                      </div>
                    )}
                    {relayPoints.length > 0 && mappableRelayPoints.length === 0 && (
                      <p className="text-xs text-[var(--sage-deep)]/70">
                        Les points relais ont été trouvés, mais aucune coordonnée GPS n'a été fournie pour afficher la carte.
                      </p>
                    )}
                    {relayPoints.length > 0 && (
                      <div className="space-y-2 max-h-52 overflow-auto">
                        {relayPoints.map((point) => (
                          <button
                            key={point.id}
                            type="button"
                            onClick={() => { setSelectedRelay(point); resetPayment(); }}
                            className={`w-full text-left border rounded-md p-2 text-xs ${selectedRelay?.id === point.id ? 'border-[var(--gold-antique)] bg-[var(--cream-apothecary)]' : 'border-[#E5E0D5]'}`}
                          >
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                              <div className="space-y-1">
                                <div className="font-medium text-[var(--sage-deep)]">{point.name || point.id}</div>
                                <div className="text-[var(--sage-deep)]/70">{point.address1} {point.address2}</div>
                                <div className="text-[var(--sage-deep)]/70">{point.postalCode} {point.city}</div>
                              </div>
                              <div className="space-y-1 text-[11px] text-[var(--sage-deep)]/70">
                                <div className="font-medium underline text-[var(--sage-deep)]">Horaires :</div>
                                {OPENING_DAY_ORDER.slice(0, 3).map((day) => (
                                  <div key={`${point.id}-${day}`} className="flex items-start gap-2">
                                    <span className="min-w-[50px] font-medium">{OPENING_DAY_LABELS[day]}</span>
                                    <span>{formatOpeningDaySlots(point.openingDays?.[day])}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="space-y-1 text-[11px] text-[var(--sage-deep)]/70">
                                {OPENING_DAY_ORDER.slice(3).map((day) => (
                                  <div key={`${point.id}-${day}`} className="flex items-start gap-2">
                                    <span className="min-w-[50px] font-medium">{OPENING_DAY_LABELS[day]}</span>
                                    <span>{formatOpeningDaySlots(point.openingDays?.[day])}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedRelay && (
                      <div className="rounded-xl border border-[var(--cream-apothecary)] bg-[var(--gold-antique)] px-3 py-2 text-xs text-[var(--sage-deep)]">
                        <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div className="space-y-1">
                            <div className="font-medium underline text-[var(--sage-deep)]">Point relais sélectionné :</div>
                            <div className="font-medium">{selectedRelay.name || selectedRelay.id}</div>
                            <div className="text-[var(--sage-deep)]/70">
                              {selectedRelay.address1} {selectedRelay.address2}
                            </div>
                            <div className="text-[var(--sage-deep)]/70">
                              {selectedRelay.postalCode} {selectedRelay.city}
                            </div>
                          </div>
                          <div className="space-y-1 text-[11px] text-[var(--sage-deep)]/70">
                            <div className="font-medium underline text-[var(--sage-deep)]">Horaires :</div>
                            {OPENING_DAY_ORDER.slice(0, 3).map((day) => (
                              <div key={`selected-${selectedRelay.id}-${day}`} className="flex items-start gap-2">
                                <span className="min-w-[50px] font-medium">{OPENING_DAY_LABELS[day]}</span>
                                <span>{formatOpeningDaySlots(selectedRelay.openingDays?.[day])}</span>
                              </div>
                            ))}
                          </div>
                          <div className="space-y-1 text-[11px] text-[var(--sage-deep)]/70">
                            {OPENING_DAY_ORDER.slice(3).map((day) => (
                              <div key={`selected-${selectedRelay.id}-${day}`} className="flex items-start gap-2">
                                <span className="min-w-[50px] font-medium">{OPENING_DAY_LABELS[day]}</span>
                                <span>{formatOpeningDaySlots(selectedRelay.openingDays?.[day])}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {hasSearchedRelayPoints && relayPoints.length === 0 && !relayLoading && (
                      <p className="text-xs text-[var(--sage-deep)]/70">
                        Aucun point relais trouvé pour cette zone. Vérifiez le pays et le code postal puis relancez la recherche.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {shippingMode === 'HOME' && (
                <div className="bg-white rounded-2xl p-5 shadow space-y-4">
                  <CheckoutAddressForm
                    title="Adresse de livraison"
                    description="Formulaire domicile : même structure que votre carnet d'adresses."
                    value={shippingAddress}
                    onFieldChange={updateShippingField}
                    onValueChange={resetPayment}
                    suppressInitialAddressSuggestions
                    allowedCountryCodes={allowedShippingCountries}
                  />
                  {customer?.email && (
                    <label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
                      <input
                        type="checkbox"
                        checked={saveHomeShippingAddress}
                        onChange={(e) => setSaveHomeShippingAddress(e.target.checked)}
                      />
                      Enregistrer cette adresse comme adresse de livraison par défaut
                    </label>
                  )}
                </div>
              )}

              {shippingMode === 'RELAY' && (
                <div className="bg-white rounded-2xl p-5 shadow space-y-4">
                  <CheckoutAddressForm
                    title="Coordonnées du destinataire"
                    description="Le point relais sélectionné est utilisé pour l'adresse de livraison."
                    value={shippingAddress}
                    onFieldChange={updateShippingField}
                    onValueChange={resetPayment}
                    showLocationFields={false}
                    showAddressFields={false}
                  />
                  <p className="text-xs text-[var(--sage-deep)]/60">
                    Pays, code postal et ville sont dérivés de votre recherche de point relais.
                  </p>
                </div>
              )}

              <div className="bg-white rounded-2xl p-5 shadow space-y-4">
                {shippingMode === 'HOME' ? (
                  <label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
                    <input
                      type="checkbox"
                      checked={useSameBilling}
                      onChange={(e) => {
                        setUseSameBilling(e.target.checked);
                        resetPayment();
                      }}
                    />
                    Utiliser la même adresse pour la facturation
                  </label>
                ) : (
                  <p className="text-sm text-[var(--sage-deep)]/70">
                    En point relais, l'adresse de facturation reste requise.
                  </p>
                )}

                {!shouldUseSameBilling && (
                  <CheckoutAddressForm
                    title="Adresse de facturation"
                    value={billingAddress}
                    onFieldChange={updateBillingField}
                    onValueChange={resetPayment}
                    suppressInitialAddressSuggestions
                  />
                )}

                {shouldUseSameBilling && (
                  <div className="rounded-xl border border-[#E5E0D5] bg-[#FAF8F3] px-3 py-2 text-xs text-[var(--sage-deep)]/70">
                    La facturation utilisera la même adresse que la livraison.
                  </div>
                )}

                {customer?.email && (
                  <label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
                    <input
                      type="checkbox"
                      checked={saveBillingAddress}
                      onChange={(e) => setSaveBillingAddress(e.target.checked)}
                    />
                    Enregistrer cette adresse comme adresse de facturation par défaut
                  </label>
                )}
              </div>

              <div className="bg-white rounded-2xl p-5 shadow space-y-3">
                <h3 className="font-medium text-[var(--sage-deep)]">Instruction spéciale</h3>
                <textarea
                  value={comment}
                  onChange={(e) => { setComment(e.target.value); resetPayment(); }}
                  placeholder="Instruction spéciale pour le vendeur..."
                  className="w-full min-h-[96px] p-3 border border-[#E5E0D5] rounded-md resize-vertical"
                />
              </div>

              {!clientSecret && renderContinueToPaymentButton()}

              {clientSecret && (
                <div ref={paymentSectionRef} className="rounded-2xl border border-[#E5E0D5] bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-[var(--sage-deep)]">Paiement sécurisé</h3>
                    <button type="button" className="text-xs text-[var(--gold-antique)] hover:underline" onClick={resetPayment}>
                      Modifier mes informations
                    </button>
                  </div>
                  <div className="rounded-2xl border border-[#E5E0D5] bg-white p-4" ref={expressContainerRef} />
                  {hasExpressMethods === false && (
                    <div className="text-xs text-[var(--sage-deep)]/60">
                      Les paiements express (Apple Pay / Google Pay) ne sont pas disponibles dans cet environnement.
                      Ils nécessitent un domaine HTTPS vérifié sur Stripe et un navigateur/appareil compatible.
                    </div>
                  )}
                  <div className="rounded-2xl border border-[#E5E0D5] bg-white p-4" ref={paymentContainerRef} />
                  <button
                    type="button"
                    className="w-full btn-primary disabled:opacity-60"
                    onClick={submitPayment}
                    disabled={!isStripeReady || isSubmittingPayment}
                  >
                    {isSubmittingPayment ? 'Paiement en cours...' : 'Payer ma commande'}
                  </button>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              )}
            </section>

            <aside className="lg:col-span-1">
              <div className="space-y-4 lg:sticky lg:top-24">
                <div className="bg-white rounded-2xl p-5 shadow space-y-3">
                  <h3 className="font-medium text-[var(--sage-deep)]">Récapitulatif</h3>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--sage-deep)]/60">Sous-total</span>
                    <span className="text-[var(--sage-deep)]">{(subtotalCents / 100).toFixed(2)} EUR</span>
                  </div>
                {subtotalDiscountCents > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--sage-deep)]/60">Remises</span>
                    <span className="text-[var(--gold-antique)]">- {(subtotalDiscountCents / 100).toFixed(2)} EUR</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--sage-deep)]/60">
                    Livraison
                  </span>
                  <div className="text-sm font-medium text-[var(--sage-deep)]">
                    {effectiveShippingCents === 0 ? (
                      originalShippingCents > 0 ? (
                        <span>
                          <span className="line-through text-[var(--sage-deep)]/40 mr-2">
                            {(originalShippingCents / 100).toFixed(2)} €
                          </span>
                          <span className="text-[var(--gold-antique)]">Gratuite</span>
                        </span>
                      ) : (
                        'Gratuite'
                      )
                    ) : (
                      `${(effectiveShippingCents / 100).toFixed(2)} €`
                    )}
                  </div>
                </div>
                  <div className="border-t border-[#E5E0D5] pt-3 flex items-center justify-between">
                    <span className="text-[var(--sage-deep)]/70">Total TTC</span>
                    <span className="font-display text-xl text-[var(--gold-antique)]">{(previewTotalCents / 100).toFixed(2)} EUR</span>
                  </div>
                </div>
                <ShippingInfoAccordion />
                {!clientSecret && renderContinueToPaymentButton()}
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer hideMainSection hideNewsletterSection />
    </div>
  );
}
