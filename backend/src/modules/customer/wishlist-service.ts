// @ts-nocheck
export function createWishlistService({
  BLEND_FORMAT_LABELS,
  DEFAULT_BLEND_FORMAT,
  computeBlendUnitPriceCents,
  crypto,
  isBaseCategory,
  normalizeBlendFormat,
  normalizeWishlistCreationName,
  prisma,
  prismaAny,
  t,
}) {
  const buildWishlistCreationSnapshot = async (params) => {
    const ingredientIds = (params.ingredientIds || [])
      .filter((id) => typeof id === 'string')
      .map((id) => id.trim())
      .filter(Boolean);
    if (ingredientIds.length === 0) {
      throw new Error('ingredientIds are required');
    }
    if (new Set(ingredientIds).size !== ingredientIds.length) {
      throw new Error('BLEND_DUPLICATE_INGREDIENT');
    }

    const ingredients = await prisma.ingredient.findMany({
      where: { id: { in: ingredientIds } },
      select: {
        id: true,
        name: true,
        color: true,
        category: true,
        price: true,
      },
    });
    if (ingredients.length !== ingredientIds.length) {
      throw new Error('One or more ingredients not found');
    }

    const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
    const orderedIngredients = ingredientIds.map((id) => ingredientById.get(id));
    const baseColors = orderedIngredients
      .filter((ingredient) => isBaseCategory(ingredient.category))
      .map((ingredient) => ingredient.color || '#C4A77D');
    const blendColor = baseColors[0] || orderedIngredients[0].color || '#C4A77D';
    const blendFormat = normalizeBlendFormat(params.blendFormat || DEFAULT_BLEND_FORMAT);
    const priceCents = computeBlendUnitPriceCents(orderedIngredients, { blendFormat });

    return {
      title: normalizeWishlistCreationName(params.name),
      blendFormat,
      blendFormatLabel: BLEND_FORMAT_LABELS[blendFormat],
      ingredientIds,
      ingredients: orderedIngredients.map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        color: ingredient.color || '#6B7280',
        category: ingredient.category,
      })),
      base: {
        colors: baseColors.map((hex) => ({ hex })),
      },
      blendColor,
      priceCents,
    };
  };

  const buildWishlistVariantSnapshot = async (params) => {
    const variantId = typeof params?.variantId === 'string' ? params.variantId.trim() : '';
    const productId = typeof params?.productId === 'string' ? params.productId.trim() : '';
    if (!variantId && !productId) {
      throw new Error('variantId or productId is required');
    }
    if (variantId) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: variantId },
        include: {
          product: true,
          optionValues: { include: { optionValue: { include: { option: true } } } },
        },
      });
      if (!variant || !variant.product || !variant.product.isActive || !variant.isActive) {
        throw new Error('Variant not found');
      }
      const selectedOptions = (variant.optionValues || []).map((value) => ({
        name: value.optionValue.option.name || 'Option',
        value: value.optionValue.value,
      }));
      const primaryImage =
        (Array.isArray(variant.images)
          ? variant.images.find((imageUrl) => typeof imageUrl === 'string' && imageUrl.trim().length > 0)
          : null) ||
        variant.imageUrl ||
        (Array.isArray(variant.product.images) ? variant.product.images[0] : null) ||
        null;
      return {
        itemType: 'VARIANT',
        title:
          typeof params?.name === 'string' && params.name.trim().length > 0
            ? params.name.trim()
            : variant.product.title || 'Produit',
        productId: variant.product.id,
        productSlug: variant.product.slug || null,
        variantId: variant.id,
        sku: variant.sku || variant.product.sku || null,
        imageUrl: primaryImage,
        priceCents: variant.priceCents,
        selectedOptions,
      };
    }
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product || !product.isActive) {
      throw new Error('Product not found');
    }
    return {
      itemType: 'VARIANT',
      title:
        typeof params?.name === 'string' && params.name.trim().length > 0
          ? params.name.trim()
          : product.title || 'Produit',
      productId: product.id,
      productSlug: product.slug || null,
      variantId: null,
      sku: product.sku || null,
      imageUrl: Array.isArray(product.images) ? product.images[0] || null : null,
      priceCents: typeof product.priceCents === 'number' ? product.priceCents : 0,
      selectedOptions: [],
    };
  };

  const extractWishlistSnapshotIngredientIds = (snapshot) => {
    if (!Array.isArray(snapshot?.ingredientIds)) {
      return [];
    }
    return snapshot.ingredientIds
      .filter((id) => typeof id === 'string')
      .map((id) => id.trim())
      .filter(Boolean);
  };

  const buildWishlistPricingIngredientMap = async (entries) => {
    if (!Array.isArray(entries) || entries.length === 0) {
      return new Map();
    }
    const uniqueIngredientIds = new Set();
    entries.forEach((entry) => {
      const snapshot = entry?.snapshot && typeof entry.snapshot === 'object' ? entry.snapshot : {};
      extractWishlistSnapshotIngredientIds(snapshot).forEach((ingredientId) => uniqueIngredientIds.add(ingredientId));
    });
    if (uniqueIngredientIds.size === 0) {
      return new Map();
    }
    const ingredients = await prisma.ingredient.findMany({
      where: { id: { in: Array.from(uniqueIngredientIds) } },
      select: { id: true, category: true, price: true },
    });
    return new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  };

  const buildWishlistAccessorySkuMap = async (entries) => {
    const productIds = new Set();
    const variantIds = new Set();
    for (const entry of entries || []) {
      const snapshot = entry?.snapshot || {};
      if (!(snapshot.itemType === 'VARIANT' || snapshot.productId || snapshot.variantId)) {
        continue;
      }
      if (typeof snapshot.variantId === 'string' && snapshot.variantId.trim().length > 0) {
        variantIds.add(snapshot.variantId.trim());
      }
      if (typeof snapshot.productId === 'string' && snapshot.productId.trim().length > 0) {
        productIds.add(snapshot.productId.trim());
      }
    }

    const skuByIdentity = new Map();
    if (variantIds.size > 0) {
      const variants = await prisma.productVariant.findMany({
        where: { id: { in: Array.from(variantIds) } },
        select: {
          id: true,
          sku: true,
          product: {
            select: {
              id: true,
              sku: true,
            },
          },
        },
      });
      for (const variant of variants) {
        const fallbackSku = variant.sku || variant.product?.sku || null;
        if (fallbackSku) {
          skuByIdentity.set(`variant:${variant.id}`, fallbackSku);
        }
        if (fallbackSku && variant.product?.id && !skuByIdentity.has(`product:${variant.product.id}`)) {
          skuByIdentity.set(`product:${variant.product.id}`, fallbackSku);
        }
      }
    }

    const missingProductIds = Array.from(productIds).filter((productId) => !skuByIdentity.has(`product:${productId}`));
    if (missingProductIds.length > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: missingProductIds } },
        select: {
          id: true,
          sku: true,
        },
      });
      for (const product of products) {
        if (product.sku) {
          skuByIdentity.set(`product:${product.id}`, product.sku);
        }
      }
    }

    return skuByIdentity;
  };

  const serializeWishlistCreation = (
    entry,
    ingredientById = new Map(),
    accessorySkuByIdentity = new Map()
  ) => {
    const snapshot = entry.snapshot || {};
    if (snapshot.itemType === 'VARIANT' || snapshot.productId || snapshot.variantId) {
      const selectedOptions = Array.isArray(snapshot.selectedOptions)
        ? snapshot.selectedOptions
            .map((option) => ({
              name: typeof option?.name === 'string' ? option.name : 'Option',
              value: typeof option?.value === 'string' ? option.value : '',
            }))
            .filter((option) => option.value.trim().length > 0)
        : [];
      const variantId = typeof snapshot.variantId === 'string' ? snapshot.variantId : null;
      const productId = typeof snapshot.productId === 'string' ? snapshot.productId : null;
      const resolvedSku =
        (typeof snapshot.sku === 'string' && snapshot.sku.trim().length > 0
          ? snapshot.sku
          : (variantId ? accessorySkuByIdentity.get(`variant:${variantId}`) : null) ||
            (productId ? accessorySkuByIdentity.get(`product:${productId}`) : null) ||
            null);
      return {
        id: entry.id,
        createdAt: entry.createdAt,
        itemType: 'VARIANT',
        name: typeof snapshot.title === 'string' && snapshot.title.trim().length > 0 ? snapshot.title.trim() : 'Produit',
        productId,
        productSlug: typeof snapshot.productSlug === 'string' ? snapshot.productSlug : null,
        variantId,
        sku: resolvedSku,
        imageUrl: typeof snapshot.imageUrl === 'string' ? snapshot.imageUrl : null,
        selectedOptions,
        ingredientIds: [],
        ingredients: [],
        base: { colors: [] },
        blendColor: '#C4A77D',
        priceCents:
          typeof snapshot.priceCents === 'number' && Number.isFinite(snapshot.priceCents)
            ? Math.max(0, Math.round(snapshot.priceCents))
            : 0,
      };
    }

    const ingredients = Array.isArray(snapshot.ingredients)
      ? snapshot.ingredients.map((ingredient) => ({
          id: typeof ingredient.id === 'string' ? ingredient.id : '',
          name: typeof ingredient.name === 'string' ? ingredient.name : t("backend.index.ingredient"),
          color: typeof ingredient.color === 'string' ? ingredient.color : '#6B7280',
          category: typeof ingredient.category === 'string' ? ingredient.category : '',
        }))
      : [];
    const ingredientIds = extractWishlistSnapshotIngredientIds(snapshot);
    const baseSnapshot = snapshot.base && typeof snapshot.base === 'object' ? snapshot.base : {};
    const baseColorsFromSnapshot = Array.isArray(baseSnapshot.colors)
      ? baseSnapshot.colors
          .map((colorEntry) => (typeof colorEntry?.hex === 'string' ? colorEntry.hex : null))
          .filter(Boolean)
      : [];
    const fallbackBaseColors = ingredients
      .filter((ingredient) => isBaseCategory(ingredient.category))
      .map((ingredient) => ingredient.color || '#C4A77D');
    const resolvedBaseColors = (
      baseColorsFromSnapshot.length > 0 ? baseColorsFromSnapshot : fallbackBaseColors
    ).map((hex) => ({ hex }));
    const blendFormat = normalizeBlendFormat(snapshot.blendFormat || DEFAULT_BLEND_FORMAT);
    const fallbackPriceCents =
      typeof snapshot.priceCents === 'number' && Number.isFinite(snapshot.priceCents)
        ? Math.max(0, Math.round(snapshot.priceCents))
        : 0;

    let priceCents = fallbackPriceCents;
    const pricingIngredients = ingredientIds.map((ingredientId) => ingredientById.get(ingredientId)).filter(Boolean);
    if (ingredientIds.length > 0 && pricingIngredients.length === ingredientIds.length) {
      try {
        priceCents = computeBlendUnitPriceCents(pricingIngredients, { blendFormat });
      } catch (_error) {
        priceCents = fallbackPriceCents;
      }
    }

    const blendColor =
      typeof snapshot.blendColor === 'string' && snapshot.blendColor.trim().length > 0
        ? snapshot.blendColor
        : resolvedBaseColors[0]?.hex || '#C4A77D';
    return {
      id: entry.id,
      createdAt: entry.createdAt,
      name: normalizeWishlistCreationName(snapshot.title),
      blendFormat,
      ingredientIds,
      ingredients,
      base: {
        colors: resolvedBaseColors,
      },
      blendColor,
      priceCents,
    };
  };

  const getWishlistDelegate = () => prismaAny.wishlistCreation;

  const ensureWishlistTable = async () => {
    await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WishlistCreation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "customerId" TEXT NOT NULL,
      "snapshot" JSONB NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
    await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WishlistCreation_customerId_createdAt_idx"
    ON "WishlistCreation"("customerId", "createdAt");
  `);
  };

  const listWishlistRows = async (customerId) => {
    const delegate = getWishlistDelegate();
    if (delegate) {
      return delegate.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
      });
    }
    await ensureWishlistTable();
    const rows = await prisma.$queryRaw`
    SELECT "id", "createdAt", "snapshot"
    FROM "WishlistCreation"
    WHERE "customerId" = ${customerId}
    ORDER BY "createdAt" DESC
  `;
    return rows;
  };

  const createWishlistRow = async (customerId, snapshot) => {
    const delegate = getWishlistDelegate();
    if (delegate) {
      return delegate.create({
        data: {
          customerId,
          snapshot,
        },
      });
    }
    await ensureWishlistTable();
    const id = crypto.randomUUID();
    const rows = await prisma.$queryRaw`
    INSERT INTO "WishlistCreation" ("id", "customerId", "snapshot", "createdAt", "updatedAt")
    VALUES (${id}, ${customerId}, CAST(${JSON.stringify(snapshot)} AS jsonb), NOW(), NOW())
    RETURNING "id", "createdAt", "snapshot"
  `;
    return rows[0];
  };

  const deleteWishlistRow = async (customerId, wishlistId) => {
    const delegate = getWishlistDelegate();
    if (delegate) {
      const existing = await delegate.findFirst({
        where: {
          id: wishlistId,
          customerId,
        },
        select: { id: true },
      });
      if (!existing) {
        return false;
      }
      await delegate.delete({ where: { id: existing.id } });
      return true;
    }
    await ensureWishlistTable();
    const existing = await prisma.$queryRaw`
    SELECT "id"
    FROM "WishlistCreation"
    WHERE "id" = ${wishlistId} AND "customerId" = ${customerId}
    LIMIT 1
  `;
    if (!existing.length) {
      return false;
    }
    await prisma.$executeRaw`
    DELETE FROM "WishlistCreation"
    WHERE "id" = ${wishlistId} AND "customerId" = ${customerId}
  `;
    return true;
  };

  return {
    buildWishlistAccessorySkuMap,
    buildWishlistCreationSnapshot,
    buildWishlistPricingIngredientMap,
    buildWishlistVariantSnapshot,
    createWishlistRow,
    deleteWishlistRow,
    listWishlistRows,
    serializeWishlistCreation,
  };
}
