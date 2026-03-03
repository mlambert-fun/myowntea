export type IngredientCategorySortable = {
  name?: string | null;
  category?: string | null;
};

const normalizeCategory = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const getCategoryRank = (value: unknown): number => {
  const normalized = normalizeCategory(value);

  if (
    normalized.startsWith('base') ||
    normalized === 'tea' ||
    normalized === 'the' ||
    normalized.startsWith('tea')
  ) {
    return 0;
  }
  if (normalized.startsWith('fleur') || normalized.startsWith('flower')) return 1;
  if (normalized.startsWith('fruit')) return 2;
  if (
    normalized.startsWith('plante') ||
    normalized.startsWith('plant') ||
    normalized.startsWith('herb') ||
    normalized.startsWith('vegetal')
  ) {
    return 3;
  }
  if (
    normalized.startsWith('arome') ||
    normalized.startsWith('aroma') ||
    normalized.startsWith('flavor') ||
    normalized.startsWith('flavour') ||
    normalized.startsWith('spice')
  ) {
    return 4;
  }

  return 99;
};

export function sortIngredientsByCategoryOrder<T extends IngredientCategorySortable>(
  ingredients: T[]
): T[] {
  return ingredients
    .map((ingredient, index) => ({
      ingredient,
      index,
      rank: getCategoryRank(ingredient.category),
      label: String(ingredient.name || ''),
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;

      // Keep original order if category could not be identified.
      if (left.rank === 99) return left.index - right.index;

      const byName = left.label.localeCompare(right.label, 'fr', { sensitivity: 'base' });
      if (byName !== 0) return byName;

      return left.index - right.index;
    })
    .map((entry) => entry.ingredient);
}
