import { useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import { Home, MapPin } from 'lucide-react';
import { CountrySelectField } from '@/components/forms/CountrySelectField';
import { PhoneField } from '@/components/forms/PhoneField';
import { Footer } from '@/sections/Footer';
import { Navigation } from '@/sections/Navigation';
import { api, type AccountAddress, type AccountAddressPayload, type RelayPoint, type ShippingOffer, type ShippingSelection, } from '@/api/client';
import { useBlend } from '@/context/BlendContext';
import { useAuth } from '@/context/AuthContext';
import { ShippingInfoAccordion } from '@/components/ShippingInfoAccordion';
import { StripeWordmark } from '@/components/ui/StripeWordmark';
import { InlineLoading } from '@/components/ui/loading-state';
import { DELIVERY_COUNTRY_CODES, filterCountryOptions, type CountryOption } from '@/lib/countries';
import { t } from "@/lib/i18n";
import { isValidPhoneE164 } from '@/lib/phone';
type ShippingMode = 'HOME' | 'RELAY';
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
    elements: (options: {
        clientSecret: string;
        locale?: string;
    }) => StripeElementsInstance;
    confirmPayment: (options: {
        elements: StripeElementsInstance;
        confirmParams: {
            return_url: string;
        };
    }) => Promise<{
        error?: {
            message?: string;
        };
    }>;
};
declare global {
    interface Window {
        Stripe?: (publishableKey: string) => StripeInstance;
    }
}
const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
const geoapifyAutocompleteApiKey = String(import.meta.env.VITE_GEOAPIFY_API_KEY || '').trim();
const geoapifyAutocompleteBaseUrl = 'https://api.geoapify.com/v1/geocode/autocomplete';
const normalizePostalCode = (value: string) => String(value || '').replace(/\s+/g, '').trim();
const resolvePostalCityLookupContext = (countryCode: string, postalCode: string) => {
    const normalizedCountryCode = String(countryCode || '').trim().toUpperCase();
    const normalizedPostalCode = normalizePostalCode(postalCode);
    const isFrance = normalizedCountryCode === 'FR';
    const isBelgium = normalizedCountryCode === 'BE';
    const hasEnoughPostalChars = (isFrance && normalizedPostalCode.length >= 5) || (isBelgium && normalizedPostalCode.length >= 4);
    return {
        countryCode: normalizedCountryCode,
        postalCode: normalizedPostalCode,
        isFrance,
        isBelgium,
        canLookup: (isFrance || isBelgium) && hasEnoughPostalChars,
    };
};
const fetchCitySuggestionsByPostalCode = async (params: {
    countryCode: string;
    postalCode: string;
    signal?: AbortSignal;
}): Promise<string[]> => {
    const context = resolvePostalCityLookupContext(params.countryCode, params.postalCode);
    if (!context.canLookup) {
        return [];
    }
    if (context.isFrance) {
        const response = await fetch(`https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(context.postalCode)}&fields=nom&format=json&geometry=centre`, { signal: params.signal });
        if (!response.ok) {
            return [];
        }
        const payload = (await response.json()) as Array<{
            nom?: string;
        }>;
        return Array.from(new Set((Array.isArray(payload) ? payload : [])
            .map((item) => String(item?.nom || '').trim())
            .filter(Boolean)));
    }
    if (context.isBelgium) {
        const response = await fetch(`https://api.zippopotam.us/BE/${encodeURIComponent(context.postalCode)}`, { signal: params.signal });
        if (!response.ok) {
            return [];
        }
        const payload = (await response.json()) as {
            places?: Array<{
                'place name'?: string;
            }>;
        };
        return Array.from(new Set((Array.isArray(payload?.places) ? payload.places : [])
            .map((item) => String(item?.['place name'] || '').trim())
            .filter(Boolean)));
    }
    return [];
};
const loadStripeJs = async (): Promise<void> => {
    if (window.Stripe)
        return;
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
const OPENING_DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
const OPENING_DAY_LABELS: Record<(typeof OPENING_DAY_ORDER)[number], string> = {
    MONDAY: t("app.sections.checkout_page.day_monday"),
    TUESDAY: t("app.sections.checkout_page.day_tuesday"),
    WEDNESDAY: t("app.sections.checkout_page.day_wednesday"),
    THURSDAY: t("app.sections.checkout_page.day_thursday"),
    FRIDAY: t("app.sections.checkout_page.day_friday"),
    SATURDAY: t("app.sections.checkout_page.day_saturday"),
    SUNDAY: t("app.sections.checkout_page.day_sunday"),
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
const toNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return undefined;
};
const normalizeRelayPoint = (raw: any, index: number): RelayPointDetails | null => {
    if (!raw || typeof raw !== 'object')
        return null;
    const source = raw.parcelPoint && typeof raw.parcelPoint === 'object' ? raw.parcelPoint : raw;
    const location = source.location || raw.location || {};
    const position = location.position || source.position || raw.position || {};
    const address = source.address || raw.address || {};
    const latitude = toNumber(source.latitude) ??
        toNumber(source.lat) ??
        toNumber(source.y) ??
        toNumber(position.latitude) ??
        toNumber(position.lat) ??
        toNumber(location.latitude) ??
        toNumber(location.lat) ??
        (Array.isArray(location) ? toNumber(location[1]) : undefined);
    const longitude = toNumber(source.longitude) ??
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
    const id = String(source.id || source.parcelPointId || source.code || source.uuid || raw.id || raw.code || '').trim() ||
        `${latitude ?? 'na'}-${longitude ?? 'na'}-${index}`;
    return {
        id,
        network: source.network || source.partner || source.carrier || undefined,
        name: source.name || source.label || source.company || source.parcelPointName || undefined,
        address1: source.address1 ||
            source.street ||
            location.street ||
            address.address1 ||
            address.line1 ||
            undefined,
        address2: source.address2 || location.street2 || address.address2 || address.line2 || undefined,
        postalCode: source.postalCode ||
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
    if (!slots || slots.length === 0)
        return t("app.sections.checkout_page.ferme");
    const ranges = slots
        .map((slot) => {
        const start = String(slot.openingTime || '').slice(0, 5);
        const end = String(slot.closingTime || '').slice(0, 5);
        if (!start || !end)
            return null;
        return `${start} - ${end}`;
    })
        .filter((value): value is string => Boolean(value));
    return ranges.length > 0 ? ranges.join(' / ') : t("app.sections.checkout_page.ferme");
};
const validateAddress = (address: CheckoutAddress, label: 'livraison' | 'facturation', options?: {
    requireAddress1?: boolean;
    requireLocation?: boolean;
}) => {
    const requireAddress1 = options?.requireAddress1 ?? true;
    const requireLocation = options?.requireLocation ?? true;
    if (!address.firstName.trim())
        return t("app.sections.checkout_page.first_name_required_for", undefined, { label });
    if (!address.lastName.trim())
        return t("app.sections.checkout_page.last_name_required_for", undefined, { label });
    if (requireLocation && !address.countryCode.trim())
        return t("app.sections.checkout_page.country_required_for", undefined, { label });
    if (requireLocation && !address.postalCode.trim())
        return t("app.sections.checkout_page.postal_code_required_for", undefined, { label });
    if (requireLocation && !address.city.trim())
        return t("app.sections.checkout_page.city_required_for", undefined, { label });
    if (requireAddress1 && !address.address1.trim())
        return t("app.sections.checkout_page.address_required_for", undefined, { label });
    if (!isValidPhoneE164(address.phoneE164.trim()))
        return t("app.sections.checkout_page.phone_must_format");
    return null;
};
const toAccountAddressPayload = (address: CheckoutAddress, defaults?: {
    isDefaultBilling?: boolean;
    isDefaultShipping?: boolean;
}): AccountAddressPayload => {
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
    const relayLabel = String(relayPoint?.name || relayPoint?.id || t("app.sections.checkout_page.relay_point")).trim();
    return {
        ...address,
        countryCode: String(relayPoint?.countryCode || address.countryCode || 'FR').trim().toUpperCase(),
        postalCode: String(relayPoint?.postalCode || address.postalCode || '').trim(),
        city: String(relayPoint?.city || address.city || '').trim(),
        address1: String(relayPoint?.address1 || t("app.sections.checkout_page.relay_point_with_label", undefined, { label: relayLabel })).trim(),
        address2: String(relayPoint?.address2 ||
            (relayPoint?.name ? t("app.sections.checkout_page.pickup_at", undefined, { name: relayPoint.name }) : '') ||
            address.address2 ||
            '').trim(),
    };
};
const CHECKOUT_SHIPPING_STORAGE_KEY = 'tea_shipping';
const readStoredShippingSelection = (): ShippingSelection | null => {
    try {
        const raw = localStorage.getItem(CHECKOUT_SHIPPING_STORAGE_KEY);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw) as ShippingSelection;
        return {
            mode: parsed.mode === 'RELAY' ? 'RELAY' : 'HOME',
            offerId: parsed.offerId,
            offerCode: parsed.offerCode,
            offerLabel: parsed.offerLabel,
            countryCode: parsed.countryCode,
            postalCode: parsed.postalCode,
            city: parsed.city,
            relayPoint: parsed.relayPoint || null,
        };
    }
    catch {
        return null;
    }
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
const CheckoutAddressForm = ({ title, description, value, onFieldChange, onValueChange, showLocationFields = true, showAddressFields = true, suppressInitialAddressSuggestions = true, allowedCountryCodes, }: CheckoutAddressFormProps) => {
    const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [isAddressEdited, setIsAddressEdited] = useState(false);
    const [isAddressSuggestionLocked, setIsAddressSuggestionLocked] = useState(false);
    const addressCountryOptions = useMemo<CountryOption[]>(() => filterCountryOptions(DELIVERY_COUNTRY_CODES, allowedCountryCodes), [allowedCountryCodes]);
    const normalizedCountryCode = String(value.countryCode || '').trim().toUpperCase();
    const normalizedPostalCode = normalizePostalCode(value.postalCode || '');
    const previousPostalCodeRef = useRef(normalizedPostalCode);
    const previousCountryCodeRef = useRef(normalizedCountryCode);
    const addressQuery = String(value.address1 || '').trim();
    const canShowAddressSuggestions = !suppressInitialAddressSuggestions || isAddressEdited;
    const supportsAddressSuggestions = normalizedCountryCode === 'FR' || normalizedCountryCode === 'BE';
    const showSuggestions = showAddressFields &&
        supportsAddressSuggestions &&
        addressQuery.length > 4 &&
        canShowAddressSuggestions &&
        !isAddressSuggestionLocked;
    const prioritizedSuggestions = useMemo(() => {
        if (!normalizedPostalCode || suggestions.length <= 1) {
            return suggestions;
        }
        const matchingPostalSuggestions: AddressSuggestion[] = [];
        const otherSuggestions: AddressSuggestion[] = [];
        suggestions.forEach((suggestion) => {
            const suggestionPostalCode = String(suggestion.postcode || '').replace(/\s+/g, '').trim();
            if (suggestionPostalCode.startsWith(normalizedPostalCode)) {
                matchingPostalSuggestions.push(suggestion);
                return;
            }
            otherSuggestions.push(suggestion);
        });
        return [...matchingPostalSuggestions, ...otherSuggestions];
    }, [normalizedPostalCode, suggestions]);
    useEffect(() => {
        if (!showLocationFields) {
            previousPostalCodeRef.current = normalizedPostalCode;
            previousCountryCodeRef.current = normalizedCountryCode;
            return;
        }
        const hasPostalContextChanged = previousPostalCodeRef.current !== normalizedPostalCode ||
            previousCountryCodeRef.current !== normalizedCountryCode;
        previousPostalCodeRef.current = normalizedPostalCode;
        previousCountryCodeRef.current = normalizedCountryCode;
        const hasExistingCity = String(value.city || '').trim().length > 0;
        if (!hasPostalContextChanged && hasExistingCity) {
            return;
        }
        const lookupContext = resolvePostalCityLookupContext(normalizedCountryCode, normalizedPostalCode);
        if (!lookupContext.canLookup) {
            return;
        }
        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            try {
                const nextCitySuggestions = await fetchCitySuggestionsByPostalCode({
                    countryCode: lookupContext.countryCode,
                    postalCode: lookupContext.postalCode,
                    signal: controller.signal,
                });
                if (nextCitySuggestions.length === 0) {
                    return;
                }
                const nextCity = String(nextCitySuggestions[0] || '').trim();
                if (!nextCity || nextCity === String(value.city || '').trim()) {
                    return;
                }
                onFieldChange('city', nextCity);
                onValueChange?.();
            }
            catch {
                // ignore
            }
        }, 250);
        return () => {
            window.clearTimeout(timeoutId);
            controller.abort();
        };
    }, [normalizedCountryCode, normalizedPostalCode, showLocationFields, value.city]);
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
                let nextSuggestions: AddressSuggestion[] = [];
                if (normalizedCountryCode === 'FR') {
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
                    nextSuggestions = (payload.features || [])
                        .map((feature) => ({
                        label: String(feature.properties?.label || '').trim(),
                        postcode: String(feature.properties?.postcode || '').trim(),
                        city: String(feature.properties?.city || '').trim(),
                        name: String(feature.properties?.name || '').trim(),
                    }))
                        .filter((item) => item.label);
                }
                else if (normalizedCountryCode === 'BE') {
                    const enteredPostalCode = String(value.postalCode || '').replace(/\s+/g, '').trim();
                    const normalizedAddressQuery = String(addressQuery || '').replace(/\s+/g, ' ').trim();
                    const houseNumberMatch = normalizedAddressQuery.match(/^(.*?)[,\s]+(\d+[A-Za-z0-9\-\/]*)$/);
                    const streetOnlyQuery = String(houseNumberMatch?.[1] || '').trim();
                    const normalizeBelgianSuggestions = (payload: {
                        features?: Array<{
                            properties?: {
                                formatted?: string;
                                address_line1?: string;
                                name?: string;
                                street?: string;
                                housenumber?: string;
                                house_number?: string;
                                postcode?: string;
                                city?: string;
                                town?: string;
                                village?: string;
                                municipality?: string;
                                county?: string;
                            };
                        }>;
                    }) => (Array.isArray(payload?.features) ? payload.features : [])
                        .map((feature) => {
                        const properties = feature?.properties || {};
                        const street = String(properties.address_line1 ||
                            properties.street ||
                            properties.name ||
                            '')
                            .trim();
                        const houseNumber = String(properties.housenumber || properties.house_number || '').trim();
                        const escapedHouseNumber = houseNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const houseNumberAlreadyInStreet = houseNumber
                            ? new RegExp(`\\b${escapedHouseNumber}\\b`).test(street)
                            : false;
                        const streetWithNumber = houseNumber
                            ? (houseNumberAlreadyInStreet ? street : `${street} ${houseNumber}`.trim())
                            : street;
                        const city = String(properties.city ||
                            properties.town ||
                            properties.village ||
                            properties.municipality ||
                            properties.county ||
                            '')
                            .trim();
                        const postcode = String(properties.postcode || '').trim();
                        const formatted = String(properties.formatted || '').trim();
                        const label = formatted || (streetWithNumber
                            ? [streetWithNumber, [postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
                            : '');
                        return {
                            label,
                            postcode,
                            city,
                            name: streetWithNumber || street || label,
                        };
                    })
                        .filter((item) => item.label);
                    const fetchBelgianSuggestions = async (freeQuery: string, includePostalInQuery = true): Promise<AddressSuggestion[]> => {
                        const query = String(freeQuery || '').trim();
                        if (!query || !geoapifyAutocompleteApiKey) {
                            return [];
                        }
                        const text = includePostalInQuery && enteredPostalCode
                            ? `${query} ${enteredPostalCode}`.trim()
                            : query;
                        const params = new URLSearchParams({
                            text,
                            filter: 'countrycode:be',
                            lang: 'fr',
                            limit: '5',
                            format: 'json',
                            apiKey: geoapifyAutocompleteApiKey,
                        });
                        const response = await fetch(`${geoapifyAutocompleteBaseUrl}?${params.toString()}`, {
                            signal: controller.signal,
                        });
                        if (!response.ok) {
                            return [];
                        }
                        const payload = (await response.json()) as {
                            features?: Array<{
                                properties?: {
                                    formatted?: string;
                                    address_line1?: string;
                                    name?: string;
                                    street?: string;
                                    housenumber?: string;
                                    house_number?: string;
                                    postcode?: string;
                                    city?: string;
                                    town?: string;
                                    village?: string;
                                    municipality?: string;
                                    county?: string;
                                };
                            }>;
                        };
                        return normalizeBelgianSuggestions(payload);
                    };
                    const filterByEnteredPostalCode = (items: AddressSuggestion[]) => {
                        if (!enteredPostalCode) {
                            return items;
                        }
                        return items.filter((item) => String(item.postcode || '').replace(/\s+/g, '').startsWith(enteredPostalCode));
                    };
                    let candidateSuggestions = await fetchBelgianSuggestions(normalizedAddressQuery, true);
                    if (candidateSuggestions.length === 0) {
                        candidateSuggestions = await fetchBelgianSuggestions(normalizedAddressQuery, false);
                    }
                    if (candidateSuggestions.length === 0 && streetOnlyQuery) {
                        candidateSuggestions = await fetchBelgianSuggestions(streetOnlyQuery, true);
                        if (candidateSuggestions.length === 0) {
                            candidateSuggestions = await fetchBelgianSuggestions(streetOnlyQuery, false);
                        }
                    }
                    let postalMatchedSuggestions = filterByEnteredPostalCode(candidateSuggestions);
                    nextSuggestions = enteredPostalCode ? postalMatchedSuggestions : candidateSuggestions;
                }
                setSuggestions(nextSuggestions);
            }
            catch {
                setSuggestions([]);
            }
            finally {
                setIsLoadingSuggestions(false);
            }
        }, 350);
        return () => {
            window.clearTimeout(timeoutId);
            controller.abort();
        };
    }, [addressQuery, normalizedCountryCode, showSuggestions, value.postalCode]);
    const handleFieldChange = (key: keyof CheckoutAddress, nextValue: string | undefined) => {
        onFieldChange(key, nextValue);
        onValueChange?.();
    };
    return (<div className="space-y-4">
      <div>
        <h4 className="font-medium text-[var(--sage-deep)]">{title}</h4>
        {description && <p className="mt-1 text-xs text-[var(--sage-deep)]/60">{description}</p>}
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--sage-deep)]">Civilite *</p>
        <div className="mt-2 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
            <input type="radio" checked={value.salutation === 'MME'} onChange={() => handleFieldChange('salutation', 'MME')}/>
            Mme
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
            <input type="radio" checked={value.salutation === 'MR'} onChange={() => handleFieldChange('salutation', 'MR')}/>
            M.
          </label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input className="input-elegant w-full" placeholder={t("app.sections.checkout_page.first_name")} value={value.firstName} onChange={(e) => handleFieldChange('firstName', e.target.value)}/>
        <input className="input-elegant w-full" placeholder="Nom *" value={value.lastName} onChange={(e) => handleFieldChange('lastName', e.target.value)}/>
      </div>

      {showLocationFields && (<div className="grid gap-3 sm:grid-cols-2">
          <CountrySelectField countries={addressCountryOptions} value={value.countryCode} placeholder={t("app.sections.checkout_page.select_country_europe")} searchPlaceholder={t("app.sections.checkout_page.country_search", 'Rechercher un pays')} emptyLabel={t("app.sections.checkout_page.country_empty", 'Aucun pays trouvé.')} onChange={(nextValue) => handleFieldChange('countryCode', nextValue)}/>
          <input className="input-elegant w-full" placeholder={t("app.sections.checkout_page.postal_code_placeholder")} value={value.postalCode} onChange={(e) => handleFieldChange('postalCode', e.target.value)}/>
        </div>)}

      {showAddressFields && (<div className="relative">
          <input className="input-elegant w-full" placeholder={t("app.sections.checkout_page.address")} value={value.address1} onChange={(e) => {
                if (isAddressSuggestionLocked) {
                    setIsAddressSuggestionLocked(false);
                }
                setIsAddressEdited(true);
                handleFieldChange('address1', e.target.value);
            }}/>
          {showSuggestions && (isLoadingSuggestions || prioritizedSuggestions.length > 0) && (<div className="absolute z-10 mt-2 w-full rounded-xl border border-[#EEE6D8] bg-white p-2 shadow">
              {isLoadingSuggestions && (<InlineLoading label={t("app.sections.checkout_page.searching")} textClassName="text-xs text-[var(--sage-deep)]/60"/>)}
              {prioritizedSuggestions.map((suggestion) => (<button key={suggestion.label} type="button" className="block w-full rounded-lg px-3 py-2 text-left text-xs text-[var(--sage-deep)] hover:bg-[#F6F2EA]" onClick={() => {
                        handleFieldChange('address1', suggestion.name || suggestion.label);
                        if (showLocationFields) {
                            handleFieldChange('postalCode', suggestion.postcode || value.postalCode);
                            handleFieldChange('city', suggestion.city || value.city);
                        }
                        setIsAddressSuggestionLocked(true);
                        setSuggestions([]);
                    }}>
                  {suggestion.label}
                </button>))}
            </div>)}
        </div>)}

      {showLocationFields && (<input className="input-elegant w-full" placeholder="Ville *" value={value.city} onChange={(e) => handleFieldChange('city', e.target.value)}/>)}

      {showAddressFields && (<input className="input-elegant w-full" placeholder="Complement (optionnel)" value={value.address2 || ''} onChange={(e) => handleFieldChange('address2', e.target.value)}/>)}

      <PhoneField value={value.phoneE164} onChange={(nextPhoneValue) => handleFieldChange('phoneE164', nextPhoneValue)} autoCountryCode={value.countryCode} searchPlaceholder={t("app.sections.checkout_page.phone_country_search", 'Rechercher un pays ou un indicatif')} emptyLabel={t("app.sections.checkout_page.phone_country_empty", 'Aucun indicatif trouvé.')} placeholderFallback={t("app.sections.checkout_page.phone_local_placeholder", '6 12 34 56 78')}/>

      <p className="text-[11px] text-[var(--sage-deep)]/55">(*) champs obligatoires</p>
    </div>);
};
export default function CheckoutPage() {
    const { customer, isLoading: isAuthLoading } = useAuth();
    const { cartItems, cartSubtotal, cartSummary, cartMessages } = useBlend();
    const blendSubscriptionItems = useMemo(() => cartItems.filter((item) => item.itemType === 'BLEND' && item.purchaseMode === 'SUBSCRIPTION'), [cartItems]);
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
    const [shippingQuote, setShippingQuote] = useState({
        shippingCents: 0,
        defaultShippingCents: 0,
        supportsRelay: true,
        mode: 'HOME' as ShippingMode,
    });
    const [allowedShippingCountries, setAllowedShippingCountries] = useState<string[]>(Array.from(DELIVERY_COUNTRY_CODES));
    const relayCountryOptions = useMemo<CountryOption[]>(() => filterCountryOptions(DELIVERY_COUNTRY_CODES, allowedShippingCountries), [allowedShippingCountries]);
    const paymentContainerRef = useRef<HTMLDivElement | null>(null);
    const expressContainerRef = useRef<HTMLDivElement | null>(null);
    const stripeRef = useRef<StripeInstance | null>(null);
    const stripeElementsRef = useRef<StripeElementsInstance | null>(null);
    const paymentElementRef = useRef<StripeElement | null>(null);
    const expressElementRef = useRef<StripeElement | null>(null);
    const relayMapContainerRef = useRef<HTMLDivElement | null>(null);
    const relayMapRef = useRef<L.Map | null>(null);
    const relayMarkersLayerRef = useRef<L.LayerGroup | null>(null);
    const relayMapScrollHandlersRef = useRef<{
        container: HTMLElement;
        onMouseEnter: () => void;
        onMouseLeave: () => void;
    } | null>(null);
    const paymentSectionRef = useRef<HTMLDivElement | null>(null);
    const subtotalCents = cartSummary?.subtotalCents ?? Math.round(cartSubtotal * 100);
    const subtotalDiscountCents = cartSummary?.discountLines
        ?.filter((line) => line.type !== 'FREE_SHIPPING')
        ?.reduce((sum, line) => sum + line.amountCents, 0) ?? 0;
    const shippingDiscountCents = cartSummary?.discountLines
        ?.filter((line) => line.type === 'FREE_SHIPPING')
        ?.reduce((sum, line) => sum + line.amountCents, 0) ?? 0;
    const isInitialCartLoading =
        (isAuthLoading || (Boolean(customer?.id) && cartItems.length === 0 && !cartSummary && cartMessages.length === 0));
    const supportsRelay = shippingQuote.supportsRelay !== false;
    const quotedShippingCents = Math.max(0, shippingQuote.shippingCents || 0);
    const effectiveShippingCents = Math.max(0, quotedShippingCents - shippingDiscountCents);
    const originalShippingCents = Math.max(0, effectiveShippingCents + shippingDiscountCents);
    const previewTotalCents = Math.max(0, subtotalCents + effectiveShippingCents - subtotalDiscountCents);
    const shouldUseSameBilling = shippingMode === 'HOME' && useSameBilling;
    const blendSubscriptionSummary = useMemo(() => blendSubscriptionItems.map((item) => ({
        id: item.id,
        title: item.name,
        cadence: item.subscriptionIntervalCount === 2
            ? t("app.sections.account.account_subscriptions.every_two_months")
            : item.subscriptionIntervalCount === 3
                ? t("app.sections.account.account_subscriptions.every_three_months")
                : t("app.sections.account.account_subscriptions.every_month"),
        recurringTotalCents: Math.max(0, Math.round(item.price * 100)),
        basePriceCents: item.basePriceCents || Math.max(0, Math.round(item.price * 100)),
    })), [blendSubscriptionItems]);
    const otherItemsSummary = useMemo(() => cartItems
        .filter((item) => item.itemType !== 'SUBSCRIPTION' && item.purchaseMode !== 'SUBSCRIPTION')
        .map((item) => ({
        id: item.id,
        title: item.name,
        quantity: Math.max(1, item.quantity || 1),
        totalCents: Math.max(0, Math.round(item.price * 100)) * Math.max(1, item.quantity || 1),
    })), [cartItems]);
    const recurringOverviewLabel = useMemo(() => blendSubscriptionSummary
        .map((item) => `${item.title} · ${item.cadence}`)
        .join(' • '), [blendSubscriptionSummary]);
    void recurringOverviewLabel;
    const mappableRelayPoints = useMemo(() => relayPoints.filter((point) => typeof point.latitude === 'number' &&
        Number.isFinite(point.latitude) &&
        typeof point.longitude === 'number' &&
        Number.isFinite(point.longitude)), [relayPoints]);
    const shouldShowRelayMap = shippingMode === 'RELAY' && mappableRelayPoints.length > 0;
    const selectedOffer = useMemo(() => shippingOffers.find((offer) => offer.mode === shippingMode) || null, [shippingMode, shippingOffers]);
    useEffect(() => {
        const storedSelection = readStoredShippingSelection();
        if (storedSelection?.mode === 'HOME' || storedSelection?.mode === 'RELAY') {
            setShippingMode(storedSelection.mode);
        }
        if (storedSelection?.countryCode || storedSelection?.postalCode || storedSelection?.city) {
            setShippingAddress((prev) => ({
                ...prev,
                countryCode: String(storedSelection.countryCode || prev.countryCode || 'FR').toUpperCase(),
                postalCode: String(storedSelection.postalCode || prev.postalCode || '').trim(),
                city: String(storedSelection.city || prev.city || '').trim(),
            }));
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
        if (!isShippingSelectionHydrated)
            return;
        try {
            const payload: ShippingSelection = {
                mode: shippingMode,
                offerId: selectedOffer?.id || undefined,
                offerCode: selectedOffer?.code,
                offerLabel: selectedOffer?.label,
                countryCode: String(shippingAddress.countryCode || '').trim().toUpperCase() || undefined,
                postalCode: String(shippingAddress.postalCode || '').trim() || undefined,
                city: String(shippingAddress.city || '').trim() || undefined,
                relayPoint: selectedRelay || null,
            };
            localStorage.setItem(CHECKOUT_SHIPPING_STORAGE_KEY, JSON.stringify(payload));
            window.dispatchEvent(new Event('shipping-changed'));
        }
        catch {
            // ignore
        }
    }, [
        isShippingSelectionHydrated,
        selectedOffer?.id,
        selectedOffer?.code,
        selectedOffer?.label,
        selectedRelay,
        shippingAddress.city,
        shippingAddress.countryCode,
        shippingAddress.postalCode,
        shippingMode,
    ]);
    useEffect(() => {
        if (!supportsRelay && shippingMode === 'RELAY' && !selectedRelay) {
            setShippingMode('HOME');
            setSelectedRelay(null);
            setRelayPoints([]);
            setHasSearchedRelayPoints(false);
        }
    }, [selectedRelay, shippingMode, supportsRelay]);
    useEffect(() => {
        if (shippingMode === 'RELAY' && useSameBilling) {
            setUseSameBilling(false);
        }
    }, [shippingMode, useSameBilling]);
    useEffect(() => {
        if (isInitialCartLoading)
            return;
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
                    const nextAllowedCountries = normalizedAllowedCountries.filter((country) => DELIVERY_COUNTRY_CODES.includes(country as 'FR' | 'BE'));
                    setAllowedShippingCountries(nextAllowedCountries.length > 0 ? nextAllowedCountries : Array.from(DELIVERY_COUNTRY_CODES));
                }
            }
            catch {
                if (!isCancelled) {
                    setShippingOffers([]);
                    setAllowedShippingCountries(Array.from(DELIVERY_COUNTRY_CODES));
                }
            }
            if (!customer?.email)
                return;
            try {
                const response = await api.getAccountAddresses();
                if (isCancelled)
                    return;
                const addresses = response?.addresses || [];
                const shipping = addresses.find((item) => item.isDefaultShipping) || addresses[0];
                const billing = addresses.find((item) => item.isDefaultBilling) || shipping;
                if (shipping)
                    setShippingAddress(mapAccountAddress(shipping));
                if (billing)
                    setBillingAddress(mapAccountAddress(billing));
                setDefaultShippingAddressId(shipping?.id || null);
                setDefaultBillingAddressId(billing?.id || shipping?.id || null);
            }
            catch {
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
        const loadShippingQuote = async () => {
            try {
                const quote = await api.getShippingQuote({
                    mode: shippingMode,
                    offerCode: selectedOffer?.code,
                    countryCode: String(shippingAddress.countryCode || '').trim().toUpperCase() || undefined,
                    postalCode: String(shippingAddress.postalCode || '').trim() || undefined,
                    city: String(shippingAddress.city || '').trim() || undefined,
                });
                if (isCancelled)
                    return;
                setShippingQuote({
                    shippingCents: Math.max(0, quote?.shippingCents ?? 0),
                    defaultShippingCents: Math.max(0, quote?.defaultShippingCents ?? 0),
                    supportsRelay: quote?.supportsRelay !== false,
                    mode: quote?.mode === 'RELAY' ? 'RELAY' : 'HOME',
                });
            }
            catch {
                // Keep the latest known quote until next successful refresh.
            }
        };
        void loadShippingQuote();
        return () => {
            isCancelled = true;
        };
    }, [selectedOffer?.code, shippingAddress.city, shippingAddress.countryCode, shippingAddress.postalCode, shippingMode]);
    useEffect(() => {
        if (shippingMode !== 'RELAY') {
            setRelayCitySuggestions([]);
            return;
        }
        const lookupContext = resolvePostalCityLookupContext(shippingAddress.countryCode, shippingAddress.postalCode);
        if (!lookupContext.canLookup) {
            setRelayCitySuggestions([]);
            return;
        }
        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            try {
                const suggestions = await fetchCitySuggestionsByPostalCode({
                    countryCode: lookupContext.countryCode,
                    postalCode: lookupContext.postalCode,
                    signal: controller.signal,
                });
                setRelayCitySuggestions(suggestions);
                if (suggestions.length > 0) {
                    setShippingAddress((prev) => ({ ...prev, city: suggestions[0] }));
                }
            }
            catch {
                setRelayCitySuggestions([]);
            }
        }, 250);
        return () => {
            window.clearTimeout(timeoutId);
            controller.abort();
        };
    }, [shippingMode, shippingAddress.countryCode, shippingAddress.postalCode]);
    useEffect(() => {
        if (!shouldShowRelayMap)
            return;
        if (!relayMapContainerRef.current)
            return;
        if (relayMapRef.current && relayMapRef.current.getContainer() !== relayMapContainerRef.current) {
            if (relayMapScrollHandlersRef.current) {
                const { container, onMouseEnter, onMouseLeave } = relayMapScrollHandlersRef.current;
                container.removeEventListener('mouseenter', onMouseEnter);
                container.removeEventListener('mouseleave', onMouseLeave);
                relayMapScrollHandlersRef.current = null;
            }
            relayMapRef.current.remove();
            relayMapRef.current = null;
            relayMarkersLayerRef.current = null;
        }
        if (!relayMapRef.current) {
            const map = L.map(relayMapContainerRef.current, {
                scrollWheelZoom: false,
            });
            const mapContainer = map.getContainer();
            const onMouseEnter = () => {
                map.scrollWheelZoom.enable();
            };
            const onMouseLeave = () => {
                map.scrollWheelZoom.disable();
            };
            mapContainer.addEventListener('mouseenter', onMouseEnter);
            mapContainer.addEventListener('mouseleave', onMouseLeave);
            relayMapScrollHandlersRef.current = {
                container: mapContainer,
                onMouseEnter,
                onMouseLeave,
            };
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
            }).addTo(map);
            relayMapRef.current = map;
            relayMarkersLayerRef.current = L.layerGroup().addTo(map);
        }
        const map = relayMapRef.current;
        const markers = relayMarkersLayerRef.current;
        if (!map || !markers)
            return;
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
        }
        else {
            map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24] });
        }
        window.setTimeout(() => map.invalidateSize(), 0);
    }, [mappableRelayPoints, selectedRelay?.id, shouldShowRelayMap]);
    useEffect(() => {
        if (shouldShowRelayMap) {
            return;
        }
        if (relayMapScrollHandlersRef.current) {
            const { container, onMouseEnter, onMouseLeave } = relayMapScrollHandlersRef.current;
            container.removeEventListener('mouseenter', onMouseEnter);
            container.removeEventListener('mouseleave', onMouseLeave);
            relayMapScrollHandlersRef.current = null;
        }
        if (relayMapRef.current) {
            relayMapRef.current.remove();
            relayMapRef.current = null;
        }
        relayMarkersLayerRef.current = null;
    }, [shouldShowRelayMap]);
    useEffect(() => () => {
        if (relayMapScrollHandlersRef.current) {
            const { container, onMouseEnter, onMouseLeave } = relayMapScrollHandlersRef.current;
            container.removeEventListener('mouseenter', onMouseEnter);
            container.removeEventListener('mouseleave', onMouseLeave);
            relayMapScrollHandlersRef.current = null;
        }
        if (relayMapRef.current) {
            relayMapRef.current.remove();
            relayMapRef.current = null;
        }
        relayMarkersLayerRef.current = null;
    }, []);
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
                    setError(t("app.lib.api_errors.stripe_publishable_key_missing"));
                    return;
                }
                await loadStripeJs();
                if (isCancelled)
                    return;
                if (!window.Stripe) {
                    setError(t("app.sections.checkout_page.failed_load_stripe"));
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
                        expressElement.on?.('ready', (event: {
                            availablePaymentMethods?: Record<string, unknown> | null;
                        }) => {
                            if (isCancelled)
                                return;
                            const available = event?.availablePaymentMethods;
                            const hasMethods = Boolean(available && Object.keys(available).length > 0);
                            setHasExpressMethods(hasMethods);
                        });
                        expressElement.on?.('confirm', async () => {
                            if (isCancelled)
                                return;
                            if (!stripeRef.current || !stripeElementsRef.current)
                                return;
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
                                    setError(result.error.message || t("app.sections.checkout_page.payment_echoue"));
                                }
                            }
                            finally {
                                if (!isCancelled) {
                                    setIsSubmittingPayment(false);
                                }
                            }
                        });
                        expressElement.mount(expressContainerRef.current);
                        expressElementRef.current = expressElement;
                    }
                    catch {
                        expressElementRef.current = null;
                        setHasExpressMethods(false);
                    }
                }
                setIsStripeReady(true);
            }
            catch {
                if (!isCancelled) {
                    setError(t("app.sections.checkout_page.failed_load_stripe"));
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
            }
            catch {
                // ignore
            }
            expressElementRef.current = null;
            try {
                paymentElementRef.current?.unmount?.();
                paymentElementRef.current?.destroy?.();
            }
            catch {
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
        if (!shouldScrollToPaymentSection || !clientSecret || !isStripeReady)
            return;
        const timeoutId = window.setTimeout(() => {
            const section = paymentSectionRef.current;
            if (!section)
                return;
            const targetTop = Math.max(0, section.getBoundingClientRect().top + window.scrollY - 110);
            window.scrollTo({ top: targetTop, behavior: 'smooth' });
            setShouldScrollToPaymentSection(false);
        }, 80);
        return () => window.clearTimeout(timeoutId);
    }, [clientSecret, isStripeReady, shouldScrollToPaymentSection]);
    const updateShippingField = (key: keyof CheckoutAddress, value: string | undefined) => {
        const nextValue = key === 'salutation' ? value : value ?? '';
        setShippingAddress((prev) => {
            if (key === 'countryCode') {
                const previousCountry = String(prev.countryCode || '').trim().toUpperCase();
                const nextCountry = String(nextValue || '').trim().toUpperCase();
                if (previousCountry !== nextCountry) {
                    return {
                        ...prev,
                        countryCode: nextCountry,
                        postalCode: '',
                        city: '',
                        address1: '',
                        address2: '',
                    } as CheckoutAddress;
                }
                return { ...prev, countryCode: nextCountry } as CheckoutAddress;
            }
            return { ...prev, [key]: nextValue } as CheckoutAddress;
        });
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
            setError(t("app.sections.checkout_page.shipping_pickup_point"));
            return;
        }
        if (!shippingAddress.postalCode.trim() || !shippingAddress.countryCode.trim()) {
            setError(t("app.sections.checkout_page.code_postal_country"));
            return;
        }
        const normalizedCountryCode = String(shippingAddress.countryCode || '').trim().toUpperCase();
        if (!allowedShippingCountries.includes(normalizedCountryCode)) {
            setError(`${t("app.lib.api_errors.country_not_supported")} ${t("app.lib.api_errors.allowed_countries")} ${allowedShippingCountries.join(', ')}`);
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
            const points = response?.data ||
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
        }
        catch {
            setRelayPoints([]);
            setError(t("app.sections.checkout_page.failed_load_points"));
        }
        finally {
            setRelayLoading(false);
        }
    };
    const preparePayment = async () => {
        const normalizedShippingCountryCode = String(shippingAddress.countryCode || '').trim().toUpperCase();
        if (!allowedShippingCountries.includes(normalizedShippingCountryCode)) {
            setError(`${t("app.lib.api_errors.country_not_supported")} ${t("app.lib.api_errors.allowed_countries")} ${allowedShippingCountries.join(', ')}`);
            return;
        }
        if (shippingMode === 'RELAY' && !selectedRelay) {
            setError(t("app.sections.checkout_page.please_select_pickup"));
            return;
        }
        if (shippingMode === 'RELAY' && !selectedOffer?.code) {
            setError(t("app.sections.checkout_page.shipping_pickup_point"));
            return;
        }
        const checkoutShippingAddress = shippingMode === 'RELAY'
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
                    }
                    else if (shouldUseSameBilling && saveBillingAddress) {
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
                }
                catch (saveError) {
                    console.error('Failed to save preferred checkout addresses', saveError);
                }
            }
            const response = await api.createCheckoutPaymentIntent({
                appliedDiscountCode: cartSummary?.appliedCode || undefined,
                comment: comment.trim() || undefined,
                shippingSelection: {
                    mode: shippingMode,
                    offerId: selectedOffer?.id || undefined,
                    offerCode: selectedOffer?.code,
                    offerLabel: selectedOffer?.label,
                    countryCode: checkoutShippingAddress.countryCode,
                    postalCode: checkoutShippingAddress.postalCode,
                    city: checkoutShippingAddress.city,
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
            setError(t("app.sections.checkout_page.failed_preparer_payment"));
        }
        catch (e: any) {
            setError(e?.message || t("app.sections.checkout_page.failed_preparer_payment"));
        }
        finally {
            setIsPreparingPayment(false);
        }
    };
    const submitPayment = async () => {
        if (isSubmittingPayment)
            return;
        if (!stripeRef.current || !stripeElementsRef.current || !isStripeReady) {
            setError(t("app.sections.checkout_page.stripe_cours_loading"));
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
                setError(result.error.message || t("app.sections.checkout_page.payment_echoue"));
            }
        }
        finally {
            setIsSubmittingPayment(false);
        }
    };
    const renderContinueToPaymentButton = () => (<button type="button" className="w-full btn-primary" onClick={() => {
            setShouldScrollToPaymentSection(true);
            void preparePayment();
        }} disabled={isPreparingPayment}>
      {isPreparingPayment ? t("app.sections.checkout_page.preparation_payment") : t("app.sections.checkout_page.continue_payment")}
    </button>);
    return (<div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation hidePrimaryNav/>
      <main className="pt-28 pb-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-6">
            <h2 className="font-display text-3xl text-[var(--sage-deep)]">{t("app.sections.checkout_page.shipping_payment_2")}</h2>
            <p className="text-sm text-[var(--sage-deep)]/70 mt-2">
              {t("app.sections.checkout_page.renseignez_addresses_then")}
            </p>
            <div className="mt-6 mx-auto w-full max-w-4xl px-4">
              <div className="relative flex w-full items-center justify-center gap-[5rem]">
                <span className="pointer-events-none absolute left-10 right-10 top-1/2 -translate-y-1/2 border-t border-[#E5E0D5]"/>

                <a href="/cart" className="relative z-10 inline-flex min-w-[11rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-white px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]/80 transition hover:border-[var(--gold-antique)] hover:text-[var(--sage-deep)]">{t("app.sections.checkout_page.cart")}</a>

                <a href="/checkout" aria-current="step" className="relative z-10 inline-flex min-w-[15rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-[var(--gold-antique)] px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]">{t("app.sections.checkout_page.shipping_payment")}</a>

                <span className="relative z-10 inline-flex min-w-[11rem] items-center justify-center rounded-full border border-[#E5E0D5] bg-white px-6 py-2.5 text-sm font-medium text-[var(--sage-deep)]/70">
                  {t("app.sections.checkout_page.confirmation_step")}
                </span>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <section className="lg:col-span-2 space-y-5">
              <div className="bg-white rounded-2xl p-5 shadow space-y-4">
                <h3 className="font-medium text-[var(--sage-deep)]">{t("app.sections.checkout_page.mode_shipping")}</h3>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
                    <input type="radio" checked={shippingMode === 'HOME'} onChange={() => {
            setShippingMode('HOME');
            setSelectedRelay(null);
            setRelayPoints([]);
            setHasSearchedRelayPoints(false);
            resetPayment();
        }}/>
                    <span className="inline-flex items-center gap-1.5">
                      <Home className="h-4 w-4 text-[var(--gold-antique)]" aria-hidden="true"/>
                      {t("app.sections.checkout_page.home_delivery")}
                    </span>
                  </label>
                  {supportsRelay && (<label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
                      <input type="radio" checked={shippingMode === 'RELAY'} onChange={() => {
                setShippingMode('RELAY');
                setSelectedRelay(null);
                setRelayPoints([]);
                setHasSearchedRelayPoints(false);
                resetPayment();
            }}/>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-[var(--gold-antique)]" aria-hidden="true"/>
                        {t("app.sections.checkout_page.relay_point")}
                      </span>
                    </label>)}
                </div>
                {shippingMode === 'RELAY' && (<div className="space-y-3">
                    <div className="grid sm:grid-cols-3 gap-3">
                      <CountrySelectField countries={relayCountryOptions} value={shippingAddress.countryCode} placeholder={t("app.sections.checkout_page.select_country_europe")} searchPlaceholder={t("app.sections.checkout_page.country_search", 'Rechercher un pays')} emptyLabel={t("app.sections.checkout_page.country_empty", 'Aucun pays trouvé.')} onChange={(value) => {
                updateShippingField('countryCode', value);
                setSelectedRelay(null);
                setRelayPoints([]);
                setHasSearchedRelayPoints(false);
                resetPayment();
            }}/>
                      <input className="input-elegant w-full" placeholder={t("app.sections.checkout_page.postal_code_placeholder")} value={shippingAddress.postalCode} onChange={(e) => {
                updateShippingField('postalCode', e.target.value);
                setSelectedRelay(null);
                setRelayPoints([]);
                setHasSearchedRelayPoints(false);
                resetPayment();
            }}/>
                      <input className="input-elegant w-full" placeholder={t("app.sections.checkout_page.city_optional")} list="relay-city-suggestions" value={shippingAddress.city} onChange={(e) => {
                updateShippingField('city', e.target.value);
                setSelectedRelay(null);
                setRelayPoints([]);
                setHasSearchedRelayPoints(false);
                resetPayment();
            }}/>
                    </div>
                    <datalist id="relay-city-suggestions">
                      {relayCitySuggestions.map((city) => (<option key={city} value={city}/>))}
                    </datalist>
                    <button type="button" className="btn-secondary relative inline-flex items-center justify-center" onClick={searchRelayPoints} disabled={relayLoading}>
                      <span className={relayLoading ? 'invisible' : 'visible'}>{t("app.sections.checkout_page.search_pickup_point")}</span>
                      {relayLoading && (<span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                          <InlineLoading label={t("app.sections.checkout_page.searching")} className="items-center justify-center" textClassName="text-sm text-[var(--sage-deep)]"/>
                        </span>)}
                    </button>
                    {shouldShowRelayMap && (<div className="h-64 w-full overflow-hidden rounded-xl border border-[#E5E0D5]">
                        <div ref={relayMapContainerRef} className="h-full w-full"/>
                      </div>)}
                    {relayPoints.length > 0 && mappableRelayPoints.length === 0 && (<p className="text-xs text-[var(--sage-deep)]/70">{t("app.sections.checkout_page.points_point_ont")}</p>)}
                    {relayPoints.length > 0 && (<div className="space-y-2 max-h-52 overflow-auto">
                        {relayPoints.map((point) => (<button key={point.id} type="button" onClick={() => { setSelectedRelay(point); resetPayment(); }} className={`w-full text-left border rounded-md p-2 text-xs ${selectedRelay?.id === point.id ? 'border-[var(--gold-antique)] bg-[var(--cream-apothecary)]' : 'border-[#E5E0D5]'}`}>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                              <div className="space-y-1">
                                <div className="font-medium text-[var(--sage-deep)]">{point.name || point.id}</div>
                                <div className="text-[var(--sage-deep)]/70">{point.address1} {point.address2}</div>
                                <div className="text-[var(--sage-deep)]/70">{point.postalCode} {point.city}</div>
                              </div>
                              <div className="space-y-1 text-[11px] text-[var(--sage-deep)]/70">
                                <div className="font-medium underline text-[var(--sage-deep)]">{t("app.sections.checkout_page.opening_hours")}</div>
                                {OPENING_DAY_ORDER.slice(0, 3).map((day) => (<div key={`${point.id}-${day}`} className="flex items-start gap-2">
                                    <span className="min-w-[50px] font-medium">{OPENING_DAY_LABELS[day]}</span>
                                    <span>{formatOpeningDaySlots(point.openingDays?.[day])}</span>
                                  </div>))}
                              </div>
                              <div className="space-y-1 text-[11px] text-[var(--sage-deep)]/70">
                                {OPENING_DAY_ORDER.slice(3).map((day) => (<div key={`${point.id}-${day}`} className="flex items-start gap-2">
                                    <span className="min-w-[50px] font-medium">{OPENING_DAY_LABELS[day]}</span>
                                    <span>{formatOpeningDaySlots(point.openingDays?.[day])}</span>
                                  </div>))}
                              </div>
                            </div>
                          </button>))}
                      </div>)}
                    {selectedRelay && (<>
                      <h3 className="font-medium text-[var(--sage-deep)]">{t("app.sections.checkout_page.pickup_point_selected_2")}</h3>
                      <div className="rounded-xl border border-[var(--cream-apothecary)] bg-[var(--gold-antique)] px-3 py-2 text-xs text-[var(--sage-deep)]">
                        <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div className="space-y-1">
                            <div className="font-medium">{selectedRelay.name || selectedRelay.id}</div>
                            <div className="text-[var(--sage-deep)]/70">
                              {selectedRelay.address1} {selectedRelay.address2}
                            </div>
                            <div className="text-[var(--sage-deep)]/70">
                              {selectedRelay.postalCode} {selectedRelay.city}
                            </div>
                          </div>
                          <div className="space-y-1 text-[11px] text-[var(--sage-deep)]/70">
                            <div className="font-medium underline text-[var(--sage-deep)]">{t("app.sections.checkout_page.opening_hours")}</div>
                            {OPENING_DAY_ORDER.slice(0, 3).map((day) => (<div key={`selected-${selectedRelay.id}-${day}`} className="flex items-start gap-2">
                                <span className="min-w-[50px] font-medium">{OPENING_DAY_LABELS[day]}</span>
                                <span>{formatOpeningDaySlots(selectedRelay.openingDays?.[day])}</span>
                              </div>))}
                          </div>
                          <div className="space-y-1 text-[11px] text-[var(--sage-deep)]/70">
                            {OPENING_DAY_ORDER.slice(3).map((day) => (<div key={`selected-${selectedRelay.id}-${day}`} className="flex items-start gap-2">
                                <span className="min-w-[50px] font-medium">{OPENING_DAY_LABELS[day]}</span>
                                <span>{formatOpeningDaySlots(selectedRelay.openingDays?.[day])}</span>
                              </div>))}
                          </div>
                        </div>
                      </div>
                      </>)}
                    {hasSearchedRelayPoints && relayPoints.length === 0 && !relayLoading && (<p className="text-xs text-[var(--sage-deep)]/70">{t("app.sections.checkout_page.none_pickup_point")}</p>)}
                  </div>)}
              </div>

              {shippingMode === 'HOME' && (<div className="bg-white rounded-2xl p-5 shadow space-y-4">
                  <CheckoutAddressForm title={t("app.sections.checkout_page.address_shipping")} description={t("app.sections.checkout_page.formulaire_home_meme")} value={shippingAddress} onFieldChange={updateShippingField} onValueChange={resetPayment} suppressInitialAddressSuggestions allowedCountryCodes={allowedShippingCountries}/>
                  {customer?.email && (<label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
                      <input type="checkbox" checked={saveHomeShippingAddress} onChange={(e) => setSaveHomeShippingAddress(e.target.checked)}/>{t("app.sections.checkout_page.save_address_comme_2")}</label>)}
                </div>)}

              {shippingMode === 'RELAY' && (<div className="bg-white rounded-2xl p-5 shadow space-y-4">
                  <CheckoutAddressForm title={t("app.sections.checkout_page.coordonnees_destinataire")} description={t("app.sections.checkout_page.pickup_point_selected")} value={shippingAddress} onFieldChange={updateShippingField} onValueChange={resetPayment} showLocationFields={false} showAddressFields={false}/>
                  <p className="text-xs text-[var(--sage-deep)]/60">{t("app.sections.checkout_page.country_code_postal")}</p>
                </div>)}

              <div className="bg-white rounded-2xl p-5 shadow space-y-4">
                {shippingMode === 'HOME' ? (<label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
                    <input type="checkbox" checked={useSameBilling} onChange={(e) => {
                setUseSameBilling(e.target.checked);
                resetPayment();
            }}/>{t("app.sections.checkout_page.utiliser_meme_address")}</label>) : (<p className="text-sm text-[var(--sage-deep)]/70">{t("app.sections.checkout_page.pickup_point_address")}</p>)}

                {!shouldUseSameBilling && (<CheckoutAddressForm title={t("app.sections.checkout_page.address_billing")} value={billingAddress} onFieldChange={updateBillingField} onValueChange={resetPayment} suppressInitialAddressSuggestions/>)}

                {shouldUseSameBilling && (<div className="rounded-xl border border-[#E5E0D5] bg-[#FAF8F3] px-3 py-2 text-xs text-[var(--sage-deep)]/70">{t("app.sections.checkout_page.billing_utilisera_meme")}</div>)}

                {customer?.email && (<label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
                    <input type="checkbox" checked={saveBillingAddress} onChange={(e) => setSaveBillingAddress(e.target.checked)}/>{t("app.sections.checkout_page.save_address_comme")}</label>)}
              </div>

              <div className="bg-white rounded-2xl p-5 shadow space-y-3">
                <h3 className="font-medium text-[var(--sage-deep)]">{t("app.sections.checkout_page.instruction_special")}</h3>
                <textarea value={comment} onChange={(e) => { setComment(e.target.value); resetPayment(); }} placeholder={t("app.sections.checkout_page.instruction_special_vendeur")} className="w-full min-h-[96px] p-3 border border-[#E5E0D5] rounded-md resize-vertical"/>
              </div>

              {!clientSecret && renderContinueToPaymentButton()}

              {clientSecret && (<div ref={paymentSectionRef} className="rounded-2xl border border-[#E5E0D5] bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 font-medium text-[var(--sage-deep)]">
                      <span>{t("app.sections.checkout_page.secure_payment_by")}</span>
                      <StripeWordmark className="h-5" />
                    </h3>
                    <button type="button" className="text-xs text-[var(--gold-antique)] hover:underline" onClick={resetPayment}>{t("app.sections.checkout_page.edit_my_informations")}</button>
                  </div>
                  <div className="rounded-2xl border border-[#E5E0D5] bg-white p-4" ref={expressContainerRef}/>
                  {hasExpressMethods === false && (<div className="text-xs text-[var(--sage-deep)]/60">
                      {t("app.sections.checkout_page.express_payments_unavailable")}
                    </div>)}
                  <div className="rounded-2xl border border-[#E5E0D5] bg-white p-4" ref={paymentContainerRef}/>
                  <button type="button" className="w-full btn-primary disabled:opacity-60" onClick={submitPayment} disabled={!isStripeReady || isSubmittingPayment}>
                    {isSubmittingPayment
                        ? t("app.sections.checkout_page.payment_cours")
                        : t("app.sections.checkout_page.pay_my_order")}
                  </button>
                </div>)}

              {error && (<div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>)}
            </section>

            <aside className="lg:col-span-1">
              <div className="space-y-4 lg:sticky lg:top-24">
                <div className="bg-white rounded-2xl p-5 shadow space-y-3">
                  <h3 className="font-medium text-[var(--sage-deep)]">{t("app.sections.checkout_page.summary")}</h3>
                  {blendSubscriptionSummary.length > 0 && (<div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold-antique)]">
                        {t("app.sections.checkout_page.subscription_items_title")}
                      </div>
                      <div className="rounded-xl border border-[var(--gold-antique)]/25 bg-[color-mix(in_srgb,var(--gold-antique)_10%,white)] text-xs text-[var(--sage-deep)]/75">{blendSubscriptionSummary.map((item, index) => (<div key={item.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${index > 0 ? 'border-t border-[var(--gold-antique)]/15' : ''}`}>
                          
                            <div>
                              <div className="font-medium text-[var(--sage-deep)]">{item.title}</div>
                              <div>{item.cadence}</div>
                            </div>
                            <div className="shrink-0 whitespace-nowrap text-right">
                              {item.basePriceCents > item.recurringTotalCents && (<div className="text-[11px] text-[var(--sage-deep)]/45 line-through">
                                  {(item.basePriceCents / 100).toFixed(2)} €
                                </div>)}
                              <div className="font-medium text-[var(--sage-deep)]">{(item.recurringTotalCents / 100).toFixed(2)} €</div>
                            </div>
                          </div>
                        ))}</div>
                    </div>)}
                  {otherItemsSummary.length > 0 && (<div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--sage-deep)]/55">
                        {t("app.sections.checkout_page.other_items_title")}
                      </div>
                      <div className="rounded-xl border border-[#E5E0D5] bg-[#FAF8F3] text-xs text-[var(--sage-deep)]/75">{otherItemsSummary.map((item, index) => (<div key={item.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${index > 0 ? 'border-t border-[#E5E0D5]' : ''}`}>
                          
                            <div className="font-medium text-[var(--sage-deep)]">{item.title} × {item.quantity}</div>
                            <div className="shrink-0 whitespace-nowrap font-medium text-[var(--sage-deep)]">
                              {(item.totalCents / 100).toFixed(2)} &euro;
                            </div>
                          </div>
                        ))}</div>
                    </div>)}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--sage-deep)]/60">{t("app.sections.checkout_page.subtotal")}</span>
                    <span className="text-[var(--sage-deep)]">{(subtotalCents / 100).toFixed(2)} &euro;</span>
                  </div>
                {subtotalDiscountCents > 0 && (<div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--sage-deep)]/60">{t("app.sections.checkout_page.discounts")}</span>
                    <span className="text-[var(--gold-antique)]">- {(subtotalDiscountCents / 100).toFixed(2)} &euro;</span>
                  </div>)}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--sage-deep)]/60">{t("app.sections.checkout_page.shipping_2")}</span>
                  <div className="text-sm font-medium text-[var(--sage-deep)]">
                    {effectiveShippingCents === 0 ? (originalShippingCents > 0 ? (<span>
                          <span className="line-through text-[var(--sage-deep)]/40 mr-2">
                            {(originalShippingCents / 100).toFixed(2)} €
                          </span>
                          <span className="text-[var(--gold-antique)]">{t("app.sections.checkout_page.free")}</span>
                        </span>) : (t("app.sections.checkout_page.free"))) : (`${(effectiveShippingCents / 100).toFixed(2)} €`)}
                  </div>
                </div>
                  <div className="border-t border-[#E5E0D5] pt-3 flex items-center justify-between">
                    <span className="text-[var(--sage-deep)]/70">{t("app.sections.checkout_page.total_incl_tax")}</span>
                    <span className="font-display text-xl text-[var(--gold-antique)]">{(previewTotalCents / 100).toFixed(2)} &euro;</span>
                  </div>
                </div>
                <ShippingInfoAccordion />
                {!clientSecret && renderContinueToPaymentButton()}
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer hideMainSection hideNewsletterSection/>
    </div>);
}
