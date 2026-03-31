import type { PrismaClient, TranslatableEntityType } from '@prisma/client';

export const DEFAULT_DB_LOCALE = 'fr-fr';

type TranslationMap = Map<string, Record<string, unknown>>;

type LocaleSource = {
  queryLocale?: unknown;
  acceptLanguage?: unknown;
};

type LocaleVariants = {
  requested: string;
  chain: string[];
};

const ENTITY_FIELD_TYPES: Record<TranslatableEntityType, Record<string, 'string' | 'nullable_string' | 'string_array'>> = {
  INGREDIENT: {
    name: 'string',
    description: 'string',
    longDescription: 'nullable_string',
    flavor: 'nullable_string',
    flavors: 'string_array',
    benefits: 'string_array',
    dayMoments: 'string_array',
    infusionTime: 'nullable_string',
    dosage: 'nullable_string',
    temperature: 'nullable_string',
    preparation: 'nullable_string',
    origin: 'nullable_string',
    pairing: 'nullable_string',
  },
  PRODUCT: {
    title: 'string',
    description: 'nullable_string',
  },
  PRODUCT_OPTION: {
    name: 'string',
  },
  PRODUCT_OPTION_VALUE: {
    value: 'string',
  },
  BLEND: {
    name: 'string',
    description: 'nullable_string',
  },
  BLEND_LISTING: {
    title: 'string',
    description: 'nullable_string',
  },
};

const normalizeLocaleToken = (value: unknown): string | null => {
  const normalized = String(value ?? '')
    .trim()
    .replace(/_/g, '-')
    .toLowerCase();
  if (!normalized) return null;
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(normalized)) return null;
  return normalized;
};

const parseAcceptLanguage = (value: unknown): string | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  const first = String(raw ?? '')
    .split(',')[0]
    .split(';')[0]
    .trim();
  return normalizeLocaleToken(first);
};

const uniquePush = (target: string[], value: string | null) => {
  if (!value) return;
  if (!target.includes(value)) {
    target.push(value);
  }
};

export const resolveLocaleVariants = (source: LocaleSource): LocaleVariants => {
  const requested =
    normalizeLocaleToken(source.queryLocale) ||
    parseAcceptLanguage(source.acceptLanguage) ||
    DEFAULT_DB_LOCALE;
  const language = requested.split('-')[0] || 'fr';
  const chain: string[] = [];
  uniquePush(chain, requested);
  uniquePush(chain, language);
  uniquePush(chain, DEFAULT_DB_LOCALE);
  uniquePush(chain, 'fr');
  return { requested, chain };
};

export const getAllowedTranslationFields = (entityType: TranslatableEntityType): string[] => {
  return Object.keys(ENTITY_FIELD_TYPES[entityType] || {});
};

export const sanitizeEntityTranslationValue = (
  entityType: TranslatableEntityType,
  field: string,
  value: unknown,
): unknown => {
  const fieldType = ENTITY_FIELD_TYPES[entityType]?.[field];
  if (!fieldType) {
    throw new Error('TRANSLATION_FIELD_NOT_ALLOWED');
  }

  if (fieldType === 'string') {
    const normalized = String(value ?? '').trim();
    if (!normalized) throw new Error('TRANSLATION_VALUE_REQUIRED');
    return normalized;
  }

  if (fieldType === 'nullable_string') {
    if (value === null) return null;
    const normalized = String(value ?? '').trim();
    if (!normalized) throw new Error('TRANSLATION_VALUE_REQUIRED');
    return normalized;
  }

  if (!Array.isArray(value)) {
    throw new Error('TRANSLATION_VALUE_ARRAY_REQUIRED');
  }

  return value
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);
};

