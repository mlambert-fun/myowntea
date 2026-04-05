// @ts-nocheck
export function createCatalogService({
  applyBlendListingTranslations,
  applyIngredientTranslations,
  applyProductTranslations,
  computeBlendUnitPriceCents,
  getAllowedTranslationFields,
  isBaseCategory,
  loadEntityTranslations,
  prisma,
  resolveLocaleVariants,
  slugify,
  t,
  toBlendPricingErrorResponse,
  toNonEmptyStringOrNull,
}) {
  const DAY_MOMENTS = [
    'Matin',
    t("backend.index.apres_midi"),
    'Soir',
    t("backend.index.toute_daytime"),
  ];

  const normalizeStringField = (value, fieldName) => {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    if (typeof value !== 'string') {
      throw new Error(`${fieldName} must be a string`);
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  };

  const normalizeDayMoments = (value) => {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const rawList = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];
    const cleaned = Array.from(new Set(rawList.map((entry) => String(entry).trim()).filter(Boolean)));
    if (cleaned.some((item) => !DAY_MOMENTS.includes(item))) {
      throw new Error('Invalid dayMoments value');
    }
    return cleaned.length ? cleaned : null;
  };

  const normalizeTasteMetric = (value) => {
    if (value === undefined || value === null || value === '') {
      return 3;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return 3;
    }
    const rounded = Math.round(parsed);
    if (rounded < 1 || rounded > 5) {
      return 3;
    }
    return rounded;
  };

  const normalizeBaseFields = (payload, category) => {
    if (!isBaseCategory(category)) {
      return {
        dayMoments: null,
        infusionTime: null,
        dosage: null,
        temperature: null,
        preparation: null,
        origin: null,
      };
    }
    return {
      dayMoments: normalizeDayMoments(payload.dayMoments),
      infusionTime: normalizeStringField(payload.infusionTime, 'infusionTime'),
      dosage: normalizeStringField(payload.dosage, 'dosage'),
      temperature: normalizeStringField(payload.temperature, 'temperature'),
      preparation: normalizeStringField(payload.preparation, 'preparation'),
      origin: normalizeStringField(payload.origin, 'origin'),
    };
  };

  const ensureUniqueBlendListingSlug = async (base) => {
    let slug = slugify(base) || `creation-${Date.now()}`;
    let suffix = 1;
    while (await prisma.blendListing.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${slugify(base)}-${suffix}`;
    }
    return slug;
  };

  const normalizeIngredientIds = (value) => {
    if (!Array.isArray(value)) {
      return [];
    }
    return Array.from(
      new Set(
        value
          .filter((item) => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  };

  const parseBlendListingRanking = (value, defaultValue) => {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    const normalized = Math.round(parsed);
    if (normalized < 0) {
      return null;
    }
    return normalized;
  };

  const parseProductRanking = (value, defaultValue) => {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    const normalized = Math.round(parsed);
    if (normalized < 0) {
      return null;
    }
    return normalized;
  };

  const resolveRequestDataLocale = (req) => {
    return resolveLocaleVariants({
      queryLocale: req?.query?.locale,
      acceptLanguage: req?.headers?.['accept-language'],
    }).requested;
  };

  const localizeIngredientsForRequest = async (req, ingredients) => {
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return ingredients;
    }
    const locale = resolveRequestDataLocale(req);
    const map = await loadEntityTranslations(prisma, {
      entityType: 'INGREDIENT',
      entityIds: ingredients.map((ingredient) => ingredient.id),
      fields: getAllowedTranslationFields('INGREDIENT'),
      locale,
    });
    return applyIngredientTranslations(ingredients, map);
  };

  const localizeProductsForRequest = async (req, products) => {
    if (!Array.isArray(products) || products.length === 0) {
      return products;
    }
    const locale = resolveRequestDataLocale(req);
    const productIds = products.map((product) => product.id).filter(Boolean);
    const optionIds = products
      .flatMap((product) => (Array.isArray(product.options) ? product.options : []))
      .map((option) => option?.id)
      .filter(Boolean);
    const optionValueIds = products
      .flatMap((product) => {
        const optionValuesFromOptions = (Array.isArray(product.options) ? product.options : [])
          .flatMap((option) => (Array.isArray(option.values) ? option.values : []));
        const optionValuesFromVariants = (Array.isArray(product.variants) ? product.variants : [])
          .flatMap((variant) => (Array.isArray(variant.optionValues) ? variant.optionValues : []))
          .map((entry) => entry?.optionValue)
          .filter(Boolean);
        return [...optionValuesFromOptions, ...optionValuesFromVariants];
      })
      .map((value) => value?.id)
      .filter(Boolean);
    const [productMap, optionMap, optionValueMap] = await Promise.all([
      loadEntityTranslations(prisma, {
        entityType: 'PRODUCT',
        entityIds: productIds,
        fields: getAllowedTranslationFields('PRODUCT'),
        locale,
      }),
      loadEntityTranslations(prisma, {
        entityType: 'PRODUCT_OPTION',
        entityIds: optionIds,
        fields: getAllowedTranslationFields('PRODUCT_OPTION'),
        locale,
      }),
      loadEntityTranslations(prisma, {
        entityType: 'PRODUCT_OPTION_VALUE',
        entityIds: optionValueIds,
        fields: getAllowedTranslationFields('PRODUCT_OPTION_VALUE'),
        locale,
      }),
    ]);
    return applyProductTranslations(products, {
      productMap,
      optionMap,
      optionValueMap,
    });
  };

  const localizeBlendListingsForRequest = async (req, listings) => {
    if (!Array.isArray(listings) || listings.length === 0) {
      return listings;
    }
    const locale = resolveRequestDataLocale(req);
    const listingIds = listings.map((listing) => listing?.id).filter(Boolean);
    const blendIds = listings.map((listing) => listing?.blend?.id).filter(Boolean);
    const ingredientIds = listings
      .flatMap((listing) => {
        const ingredients = Array.isArray(listing?.blend?.ingredients)
          ? listing.blend.ingredients
          : [];
        return ingredients.map((entry) => entry?.ingredient?.id).filter(Boolean);
      })
      .filter(Boolean);
    const [listingMap, blendMap, ingredientMap] = await Promise.all([
      loadEntityTranslations(prisma, {
        entityType: 'BLEND_LISTING',
        entityIds: listingIds,
        fields: getAllowedTranslationFields('BLEND_LISTING'),
        locale,
      }),
      loadEntityTranslations(prisma, {
        entityType: 'BLEND',
        entityIds: blendIds,
        fields: getAllowedTranslationFields('BLEND'),
        locale,
      }),
      loadEntityTranslations(prisma, {
        entityType: 'INGREDIENT',
        entityIds: ingredientIds,
        fields: getAllowedTranslationFields('INGREDIENT'),
        locale,
      }),
    ]);
    return applyBlendListingTranslations(listings, {
      listingMap,
      blendMap,
      ingredientMap,
    });
  };

  const toBlendPricingIngredient = (value) => {
    if (!value || typeof value !== 'object') {
      return null;
    }
    return {
      id: typeof value.id === 'string' ? value.id : undefined,
      category: typeof value.category === 'string' ? value.category : '',
      price: typeof value.price === 'number' && Number.isFinite(value.price) ? value.price : 0,
    };
  };

  const toBlendPricingIngredientsFromBlendEntries = (entries) => {
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries
      .map((entry) => {
        const nestedIngredient = entry?.ingredient;
        return toBlendPricingIngredient(nestedIngredient || entry);
      })
      .filter(Boolean);
  };

  const toBlendPricingErrorPayload = (error) => {
    const pricingError = toBlendPricingErrorResponse(error);
    if (!pricingError) {
      return null;
    }
    return {
      error: pricingError.message,
      code: pricingError.code,
    };
  };

  const assertBlendPricingIngredients = (ingredients) => {
    computeBlendUnitPriceCents(ingredients, { blendFormat: 'POUCH_100G' });
  };

  const computeBlendListingPricing = (listing) => {
    const pricingIngredients = toBlendPricingIngredientsFromBlendEntries(
      listing?.blend?.ingredients
    );
    if (pricingIngredients.length === 0) {
      return {
        priceCents: 0,
        priceByFormatCents: {
          POUCH_100G: 0,
          MUSLIN_20: 0,
        },
        pricingErrorCode: 'BLEND_EMPTY',
      };
    }
    try {
      const pouchPriceCents = computeBlendUnitPriceCents(pricingIngredients, {
        blendFormat: 'POUCH_100G',
      });
      const muslinPriceCents = computeBlendUnitPriceCents(pricingIngredients, {
        blendFormat: 'MUSLIN_20',
      });
      return {
        priceCents: pouchPriceCents,
        priceByFormatCents: {
          POUCH_100G: pouchPriceCents,
          MUSLIN_20: muslinPriceCents,
        },
        pricingErrorCode: null,
      };
    } catch (error) {
      const pricingError = toBlendPricingErrorResponse(error);
      return {
        priceCents: 0,
        priceByFormatCents: {
          POUCH_100G: 0,
          MUSLIN_20: 0,
        },
        pricingErrorCode: pricingError?.code || 'BLEND_PRICING_ERROR',
      };
    }
  };

  const serializeBlendListingWithPricing = (listing) => {
    const pricing = computeBlendListingPricing(listing);
    return {
      ...listing,
      priceCents: pricing.priceCents,
      priceByFormatCents: pricing.priceByFormatCents,
      pricingErrorCode: pricing.pricingErrorCode,
    };
  };

  const normalizeStoreContactField = (value) => {
    return toNonEmptyStringOrNull(value);
  };

  const normalizeVariantImages = (variant) => {
    const images = Array.isArray(variant?.images)
      ? variant.images.filter(
          (image) => typeof image === 'string' && image.trim().length > 0
        )
      : [];
    if (images.length > 0) {
      return images;
    }
    return typeof variant?.imageUrl === 'string' && variant.imageUrl.trim().length > 0
      ? [variant.imageUrl]
      : [];
  };

  const mapProductVariant = (variant) => {
    const images = normalizeVariantImages(variant);
    return {
      id: variant.id,
      productId: variant.productId,
      sku: variant.sku,
      priceCents: variant.priceCents,
      stockQty: variant.stockQty,
      imageUrl: images[0] || null,
      images,
      isActive: variant.isActive,
      createdAt: variant.createdAt,
      updatedAt: variant.updatedAt,
      optionValues: (variant.optionValues || []).map((value) => ({
        id: value.optionValue.id,
        value: value.optionValue.value,
        optionId: value.optionValue.optionId,
        position: value.optionValue.position,
        optionName: value.optionValue.option.name,
      })),
    };
  };

  const mapProductForApi = (product) => {
    const variants = (product.variants || []).map(mapProductVariant);
    return {
      ...product,
      variants,
      defaultVariant: variants[0] || null,
    };
  };

  const mapAdminProductForApi = (product) => {
    const variants = (product.variants || []).map(mapProductVariant);
    return {
      ...product,
      variants,
    };
  };

  const normalizeProductTags = (value) => {
    if (!Array.isArray(value)) {
      return [];
    }
    return Array.from(
      new Set(
        value
          .filter((tag) => typeof tag === 'string')
          .map((tag) => tag.trim())
          .filter(Boolean)
      )
    );
  };

  return {
    assertBlendPricingIngredients,
    ensureUniqueBlendListingSlug,
    localizeBlendListingsForRequest,
    localizeIngredientsForRequest,
    localizeProductsForRequest,
    mapAdminProductForApi,
    mapProductForApi,
    mapProductVariant,
    normalizeBaseFields,
    normalizeIngredientIds,
    normalizeProductTags,
    normalizeStoreContactField,
    normalizeTasteMetric,
    normalizeVariantImages,
    parseBlendListingRanking,
    parseProductRanking,
    serializeBlendListingWithPricing,
    toBlendPricingErrorPayload,
    toBlendPricingIngredientsFromBlendEntries,
  };
}
