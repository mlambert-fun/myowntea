import {
    getCountryCallingCode,
    getExampleNumber,
    isSupportedCountry,
    parsePhoneNumberFromString,
    type CountryCode,
} from 'libphonenumber-js/min';
import examples from 'libphonenumber-js/mobile/examples';

export const DEFAULT_PHONE_COUNTRY_CODE = 'FR' as const;

export type ParsedPhoneState = {
    countryCode: string;
    nationalNumber: string;
    e164: string;
};

export const normalizeCountryCode = (value: string | undefined) => String(value || '').trim().toUpperCase();
export const normalizePhoneInput = (value: string | undefined) => String(value || '').trim().replace(/\s+/g, '');
export const extractPhoneDigits = (value: string | undefined) => String(value || '').replace(/\D+/g, '');

const toPhoneCountry = (value: string | undefined): CountryCode | undefined => {
    const normalizedCode = normalizeCountryCode(value);
    if (!normalizedCode) {
        return undefined;
    }
    return isSupportedCountry(normalizedCode as CountryCode) ? normalizedCode as CountryCode : undefined;
};

const normalizePhoneValueForParsing = (value: string | undefined) => normalizePhoneInput(value).replace(/^00/, '+');

const parsePhone = (value: string | undefined, fallbackCountryCode?: string) => {
    const normalizedValue = normalizePhoneValueForParsing(value);
    const fallbackCountry = toPhoneCountry(fallbackCountryCode) || DEFAULT_PHONE_COUNTRY_CODE;
    if (!normalizedValue) {
        return undefined;
    }
    if (normalizedValue.startsWith('+')) {
        return parsePhoneNumberFromString(normalizedValue);
    }
    return parsePhoneNumberFromString(normalizedValue, fallbackCountry);
};

export const isPhoneCountrySupported = (value: string | undefined) => Boolean(toPhoneCountry(value));

export const getPhoneDialCode = (countryCode: string | undefined) => {
    const supportedCountry = toPhoneCountry(countryCode);
    return supportedCountry ? getCountryCallingCode(supportedCountry) : '';
};

export const getPhonePlaceholder = (countryCode: string | undefined, fallbackPlaceholder: string) => {
    const supportedCountry = toPhoneCountry(countryCode);
    if (!supportedCountry) {
        return fallbackPlaceholder;
    }
    const exampleNumber = getExampleNumber(supportedCountry, examples);
    if (!exampleNumber) {
        return fallbackPlaceholder;
    }
    const dialCode = getCountryCallingCode(supportedCountry);
    return exampleNumber.formatInternational().replace(new RegExp(`^\\+${dialCode}\\s*`), '').trim() || fallbackPlaceholder;
};

export const buildPhoneE164 = (countryCode: string | undefined, phoneNumber: string | undefined) => {
    const supportedCountry = toPhoneCountry(countryCode) || DEFAULT_PHONE_COUNTRY_CODE;
    const parsedPhone = parsePhone(phoneNumber, supportedCountry);
    if (parsedPhone) {
        return parsedPhone.number;
    }
    const digits = extractPhoneDigits(phoneNumber);
    if (!digits) {
        return '';
    }
    return `+${getCountryCallingCode(supportedCountry)}${digits}`;
};

export const parsePhoneE164 = (value: string | undefined, fallbackCountryCode: string | undefined): ParsedPhoneState => {
    const fallbackCountry = toPhoneCountry(fallbackCountryCode) || DEFAULT_PHONE_COUNTRY_CODE;
    const parsedPhone = parsePhone(value, fallbackCountry);
    if (parsedPhone) {
        return {
            countryCode: toPhoneCountry(parsedPhone.country) || fallbackCountry,
            nationalNumber: parsedPhone.nationalNumber,
            e164: parsedPhone.number,
        };
    }
    return {
        countryCode: fallbackCountry,
        nationalNumber: extractPhoneDigits(value),
        e164: '',
    };
};

export const isValidPhoneE164 = (value: string | undefined) => {
    const parsedPhone = parsePhone(value);
    return Boolean(parsedPhone?.isValid());
};
