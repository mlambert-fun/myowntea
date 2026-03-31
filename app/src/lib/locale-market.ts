export type LocaleMarketPreference = {
  locale: string;
  countryCode: string;
  updatedAt: string;
};

export const DEFAULT_LOCALE_MARKET = {
  locale: 'fr-FR',
  countryCode: 'FR',
} as const;

const LOCALE_MARKET_PREFERENCE_KEY = 'mot_locale_market_pref_v1';
const LOCALE_MARKET_PROMPT_DISMISSED_KEY = 'mot_locale_market_prompt_dismissed_v1';

const normalizeLocale = (value: unknown) => String(value || '').trim();
const normalizeCountryCode = (value: unknown) => String(value || '').trim().toUpperCase();

export const readLocaleMarketPreference = (): LocaleMarketPreference | null => {
  try {
    const raw = localStorage.getItem(LOCALE_MARKET_PREFERENCE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocaleMarketPreference>;
    const locale = normalizeLocale(parsed.locale);
    const countryCode = normalizeCountryCode(parsed.countryCode);
    if (!locale || !countryCode) return null;
    return {
      locale,
      countryCode,
      updatedAt: normalizeLocale(parsed.updatedAt) || new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

export const saveLocaleMarketPreference = (payload: { locale: string; countryCode: string }) => {
  const next: LocaleMarketPreference = {
    locale: normalizeLocale(payload.locale),
    countryCode: normalizeCountryCode(payload.countryCode),
    updatedAt: new Date().toISOString(),
  };
  if (!next.locale || !next.countryCode) return;
  localStorage.setItem(LOCALE_MARKET_PREFERENCE_KEY, JSON.stringify(next));
  localStorage.removeItem(LOCALE_MARKET_PROMPT_DISMISSED_KEY);
};

export const isLocaleMarketPromptDismissed = () => {
  return localStorage.getItem(LOCALE_MARKET_PROMPT_DISMISSED_KEY) === '1';
};

export const dismissLocaleMarketPrompt = () => {
  localStorage.setItem(LOCALE_MARKET_PROMPT_DISMISSED_KEY, '1');
};

export const getRedirectGeoContext = () => {
  const preference = readLocaleMarketPreference();
  if (preference) {
    return {
      locale: preference.locale,
      countryCode: preference.countryCode,
      hasPreference: true,
    };
  }

  // Default storefront values when no explicit preference is set.
  return {
    locale: DEFAULT_LOCALE_MARKET.locale,
    countryCode: DEFAULT_LOCALE_MARKET.countryCode,
    hasPreference: false,
  };
};
