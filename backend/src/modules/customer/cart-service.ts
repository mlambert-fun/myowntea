// @ts-nocheck
export function createCartService({
  hasPaidOrConfirmedOrder,
  normalizeEmail,
  prisma,
}) {
  const getActiveCart = async (customerId) => {
    const carts = await prisma.cart.findMany({
      where: { customerId, status: 'ACTIVE' },
      include: { items: true },
      orderBy: { updatedAt: 'desc' },
    });
    let cart = carts.find((entry) => entry.items.length > 0) || carts[0] || null;
    if (!cart) {
      cart = await prisma.cart.create({
        data: { customerId, status: 'ACTIVE', currency: 'EUR' },
        include: { items: true },
      });
    }
    return cart;
  };

  const touchCartUpdatedAt = async (cartId) => {
    await prisma.$executeRaw`
    UPDATE "Cart"
    SET "updatedAt" = NOW()
    WHERE "id" = ${cartId}
  `;
  };

  const asPlainObject = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value;
  };

  const toSafeInt = (value, fallback = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(0, Math.round(parsed));
  };

  const toSafePositiveInt = (value, fallback = 0) => {
    const parsed = toSafeInt(value, fallback);
    return parsed > 0 ? parsed : fallback;
  };

  const toStringIdSet = (value) => {
    if (!Array.isArray(value)) {
      return new Set();
    }
    return new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
    );
  };

  const isGiftCartItem = (item) => {
    const snapshot = asPlainObject(item?.snapshot);
    return Boolean(snapshot.isGift);
  };

  const mapCartItemToDiscountInput = (item) => ({
    itemType: item.itemType,
    quantity: Math.max(1, item.qty || 1),
    unitPriceCents: Math.max(0, item.unitPriceCents || 0),
    lineSubtotalCents: Math.max(0, item.unitPriceCents || 0) * Math.max(1, item.qty || 1),
    productId: typeof item.snapshot?.productId === 'string' ? item.snapshot.productId : null,
    variantId: typeof item.snapshot?.variantId === 'string' ? item.snapshot.variantId : item.variantId || null,
    subscriptionPlanId:
      item.subscriptionPlanId || (typeof item.snapshot?.planId === 'string' ? item.snapshot.planId : null),
    isGift: isGiftCartItem(item),
  });

  const resolveGiftDiscountRule = (discount, cartItemsForDiscount, subtotalCents) => {
    const config = asPlainObject(discount.config);
    const giftVariantId = typeof config.giftVariantId === 'string' ? config.giftVariantId.trim() : '';
    const giftProductId = typeof config.giftProductId === 'string' ? config.giftProductId.trim() : '';
    if (!giftVariantId && !giftProductId) {
      return null;
    }
    const triggerProductIds = toStringIdSet(config.triggerProductIds);
    const triggerVariantIds = toStringIdSet(config.triggerVariantIds);
    const triggerQty = Math.max(1, toSafePositiveInt(config.triggerQty, 1));
    const hasProductTrigger = triggerProductIds.size > 0 || triggerVariantIds.size > 0;
    const triggerCount = hasProductTrigger
      ? cartItemsForDiscount.reduce((sum, item) => {
          const matchesProduct = item.productId ? triggerProductIds.has(item.productId) : false;
          const matchesVariant = item.variantId ? triggerVariantIds.has(item.variantId) : false;
          if (matchesProduct || matchesVariant) {
            return sum + Math.max(1, item.quantity || 1);
          }
          return sum;
        }, 0)
      : 0;
    const productTriggerMatched = hasProductTrigger && triggerCount >= triggerQty;
    const minimumSubtotalFromConfig = toSafeInt(config.triggerMinimumSubtotalCents, 0);
    const minimumSubtotalFromDiscount = toSafeInt(discount.minimumSubtotalCents, 0);
    const thresholdCents = Math.max(minimumSubtotalFromConfig, minimumSubtotalFromDiscount);
    const thresholdMatched = thresholdCents > 0 ? subtotalCents >= thresholdCents : false;
    if (!thresholdMatched && !productTriggerMatched) {
      return null;
    }
    let giftQty = 1;
    const forcedGiftQty = toSafePositiveInt(config.giftQty, 0);
    if (forcedGiftQty > 0) {
      giftQty = forcedGiftQty;
    } else if (productTriggerMatched && Boolean(config.repeatPerTrigger)) {
      giftQty = Math.max(1, Math.floor(triggerCount / triggerQty));
    }
    const maxGiftQty = Math.max(1, toSafePositiveInt(config.maxGiftQty, 1));
    giftQty = Math.min(giftQty, maxGiftQty);
    if (!Number.isFinite(giftQty) || giftQty <= 0) {
      return null;
    }
    return {
      discountId: discount.id,
      discountTitle: discount.title,
      giftVariantId: giftVariantId || null,
      giftProductId: giftProductId || null,
      qty: Math.max(1, Math.round(giftQty)),
    };
  };

  const buildGiftIdentityKey = (itemType, variantId, productId) => {
    if (variantId) {
      return `${itemType}:variant:${variantId}`;
    }
    if (productId) {
      return `${itemType}:product:${productId}`;
    }
    return `${itemType}:unknown`;
  };

  const syncAutomaticGiftCartItems = async ({ customer, cartId }) => {
    let cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: { items: true },
    });
    if (!cart) {
      return null;
    }
    const existingGiftItems = cart.items.filter((item) => isGiftCartItem(item));
    const baseItems = cart.items.filter((item) => !isGiftCartItem(item));
    const desiredGiftRules = [];

    if (baseItems.length > 0 && !baseItems.some((item) => item.itemType === 'SUBSCRIPTION')) {
      const cartItemsForDiscount = baseItems.map((item) => mapCartItemToDiscountInput(item));
      const subtotalCents = cartItemsForDiscount.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
      const customerEmail = normalizeEmail(customer?.email);
      const giftDiscounts = await prisma.discount.findMany({
        where: {
          status: 'ACTIVE',
          method: 'AUTOMATIC',
          type: 'GIFT',
        },
        orderBy: { createdAt: 'asc' },
      });
      if (giftDiscounts.length > 0) {
        const giftDiscountIds = giftDiscounts.map((discount) => discount.id);
        const totalRedemptions = await prisma.discountRedemption.groupBy({
          by: ['discountId'],
          where: { discountId: { in: giftDiscountIds } },
          _count: { _all: true },
        });
        const customerRedemptions = customerEmail
          ? await prisma.discountRedemption.groupBy({
              by: ['discountId'],
              where: {
                discountId: { in: giftDiscountIds },
                customerEmail,
              },
              _count: { _all: true },
            })
          : [];
        const usageById = {};
        totalRedemptions.forEach((entry) => {
          usageById[entry.discountId] = {
            totalRedemptions: entry._count._all,
            customerRedemptions: 0,
          };
        });
        customerRedemptions.forEach((entry) => {
          if (!usageById[entry.discountId]) {
            usageById[entry.discountId] = { totalRedemptions: 0, customerRedemptions: 0 };
          }
          usageById[entry.discountId].customerRedemptions = entry._count._all;
        });
        const isFirstOrderEligible = !(await hasPaidOrConfirmedOrder({
          customerId: customer.id,
          customerEmail: customerEmail || null,
        }));
        const now = new Date();
        giftDiscounts.forEach((discount) => {
          if (discount.startAt && now < discount.startAt) {
            return;
          }
          if (discount.endAt && now > discount.endAt) {
            return;
          }
          if (Boolean(discount.firstOrderOnly) && !isFirstOrderEligible) {
            return;
          }
          const usage = usageById[discount.id] || { totalRedemptions: 0, customerRedemptions: 0 };
          if (
            discount.usageLimitTotal !== null &&
            discount.usageLimitTotal !== undefined &&
            usage.totalRedemptions >= discount.usageLimitTotal
          ) {
            return;
          }
          if (discount.usageLimitPerCustomer !== null && discount.usageLimitPerCustomer !== undefined) {
            if (!customerEmail) {
              return;
            }
            if (usage.customerRedemptions >= discount.usageLimitPerCustomer) {
              return;
            }
          }
          const rule = resolveGiftDiscountRule(discount, cartItemsForDiscount, subtotalCents);
          if (rule) {
            desiredGiftRules.push(rule);
          }
        });
      }
    }

    const desiredByKey = new Map();
    desiredGiftRules.forEach((rule) => {
      const key = rule.giftVariantId ? `variant:${rule.giftVariantId}` : `product:${rule.giftProductId}`;
      if (!key) {
        return;
      }
      const existing = desiredByKey.get(key);
      if (existing) {
        existing.qty += rule.qty;
        existing.discountIds.add(rule.discountId);
        existing.discountTitles.add(rule.discountTitle);
        return;
      }
      desiredByKey.set(key, {
        ...rule,
        qty: Math.max(1, rule.qty),
        discountIds: new Set([rule.discountId]),
        discountTitles: new Set([rule.discountTitle]),
      });
    });

    const desiredRules = Array.from(desiredByKey.values());
    const desiredVariantIds = Array.from(
      new Set(
        desiredRules
          .map((entry) => entry.giftVariantId)
          .filter((id) => typeof id === 'string' && id.length > 0)
      )
    );
    const desiredProductIds = Array.from(
      new Set(
        desiredRules
          .map((entry) => entry.giftProductId)
          .filter((id) => typeof id === 'string' && id.length > 0)
      )
    );

    const giftVariants =
      desiredVariantIds.length > 0
        ? await prisma.productVariant.findMany({
            where: { id: { in: desiredVariantIds }, isActive: true },
            include: {
              product: true,
              optionValues: { include: { optionValue: { include: { option: true } } } },
            },
          })
        : [];
    const giftProducts =
      desiredProductIds.length > 0
        ? await prisma.product.findMany({
            where: { id: { in: desiredProductIds }, isActive: true },
          })
        : [];
    const packProductIds = Array.from(
      new Set(
        giftVariants
          .filter((variant) => variant.product?.type === 'PACK' && variant.product?.isActive)
          .map((variant) => variant.product.id)
      )
    );
    const packItems =
      packProductIds.length > 0
        ? await prisma.packItem.findMany({
            where: { packProductId: { in: packProductIds } },
            include: { componentVariant: { include: { product: true } } },
          })
        : [];
    const packItemsByProductId = new Map();
    packItems.forEach((packItem) => {
      const list = packItemsByProductId.get(packItem.packProductId) || [];
      list.push({
        variantId: packItem.componentVariantId,
        qty: packItem.qty,
        title: packItem.componentVariant.product.title,
        imageUrl: packItem.componentVariant.imageUrl || null,
      });
      packItemsByProductId.set(packItem.packProductId, list);
    });
    const variantById = new Map(giftVariants.map((variant) => [variant.id, variant]));
    const productById = new Map(giftProducts.map((product) => [product.id, product]));
    const desiredGiftItems = [];

    desiredRules.forEach((entry) => {
      const qty = Math.max(1, Math.round(entry.qty));
      if (entry.giftVariantId) {
        const variant = variantById.get(entry.giftVariantId);
        if (!variant || !variant.product?.isActive) {
          return;
        }
        if (variant.stockQty !== null && variant.stockQty !== undefined && variant.stockQty <= 0) {
          return;
        }
        if (variant.product.type === 'SUBSCRIPTION') {
          return;
        }
        const itemType = variant.product.type === 'PACK' ? 'PACK' : 'VARIANT';
        const selectedOptions = (variant.optionValues || []).map((value) => ({
          name: value.optionValue.option.name || 'Option',
          value: value.optionValue.value,
        }));
        const snapshot = {
          title: variant.product.title,
          imageUrl: variant.imageUrl || variant.product.images?.[0] || null,
          priceCents: 0,
          originalPriceCents: variant.priceCents || variant.product.priceCents || 0,
          productId: variant.product.id,
          variantId: variant.id,
          selectedOptions,
          ...(itemType === 'PACK' ? { packItems: packItemsByProductId.get(variant.product.id) || [] } : {}),
          isGift: true,
          giftKey: buildGiftIdentityKey(itemType, variant.id, variant.product.id),
          giftDiscountIds: Array.from(entry.discountIds),
          giftDiscountTitles: Array.from(entry.discountTitles),
        };
        desiredGiftItems.push({
          itemType,
          qty,
          unitPriceCents: 0,
          variantId: variant.id,
          snapshot,
        });
        return;
      }
      if (!entry.giftProductId) {
        return;
      }
      const product = productById.get(entry.giftProductId);
      if (!product) {
        return;
      }
      if (product.type === 'PACK' || product.type === 'SUBSCRIPTION') {
        return;
      }
      if (product.stockQty !== null && product.stockQty !== undefined && product.stockQty <= 0) {
        return;
      }
      const itemType = 'VARIANT';
      const snapshot = {
        title: product.title,
        imageUrl: product.images?.[0] || null,
        priceCents: 0,
        originalPriceCents: product.priceCents || 0,
        productId: product.id,
        variantId: null,
        selectedOptions: [],
        isGift: true,
        giftKey: buildGiftIdentityKey(itemType, null, product.id),
        giftDiscountIds: Array.from(entry.discountIds),
        giftDiscountTitles: Array.from(entry.discountTitles),
      };
      desiredGiftItems.push({
        itemType,
        qty,
        unitPriceCents: 0,
        variantId: null,
        snapshot,
      });
    });

    const existingSignature = existingGiftItems
      .map((item) => {
        const snapshot = asPlainObject(item.snapshot);
        const variantId =
          typeof item.variantId === 'string' && item.variantId.trim().length > 0
            ? item.variantId.trim()
            : typeof snapshot.variantId === 'string' && snapshot.variantId.trim().length > 0
              ? snapshot.variantId.trim()
              : null;
        const productId =
          typeof snapshot.productId === 'string' && snapshot.productId.trim().length > 0
            ? snapshot.productId.trim()
            : null;
        const key = buildGiftIdentityKey(item.itemType, variantId, productId);
        return `${key}:${Math.max(1, item.qty)}:${Math.max(0, item.unitPriceCents)}`;
      })
      .sort()
      .join('|');
    const desiredSignature = desiredGiftItems
      .map((item) => {
        const snapshot = asPlainObject(item.snapshot);
        const variantId =
          typeof item.variantId === 'string' && item.variantId.trim().length > 0 ? item.variantId.trim() : null;
        const productId =
          typeof snapshot.productId === 'string' && snapshot.productId.trim().length > 0
            ? snapshot.productId.trim()
            : null;
        const key = buildGiftIdentityKey(item.itemType, variantId, productId);
        return `${key}:${Math.max(1, item.qty)}:${Math.max(0, item.unitPriceCents)}`;
      })
      .sort()
      .join('|');

    if (existingSignature === desiredSignature) {
      return cart;
    }

    await prisma.$transaction(async (tx) => {
      if (existingGiftItems.length > 0) {
        await tx.cartItem.deleteMany({
          where: { id: { in: existingGiftItems.map((item) => item.id) } },
        });
      }
      for (const giftItem of desiredGiftItems) {
        await tx.cartItem.create({
          data: {
            cartId: cart.id,
            itemType: giftItem.itemType,
            qty: giftItem.qty,
            unitPriceCents: giftItem.unitPriceCents,
            snapshot: giftItem.snapshot,
            variantId: giftItem.variantId || null,
          },
        });
      }
    });

    await touchCartUpdatedAt(cart.id);
    cart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: { items: true },
    });
    return cart;
  };

  const serializeCart = (cart, shipping) => {
    const items = cart.items.map((item) => {
      const lineSubtotalCents = item.unitPriceCents * item.qty;
      const lineTotalCents = lineSubtotalCents;
      return {
        id: item.id,
        itemType: item.itemType,
        qty: item.qty,
        unitPriceCents: item.unitPriceCents,
        snapshot: item.snapshot,
        isGift: isGiftCartItem(item),
        subscriptionPlanId: item.subscriptionPlanId || null,
        lineSubtotalCents,
        lineDiscountCents: 0,
        lineTotalCents,
      };
    });
    const subtotalCents = items.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
    const shippingCents = shipping.shippingCents;
    const totalCents = subtotalCents + shippingCents;
    return {
      id: cart.id,
      status: cart.status,
      currency: cart.currency,
      items,
      totals: {
        subtotalCents,
        shippingCents,
        discountTotalCents: 0,
        totalCents,
      },
    };
  };

  return {
    getActiveCart,
    isGiftCartItem,
    serializeCart,
    syncAutomaticGiftCartItems,
    touchCartUpdatedAt,
  };
}
