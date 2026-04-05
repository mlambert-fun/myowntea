// @ts-nocheck
export function registerCustomerCartRoutes(app, deps) {
  const {
    BLEND_FORMAT_LABELS,
    BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
    DEFAULT_BLEND_FORMAT,
    buildBlendSubscriptionSetupSnapshot,
    computeBlendUnitPriceCents,
    discountBlendSubscriptionPriceCents,
    extractShippingSelection,
    getActiveCart,
    normalizeBlendCartPurchaseMode,
    normalizeBlendFormat,
    normalizeBlendSubscriptionIntervalCount,
    prisma,
    requireCustomer,
    resolveShippingQuote,
    serializeCart,
    syncAutomaticGiftCartItems,
    t,
    toBlendPricingErrorResponse,
    touchCartUpdatedAt,
  } = deps;

  app.get('/api/cart', requireCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const cart = await getActiveCart(customer.id);
      const syncedCart = await syncAutomaticGiftCartItems({ customer, cartId: cart.id });
      const shippingSelection = extractShippingSelection(req);
      const shippingQuote = await resolveShippingQuote(shippingSelection);
      res.json(serializeCart(syncedCart || cart, shippingQuote));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch cart' });
    }
  });

  app.post('/api/cart/items', requireCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const payload = req.body;
      let cart = await getActiveCart(customer.id);
      cart = (await syncAutomaticGiftCartItems({ customer, cartId: cart.id })) || cart;
      const entries = Array.isArray(payload.items) ? payload.items : [payload];

      for (const entry of entries) {
        if (!entry.itemType) {
          return res.status(400).json({ error: 'itemType is required' });
        }

        const qty = Math.max(1, entry.qty || 1);
        const hasSubscription = cart.items.some((item) => item.itemType === 'SUBSCRIPTION');
        const hasOneTime = cart.items.some((item) => item.itemType !== 'SUBSCRIPTION');
        if (entry.itemType === 'SUBSCRIPTION' && hasOneTime) {
          return res.status(409).json({ error: t("backend.index.failed_melanger_abonnement") });
        }
        if (entry.itemType !== 'SUBSCRIPTION' && hasSubscription) {
          return res.status(409).json({ error: t("backend.index.failed_add_article") });
        }

        if (entry.itemType === 'BLEND') {
          const purchaseMode = normalizeBlendCartPurchaseMode(entry.purchaseMode);
          const ingredientIds = (entry.ingredientIds || []).filter(Boolean);
          if (ingredientIds.length === 0) {
            return res.status(400).json({ error: 'ingredientIds are required for blend items' });
          }
          if (new Set(ingredientIds).size !== ingredientIds.length) {
            return res.status(400).json({
              error: t("backend.index.meme_ingredient_peut"),
              code: 'BLEND_DUPLICATE_INGREDIENT',
            });
          }

          const blendFormat = normalizeBlendFormat(entry.blendFormat || DEFAULT_BLEND_FORMAT);
          const ingredients = await prisma.ingredient.findMany({
            where: { id: { in: ingredientIds } },
            select: { id: true, name: true, color: true, category: true, price: true },
          });
          if (ingredients.length !== ingredientIds.length) {
            return res.status(404).json({ error: 'One or more ingredients not found' });
          }

          let unitPriceCents = 0;
          try {
            unitPriceCents = computeBlendUnitPriceCents(ingredients, { blendFormat });
          } catch (pricingError) {
            const errorPayload = toBlendPricingErrorResponse(pricingError);
            if (errorPayload) {
              return res.status(400).json({ error: errorPayload.message, code: errorPayload.code });
            }
            throw pricingError;
          }

          const basePriceCents = Math.max(0, Math.round(Number(entry.basePriceCents) || unitPriceCents));
          const finalUnitPriceCents = purchaseMode === 'SUBSCRIPTION'
            ? discountBlendSubscriptionPriceCents(basePriceCents, BLEND_SUBSCRIPTION_DISCOUNT_PERCENT)
            : unitPriceCents;
          const snapshot = {
            blendFormat,
            blendFormatLabel: BLEND_FORMAT_LABELS[blendFormat],
            title: entry.name || t("backend.index.my_melange"),
            ingredientIds,
            ingredients: ingredients.map((ing) => ({
              name: ing.name,
              ingredientColor: ing.color || '#6B7280',
              category: ing.category,
            })),
            priceCents: finalUnitPriceCents,
            basePriceCents,
            purchaseMode,
          };

          if (purchaseMode === 'SUBSCRIPTION') {
            Object.assign(snapshot, {
              sourceType: entry.sourceType === 'LISTING' ? 'LISTING' : 'CUSTOM',
              listingId: typeof entry.listingId === 'string' && entry.listingId.trim().length > 0 ? entry.listingId.trim() : null,
              subscriptionSetup: buildBlendSubscriptionSetupSnapshot({
                sourceType: entry.sourceType === 'LISTING' ? 'LISTING' : 'CUSTOM',
                listingId: entry.listingId,
                title: snapshot.title,
                blendFormat,
                intervalCount: entry.intervalCount,
                basePriceCents,
                unitPriceCents: finalUnitPriceCents,
                shippingCents: 0,
                discountPercent: BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
              }),
            });
          }

          const existing = cart.items.find((item) => item.itemType === 'BLEND'
            && Array.isArray(item.snapshot.ingredientIds)
            && item.snapshot.title === snapshot.title
            && normalizeBlendFormat(item.snapshot.blendFormat || DEFAULT_BLEND_FORMAT) === blendFormat
            && normalizeBlendCartPurchaseMode(item.snapshot.purchaseMode) === purchaseMode
            && (purchaseMode !== 'SUBSCRIPTION'
              || (normalizeBlendSubscriptionIntervalCount(item.snapshot?.subscriptionSetup?.intervalCount) === normalizeBlendSubscriptionIntervalCount(entry.intervalCount)
                && (item.snapshot?.listingId || null) === (snapshot.listingId || null)))
            && item.snapshot.ingredientIds.sort().join(',') === ingredientIds.slice().sort().join(','));

          if (existing) {
            await prisma.cartItem.update({
              where: { id: existing.id },
              data: {
                qty: purchaseMode === 'SUBSCRIPTION' ? 1 : existing.qty + qty,
                unitPriceCents: finalUnitPriceCents,
                snapshot,
              },
            });
          } else {
            await prisma.cartItem.create({
              data: {
                cartId: cart.id,
                itemType: 'BLEND',
                qty: purchaseMode === 'SUBSCRIPTION' ? 1 : qty,
                unitPriceCents: finalUnitPriceCents,
                snapshot,
              },
            });
          }
        }

        if (entry.itemType === 'VARIANT') {
          if (!entry.variantId) {
            if (!entry.productId) {
              return res.status(400).json({ error: 'variantId is required' });
            }

            const product = await prisma.product.findUnique({
              where: { id: entry.productId },
              include: { variants: true },
            });
            if (!product || !product.isActive) {
              return res.status(404).json({ error: 'Product not found' });
            }
            if (product.type !== 'ACCESSORY') {
              return res.status(409).json({ error: 'Ce produit n\'est pas un accessoire.' });
            }
            if (product.variants.length > 0) {
              return res.status(409).json({ error: t("backend.index.please_choisir_variant") });
            }
            if (product.stockQty !== null && product.stockQty <= 0) {
              return res.status(409).json({ error: t("backend.index.product_rupture_stock") });
            }

            const imageUrl = product.images[0] || null;
            const snapshot = {
              title: product.title,
              imageUrl,
              priceCents: product.priceCents,
              productId: product.id,
              variantId: null,
              selectedOptions: [],
            };
            const existing = cart.items.find((item) => item.itemType === 'VARIANT' && !item.variantId && item.snapshot.productId === product.id);
            if (existing) {
              await prisma.cartItem.update({
                where: { id: existing.id },
                data: { qty: existing.qty + qty, unitPriceCents: product.priceCents, snapshot },
              });
            } else {
              await prisma.cartItem.create({
                data: {
                  cartId: cart.id,
                  itemType: 'VARIANT',
                  qty,
                  unitPriceCents: product.priceCents,
                  snapshot,
                  variantId: null,
                },
              });
            }
            continue;
          }

          const variant = await prisma.productVariant.findUnique({
            where: { id: entry.variantId },
            include: {
              product: true,
              optionValues: { include: { optionValue: { include: { option: true } } } },
            },
          });
          if (!variant || !variant.isActive || !variant.product.isActive) {
            return res.status(404).json({ error: 'Variant not found' });
          }
          if (variant.product.type === 'PACK') {
            return res.status(409).json({ error: t("backend.index.utilisez_type_pack") });
          }
          if (variant.product.type === 'SUBSCRIPTION') {
            return res.status(409).json({ error: t("backend.index.utilisez_type_subscription") });
          }
          if (variant.stockQty !== null && variant.stockQty <= 0) {
            return res.status(409).json({ error: 'Variant out of stock' });
          }

          const selectedOptions = (variant.optionValues || []).map((value) => ({
            name: value.optionValue.option.name || 'Option',
            value: value.optionValue.value,
          }));
          const snapshot = {
            title: variant.product.title,
            imageUrl: variant.imageUrl,
            priceCents: variant.priceCents,
            productId: variant.product.id,
            variantId: variant.id,
            selectedOptions,
          };
          const existing = cart.items.find((item) => item.itemType === 'VARIANT' && item.variantId === variant.id);
          if (existing) {
            await prisma.cartItem.update({
              where: { id: existing.id },
              data: { qty: existing.qty + qty, unitPriceCents: variant.priceCents, snapshot },
            });
          } else {
            await prisma.cartItem.create({
              data: {
                cartId: cart.id,
                itemType: 'VARIANT',
                qty,
                unitPriceCents: variant.priceCents,
                snapshot,
                variantId: variant.id,
              },
            });
          }
        }

        if (entry.itemType === 'PACK') {
          if (!entry.variantId) {
            return res.status(400).json({ error: 'variantId is required for packs' });
          }

          const variant = await prisma.productVariant.findUnique({
            where: { id: entry.variantId },
            include: {
              product: true,
              optionValues: { include: { optionValue: { include: { option: true } } } },
            },
          });
          if (!variant || !variant.isActive || !variant.product.isActive) {
            return res.status(404).json({ error: 'Pack variant not found' });
          }
          if (variant.product.type !== 'PACK') {
            return res.status(409).json({ error: 'Ce produit n\'est pas un pack.' });
          }
          if (variant.stockQty !== null && variant.stockQty <= 0) {
            return res.status(409).json({ error: 'Pack out of stock' });
          }

          const selectedOptions = (variant.optionValues || []).map((value) => ({
            name: value.optionValue.option.name || 'Option',
            value: value.optionValue.value,
          }));
          const packItems = await prisma.packItem.findMany({
            where: { packProductId: variant.product.id },
            include: { componentVariant: { include: { product: true } } },
          });
          const snapshot = {
            title: variant.product.title,
            imageUrl: variant.imageUrl,
            priceCents: variant.priceCents,
            productId: variant.product.id,
            variantId: variant.id,
            selectedOptions,
            packItems: packItems.map((pack) => ({
              variantId: pack.componentVariantId,
              qty: pack.qty,
              title: pack.componentVariant.product.title,
              imageUrl: pack.componentVariant.imageUrl || null,
            })),
          };
          const existing = cart.items.find((item) => item.itemType === 'PACK' && item.variantId === variant.id);
          if (existing) {
            await prisma.cartItem.update({
              where: { id: existing.id },
              data: { qty: existing.qty + qty, unitPriceCents: variant.priceCents, snapshot },
            });
          } else {
            await prisma.cartItem.create({
              data: {
                cartId: cart.id,
                itemType: 'PACK',
                qty,
                unitPriceCents: variant.priceCents,
                snapshot,
                variantId: variant.id,
              },
            });
          }
        }

        if (entry.itemType === 'SUBSCRIPTION') {
          if (!entry.subscriptionPlanId) {
            return res.status(400).json({ error: 'subscriptionPlanId is required' });
          }

          const plan = await prisma.subscriptionPlan.findUnique({
            where: { id: entry.subscriptionPlanId },
            include: { product: true },
          });
          if (!plan || !plan.isActive || !plan.product.isActive) {
            return res.status(404).json({ error: 'Subscription plan not found' });
          }
          if (plan.product.type !== 'SUBSCRIPTION') {
            return res.status(409).json({ error: 'Ce produit n\'est pas un abonnement.' });
          }

          const snapshot = {
            title: plan.product.title,
            productId: plan.product.id,
            planId: plan.id,
            stripePriceId: plan.stripePriceId,
            interval: plan.interval,
            intervalCount: plan.intervalCount,
            priceCents: plan.product.priceCents,
          };
          const existing = cart.items.find((item) => item.itemType === 'SUBSCRIPTION' && item.subscriptionPlanId === plan.id);
          if (existing) {
            await prisma.cartItem.update({
              where: { id: existing.id },
              data: { qty: 1, unitPriceCents: plan.product.priceCents, snapshot },
            });
          } else {
            await prisma.cartItem.create({
              data: {
                cartId: cart.id,
                itemType: 'SUBSCRIPTION',
                qty: 1,
                unitPriceCents: plan.product.priceCents,
                snapshot,
                subscriptionPlanId: plan.id,
              },
            });
          }
        }
      }

      await touchCartUpdatedAt(cart.id);
      const updated = (await syncAutomaticGiftCartItems({ customer, cartId: cart.id }))
        || (await prisma.cart.findUnique({ where: { id: cart.id }, include: { items: true } }));
      const shippingSelection = extractShippingSelection(req);
      const shippingQuote = await resolveShippingQuote(shippingSelection);
      res.status(201).json(serializeCart(updated, shippingQuote));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to add cart item' });
    }
  });

  app.patch('/api/cart/items/:id', requireCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const { qty } = req.body;
      const item = await prisma.cartItem.findUnique({ where: { id: req.params.id }, include: { cart: true } });
      if (!item || item.cart.customerId !== customer.id) {
        return res.status(404).json({ error: 'Cart item not found' });
      }

      const nextQty = Math.max(1, qty || 1);
      await prisma.cartItem.update({ where: { id: item.id }, data: { qty: nextQty } });
      await touchCartUpdatedAt(item.cartId);
      const cart = (await syncAutomaticGiftCartItems({ customer, cartId: item.cartId }))
        || (await prisma.cart.findUnique({ where: { id: item.cartId }, include: { items: true } }));
      const shippingSelection = extractShippingSelection(req);
      const shippingQuote = await resolveShippingQuote(shippingSelection);
      res.json(serializeCart(cart, shippingQuote));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to update cart item' });
    }
  });

  app.delete('/api/cart/items/:id', requireCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const item = await prisma.cartItem.findUnique({ where: { id: req.params.id }, include: { cart: true } });
      if (!item || item.cart.customerId !== customer.id) {
        return res.status(404).json({ error: 'Cart item not found' });
      }

      await prisma.cartItem.delete({ where: { id: item.id } });
      await touchCartUpdatedAt(item.cartId);
      const cart = (await syncAutomaticGiftCartItems({ customer, cartId: item.cartId }))
        || (await prisma.cart.findUnique({ where: { id: item.cartId }, include: { items: true } }));
      const shippingSelection = extractShippingSelection(req);
      const shippingQuote = await resolveShippingQuote(shippingSelection);
      res.json(serializeCart(cart, shippingQuote));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to remove cart item' });
    }
  });
}
