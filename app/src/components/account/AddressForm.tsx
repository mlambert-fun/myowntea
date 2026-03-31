import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AccountAddress } from '@/api/client';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { InlineLoading } from '@/components/ui/loading-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { t } from "@/lib/i18n";
import { DELIVERY_COUNTRY_CODES } from '@/lib/countries';
import {
    DEFAULT_PHONE_COUNTRY_CODE,
    buildPhoneE164,
    extractPhoneDigits,
    getPhoneDialCode,
    getPhonePlaceholder,
    isPhoneCountrySupported,
    isValidPhoneE164,
    normalizeCountryCode,
    normalizePhoneInput,
    parsePhoneE164,
} from '@/lib/phone';
import { cn } from '@/lib/utils';
const schema = z.object({
    salutation: z.enum(['MME', 'MR']).optional(),
    firstName: z.string().min(1, t("app.components.account.address_form.first_name_required")),
    lastName: z.string().min(1, 'Nom requis'),
    countryCode: z.string().min(2, 'Pays requis'),
    postalCode: z.string().min(1, 'Code postal requis'),
    city: z.string().min(1, 'Ville requise'),
    hamlet: z.string().optional(),
    address1: z.string().min(1, t("app.components.account.address_form.address_requise")),
    address2: z.string().optional(),
    phoneE164: z.string().refine((value) => isValidPhoneE164(value), {
        message: t("app.components.account.address_form.phone_must_format", 'Le téléphone doit être au format +33612345678.'),
    }),
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
type CountryOption = {
    code: string;
    name: string;
    flag: string;
};
type PhoneCountryOption = CountryOption & {
    dialCode: string;
};
const FLAG_ICON_MODULES = import.meta.glob('../../../node_modules/flag-icons/flags/4x3/{ad,al,am,at,az,ba,be,bg,by,ch,cy,cz,de,dk,ee,es,fi,fr,gb,ge,gr,hr,hu,ie,is,it,li,lt,lu,lv,mc,md,me,mk,mt,nl,no,pl,pt,ro,rs,ru,se,si,sk,sm,tr,ua,va,xk}.svg', {
    eager: true,
    import: 'default',
}) as Record<string, string>;
const FLAG_ICON_URLS = Object.fromEntries(Object.entries(FLAG_ICON_MODULES).map(([path, url]) => {
    const match = path.match(/([a-z]{2})\.svg$/i);
    return [match ? match[1].toUpperCase() : path, String(url)];
})) as Record<string, string>;
const countryCodeToFlag = (code: string | undefined) => {
    const normalizedCode = normalizeCountryCode(code);
    if (!/^[A-Z]{2}$/.test(normalizedCode)) {
        return '';
    }
    return String.fromCodePoint(...normalizedCode.split('').map((char) => 127397 + char.charCodeAt(0)));
};
function FlagIcon({
    code,
    className,
}: {
    code: string;
    className?: string;
}) {
    const normalizedCode = normalizeCountryCode(code).toLowerCase();
    const flagUrl = FLAG_ICON_URLS[normalizedCode.toUpperCase()];
    if (!normalizedCode || !flagUrl) {
        return <span className={className}/>;
    }
    return (<span className={cn('grid place-items-center overflow-hidden rounded-[0.25rem] border border-[#E8DED0] bg-[#FFFDF8] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_2px_8px_rgba(65,76,22,0.08)]', className)}>
      <img src={flagUrl} alt="" aria-hidden="true" className="block h-full w-full object-cover"/>
    </span>);
}
function AddressCountrySelect({
    countries,
    value,
    onChange,
    hasError = false,
}: {
    countries: CountryOption[];
    value: string;
    onChange: (nextCountryCode: string) => void;
    hasError?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const selectedCountry = countries.find((country) => country.code === normalizeCountryCode(value))
        || countries.find((country) => country.code === DEFAULT_PHONE_COUNTRY_CODE)
        || countries[0];
    if (!selectedCountry) {
        return null;
    }
    return (<Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn('input-elegant flex w-full items-center gap-3 px-4 py-4 text-left focus:outline-none', hasError && 'border-[#C96F5C]/60 ring-2 ring-[#C96F5C]/10')} aria-expanded={open} aria-label={selectedCountry.name}>
          <FlagIcon code={selectedCountry.code} className="h-[1rem] w-[1.5rem] shrink-0"/>
          <span className="min-w-0 flex flex-1 items-center gap-2">
            <span className="truncate text-base leading-6 text-[var(--sage-deep)]">
              {selectedCountry.name}
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-[0.22em] text-[var(--sage-deep)]/45">
              {selectedCountry.code}
            </span>
          </span>
          <ChevronsUpDown className={cn('h-4 w-4 shrink-0 text-[var(--sage-deep)]/50 transition-transform duration-200', open && 'rotate-180')}/>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={10} className="w-[min(24rem,calc(100vw-2rem))] rounded-[1.25rem] border-[#E5E0D5] bg-[#FFFDF8] p-0 shadow-[0_24px_55px_rgba(65,76,22,0.16)]">
        <Command className="rounded-[1.25rem] bg-transparent [&_[data-slot=command-input-wrapper]]:border-b-[#E8DED0] [&_[data-slot=command-input-wrapper]]:focus-within:outline-none [&_[data-slot=command-input-wrapper]]:focus-within:ring-0 [&_[data-slot=command-input-wrapper]]:focus-within:shadow-none [&_[cmdk-input]]:border-0 [&_[cmdk-input]]:ring-0 [&_[cmdk-input]]:outline-none [&_[cmdk-input]]:shadow-none [&_[cmdk-input]]:focus:outline-none [&_[cmdk-input]]:focus:ring-0 [&_[cmdk-input]]:focus-visible:outline-none [&_[cmdk-input]]:focus-visible:ring-0">
          <CommandInput placeholder={t("app.components.account.address_form.country_search", 'Rechercher un pays')} className="h-12 border-0 text-sm text-[var(--sage-deep)] shadow-none ring-0 outline-none placeholder:text-[var(--sage-deep)]/40 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"/>
          <CommandList className="max-h-72 p-2">
            <CommandEmpty className="py-6 text-sm text-[var(--sage-deep)]/60">
              {t("app.components.account.address_form.country_empty", 'Aucun pays trouvé.')}
            </CommandEmpty>
            <CommandGroup className="p-0">
              {countries.map((country) => (<CommandItem key={country.code} value={`${country.name} ${country.code}`} onSelect={() => {
                        onChange(country.code);
                        setOpen(false);
                    }} className="rounded-xl px-3 py-3 text-[var(--sage-deep)] data-[selected=true]:bg-[#F7F1E5] data-[selected=true]:text-[var(--sage-deep)]">
                  <span className="flex w-full items-center gap-3">
                    <FlagIcon code={country.code} className="h-[1.125rem] w-[1.625rem] shrink-0"/>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{country.name}</span>
                      <span className="block text-xs uppercase tracking-[0.2em] text-[var(--sage-deep)]/55">
                        {country.code}
                      </span>
                    </span>
                    <Check className={cn('h-4 w-4 shrink-0 text-[var(--gold-antique)] transition-opacity', country.code === selectedCountry.code ? 'opacity-100' : 'opacity-0')}/>
                  </span>
                </CommandItem>))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>);
}
function PhoneCountrySelect({
    countries,
    value,
    onChange,
}: {
    countries: PhoneCountryOption[];
    value: string;
    onChange: (nextCountryCode: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const selectedCountry = countries.find((country) => country.code === normalizeCountryCode(value))
        || countries.find((country) => country.code === DEFAULT_PHONE_COUNTRY_CODE)
        || countries[0];
    if (!selectedCountry) {
        return null;
    }
    return (<Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex min-w-[7.75rem] items-center gap-2.5 border-r border-[#E8DED0] bg-[linear-gradient(135deg,rgba(201,169,98,0.16),rgba(245,241,232,0.96))] px-4 py-4 text-left transition hover:bg-[linear-gradient(135deg,rgba(201,169,98,0.22),rgba(245,241,232,1))] focus:outline-none" aria-expanded={open} aria-label={selectedCountry.name}>
          <FlagIcon code={selectedCountry.code} className="h-[1.125rem] w-[1.625rem] shrink-0"/>
          <span className="min-w-0 flex flex-1 items-center gap-2">
            <span className="text-base font-medium leading-6 text-[var(--sage-deep)]">+{selectedCountry.dialCode}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-[0.22em] text-[var(--sage-deep)]/45">
              {selectedCountry.code}
            </span>
          </span>
          <ChevronsUpDown className={cn('h-4 w-4 shrink-0 text-[var(--sage-deep)]/50 transition-transform duration-200', open && 'rotate-180')}/>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={10} className="w-[min(24rem,calc(100vw-2rem))] rounded-[1.25rem] border-[#E5E0D5] bg-[#FFFDF8] p-0 shadow-[0_24px_55px_rgba(65,76,22,0.16)]">
        <Command className="rounded-[1.25rem] bg-transparent [&_[data-slot=command-input-wrapper]]:border-b-[#E8DED0] [&_[data-slot=command-input-wrapper]]:focus-within:outline-none [&_[data-slot=command-input-wrapper]]:focus-within:ring-0 [&_[data-slot=command-input-wrapper]]:focus-within:shadow-none [&_[cmdk-input]]:border-0 [&_[cmdk-input]]:ring-0 [&_[cmdk-input]]:outline-none [&_[cmdk-input]]:shadow-none [&_[cmdk-input]]:focus:outline-none [&_[cmdk-input]]:focus:ring-0 [&_[cmdk-input]]:focus-visible:outline-none [&_[cmdk-input]]:focus-visible:ring-0">
          <CommandInput placeholder={t("app.components.account.address_form.phone_country_search", 'Rechercher un pays ou un indicatif')} className="h-12 border-0 text-sm text-[var(--sage-deep)] shadow-none ring-0 outline-none placeholder:text-[var(--sage-deep)]/40 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"/>
          <CommandList className="max-h-72 p-2">
            <CommandEmpty className="py-6 text-sm text-[var(--sage-deep)]/60">
              {t("app.components.account.address_form.phone_country_empty", 'Aucun indicatif trouvé.')}
            </CommandEmpty>
            <CommandGroup className="p-0">
              {countries.map((country) => (<CommandItem key={country.code} value={`${country.name} ${country.code} +${country.dialCode}`} onSelect={() => {
                    onChange(country.code);
                    setOpen(false);
                }} className="rounded-xl px-3 py-3 text-[var(--sage-deep)] data-[selected=true]:bg-[#F7F1E5] data-[selected=true]:text-[var(--sage-deep)]">
                  <span className="flex w-full items-center gap-3">
                    <FlagIcon code={country.code} className="h-[1.25rem] w-[1.75rem] shrink-0"/>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{country.name}</span>
                      <span className="block text-xs text-[var(--sage-deep)]/55">
                        +{country.dialCode} · {country.code}
                      </span>
                    </span>
                    <Check className={cn('h-4 w-4 shrink-0 text-[var(--gold-antique)] transition-opacity', country.code === selectedCountry.code ? 'opacity-100' : 'opacity-0')}/>
                  </span>
                </CommandItem>))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>);
}
const EUROPE_COUNTRIES = [
    { code: 'AL', name: 'Albanie', flag: '🇦🇱' },
    { code: 'AD', name: 'Andorre', flag: '🇦🇩' },
    { code: 'AM', name: 'Armenie', flag: '🇦🇲' },
    { code: 'AT', name: 'Autriche', flag: '🇦🇹' },
    { code: 'AZ', name: 'Azerbaidjan', flag: '🇦🇿' },
    { code: 'BY', name: 'Bielorussie', flag: '🇧🇾' },
    { code: 'BE', name: t("app.components.account.address_form.belgium"), flag: '🇧🇪' },
    { code: 'BA', name: 'Bosnie-Herzegovine', flag: '🇧🇦' },
    { code: 'BG', name: 'Bulgarie', flag: '🇧🇬' },
    { code: 'HR', name: 'Croatie', flag: '🇭🇷' },
    { code: 'CY', name: 'Chypre', flag: '🇨🇾' },
    { code: 'CZ', name: 'Tchequie', flag: '🇨🇿' },
    { code: 'DK', name: 'Danemark', flag: '🇩🇰' },
    { code: 'EE', name: 'Estonie', flag: '🇪🇪' },
    { code: 'FI', name: 'Finlande', flag: '🇫🇮' },
    { code: 'FR', name: t("app.components.account.address_form.france"), flag: '🇫🇷' },
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
    { code: 'MK', name: t("app.components.account.address_form.macedoine_nord"), flag: '🇲🇰' },
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
    const resolvedDefaultValues = useMemo<AddressFormValues>(() => ({
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
    }), [
        defaultValues?.address1,
        defaultValues?.address2,
        defaultValues?.city,
        defaultValues?.countryCode,
        defaultValues?.firstName,
        defaultValues?.hamlet,
        defaultValues?.isDefaultBilling,
        defaultValues?.isDefaultShipping,
        defaultValues?.lastName,
        defaultValues?.phoneE164,
        defaultValues?.postalCode,
        defaultValues?.salutation,
    ]);
    const form = useForm<AddressFormValues>({
        resolver: zodResolver(schema),
        defaultValues: resolvedDefaultValues,
    });
    const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [isAddressEdited, setIsAddressEdited] = useState(false);
    const [isAddressSuggestionLocked, setIsAddressSuggestionLocked] = useState(false);
    const addressCountries = useMemo<CountryOption[]>(() => EUROPE_COUNTRIES
        .filter((country) => DELIVERY_COUNTRY_CODES.includes(normalizeCountryCode(String(country.code)) as 'FR' | 'BE'))
        .map((country) => ({
        ...country,
        code: normalizeCountryCode(String(country.code)),
    })), []);
    const phoneCountries = useMemo<PhoneCountryOption[]>(() => EUROPE_COUNTRIES.map((country) => {
        const normalizedCode = normalizeCountryCode(String(country.code));
        return {
            code: normalizedCode,
            name: country.name,
            flag: countryCodeToFlag(normalizedCode) || country.flag,
            dialCode: getPhoneDialCode(normalizedCode),
        };
    }).filter((country) => country.dialCode), []);
    const initialPhoneState = useMemo(() => parsePhoneE164(defaultValues?.phoneE164, defaultValues?.countryCode || DEFAULT_PHONE_COUNTRY_CODE), [defaultValues?.countryCode, defaultValues?.phoneE164]);
    const [phoneCountryCode, setPhoneCountryCode] = useState(initialPhoneState.countryCode);
    const [phoneNationalNumber, setPhoneNationalNumber] = useState(initialPhoneState.nationalNumber);
    const [hasManualPhoneCountrySelection, setHasManualPhoneCountrySelection] = useState(Boolean(defaultValues?.phoneE164));
    const addressQuery = form.watch('address1');
    const countryCode = form.watch('countryCode');
    const showSuggestions = useMemo(() => countryCode === 'FR' && addressQuery.length > 4 && isAddressEdited && !isAddressSuggestionLocked, [countryCode, addressQuery, isAddressEdited, isAddressSuggestionLocked]);
    const selectedAddressCountry = addressCountries.find((country) => country.code === normalizeCountryCode(countryCode))
        || addressCountries.find((country) => country.code === DEFAULT_PHONE_COUNTRY_CODE)
        || addressCountries[0];
    const selectedPhoneCountry = phoneCountries.find((country) => country.code === normalizeCountryCode(phoneCountryCode))
        || phoneCountries.find((country) => country.code === DEFAULT_PHONE_COUNTRY_CODE)
        || phoneCountries[0];
    const defaultPhonePlaceholder = t("app.components.account.address_form.phone_local_placeholder", '6 12 34 56 78');
    const phonePlaceholder = getPhonePlaceholder(selectedPhoneCountry?.code, defaultPhonePlaceholder);
    useEffect(() => {
        form.reset(resolvedDefaultValues);
        setIsAddressEdited(false);
        setIsAddressSuggestionLocked(false);
    }, [form, resolvedDefaultValues]);
    useEffect(() => {
        const parsedPhone = parsePhoneE164(defaultValues?.phoneE164, defaultValues?.countryCode || DEFAULT_PHONE_COUNTRY_CODE);
        setPhoneCountryCode(parsedPhone.countryCode);
        setPhoneNationalNumber(parsedPhone.nationalNumber);
        setHasManualPhoneCountrySelection(Boolean(defaultValues?.phoneE164));
    }, [defaultValues?.countryCode, defaultValues?.phoneE164]);
    useEffect(() => {
        if (hasManualPhoneCountrySelection || phoneNationalNumber.length > 0) {
            return;
        }
        const normalizedAddressCountryCode = normalizeCountryCode(countryCode);
        if (isPhoneCountrySupported(normalizedAddressCountryCode)) {
            setPhoneCountryCode(normalizedAddressCountryCode);
        }
    }, [countryCode, hasManualPhoneCountrySelection, phoneNationalNumber.length]);
    useEffect(() => {
        const nextPhoneValue = buildPhoneE164(phoneCountryCode, phoneNationalNumber);
        if (form.getValues('phoneE164') !== nextPhoneValue) {
            form.setValue('phoneE164', nextPhoneValue, {
                shouldValidate: form.formState.isSubmitted,
            });
        }
    }, [form, phoneCountryCode, phoneNationalNumber]);
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
                const data = (await response.json()) as {
                    features?: Array<{
                        properties?: any;
                    }>;
                };
                const items = (data.features || []).map((feature) => ({
                    label: feature.properties?.label || '',
                    postcode: feature.properties?.postcode || '',
                    city: feature.properties?.city || '',
                    name: feature.properties?.name || '',
                }));
                setSuggestions(items.filter((item) => item.label));
            }
            catch {
                setSuggestions([]);
            }
            finally {
                setIsLoadingSuggestions(false);
            }
        }, 350);
        return () => window.clearTimeout(handler);
    }, [addressQuery, showSuggestions]);
    const handlePhoneCountryChange = (nextCountryCode: string) => {
        setPhoneCountryCode(nextCountryCode);
        setHasManualPhoneCountrySelection(true);
    };
    const handleAddressCountryChange = (nextCountryCode: string) => {
        form.setValue('countryCode', nextCountryCode, {
            shouldDirty: true,
            shouldValidate: true,
        });
    };
    const address1Field = form.register('address1', {
        onChange: () => {
            if (!isAddressEdited) {
                setIsAddressEdited(true);
            }
            if (isAddressSuggestionLocked) {
                setIsAddressSuggestionLocked(false);
            }
        },
    });
    const handlePhoneNumberChange = (rawValue: string) => {
        const normalizedRawValue = normalizePhoneInput(rawValue);
        if (normalizedRawValue.startsWith('+') || normalizedRawValue.startsWith('00')) {
            const parsedPhone = parsePhoneE164(normalizedRawValue, phoneCountryCode);
            setPhoneCountryCode(parsedPhone.countryCode);
            setPhoneNationalNumber(parsedPhone.nationalNumber);
            setHasManualPhoneCountrySelection(true);
            return;
        }
        setPhoneNationalNumber(extractPhoneDigits(rawValue));
    };
    return (<form className="space-y-4" onSubmit={form.handleSubmit(async (values) => {
            await onSubmit(values);
        })}>
      <div>
        <p className="text-sm font-medium text-[var(--sage-deep)]">{t("app.components.account.address_form.title")}</p>
        <div className="mt-2 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" value="MME" {...form.register('salutation')}/> Mme
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" value="MR" {...form.register('salutation')}/> M.
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm text-[var(--sage-deep)]">{t("app.components.account.address_form.first_name")}</label>
          <input className="input-elegant w-full" {...form.register('firstName')}/>
          {form.formState.errors.firstName && (<p className="text-xs text-red-600 mt-1">{form.formState.errors.firstName.message}</p>)}
        </div>
        <div>
          <label className="text-sm text-[var(--sage-deep)]">Nom *</label>
          <input className="input-elegant w-full" {...form.register('lastName')}/>
          {form.formState.errors.lastName && (<p className="text-xs text-red-600 mt-1">{form.formState.errors.lastName.message}</p>)}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm text-[var(--sage-deep)]">Pays *</label>
          <input type="hidden" {...form.register('countryCode')}/>
          <AddressCountrySelect countries={addressCountries} value={selectedAddressCountry?.code || DEFAULT_PHONE_COUNTRY_CODE} onChange={handleAddressCountryChange} hasError={Boolean(form.formState.errors.countryCode)}/>
          {form.formState.errors.countryCode && (<p className="text-xs text-red-600 mt-1">{form.formState.errors.countryCode.message}</p>)}
        </div>
        <div>
          <label className="text-sm text-[var(--sage-deep)]">{t("app.components.account.address_form.postal_code")}</label>
          <input className="input-elegant w-full" {...form.register('postalCode')}/>
          {form.formState.errors.postalCode && (<p className="text-xs text-red-600 mt-1">{form.formState.errors.postalCode.message}</p>)}
        </div>
      </div>

      <div className="relative">
        <label className="text-sm text-[var(--sage-deep)]">{t("app.components.account.address_form.address")}</label>
        <input className="input-elegant w-full" placeholder={t("app.components.account.address_form.numero_voie_voirie")} {...address1Field}/>
        {form.formState.errors.address1 && (<p className="text-xs text-red-600 mt-1">{form.formState.errors.address1.message}</p>)}
        {showSuggestions && (suggestions.length > 0 || isLoadingSuggestions) && (<div className="absolute z-10 mt-2 w-full rounded-xl border border-[#EEE6D8] bg-white p-2 shadow">
            {isLoadingSuggestions && (<InlineLoading label={t("app.components.account.address_form.searching")} textClassName="text-xs text-[var(--sage-deep)]/60"/>)}
            {suggestions.map((suggestion) => (<button key={suggestion.label} type="button" className="block w-full rounded-lg px-3 py-2 text-left text-xs text-[var(--sage-deep)] hover:bg-[#F6F2EA]" onClick={() => {
                    form.setValue('address1', suggestion.name || suggestion.label, { shouldValidate: true });
                    form.setValue('postalCode', suggestion.postcode || '', { shouldValidate: true });
                    form.setValue('city', suggestion.city || '', { shouldValidate: true });
                    setIsAddressSuggestionLocked(true);
                    setSuggestions([]);
                }}>
                {suggestion.label}
              </button>))}
          </div>)}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm text-[var(--sage-deep)]">Ville *</label>
          <input className="input-elegant w-full" {...form.register('city')}/>
          {form.formState.errors.city && (<p className="text-xs text-red-600 mt-1">{form.formState.errors.city.message}</p>)}
        </div>
        <div>
          <label className="text-sm text-[var(--sage-deep)]">Lieu-dit</label>
          <input className="input-elegant w-full" {...form.register('hamlet')}/>
        </div>
      </div>

      <div>
        <label className="text-sm text-[var(--sage-deep)]">{t("app.components.account.address_form.complement_entreprise")}</label>
        <input className="input-elegant w-full" placeholder="Entreprise / batiment / etage / digicode / BP" {...form.register('address2')}/>
      </div>

      <div>
        <label className="text-sm text-[var(--sage-deep)]">{t("app.components.account.address_form.phone_portable")}</label>
        <input type="hidden" {...form.register('phoneE164')}/>
        <div className={cn('overflow-hidden rounded-[1rem] border bg-[var(--white-warm)] shadow-[0_12px_28px_rgba(65,76,22,0.06)] transition-all duration-300', form.formState.errors.phoneE164
                ? 'border-[#C96F5C]/60 ring-2 ring-[#C96F5C]/10'
                : 'border-[#E5E0D5] focus-within:border-[var(--gold-antique)] focus-within:shadow-[0_16px_34px_rgba(201,169,98,0.18)]')}>
          <div className="flex items-stretch">
            <PhoneCountrySelect countries={phoneCountries} value={selectedPhoneCountry?.code || DEFAULT_PHONE_COUNTRY_CODE} onChange={handlePhoneCountryChange}/>
            <div className="min-w-0 flex-1">
              <input type="tel" inputMode="tel" autoComplete="tel-national" className="h-full w-full bg-transparent px-5 py-4 text-base leading-6 text-[var(--sage-deep)] outline-none placeholder:text-[var(--sage-deep)]/40" value={phoneNationalNumber} onChange={(event) => handlePhoneNumberChange(event.target.value)} placeholder={phonePlaceholder}/>
            </div>
          </div>
        </div>
        {form.formState.errors.phoneE164 && (<p className="text-xs text-red-600 mt-1">{form.formState.errors.phoneE164.message}</p>)}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
          <input type="checkbox" {...form.register('isDefaultBilling')}/>{t("app.components.account.address_form.utiliser_comme_address")}</label>
        <label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
          <input type="checkbox" {...form.register('isDefaultShipping')}/>{t("app.components.account.address_form.utiliser_comme_address_2")}</label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary">
          {submitLabel || 'Enregistrer'}
        </button>
        {onCancel && (<button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>)}
      </div>
    </form>);
}
