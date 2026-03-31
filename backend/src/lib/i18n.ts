import fr from '../locales/fr.json';

type SectionMap = Record<string, Record<string, string>>;

const sections: SectionMap = ((fr as { sections?: SectionMap }).sections ?? {}) as SectionMap;

export function t(key: string, fallback?: string): string {
    const separatorIndex = key.lastIndexOf('.');
    if (separatorIndex < 0) {
        return fallback ?? key;
    }

    const sectionKey = key.slice(0, separatorIndex);
    const valueKey = key.slice(separatorIndex + 1);
    const value = sections[sectionKey]?.[valueKey];

    if (typeof value === 'string') {
        return value;
    }

    return fallback ?? key;
}