export const loadEntityTranslations = async (
  prisma: PrismaClient,
  params: {
    entityType: TranslatableEntityType;
    entityIds: string[];
    fields: string[];
    locale: string;
  },
): Promise<TranslationMap> => {
  const entityIds = Array.from(new Set((params.entityIds || []).filter(Boolean)));
  const fields = Array.from(new Set((params.fields || []).filter(Boolean)));
  if (entityIds.length === 0 || fields.length === 0) {
    return new Map();
  }

  const { chain } = resolveLocaleVariants({ queryLocale: params.locale });
  const localePriority = new Map(chain.map((locale, index) => [locale, index]));

  const rows = await prisma.entityTranslation.findMany({
    where: {
      entityType: params.entityType,
      entityId: { in: entityIds },
      field: { in: fields },
      locale: { in: chain },
    },
    select: {
      entityId: true,
      field: true,
      locale: true,
      value: true,
    },
  });

  rows.sort((a, b) => {
    const aPriority = localePriority.get(a.locale) ?? Number.MAX_SAFE_INTEGER;
    const bPriority = localePriority.get(b.locale) ?? Number.MAX_SAFE_INTEGER;
    return aPriority - bPriority;
  });

  const perEntity = new Map<string, Record<string, unknown>>();
  const selected = new Set<string>();

  for (const row of rows) {
    const key = `${row.entityId}::${row.field}`;
    if (selected.has(key)) continue;
    selected.add(key);

    const fieldMap = perEntity.get(row.entityId) || {};
    fieldMap[row.field] = row.value;
    perEntity.set(row.entityId, fieldMap);
  }

  return perEntity;
};

const asString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const asNullableString = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  return asString(value);
};

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);
};

const patchIngredient = (ingredient: any, translation: Record<string, unknown> | undefined): any => {
  if (!translation) return ingredient;
  const next = { ...ingredient };

  const name = asString(translation.name);
  if (name !== undefined) next.name = name;

  const description = asString(translation.description);
  if (description !== undefined) next.description = description;

  const longDescription = asNullableString(translation.longDescription);
  if (longDescription !== undefined) next.longDescription = longDescription;

  const flavor = asNullableString(translation.flavor);
  if (flavor !== undefined) next.flavor = flavor;

  const flavors = asStringArray(translation.flavors);
  if (flavors !== undefined) next.flavors = flavors;

  const benefits = asStringArray(translation.benefits);
  if (benefits !== undefined) next.benefits = benefits;

  const dayMoments = asStringArray(translation.dayMoments);
  if (dayMoments !== undefined) next.dayMoments = dayMoments;

  const infusionTime = asNullableString(translation.infusionTime);
  if (infusionTime !== undefined) next.infusionTime = infusionTime;

  const dosage = asNullableString(translation.dosage);
  if (dosage !== undefined) next.dosage = dosage;

  const temperature = asNullableString(translation.temperature);
  if (temperature !== undefined) next.temperature = temperature;

  const preparation = asNullableString(translation.preparation);
  if (preparation !== undefined) next.preparation = preparation;

  const origin = asNullableString(translation.origin);
  if (origin !== undefined) next.origin = origin;

  const pairing = asNullableString(translation.pairing);
  if (pairing !== undefined) next.pairing = pairing;

  return next;
};

export const applyIngredientTranslations = <T extends { id: string; [key: string]: unknown }>(
  ingredients: T[],
  map: TranslationMap,
): T[] => {
  return ingredients.map((ingredient) => patchIngredient(ingredient, map.get(ingredient.id)) as T);
};

const patchProduct = (product: any, translation: Record<string, unknown> | undefined): any => {
  if (!translation) return product;
  const next = { ...product };
  const title = asString(translation.title);
  if (title !== undefined) next.title = title;
  const description = asNullableString(translation.description);
  if (description !== undefined) next.description = description;
  return next;
};

const patchOption = (option: any, translation: Record<string, unknown> | undefined): any => {
  if (!translation) return option;
  const next = { ...option };
  const name = asString(translation.name);
  if (name !== undefined) next.name = name;
  return next;
};

