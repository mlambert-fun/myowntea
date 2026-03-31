import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { CountryOption } from '@/lib/countries';
import { getCountryName, getPhoneCountryOptions } from '@/lib/countries';
import {
    DEFAULT_PHONE_COUNTRY_CODE,
    buildPhoneE164,
    extractPhoneDigits,
    getPhoneDialCode,
    getPhonePlaceholder,
    isPhoneCountrySupported,
    normalizeCountryCode,
    normalizePhoneInput,
    parsePhoneE164,
} from '@/lib/phone';
import { cn } from '@/lib/utils';
import { FlagIcon } from './FlagIcon';

type PhoneCountryOption = CountryOption & {
    dialCode: string;
};

type PhoneFieldProps = {
    value: string;
    onChange: (nextPhoneE164: string) => void;
    autoCountryCode?: string;
    countries?: CountryOption[];
    error?: boolean;
    searchPlaceholder: string;
    emptyLabel: string;
    placeholderFallback: string;
    autoComplete?: string;
};

function PhoneCountrySelect({
    countries,
    value,
    onChange,
    searchPlaceholder,
    emptyLabel,
}: {
    countries: PhoneCountryOption[];
    value: string;
    onChange: (nextCountryCode: string) => void;
    searchPlaceholder: string;
    emptyLabel: string;
}) {
    const [open, setOpen] = useState(false);
    const normalizedValue = normalizeCountryCode(value);
    const selectedCountry = countries.find((country) => country.code === normalizedValue)
        || (normalizedValue ? {
            code: normalizedValue,
            name: getCountryName(normalizedValue),
            dialCode: getPhoneDialCode(normalizedValue),
        } : null)
        || countries.find((country) => country.code === DEFAULT_PHONE_COUNTRY_CODE)
        || countries[0]
        || null;
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
          <CommandInput placeholder={searchPlaceholder} className="h-12 border-0 text-sm text-[var(--sage-deep)] shadow-none ring-0 outline-none placeholder:text-[var(--sage-deep)]/40 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"/>
          <CommandList className="max-h-72 p-2">
            <CommandEmpty className="py-6 text-sm text-[var(--sage-deep)]/60">
              {emptyLabel}
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

export function PhoneField({
    value,
    onChange,
    autoCountryCode,
    countries,
    error = false,
    searchPlaceholder,
    emptyLabel,
    placeholderFallback,
    autoComplete = 'tel-national',
}: PhoneFieldProps) {
    const phoneCountries = useMemo<PhoneCountryOption[]>(() => (countries || getPhoneCountryOptions()).map((country) => ({
        ...country,
        code: normalizeCountryCode(country.code),
        dialCode: getPhoneDialCode(country.code),
    })).filter((country) => country.code && country.dialCode), [countries]);
    const initialPhoneState = useMemo(() => parsePhoneE164(value, autoCountryCode || DEFAULT_PHONE_COUNTRY_CODE), [autoCountryCode, value]);
    const [phoneCountryCode, setPhoneCountryCode] = useState(initialPhoneState.countryCode);
    const [phoneNationalNumber, setPhoneNationalNumber] = useState(initialPhoneState.nationalNumber);
    const [hasManualPhoneCountrySelection, setHasManualPhoneCountrySelection] = useState(Boolean(value));
    const selectedPhoneCountry = phoneCountries.find((country) => country.code === normalizeCountryCode(phoneCountryCode))
        || phoneCountries.find((country) => country.code === DEFAULT_PHONE_COUNTRY_CODE)
        || phoneCountries[0];
    const phonePlaceholder = getPhonePlaceholder(selectedPhoneCountry?.code, placeholderFallback);
    const emitPhoneChange = (nextCountryCode: string, nextNationalNumber: string) => {
        const nextPhoneValue = buildPhoneE164(nextCountryCode, nextNationalNumber);
        if (value !== nextPhoneValue) {
            onChange(nextPhoneValue);
        }
    };

    useEffect(() => {
        const parsedPhone = parsePhoneE164(value, autoCountryCode || DEFAULT_PHONE_COUNTRY_CODE);
        setPhoneCountryCode((currentValue) => (currentValue === parsedPhone.countryCode ? currentValue : parsedPhone.countryCode));
        setPhoneNationalNumber((currentValue) => (currentValue === parsedPhone.nationalNumber ? currentValue : parsedPhone.nationalNumber));
        setHasManualPhoneCountrySelection((currentValue) => {
            const nextValue = Boolean(value);
            return currentValue === nextValue ? currentValue : nextValue;
        });
    }, [autoCountryCode, value]);

    useEffect(() => {
        if (hasManualPhoneCountrySelection || phoneNationalNumber.length > 0) {
            return;
        }
        const normalizedAutoCountryCode = normalizeCountryCode(autoCountryCode);
        if (isPhoneCountrySupported(normalizedAutoCountryCode)) {
            setPhoneCountryCode((currentValue) => (currentValue === normalizedAutoCountryCode ? currentValue : normalizedAutoCountryCode));
        }
    }, [autoCountryCode, hasManualPhoneCountrySelection, phoneNationalNumber.length]);

    const handlePhoneCountryChange = (nextCountryCode: string) => {
        setPhoneCountryCode(nextCountryCode);
        setHasManualPhoneCountrySelection(true);
        emitPhoneChange(nextCountryCode, phoneNationalNumber);
    };

    const handlePhoneNumberChange = (rawValue: string) => {
        const normalizedRawValue = normalizePhoneInput(rawValue);
        if (normalizedRawValue.startsWith('+') || normalizedRawValue.startsWith('00')) {
            const parsedPhone = parsePhoneE164(normalizedRawValue, phoneCountryCode);
            setPhoneCountryCode(parsedPhone.countryCode);
            setPhoneNationalNumber(parsedPhone.nationalNumber);
            setHasManualPhoneCountrySelection(true);
            emitPhoneChange(parsedPhone.countryCode, parsedPhone.nationalNumber);
            return;
        }
        const nextNationalNumber = extractPhoneDigits(rawValue);
        setPhoneNationalNumber(nextNationalNumber);
        emitPhoneChange(phoneCountryCode, nextNationalNumber);
    };

    return (<div className={cn('overflow-hidden rounded-[1rem] border bg-[var(--white-warm)] shadow-[0_12px_28px_rgba(65,76,22,0.06)] transition-all duration-300', error
            ? 'border-[#C96F5C]/60 ring-2 ring-[#C96F5C]/10'
            : 'border-[#E5E0D5] focus-within:border-[var(--gold-antique)] focus-within:shadow-[0_16px_34px_rgba(201,169,98,0.18)]')}>
      <div className="flex items-stretch">
        <PhoneCountrySelect countries={phoneCountries} value={selectedPhoneCountry?.code || DEFAULT_PHONE_COUNTRY_CODE} onChange={handlePhoneCountryChange} searchPlaceholder={searchPlaceholder} emptyLabel={emptyLabel}/>
        <div className="min-w-0 flex-1">
          <input type="tel" inputMode="tel" autoComplete={autoComplete} className="h-full w-full bg-transparent px-5 py-4 text-base leading-6 text-[var(--sage-deep)] outline-none placeholder:text-[var(--sage-deep)]/40" value={phoneNationalNumber} onChange={(event) => handlePhoneNumberChange(event.target.value)} placeholder={phonePlaceholder}/>
        </div>
      </div>
    </div>);
}
