import { useState } from 'react';
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
import { getCountryName } from '@/lib/countries';
import { DEFAULT_PHONE_COUNTRY_CODE, normalizeCountryCode } from '@/lib/phone';
import { cn } from '@/lib/utils';
import { FlagIcon } from './FlagIcon';

type CountrySelectFieldProps = {
    countries: CountryOption[];
    value: string;
    onChange: (nextCountryCode: string) => void;
    searchPlaceholder: string;
    emptyLabel: string;
    placeholder?: string;
    hasError?: boolean;
    buttonClassName?: string;
    listClassName?: string;
};

export function CountrySelectField({
    countries,
    value,
    onChange,
    searchPlaceholder,
    emptyLabel,
    placeholder,
    hasError = false,
    buttonClassName,
    listClassName,
}: CountrySelectFieldProps) {
    const [open, setOpen] = useState(false);
    const normalizedValue = normalizeCountryCode(value);
    const selectedCountry = countries.find((country) => country.code === normalizedValue)
        || (normalizedValue ? {
            code: normalizedValue,
            name: getCountryName(normalizedValue),
        } : null)
        || countries.find((country) => country.code === DEFAULT_PHONE_COUNTRY_CODE)
        || countries[0]
        || null;
    return (<Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn('input-elegant flex w-full items-center gap-3 px-4 py-4 text-left focus:outline-none', hasError && 'border-[#C96F5C]/60 ring-2 ring-[#C96F5C]/10', buttonClassName)} aria-expanded={open} aria-label={selectedCountry?.name || placeholder || normalizedValue || DEFAULT_PHONE_COUNTRY_CODE}>
          {selectedCountry ? <FlagIcon code={selectedCountry.code} className="h-[1rem] w-[1.5rem] shrink-0"/> : <span className="h-[1rem] w-[1.5rem] shrink-0"/>}
          <span className="min-w-0 flex flex-1 items-center gap-2">
            <span className="truncate text-base leading-6 text-[var(--sage-deep)]">
              {selectedCountry?.name || placeholder || ''}
            </span>
            {selectedCountry ? (<span className="shrink-0 text-[10px] uppercase tracking-[0.22em] text-[var(--sage-deep)]/45">
                {selectedCountry.code}
              </span>) : null}
          </span>
          <ChevronsUpDown className={cn('h-4 w-4 shrink-0 text-[var(--sage-deep)]/50 transition-transform duration-200', open && 'rotate-180')}/>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={10} className={cn('w-[min(24rem,calc(100vw-2rem))] rounded-[1.25rem] border-[#E5E0D5] bg-[#FFFDF8] p-0 shadow-[0_24px_55px_rgba(65,76,22,0.16)]', listClassName)}>
        <Command className="rounded-[1.25rem] bg-transparent [&_[data-slot=command-input-wrapper]]:border-b-[#E8DED0] [&_[data-slot=command-input-wrapper]]:focus-within:outline-none [&_[data-slot=command-input-wrapper]]:focus-within:ring-0 [&_[data-slot=command-input-wrapper]]:focus-within:shadow-none [&_[cmdk-input]]:border-0 [&_[cmdk-input]]:ring-0 [&_[cmdk-input]]:outline-none [&_[cmdk-input]]:shadow-none [&_[cmdk-input]]:focus:outline-none [&_[cmdk-input]]:focus:ring-0 [&_[cmdk-input]]:focus-visible:outline-none [&_[cmdk-input]]:focus-visible:ring-0">
          <CommandInput placeholder={searchPlaceholder} className="h-12 border-0 text-sm text-[var(--sage-deep)] shadow-none ring-0 outline-none placeholder:text-[var(--sage-deep)]/40 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"/>
          <CommandList className="max-h-72 p-2">
            <CommandEmpty className="py-6 text-sm text-[var(--sage-deep)]/60">
              {emptyLabel}
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
                    <Check className={cn('h-4 w-4 shrink-0 text-[var(--gold-antique)] transition-opacity', country.code === selectedCountry?.code ? 'opacity-100' : 'opacity-0')}/>
                  </span>
                </CommandItem>))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>);
}
