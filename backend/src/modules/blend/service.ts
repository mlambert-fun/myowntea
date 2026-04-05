// @ts-nocheck
export function createBlendService({ t }) {
  const BLEND_MAX_INGREDIENTS = 10;
  const BLEND_MAX_AROMAS = 2;
  const BLEND_AROMA_SHARE_RATIO = 0.1;
  const BLEND_MUSLIN_RATIO = 0.8;
  const BLEND_CATEGORY_TEMPLATE_WEIGHTS = {
    base: 65,
    flower: 5,
    fruit: 15,
    vegetal: 5,
  };
  const DEFAULT_BLEND_FORMAT = 'POUCH_100G';
  const BLEND_FORMAT_LABELS = {
    POUCH_100G: 'Pochette vrac 100g',
    MUSLIN_20: 'Sachets mousselines x20',
  };
  const BLEND_SUBSCRIPTION_KIND = 'BLEND';
  const BLEND_SUBSCRIPTION_DISCOUNT_PERCENT = 10;
  const BLEND_SUBSCRIPTION_INTERVAL_COUNTS = new Set([1, 2, 3]);

  const normalizeWishlistCreationName = (value) => {
    if (typeof value !== 'string') {
      return t("backend.index.my_blend");
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : t("backend.index.my_blend");
  };

  const normalizeBlendFormat = (value) => {
    const normalized = String(value || '')
      .trim()
      .toUpperCase();
    if (
      normalized === 'MUSLIN_20' ||
      normalized === 'SACHETS_MOUSSELINES_X20' ||
      normalized === 'SACHETS_MOUSSELINE_X20'
    ) {
      return 'MUSLIN_20';
    }
    return 'POUCH_100G';
  };

  const normalizeBlendIngredientCategory = (value) => {
    const normalized = String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    if (normalized.startsWith('base') || normalized === 'tea') {
      return 'base';
    }
    if (normalized.startsWith('fleur') || normalized.startsWith('flower')) {
      return 'flower';
    }
    if (normalized.startsWith('fruit')) {
      return 'fruit';
    }
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
    return normalized;
  };

  const isBaseCategory = (category) => normalizeBlendIngredientCategory(category) === 'base';
  const isAromaCategory = (category) => normalizeBlendIngredientCategory(category) === 'aroma';

  const isMuslinBlendFormat = (value) => {
    const normalized = String(value || '')
      .trim()
      .toUpperCase();
    return (
      normalized === 'MUSLIN_20' ||
      normalized === 'SACHETS_MOUSSELINES_X20' ||
      normalized === 'SACHETS_MOUSSELINE_X20'
    );
  };

  const normalizeIngredientLookupKey = (value) =>
    value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

  const toBlendPricingSignature = (ingredient, index) => {
    const id = typeof ingredient?.id === 'string' ? ingredient.id.trim() : '';
    if (id) {
      return `id:${id}`;
    }
    const name = normalizeIngredientLookupKey(ingredient?.name || '');
    const category = normalizeBlendIngredientCategory(ingredient?.category || '');
    if (name) {
      return `name:${name}|category:${category}`;
    }
    return `index:${index}`;
  };

  const roundUpToTenthEuroCents = (rawCents) => Math.max(0, Math.ceil(rawCents / 10) * 10);

  const averageCents = (values) => {
    if (!Array.isArray(values) || values.length === 0) {
      return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const validateBlendPricingIngredients = (ingredients) => {
    const safeIngredients = Array.isArray(ingredients) ? ingredients : [];
    if (safeIngredients.length === 0) {
      return;
    }
    if (safeIngredients.length > BLEND_MAX_INGREDIENTS) {
      throw new Error('BLEND_TOO_MANY_INGREDIENTS');
    }
    const signatures = new Set();
    safeIngredients.forEach((ingredient, index) => {
      const signature = toBlendPricingSignature(ingredient, index);
      if (signatures.has(signature)) {
        throw new Error('BLEND_DUPLICATE_INGREDIENT');
      }
      signatures.add(signature);
    });
    const aromaCount = safeIngredients.reduce(
      (count, ingredient) => count + (isAromaCategory(ingredient?.category) ? 1 : 0),
      0
    );
    if (aromaCount > BLEND_MAX_AROMAS) {
      throw new Error('BLEND_TOO_MANY_AROMAS');
    }
    const nonAromaCount = safeIngredients.reduce(
      (count, ingredient) => count + (!isAromaCategory(ingredient?.category) ? 1 : 0),
      0
    );
    if (nonAromaCount === 0) {
      throw new Error('BLEND_ONLY_AROMA_NOT_ALLOWED');
    }
  };

  const toBlendPricingErrorResponse = (error) => {
    if (!(error instanceof Error)) {
      return null;
    }
    const code = error.message;
    if (code === 'BLEND_TOO_MANY_INGREDIENTS') {
      return { code, message: t("backend.index.melange_peut_pas_2") };
    }
    if (code === 'BLEND_TOO_MANY_AROMAS') {
      return { code, message: t("backend.index.melange_peut_pas") };
    }
    if (code === 'BLEND_ONLY_AROMA_NOT_ALLOWED') {
      return { code, message: t("backend.index.add_ingredient_hors") };
    }
    if (code === 'BLEND_DUPLICATE_INGREDIENT') {
      return { code, message: t("backend.index.meme_ingredient_peut") };
    }
    return null;
  };

  const toPriceCents = (price) => {
    const numericPrice = typeof price === 'number' && Number.isFinite(price) ? price : 0;
    return Math.max(0, Math.round(numericPrice * 100));
  };

  const resolveBlendIngredientsForPricing = (params) => {
    const ids = Array.isArray(params.ingredientIds) ? params.ingredientIds : [];
    const names = Array.isArray(params.ingredientNames) ? params.ingredientNames : [];
    const resolvedIngredients = [];
    let matched = 0;

    if (ids.length === 0 && names.length > 0) {
      names.forEach((name) => {
        const normalized = normalizeIngredientLookupKey(name || '');
        const ingredient = params.ingredientByName.get(normalized);
        if (ingredient) {
          resolvedIngredients.push(ingredient);
          matched += 1;
        }
      });
    }

    ids.forEach((id, index) => {
      const byId = params.ingredientById.get(id);
      if (byId) {
        resolvedIngredients.push(byId);
        matched += 1;
        return;
      }
      const name = names[index];
      const normalized = name ? normalizeIngredientLookupKey(name) : '';
      const byName = normalized ? params.ingredientByName.get(normalized) : undefined;
      if (byName) {
        resolvedIngredients.push(byName);
        matched += 1;
      }
    });

    if (
      (ids.length > 0 && matched !== ids.length) ||
      (ids.length === 0 && names.length > 0 && matched !== names.length)
    ) {
      throw new Error('INGREDIENT_NOT_FOUND');
    }

    return resolvedIngredients;
  };

  const computeBlendUnitPriceCents = (ingredients, options = {}) => {
    const safeIngredients = Array.isArray(ingredients) ? ingredients : [];
    if (safeIngredients.length === 0) {
      return 0;
    }
    validateBlendPricingIngredients(safeIngredients);
    const normalizedIngredients = safeIngredients.map((ingredient) => ({
      category: normalizeBlendIngredientCategory(ingredient?.category),
      unitPriceCents: toPriceCents(ingredient?.price),
    }));
    const nonAromaIngredients = normalizedIngredients.filter((ingredient) => ingredient.category !== 'aroma');
    const aromaIngredients = normalizedIngredients.filter((ingredient) => ingredient.category === 'aroma');
    const hasBase = nonAromaIngredients.some((ingredient) => ingredient.category === 'base');

    let nonAromaReferenceCents = 0;
    if (nonAromaIngredients.length === 1) {
      nonAromaReferenceCents = nonAromaIngredients[0].unitPriceCents;
    } else if (!hasBase) {
      nonAromaReferenceCents = averageCents(nonAromaIngredients.map((ingredient) => ingredient.unitPriceCents));
    } else {
      const categoryAverages = Object.keys(BLEND_CATEGORY_TEMPLATE_WEIGHTS)
        .map((category) => {
          const categoryIngredients = nonAromaIngredients.filter((ingredient) => ingredient.category === category);
          if (categoryIngredients.length === 0) {
            return null;
          }
          return {
            category,
            average: averageCents(categoryIngredients.map((ingredient) => ingredient.unitPriceCents)),
          };
        })
        .filter(Boolean);
      const totalWeight = categoryAverages.reduce(
        (sum, entry) => sum + BLEND_CATEGORY_TEMPLATE_WEIGHTS[entry.category],
        0
      );
      if (totalWeight > 0) {
        nonAromaReferenceCents = categoryAverages.reduce((sum, entry) => {
          const ratio = BLEND_CATEGORY_TEMPLATE_WEIGHTS[entry.category] / totalWeight;
          return sum + entry.average * ratio;
        }, 0);
      } else {
        nonAromaReferenceCents = averageCents(nonAromaIngredients.map((ingredient) => ingredient.unitPriceCents));
      }
    }

    const aromaReferenceCents =
      aromaIngredients.length === 0
        ? 0
        : aromaIngredients.length === 1
          ? aromaIngredients[0].unitPriceCents
          : averageCents(aromaIngredients.map((ingredient) => ingredient.unitPriceCents));
    const pouchRawCents =
      aromaIngredients.length > 0
        ? nonAromaReferenceCents * (1 - BLEND_AROMA_SHARE_RATIO) + aromaReferenceCents
        : nonAromaReferenceCents;
    const formatRawCents = isMuslinBlendFormat(options.blendFormat)
      ? pouchRawCents * BLEND_MUSLIN_RATIO
      : pouchRawCents;
    return roundUpToTenthEuroCents(formatRawCents);
  };

  const normalizeBlendSubscriptionIntervalCount = (value) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    const normalized = Math.round(parsed);
    return BLEND_SUBSCRIPTION_INTERVAL_COUNTS.has(normalized) ? normalized : 1;
  };

  const discountBlendSubscriptionPriceCents = (
    priceCents,
    discountPercent = BLEND_SUBSCRIPTION_DISCOUNT_PERCENT
  ) => {
    const normalizedPrice = Math.max(0, Math.round(Number(priceCents) || 0));
    const normalizedDiscount = Math.min(100, Math.max(0, Math.round(Number(discountPercent) || 0)));
    return Math.max(0, Math.round((normalizedPrice * (100 - normalizedDiscount)) / 100));
  };

  const normalizeBlendCartPurchaseMode = (value) => (value === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'ONE_TIME');

  const buildBlendSubscriptionTitle = (value, fallback = 'My Own Tea Signature') => {
    const normalized = normalizeWishlistCreationName(value);
    return normalized || fallback;
  };

  const buildBlendSubscriptionSetupSnapshot = (params) => ({
    kind: BLEND_SUBSCRIPTION_KIND,
    sourceType: params.sourceType === 'LISTING' ? 'LISTING' : 'CUSTOM',
    listingId:
      typeof params.listingId === 'string' && params.listingId.trim().length > 0
        ? params.listingId.trim()
        : null,
    title: buildBlendSubscriptionTitle(params.title),
    blendFormat: normalizeBlendFormat(params.blendFormat || DEFAULT_BLEND_FORMAT),
    interval: 'month',
    intervalCount: normalizeBlendSubscriptionIntervalCount(params.intervalCount),
    basePriceCents: Math.max(0, Math.round(Number(params.basePriceCents) || 0)),
    unitPriceCents: Math.max(0, Math.round(Number(params.unitPriceCents) || 0)),
    shippingCents: Math.max(0, Math.round(Number(params.shippingCents) || 0)),
    discountPercent: Math.max(
      0,
      Math.round(Number(params.discountPercent) || BLEND_SUBSCRIPTION_DISCOUNT_PERCENT)
    ),
  });

  const getBlendSubscriptionSetupFromSnapshot = (snapshot) => {
    const setup = snapshot?.subscriptionSetup;
    if (!setup || typeof setup !== 'object' || setup.kind !== BLEND_SUBSCRIPTION_KIND) {
      return null;
    }
    return buildBlendSubscriptionSetupSnapshot(setup);
  };

  const isBlendSubscriptionCartItem = (item) =>
    item?.itemType === 'BLEND' && Boolean(getBlendSubscriptionSetupFromSnapshot(item?.snapshot));

  return {
    BLEND_FORMAT_LABELS,
    BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
    BLEND_SUBSCRIPTION_KIND,
    DEFAULT_BLEND_FORMAT,
    buildBlendSubscriptionSetupSnapshot,
    buildBlendSubscriptionTitle,
    computeBlendUnitPriceCents,
    discountBlendSubscriptionPriceCents,
    getBlendSubscriptionSetupFromSnapshot,
    isAromaCategory,
    isBaseCategory,
    isBlendSubscriptionCartItem,
    normalizeBlendCartPurchaseMode,
    normalizeBlendFormat,
    normalizeBlendIngredientCategory,
    normalizeBlendSubscriptionIntervalCount,
    normalizeIngredientLookupKey,
    normalizeWishlistCreationName,
    resolveBlendIngredientsForPricing,
    toBlendPricingErrorResponse,
  };
}
