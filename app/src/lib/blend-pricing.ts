import { DEFAULT_BLEND_FORMAT, normalizeBlendFormat, type BlendFormatCode } from '@/lib/blend-format';

export const MAX_BLEND_INGREDIENTS = 10;
export const MAX_BLEND_AROMAS = 2;

const BLEND_AROMA_SHARE_RATIO = 0.1;
const BLEND_MUSLIN_RATIO = 0.8;
const BLEND_CATEGORY_TEMPLATE_WEIGHTS: Record<'base' | 'flower' | 'fruit' | 'vegetal', number> = {
  base: 65,
  flower: 5,
  fruit: 15,
  vegetal: 5,
};

export interface BlendPricingIngredient {
  id?: string;
  name?: string;
  category?: string | null;
  price?: number | null;
  basePrice?: number | null;
}

export type BlendSelectionBlockingReason =
  | 'NONE'
  | 'EMPTY'
  | 'TOO_MANY_INGREDIENTS'
  | 'DUPLICATE_INGREDIENTS'
  | 'TOO_MANY_AROMAS'
  | 'ONLY_AROMAS';

export interface BlendSelectionEvaluation {
  canFinalize: boolean;
  blockingReason: BlendSelectionBlockingReason;
  totalCount: number;
  aromaCount: number;
  nonAromaCount: number;
  baseCount: number;
  nonBaseCount: number;
}

const normalizeKey = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const normalizeBlendIngredientCategory = (value: unknown): 'base' | 'flower' | 'fruit' | 'vegetal' | 'aroma' | 'other' => {
  const normalized = normalizeKey(value);
  if (normalized.startsWith('base') || normalized === 'tea') return 'base';
  if (normalized.startsWith('fleur') || normalized.startsWith('flower')) return 'flower';
  if (normalized.startsWith('fruit')) return 'fruit';
  if (
    normalized.startsWith('plante') ||
    normalized.startsWith('plant') ||
    normalized.startsWith('herb') ||
    normalized.startsWith('vegetal')
  ) {
    return 'vegetal';
  }
  if (
    normalized.startsWith('arome') ||
    normalized.startsWith('aroma') ||
    normalized.startsWith('flavor') ||
    normalized.startsWith('flavour') ||
    normalized.startsWith('spice')
  ) {
    return 'aroma';
  }
  return 'other';
};

const toIngredientSignature = (ingredient: BlendPricingIngredient, index: number) => {
  const id = typeof ingredient.id === 'string' ? ingredient.id.trim() : '';
  if (id) return `id:${id}`;
  const name = normalizeKey(ingredient.name);
  const category = normalizeBlendIngredientCategory(ingredient.category);
  if (name) return `name:${name}|category:${category}`;
  return `index:${index}`;
};

const toPriceCents = (ingredient: BlendPricingIngredient) => {
  const raw =
    typeof ingredient.price === 'number' && Number.isFinite(ingredient.price)
      ? ingredient.price
      : typeof ingredient.basePrice === 'number' && Number.isFinite(ingredient.basePrice)
        ? ingredient.basePrice
        : 0;
  return Math.max(0, Math.round(raw * 100));
};