const patchOptionValue = (
  optionValue: any,
  translation: Record<string, unknown> | undefined,
): any => {
  if (!translation) return optionValue;
  const next = { ...optionValue };
  const value = asString(translation.value);
  if (value !== undefined) next.value = value;
  return next;
};

export const applyProductTranslations = <T extends { id: string; options?: unknown[]; variants?: unknown[]; [key: string]: unknown }>(
  products: T[],
  maps: {
    productMap: TranslationMap;
    optionMap: TranslationMap;
    optionValueMap: TranslationMap;
  },
): T[] => {
  return products.map((product) => {
    const localizedProduct = patchProduct(product, maps.productMap.get(product.id)) as T;
    const options = Array.isArray(localizedProduct.options) ? localizedProduct.options : [];
    const variants = Array.isArray(localizedProduct.variants) ? localizedProduct.variants : [];

    const localizedOptions = options.map((option: any) => {
      const localizedOption = patchOption(option, maps.optionMap.get(option.id));
      const values = Array.isArray(localizedOption.values) ? localizedOption.values : [];
      return {
        ...localizedOption,
        values: values.map((value: any) => patchOptionValue(value, maps.optionValueMap.get(value.id))),
      };
    });

    const localizedVariants = variants.map((variant: any) => {
      const optionValues = Array.isArray(variant.optionValues) ? variant.optionValues : [];
      return {
        ...variant,
        optionValues: optionValues.map((entry: any) => {
          if (!entry?.optionValue) return entry;
          const localizedOption = entry.optionValue.option?.id
            ? patchOption(entry.optionValue.option, maps.optionMap.get(entry.optionValue.option.id))
            : entry.optionValue.option;
          const localizedOptionValue = patchOptionValue(
            entry.optionValue,
            maps.optionValueMap.get(entry.optionValue.id),
          );
          return {
            ...entry,
            optionValue: {
              ...localizedOptionValue,
              ...(localizedOption ? { option: localizedOption } : {}),
            },
          };
        }),
      };
    });

    return {
      ...localizedProduct,
      options: localizedOptions,
      variants: localizedVariants,
    };
  });
};

export const applyBlendListingTranslations = <T extends { id: string; blend?: unknown; [key: string]: unknown }>(
  listings: T[],
  maps: {
    listingMap: TranslationMap;
    blendMap: TranslationMap;
    ingredientMap: TranslationMap;
  },
): T[] => {
  return listings.map((listing) => {
    const listingTranslations = maps.listingMap.get(listing.id);
    const localizedTitle = asString(listingTranslations?.title) ?? String((listing as any).title ?? '');
    const localizedDescription =
      asNullableString(listingTranslations?.description) ?? ((listing as any).description ?? null);

    const rawBlend = (listing as any).blend;
    if (!rawBlend || typeof rawBlend !== 'object') {
      return {
        ...listing,
        title: localizedTitle,
        description: localizedDescription,
      };
    }

    const blendTranslations = maps.blendMap.get(rawBlend.id);
    const localizedBlendName = asString(blendTranslations?.name) ?? String(rawBlend.name ?? '');
    const localizedBlendDescription =
      asNullableString(blendTranslations?.description) ?? (rawBlend.description ?? null);

    const rawIngredients = Array.isArray(rawBlend.ingredients) ? rawBlend.ingredients : [];
    const localizedIngredients = rawIngredients.map((entry: any) => {
      if (!entry?.ingredient?.id) return entry;
      return {
        ...entry,
        ingredient: patchIngredient(entry.ingredient, maps.ingredientMap.get(entry.ingredient.id)),
      };
    });

    return {
      ...listing,
      title: localizedTitle,
      description: localizedDescription,
      blend: {
        ...rawBlend,
        name: localizedBlendName,
        description: localizedBlendDescription,
        ingredients: localizedIngredients,
      },
    };
  });
};
