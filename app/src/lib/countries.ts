import { DEFAULT_LOCALE_MARKET, readLocaleMarketPreference } from '@/lib/locale-market';
import { normalizeCountryCode } from '@/lib/phone';

export type CountryOption = {
    code: string;
    name: string;
};

export const DELIVERY_COUNTRY_CODES = ['FR', 'BE'] as const;

export const PHONE_COUNTRY_CODES = [
    'AL',
    'AD',
    'AM',
    'AT',
    'AZ',
    'BY',
    'BE',
    'BA',
    'BG',
    'HR',
    'CY',
    'CZ',
    'DK',
    'EE',
    'FI',
    'FR',
    'GE',
    'DE',
    'GR',
    'HU',
    'IS',
    'IE',
    'IT',
    'XK',
    'LV',
    'LI',
    'LT',
    'LU',
    'MT',
    'MD',
    'MC',
    'ME',
    'NL',
    'MK',
    'NO',
    'PL',
    'PT',
    'RO',
    'RU',
    'SM',
    'RS',
    'SK',
    'SI',
    'ES',
    'SE',
    'CH',
    'TR',
    'UA',
    'GB',
    'VA',
] as const;

const getActiveLocale = () => {
    if (typeof window === 'undefined') {
        return DEFAULT_LOCALE_MARKET.locale;
    }
    return readLocaleMarketPreference()?.locale || DEFAULT_LOCALE_MARKET.locale;
};

const getRegionDisplayNames = () => {
    try {
        return new Intl.DisplayNames([getActiveLocale()], { type: 'region' });
    }
    catch {
        return null;
    }
};

export const getCountryName = (code: string) => {
    const normalizedCode = normalizeCountryCode(code);
    if (!normalizedCode) {
        return '';
    }
    return getRegionDisplayNames()?.of(normalizedCode) || normalizedCode;
};

export const getCountryOptions = (countryCodes: readonly string[]): CountryOption[] => countryCodes
    .map((code) => {
    const normalizedCode = normalizeCountryCode(code);
    return {
        code: normalizedCode,
        name: getCountryName(normalizedCode),
    };
})
    .filter((country) => country.code && country.name);

export const filterCountryOptions = (countryCodes: readonly string[], allowedCountryCodes?: readonly string[]) => {
    const normalizedAllowedCountryCodes = Array.isArray(allowedCountryCodes)
        ? allowedCountryCodes.map((countryCode) => normalizeCountryCode(countryCode)).filter(Boolean)
        : [];
    if (normalizedAllowedCountryCodes.length === 0) {
        return getCountryOptions(countryCodes);
    }
    return getCountryOptions(countryCodes.filter((countryCode) => normalizedAllowedCountryCodes.includes(normalizeCountryCode(countryCode))));
};

export const getDeliveryCountryOptions = () => getCountryOptions(DELIVERY_COUNTRY_CODES);
export const getPhoneCountryOptions = () => getCountryOptions(PHONE_COUNTRY_CODES);