const average = (values: number[]) => (values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

const roundUpToTenthEuroCents = (rawCents: number) => Math.max(0, Math.ceil(rawCents / 10) * 10);

export const evaluateBlendSelection = (ingredients: BlendPricingIngredient[]): BlendSelectionEvaluation => {
  const safeIngredients = Array.isArray(ingredients) ? ingredients : [];
  const totalCount = safeIngredients.length;
  const categories = safeIngredients.map((ingredient) => normalizeBlendIngredientCategory(ingredient?.category));
  const aromaCount = categories.filter((category) => category === 'aroma').length;
  const nonAromaCount = totalCount - aromaCount;
  const baseCount = categories.filter((category) => category === 'base').length;
  const nonBaseCount = totalCount - baseCount;
  const signatures = new Set<string>();
  let hasDuplicate = false;
  safeIngredients.forEach((ingredient, index) => {
    const signature = toIngredientSignature(ingredient, index);
    if (signatures.has(signature)) {
      hasDuplicate = true;
      return;
    }
    signatures.add(signature);
  });

  if (totalCount === 0) {
    return { canFinalize: false, blockingReason: 'EMPTY', totalCount, aromaCount, nonAromaCount, baseCount, nonBaseCount };
  }
  if (totalCount > MAX_BLEND_INGREDIENTS) {
    return { canFinalize: false, blockingReason: 'TOO_MANY_INGREDIENTS', totalCount, aromaCount, nonAromaCount, baseCount, nonBaseCount };
  }
  if (hasDuplicate) {
    return { canFinalize: false, blockingReason: 'DUPLICATE_INGREDIENTS', totalCount, aromaCount, nonAromaCount, baseCount, nonBaseCount };
  }
  if (aromaCount > MAX_BLEND_AROMAS) {
    return { canFinalize: false, blockingReason: 'TOO_MANY_AROMAS', totalCount, aromaCount, nonAromaCount, baseCount, nonBaseCount };
  }
  if (nonAromaCount === 0) {
    return { canFinalize: false, blockingReason: 'ONLY_AROMAS', totalCount, aromaCount, nonAromaCount, baseCount, nonBaseCount };
  }
  return { canFinalize: true, blockingReason: 'NONE', totalCount, aromaCount, nonAromaCount, baseCount, nonBaseCount };
};

export const computeBlendUnitPriceCents = (
  ingredients: BlendPricingIngredient[],
  options?: { blendFormat?: BlendFormatCode | string | null }
) => {
  const safeIngredients = Array.isArray(ingredients) ? ingredients : [];
  if (safeIngredients.length === 0) return 0;

  const validation = evaluateBlendSelection(safeIngredients);
  if (!validation.canFinalize) return 0;

  const normalizedIngredients = safeIngredients.map((ingredient) => ({
    category: normalizeBlendIngredientCategory(ingredient?.category),
    unitPriceCents: toPriceCents(ingredient),
  }));
  const nonAromaIngredients = normalizedIngredients.filter((ingredient) => ingredient.category !== 'aroma');
  const aromaIngredients = normalizedIngredients.filter((ingredient) => ingredient.category === 'aroma');
  const hasBase = nonAromaIngredients.some((ingredient) => ingredient.category === 'base');

  let nonAromaReferenceCents = 0;
  if (nonAromaIngredients.length === 1) {
    nonAromaReferenceCents = nonAromaIngredients[0].unitPriceCents;
  } else if (!hasBase) {
    nonAromaReferenceCents = average(nonAromaIngredients.map((ingredient) => ingredient.unitPriceCents));
  } else {
    const categories: Array<'base' | 'flower' | 'fruit' | 'vegetal'> = ['base', 'flower', 'fruit', 'vegetal'];
    const categoryAverages = categories
      .map((category) => {
        const entries = nonAromaIngredients.filter((ingredient) => ingredient.category === category);
        if (entries.length === 0) return null;
        return {
          category,
          average: average(entries.map((entry) => entry.unitPriceCents)),
        };
      })
      .filter((entry): entry is { category: 'base' | 'flower' | 'fruit' | 'vegetal'; average: number } => Boolean(entry));

    const totalWeight = categoryAverages.reduce((sum, entry) => sum + BLEND_CATEGORY_TEMPLATE_WEIGHTS[entry.category], 0);
    if (totalWeight > 0) {
      nonAromaReferenceCents = categoryAverages.reduce((sum, entry) => {
        const ratio = BLEND_CATEGORY_TEMPLATE_WEIGHTS[entry.category] / totalWeight;
        return sum + entry.average * ratio;
      }, 0);
    } else {
      nonAromaReferenceCents = average(nonAromaIngredients.map((ingredient) => ingredient.unitPriceCents));
    }
  }

  const aromaReferenceCents =
    aromaIngredients.length === 0
      ? 0
      : aromaIngredients.length === 1
        ? aromaIngredients[0].unitPriceCents
        : average(aromaIngredients.map((ingredient) => ingredient.unitPriceCents));

  const pouchRawCents =
    aromaIngredients.length > 0
      ? nonAromaReferenceCents * (1 - BLEND_AROMA_SHARE_RATIO) + aromaReferenceCents
      : nonAromaReferenceCents;

  const blendFormat = normalizeBlendFormat(options?.blendFormat || DEFAULT_BLEND_FORMAT);
  const formattedRawCents = blendFormat === 'MUSLIN_20' ? pouchRawCents * BLEND_MUSLIN_RATIO : pouchRawCents;
  return roundUpToTenthEuroCents(formattedRawCents);
};

export const computeBlendUnitPrice = (
  ingredients: BlendPricingIngredient[],
  options?: { blendFormat?: BlendFormatCode | string | null }
) => computeBlendUnitPriceCents(ingredients, options) / 100;
