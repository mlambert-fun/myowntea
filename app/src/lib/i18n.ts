import fr from '@/locales/fr.json';
import en from '@/locales/en.json';
import { DEFAULT_LOCALE_MARKET, readLocaleMarketPreference } from '@/lib/locale-market';

type SectionMap = Record<string, Record<string, string>>;

type Language = 'fr' | 'en';

const sectionsByLanguage: Record<Language, SectionMap> = {
  fr: ((fr as { sections?: SectionMap }).sections ?? {}) as SectionMap,
  en: ((en as { sections?: SectionMap }).sections ?? {}) as SectionMap,
};

const normalizeLanguage = (locale: string): Language => {
  return String(locale || '').toLowerCase().startsWith('en') ? 'en' : 'fr';
};

const getLanguageFromPreference = (): Language => {
  if (typeof window === 'undefined') {
    return 'fr';
  }
  const preference = readLocaleMarketPreference();
  const locale = preference?.locale || DEFAULT_LOCALE_MARKET.locale;
  return normalizeLanguage(locale);
};

let currentLanguage: Language = getLanguageFromPreference();

export function setLanguageFromLocale(locale: string): Language {
  const nextLanguage = normalizeLanguage(locale);
  currentLanguage = nextLanguage;
  return nextLanguage;
}

export function t(
  key: string,
  fallback?: string,
  params?: Record<string, string | number | null | undefined>
): string {
  const separatorIndex = key.lastIndexOf('.');
  if (separatorIndex < 0) {
    return fallback ?? key;
  }

  const sectionKey = key.slice(0, separatorIndex);
  const valueKey = key.slice(separatorIndex + 1);
  const activeSections = sectionsByLanguage[currentLanguage] || sectionsByLanguage.fr;
  const value = activeSections[sectionKey]?.[valueKey]
    ?? sectionsByLanguage.fr[sectionKey]?.[valueKey];

  if (typeof value === 'string') {
    if (!params) {
      return value;
    }
    return Object.entries(params).reduce((result, [paramKey, paramValue]) => {
      return result.replaceAll(`{{${paramKey}}}`, String(paramValue ?? ''));
    }, value);
  }

  return fallback ?? key;
}
