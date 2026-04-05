// @ts-nocheck
export function registerCheckoutRoutes(app, deps) {
  const {
    BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
    BLEND_SUBSCRIPTION_KIND,
    DEFAULT_BLEND_FORMAT,
    WEB_BASE_URL,
    bcrypt,
    buildBlendSubscriptionSnapshot,
    buildBlendSubscriptionStripeLineItems,
    checkoutAddressToString,
    computeBlendUnitPriceCents,
    computeDiscounts,
    discountBlendSubscriptionPriceCents,
    ensureBlendSubscriptionsFromPaidOrder,
    ensureBoxtalShipmentForOrder,
    ensureStripeCustomerForCustomer,
    finalizePaidOrder,
    getActiveCart,
    getBlendSubscriptionSetupFromSnapshot,
    getDefaultBlendSubscriptionAddresses,
    getOrderForWorkflow,
    getSessionCustomer,
    hasPaidOrConfirmedOrder,
    isBlendSubscriptionCartItem,
    isGiftCartItem,
    logOrderNotification,
    normalizeBlendFormat,
    normalizeBlendSubscriptionIntervalCount,
    normalizeCheckoutAddressInput,
    normalizeEmail,
    normalizeIngredientLookupKey,
    parseBlendSubscriptionMetadata,
    parseStripeShippingSelectionMetadata,
    prisma,
    requireAccountCustomer,
    requireCustomer,
    resolveBaseShippingCents,
    resolveBlendIngredientsForPricing,
    resolveBoxtalQuoteSelection,
    resolveFirstOrderOnlyDiscountError,
    resolveOrderShippingSelection,
    resolveShippingCents,
    serializeBlendSubscriptionMetadata,
    stripe,
    syncAutomaticGiftCartItems,
    t,
    toBlendPricingErrorResponse,
  } = deps;

  const isValidCheckoutEmail = (value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

  const resolveGuestCheckoutEmail = (value) => {
    const rawValue = String(value || '').trim();
    if (!rawValue) {
      return { email: null, error: 'Email is required' };
    }
    if (!isValidCheckoutEmail(rawValue)) {
      return { email: null, error: 'Invalid email address' };
    }
    return { email: normalizeEmail(rawValue), error: null };
  };

  app.post('/api/cart/summary', async (req, res) => {
    try {
      const { items, appliedDiscountCode, customerEmail, shippingSelection } = req.body;
      const session = await getSessionCustomer(req);
      const bodyCustomerEmail = typeof customerEmail === 'string' && customerEmail.trim().length > 0
        ? customerEmail.trim().toLowerCase()
        : null;
      const sessionCustomerEmail = typeof session.customer.email === 'string' && session.customer.email.trim().length > 0
        ? session.customer.email.trim().toLowerCase()
        : null;
      const effectiveCustomerEmail = sessionCustomerEmail || bodyCustomerEmail;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Cart items are required' });
      }

      const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
      const itemsNeedingIngredientResolution = items.filter((item) => {
        const itemType = typeof item.itemType === 'string' ? item.itemType : 'BLEND';
        return itemType === 'BLEND' || (!isFiniteNumber(item.lineSubtotalCents) && !isFiniteNumber(item.unitPriceCents));
      });
      const ingredientIds = Array.from(new Set(itemsNeedingIngredientResolution.flatMap((item) => (item.ingredientIds || []).filter(Boolean))));
      const ingredientNames = Array.from(new Set(itemsNeedingIngredientResolution.flatMap((item) => (item.ingredientNames || []).filter(Boolean))));
      if (itemsNeedingIngredientResolution.length > 0 && ingredientIds.length === 0 && ingredientNames.length === 0) {
        return res.status(400).json({ error: 'Ingredient identifiers are required' });
      }

      const ingredients = itemsNeedingIngredientResolution.length === 0
        ? []
        : ingredientNames.length > 0
          ? await prisma.ingredient.findMany({ select: { id: true, price: true, name: true, category: true } })
          : await prisma.ingredient.findMany({ where: { id: { in: ingredientIds } }, select: { id: true, price: true, name: true, category: true } });
      const ingredientById = new Map(ingredients.map((ing) => [ing.id, ing]));
      const ingredientByName = new Map(ingredients.map((ing) => [normalizeIngredientLookupKey(ing.name), ing]));

      const resolveLineSubtotalCents = (item) => {
        const itemType = typeof item.itemType === 'string' ? item.itemType : 'BLEND';
        if (itemType !== 'BLEND') {
          if (isFiniteNumber(item.lineSubtotalCents)) {
            return Math.max(0, Math.round(item.lineSubtotalCents));
          }
          if (isFiniteNumber(item.unitPriceCents)) {
            return Math.max(0, Math.round(item.unitPriceCents)) * Math.max(1, item.quantity || 1);
          }
          return 0;
        }

        const resolvedIngredients = resolveBlendIngredientsForPricing({
          ingredientIds: item.ingredientIds,
          ingredientNames: item.ingredientNames,
          ingredientById,
          ingredientByName,
        });
        const unitCents = computeBlendUnitPriceCents(resolvedIngredients, {
          blendFormat: item.blendFormat,
        });
        return unitCents * Math.max(1, item.quantity || 1);
      };

      const normalizedSummaryItems = items.map((item) => {
        const quantity = Math.max(1, Math.round(Number(item.quantity || 1)));
        const lineSubtotalCents = resolveLineSubtotalCents(item);
        const unitPriceCents = quantity > 0 ? Math.max(0, Math.round(lineSubtotalCents / quantity)) : 0;
        return {
          itemType: typeof item.itemType === 'string' ? item.itemType : 'BLEND',
          quantity,
          unitPriceCents,
          lineSubtotalCents,
          productId: typeof item.productId === 'string' ? item.productId : null,
          variantId: typeof item.variantId === 'string' ? item.variantId : null,
          subscriptionPlanId: typeof item.subscriptionPlanId === 'string' ? item.subscriptionPlanId : null,
          isGift: Boolean(item.isGift),
        };
      });

      const subtotalCents = normalizedSummaryItems.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
      const productSubtotalCents = normalizedSummaryItems.reduce((sum, item) => {
        if (item.itemType === 'VARIANT' || item.itemType === 'PACK' || item.itemType === 'SUBSCRIPTION') {
          return sum + item.lineSubtotalCents;
        }
        return sum;
      }, 0);

      let settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
      if (!settings) {
        settings = await prisma.storeSettings.create({ data: { id: 'default' } });
      }

      const discounts = await prisma.discount.findMany();
      const totalRedemptions = await prisma.discountRedemption.groupBy({
        by: ['discountId'],
        _count: { _all: true },
      });
      const customerRedemptions = effectiveCustomerEmail
        ? await prisma.discountRedemption.groupBy({
          by: ['discountId'],
          where: { customerEmail: effectiveCustomerEmail },
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
        customerId: session.customer.id,
        customerEmail: effectiveCustomerEmail || null,
      }));
      const shippingCents = resolveBaseShippingCents({
        settings,
        mode: shippingSelection?.mode,
        countryCode: shippingSelection?.countryCode || null,
        postalCode: shippingSelection?.postalCode || null,
      });
      const summary = computeDiscounts({
        discounts,
        usageById,
        subtotalCents,
        productSubtotalCents,
        shippingCents,
        items: normalizedSummaryItems,
        appliedCode: appliedDiscountCode,
        customerEmail: effectiveCustomerEmail || null,
        isFirstOrderEligible,
        now: new Date(),
      });

      const activeFreeShipping = discounts
        .filter((discount) => discount.method === 'AUTOMATIC' && discount.type === 'FREE_SHIPPING' && discount.status === 'ACTIVE')
        .filter((discount) => {
          if (discount.startAt && new Date() < discount.startAt) return false;
          if (discount.endAt && new Date() > discount.endAt) return false;
          return true;
        })
        .sort((a, b) => (a.minimumSubtotalCents || 0) - (b.minimumSubtotalCents || 0));
      const freeShippingDiscount = activeFreeShipping[0] || null;
      const thresholdCents = freeShippingDiscount?.minimumSubtotalCents ?? settings.freeShippingThresholdCents;
      const remainingCents = Math.max(0, thresholdCents - subtotalCents);
      const progress = thresholdCents > 0 ? Math.min(1, subtotalCents / thresholdCents) : 0;

      res.json({
        subtotalCents,
        shippingCents: summary.shippingCents,
        originalShippingCents: shippingCents,
        discountTotalCents: summary.discountTotalCents,
        totalCents: summary.totalCents,
        discountLines: summary.discountLines,
        matchedDiscounts: summary.matchedDiscounts,
        messages: summary.messages,
        appliedCode: summary.appliedCode,
        freeShippingProgress: freeShippingDiscount
          ? {
            thresholdCents,
            remainingCents,
            progress,
            isUnlocked: remainingCents === 0,
            discountId: freeShippingDiscount.id,
          }
          : null,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'INGREDIENT_NOT_FOUND') {
        return res.status(404).json({ error: 'One or more ingredients not found' });
      }
      const pricingError = toBlendPricingErrorResponse(error);
      if (pricingError) {
        return res.status(400).json({ error: pricingError.message, code: pricingError.code });
      }
      console.error('Error computing cart summary:', error);
      res.status(500).json({ error: 'Failed to compute cart summary' });
    }
  });

  app.post('/api/checkout/stripe-session', async (req, res) => {
    try {
      if (!stripe) {
        return res.status(501).json({ error: 'Stripe is not configured' });
      }
      const { items, appliedDiscountCode, customerEmail, successUrl, cancelUrl, shippingSelection } = req.body;
      const effectiveCustomerEmail = normalizeEmail(customerEmail);
      const resolvedShippingSelection = resolveOrderShippingSelection(shippingSelection);
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Cart items are required' });
      }

      const ingredientIds = Array.from(new Set(items.flatMap((item) => (item.ingredientIds || []).filter(Boolean))));
      const ingredientNames = Array.from(new Set(items.flatMap((item) => (item.ingredientNames || []).filter(Boolean))));
      if (ingredientIds.length === 0 && ingredientNames.length === 0) {
        return res.status(400).json({ error: 'Ingredient identifiers are required' });
      }

      const ingredients = ingredientNames.length > 0
        ? await prisma.ingredient.findMany({
          select: { id: true, price: true, name: true, category: true },
        })
        : await prisma.ingredient.findMany({
          where: { id: { in: ingredientIds } },
          select: { id: true, price: true, name: true, category: true },
        });
      const ingredientById = new Map(ingredients.map((ing) => [ing.id, ing]));
      const ingredientByName = new Map(ingredients.map((ing) => [normalizeIngredientLookupKey(ing.name), ing]));

      const normalizedStripeItems = items.map((item) => {
        const quantity = Math.max(1, item.quantity || 1);
        const resolvedIngredients = resolveBlendIngredientsForPricing({
          ingredientIds: item.ingredientIds,
          ingredientNames: item.ingredientNames,
          ingredientById,
          ingredientByName,
        });
        const unitCents = computeBlendUnitPriceCents(resolvedIngredients, {
          blendFormat: item.blendFormat,
        });
        const lineSubtotalCents = unitCents * quantity;
        return {
          itemType: item.itemType || 'BLEND',
          quantity,
          unitPriceCents: unitCents,
          lineSubtotalCents,
          productId: typeof item.productId === 'string' ? item.productId : null,
          variantId: typeof item.variantId === 'string' ? item.variantId : null,
          subscriptionPlanId: typeof item.subscriptionPlanId === 'string' ? item.subscriptionPlanId : null,
        };
      });

      const subtotalCents = normalizedStripeItems.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
      let settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
      if (!settings) {
        settings = await prisma.storeSettings.create({ data: { id: 'default' } });
      }

      const discounts = await prisma.discount.findMany();
      const totalRedemptions = await prisma.discountRedemption.groupBy({
        by: ['discountId'],
        _count: { _all: true },
      });
      const customerRedemptions = effectiveCustomerEmail
        ? await prisma.discountRedemption.groupBy({
          by: ['discountId'],
          where: { customerEmail: effectiveCustomerEmail },
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
        customerEmail: effectiveCustomerEmail,
      }));
      const shippingCents = resolveBaseShippingCents({
        settings,
        mode: shippingSelection?.mode,
        countryCode: shippingSelection?.countryCode || null,
        postalCode: shippingSelection?.postalCode || null,
      });
      const summary = computeDiscounts({
        discounts,
        usageById,
        subtotalCents,
        productSubtotalCents: 0,
        shippingCents,
        items: normalizedStripeItems,
        appliedCode: appliedDiscountCode,
        customerEmail: effectiveCustomerEmail,
        isFirstOrderEligible,
        now: new Date(),
      });
      const firstOrderOnlyError = resolveFirstOrderOnlyDiscountError(summary, appliedDiscountCode);
      if (firstOrderOnlyError) {
        return res.status(409).json({ error: firstOrderOnlyError });
      }

      const subtotalDiscountCents = summary.discountLines
        .filter((line) => line.type !== 'FREE_SHIPPING')
        .reduce((sum, line) => sum + line.amountCents, 0);
      const currency = (settings.currency || 'EUR').toLowerCase();
      const lineItems = items.map((item, index) => {
        const unitCents = normalizedStripeItems[index]?.unitPriceCents || 0;
        return {
          price_data: {
            currency,
            product_data: {
              name: item.name || t("backend.index.blend_personnalise"),
            },
            unit_amount: Math.max(0, unitCents),
          },
          quantity: Math.max(1, item.quantity || 1),
        };
      });

      if (summary.shippingCents > 0) {
        lineItems.push({
          price_data: {
            currency,
            product_data: { name: t("backend.index.shipping") },
            unit_amount: summary.shippingCents,
          },
          quantity: 1,
        });
      }

      let discountsPayload;
      if (subtotalDiscountCents > 0) {
        const coupon = await stripe.coupons.create({
          amount_off: subtotalDiscountCents,
          currency,
          duration: 'once',
          name: 'Remise',
        });
        discountsPayload = [{ coupon: coupon.id }];
      }

      const success = successUrl || process.env.STRIPE_SUCCESS_URL || `${WEB_BASE_URL}/orderstripe=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancel = cancelUrl || process.env.STRIPE_CANCEL_URL || `${WEB_BASE_URL}/cart`;
      const allowedCountries = (process.env.BOXTAL_ALLOWED_COUNTRIES || 'FR')
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: lineItems,
        discounts: discountsPayload,
        success_url: success,
        cancel_url: cancel,
        customer_email: effectiveCustomerEmail || undefined,
        shipping_address_collection: {
          allowed_countries: allowedCountries,
        },
        metadata: {
          appliedDiscountCode: summary.appliedCode || '',
          discountTotalCents: String(summary.discountTotalCents),
          discountLines: JSON.stringify(summary.discountLines || []),
          shippingSelection: resolvedShippingSelection ? JSON.stringify(resolvedShippingSelection) : '',
        },
      });

      res.json({ url: session.url, id: session.id });
    } catch (error) {
      if (error instanceof Error && error.message === 'INGREDIENT_NOT_FOUND') {
        return res.status(404).json({ error: 'One or more ingredients not found' });
      }
      const pricingError = toBlendPricingErrorResponse(error);
      if (pricingError) {
        return res.status(400).json({ error: pricingError.message, code: pricingError.code });
      }
      console.error('Error creating Stripe session:', error);
      res.status(500).json({ error: 'Failed to create Stripe session' });
    }
  });

  app.post('/api/checkout/blend-subscription', requireAccountCustomer, async (req, res) => {
    try {
      if (!stripe) {
        return res.status(501).json({ error: 'Stripe is not configured' });
      }
      const customer = req.customer;
      if (!customer.email) {
        return res.status(400).json({ error: 'Customer email is required' });
      }
      const sourceType = req.body?.sourceType === 'LISTING' ? 'LISTING' : 'CUSTOM';
      const blendFormat = normalizeBlendFormat(req.body?.blendFormat || DEFAULT_BLEND_FORMAT);
      const intervalCount = normalizeBlendSubscriptionIntervalCount(req.body?.intervalCount);
      const snapshot = await buildBlendSubscriptionSnapshot({
        sourceType,
        listingId: req.body?.listingId,
        title: req.body?.title,
        ingredientIds: req.body?.ingredientIds,
        blendFormat,
      });
      const { shippingAddress, billingAddress } = await getDefaultBlendSubscriptionAddresses(customer.id);
      if (!shippingAddress) {
        return res.status(409).json({ error: 'A default shipping address is required to subscribe.' });
      }

      const shippingAddressSnapshot = deps.addressRecordToCheckoutAddress(shippingAddress);
      const billingAddressSnapshot = deps.addressRecordToCheckoutAddress(billingAddress || shippingAddress);
      let settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
      if (!settings) {
        settings = await prisma.storeSettings.create({ data: { id: 'default' } });
      }

      const basePriceCents = Math.max(0, Math.round(snapshot.priceCents || 0));
      const unitPriceCents = discountBlendSubscriptionPriceCents(basePriceCents, BLEND_SUBSCRIPTION_DISCOUNT_PERCENT);
      const shippingCents = resolveShippingCents({
        settings,
        mode: 'HOME',
        countryCode: shippingAddress.countryCode,
        postalCode: shippingAddress.postalCode,
        city: shippingAddress.city,
        subtotalCents: unitPriceCents,
      });
      const stripeCustomerId = await ensureStripeCustomerForCustomer(customer);
      const success = typeof req.body?.successUrl === 'string' && req.body.successUrl.trim().length > 0
        ? req.body.successUrl.trim()
        : `${WEB_BASE_URL}/account/subscriptions?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancel = typeof req.body?.cancelUrl === 'string' && req.body.cancelUrl.trim().length > 0
        ? req.body.cancelUrl.trim()
        : `${WEB_BASE_URL}/subscriptions`;
      const metadata = serializeBlendSubscriptionMetadata({
        customerId: customer.id,
        sourceType,
        listingId: snapshot.listingId || null,
        title: snapshot.title,
        ingredientIds: snapshot.ingredientIds || [],
        blendFormat,
        intervalCount,
        basePriceCents,
        unitPriceCents,
        shippingCents,
        discountPercent: BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
      });
      const lineItems = buildBlendSubscriptionStripeLineItems({
        title: snapshot.title,
        blendFormat,
        intervalCount,
        unitPriceCents,
        shippingCents,
        discountPercent: BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
      });
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: stripeCustomerId,
        success_url: success,
        cancel_url: cancel,
        line_items: lineItems,
        metadata,
        subscription_data: {
          metadata,
        },
        allow_promotion_codes: false,
      });

      res.json({
        url: session.url,
        id: session.id,
        pricing: {
          basePriceCents,
          unitPriceCents,
          shippingCents,
          totalCents: unitPriceCents + shippingCents,
          intervalCount,
        },
        addresses: {
          shippingAddress: shippingAddressSnapshot,
          billingAddress: billingAddressSnapshot,
        },
      });
    } catch (error) {
      console.error('Error creating blend subscription checkout:', error);
      const message = error instanceof Error ? error.message : 'Failed to create blend subscription checkout';
      if (message === 'BLEND_LISTING_NOT_FOUND') {
        return res.status(404).json({ error: 'Blend listing not found' });
      }
      if (message === 'BLEND_LISTING_EMPTY' || message === 'ingredientIds are required' || message === 'BLEND_DUPLICATE_INGREDIENT') {
        return res.status(400).json({ error: 'Invalid blend subscription payload' });
      }
      res.status(500).json({
        error: process.env.NODE_ENV === 'development' && message
          ? message
          : 'Failed to create blend subscription checkout',
      });
    }
  });

  app.post('/api/checkout/subscription', requireCustomer, async (req, res) => {
    try {
      if (!stripe) {
        return res.status(501).json({ error: 'Stripe is not configured' });
      }
      const { planId, successUrl, cancelUrl } = req.body;
      if (!planId) {
        return res.status(400).json({ error: 'planId is required' });
      }

      const customer = req.customer;
      let cart = await getActiveCart(customer.id);
      cart = (await syncAutomaticGiftCartItems({ customer, cartId: cart.id })) || cart;
      if (cart.items.some((item) => item.itemType !== 'SUBSCRIPTION')) {
        return res.status(409).json({ error: t("backend.index.payment_abonnements_must") });
      }
      if (cart.items.length > 0 && !cart.items.some((item) => item.subscriptionPlanId === planId)) {
        return res.status(409).json({ error: t("backend.index.cart_contient_autre") });
      }

      const plan = await prisma.subscriptionPlan.findUnique({
        where: { id: planId },
        include: { product: true },
      });
      if (!plan || !plan.isActive || !plan.product.isActive) {
        return res.status(404).json({ error: 'Subscription plan not found' });
      }

      const success = successUrl || process.env.STRIPE_SUCCESS_URL || `${WEB_BASE_URL}/orderstripe=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancel = cancelUrl || process.env.STRIPE_CANCEL_URL || `${WEB_BASE_URL}/cart`;
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        success_url: success,
        cancel_url: cancel,
        customer_email: customer.email || undefined,
        metadata: {
          planId: plan.id,
          customerId: customer.id,
        },
      });
      res.json({ url: session.url, id: session.id });
    } catch (error) {
      console.error('Error creating subscription checkout:', error);
      res.status(500).json({ error: 'Failed to create subscription checkout' });
    }
  });

  app.post('/api/checkout/payment-intent', requireCustomer, async (req, res) => {
    try {
      if (!stripe) {
        return res.status(501).json({ error: 'Stripe is not configured' });
      }
      const {
        shippingSelection,
        appliedDiscountCode,
        comment,
        guestEmail: rawGuestEmail,
        shippingAddress: rawShippingAddress,
        billingAddress: rawBillingAddress,
        blendSubscription: rawBlendSubscription,
      } = req.body || {};
      const customer = req.customer;
      const accountCustomerEmail = normalizeEmail(customer.email);
      const resolvedShippingSelection = resolveOrderShippingSelection(shippingSelection);
      let shippingAddress = null;
      let billingAddress = null;

      try {
        if (rawShippingAddress !== undefined) {
          shippingAddress = normalizeCheckoutAddressInput(rawShippingAddress, 'shippingAddress');
        }
        if (rawBillingAddress !== undefined) {
          billingAddress = normalizeCheckoutAddressInput(rawBillingAddress, 'billingAddress');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid checkout address payload';
        return res.status(400).json({ error: message });
      }

      if (rawBlendSubscription) {
        if (!accountCustomerEmail) {
          return res.status(400).json({ error: 'Customer email is required' });
        }
        if (resolvedShippingSelection.mode === 'RELAY') {
          return res.status(409).json({ error: 'Blend subscriptions currently require home delivery.' });
        }
        const blendFormat = normalizeBlendFormat(rawBlendSubscription?.blendFormat || DEFAULT_BLEND_FORMAT);
        const intervalCount = normalizeBlendSubscriptionIntervalCount(rawBlendSubscription?.intervalCount);
        const snapshot = await buildBlendSubscriptionSnapshot({
          sourceType: rawBlendSubscription?.sourceType === 'LISTING' ? 'LISTING' : 'CUSTOM',
          listingId: rawBlendSubscription?.listingId,
          title: rawBlendSubscription?.title,
          ingredientIds: rawBlendSubscription?.ingredientIds,
          blendFormat,
        });
        if (!shippingAddress) {
          return res.status(400).json({ error: 'shippingAddress is required' });
        }

        const checkoutBillingAddress = billingAddress || shippingAddress;
        let settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
        if (!settings) {
          settings = await prisma.storeSettings.create({ data: { id: 'default' } });
        }
        const basePriceCents = Math.max(0, Math.round(snapshot.priceCents || rawBlendSubscription?.basePriceCents || 0));
        const unitPriceCents = discountBlendSubscriptionPriceCents(basePriceCents, BLEND_SUBSCRIPTION_DISCOUNT_PERCENT);
        const shippingCents = resolveShippingCents({
          settings,
          mode: 'HOME',
          countryCode: shippingAddress.countryCode,
          postalCode: shippingAddress.postalCode,
          city: shippingAddress.city,
          subtotalCents: unitPriceCents,
        });
        const totalCents = unitPriceCents + shippingCents;
        const metadata = parseBlendSubscriptionMetadata(serializeBlendSubscriptionMetadata({
          customerId: customer.id,
          sourceType: rawBlendSubscription?.sourceType === 'LISTING' ? 'LISTING' : 'CUSTOM',
          listingId: snapshot.listingId || null,
          title: snapshot.title,
          ingredientIds: snapshot.ingredientIds || [],
          blendFormat,
          intervalCount,
          basePriceCents,
          unitPriceCents,
          shippingCents,
          discountPercent: BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
        }));
        const subscriptionSetupSnapshot = {
          kind: BLEND_SUBSCRIPTION_KIND,
          sourceType: metadata.sourceType,
          listingId: metadata.listingId,
          title: metadata.title,
          blendFormat: metadata.blendFormat,
          interval: 'month',
          intervalCount: metadata.intervalCount,
          basePriceCents: metadata.basePriceCents,
          unitPriceCents: metadata.unitPriceCents,
          shippingCents: metadata.shippingCents,
          discountPercent: metadata.discountPercent || BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
        };
        const orderItems = [
          {
            itemType: 'BLEND',
            qty: 1,
            unitPriceCents,
            snapshot: {
              ...snapshot,
              subscriptionSetup: subscriptionSetupSnapshot,
            },
            lineSubtotalCents: unitPriceCents,
            lineDiscountCents: 0,
            lineTotalCents: unitPriceCents,
            subscriptionPlanId: null,
          },
        ];
        const shippingAddressSnapshot = {
          salutation: shippingAddress.salutation || null,
          firstName: shippingAddress.firstName,
          lastName: shippingAddress.lastName,
          address1: shippingAddress.address1,
          address2: shippingAddress.address2 || null,
          postalCode: shippingAddress.postalCode,
          city: shippingAddress.city,
          countryCode: shippingAddress.countryCode,
          phoneE164: shippingAddress.phoneE164,
        };
        const billingAddressSnapshot = {
          salutation: checkoutBillingAddress.salutation || null,
          firstName: checkoutBillingAddress.firstName,
          lastName: checkoutBillingAddress.lastName,
          address1: checkoutBillingAddress.address1,
          address2: checkoutBillingAddress.address2 || null,
          postalCode: checkoutBillingAddress.postalCode,
          city: checkoutBillingAddress.city,
          countryCode: checkoutBillingAddress.countryCode,
          phoneE164: checkoutBillingAddress.phoneE164,
        };
        const pendingOrderData = {
          customerId: customer.id,
          userId: customer.userId || null,
          customerEmailSnapshot: accountCustomerEmail,
          cartId: null,
          status: 'PENDING',
          subtotal: unitPriceCents / 100,
          shippingCost: shippingCents / 100,
          tax: 0,
          total: totalCents / 100,
          subtotalCents: unitPriceCents,
          shippingCents,
          discountTotalCents: 0,
          totalCents,
          appliedDiscounts: [],
          appliedDiscountCode: null,
          paymentMethod: 'stripe_subscription',
          paymentStatus: 'pending',
          stripeSessionId: null,
          comment: typeof comment === 'string' && comment.trim() ? comment.trim() : null,
          shippingAddress: checkoutAddressToString(shippingAddress),
          billingAddressSnapshot,
          shippingAddressSnapshot,
          shippingProvider: null,
          shippingMode: 'HOME',
          shippingOfferId: null,
          shippingOfferCode: null,
          shippingOfferLabel: null,
          relayPointId: null,
          relayPointLabel: null,
          relayNetwork: null,
          shippingMeta: {
            mode: 'HOME',
            subscriptionKind: BLEND_SUBSCRIPTION_KIND,
            intervalCount: metadata.intervalCount,
          },
        };
        const existingPendingOrder = await prisma.order.findFirst({
          where: {
            customerId: customer.id,
            cartId: null,
            status: 'PENDING',
            paymentMethod: 'stripe_subscription',
            paymentStatus: { not: 'completed' },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        const order = existingPendingOrder
          ? await prisma.$transaction(async (tx) => {
            await tx.orderItem.deleteMany({ where: { orderId: existingPendingOrder.id } });
            return tx.order.update({
              where: { id: existingPendingOrder.id },
              data: {
                ...pendingOrderData,
                items: {
                  create: orderItems,
                },
              },
              include: { items: true },
            });
          })
          : await prisma.order.create({
            data: {
              ...pendingOrderData,
              orderNumber: `SUB-${Date.now()}`,
              items: {
                create: orderItems,
              },
            },
            include: { items: true },
          });

        const stripeCustomerId = await ensureStripeCustomerForCustomer(customer);
        const paymentIntent = await stripe.paymentIntents.create({
          amount: totalCents,
          currency: (settings.currency || 'EUR').toLowerCase(),
          automatic_payment_methods: { enabled: true },
          customer: stripeCustomerId,
          setup_future_usage: 'off_session',
          receipt_email: accountCustomerEmail || undefined,
          metadata: {
            orderId: order.id,
            customerId: customer.id,
            customerEmail: accountCustomerEmail || '',
            subscriptionKind: BLEND_SUBSCRIPTION_KIND,
          },
        });
        await prisma.order.update({
          where: { id: order.id },
          data: { stripeSessionId: paymentIntent.id },
        });
        return res.json({
          orderId: order.id,
          paymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          totals: {
            subtotalCents: unitPriceCents,
            shippingCents,
            discountTotalCents: 0,
            totalCents,
          },
        });
      }

      let cart = await getActiveCart(customer.id);
      cart = (await syncAutomaticGiftCartItems({ customer, cartId: cart.id })) || cart;
      if (!cart.items || cart.items.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
      }
      if (cart.items.some((item) => item.itemType === 'SUBSCRIPTION')) {
        return res.status(409).json({ error: t("backend.index.payment_abonnements_must") });
      }

      let settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
      if (!settings) {
        settings = await prisma.storeSettings.create({ data: { id: 'default' } });
      }
      const blendUnitPriceByCartItemId = new Map();
      const blendCartItems = cart.items.filter((item) => item.itemType === 'BLEND');
      if (blendCartItems.length > 0) {
        const blendIngredientIds = Array.from(new Set(blendCartItems.flatMap((item) => (Array.isArray(item.snapshot?.ingredientIds)
          ? item.snapshot.ingredientIds
            .filter((id) => typeof id === 'string')
            .map((id) => id.trim())
            .filter(Boolean)
          : []))));
        if (blendIngredientIds.length === 0) {
          return res.status(400).json({ error: 'Ingredient identifiers are required for blend cart items.' });
        }
        const blendIngredients = await prisma.ingredient.findMany({
          where: { id: { in: blendIngredientIds } },
          select: { id: true, name: true, category: true, price: true },
        });
        const ingredientById = new Map(blendIngredients.map((ingredient) => [ingredient.id, ingredient]));
        for (const item of blendCartItems) {
          const ingredientIds = Array.isArray(item.snapshot?.ingredientIds)
            ? item.snapshot.ingredientIds
              .filter((id) => typeof id === 'string')
              .map((id) => id.trim())
              .filter(Boolean)
            : [];
          if (ingredientIds.length === 0) {
            return res.status(400).json({ error: 'Ingredient identifiers are required for blend cart items.' });
          }
          const resolvedIngredients = ingredientIds.map((id) => ingredientById.get(id)).filter(Boolean);
          if (resolvedIngredients.length !== ingredientIds.length) {
            return res.status(404).json({ error: 'One or more ingredients not found' });
          }
          const blendFormat = typeof item.snapshot?.blendFormat === 'string'
            ? item.snapshot.blendFormat
            : DEFAULT_BLEND_FORMAT;
          try {
            const unitPriceCents = computeBlendUnitPriceCents(resolvedIngredients, { blendFormat });
            blendUnitPriceByCartItemId.set(item.id, unitPriceCents);
          } catch (pricingError) {
            const errorPayload = toBlendPricingErrorResponse(pricingError);
            if (errorPayload) {
              return res.status(400).json({ error: errorPayload.message, code: errorPayload.code });
            }
            throw pricingError;
          }
        }
      }

      const hasBlendSubscriptionItems = cart.items.some((item) => isBlendSubscriptionCartItem(item));
      if (hasBlendSubscriptionItems && !accountCustomerEmail) {
        return res.status(400).json({ error: 'Customer email is required' });
      }
      if (hasBlendSubscriptionItems && !shippingAddress) {
        return res.status(400).json({ error: 'shippingAddress is required' });
      }
      let effectiveCheckoutEmail = accountCustomerEmail;
      if (!effectiveCheckoutEmail) {
        const guestEmailResolution = resolveGuestCheckoutEmail(rawGuestEmail);
        if (guestEmailResolution.error) {
          return res.status(400).json({ error: guestEmailResolution.error });
        }
        effectiveCheckoutEmail = guestEmailResolution.email;
      }
      const buildCartItemPricing = (item) => {
        const isRecurringBlend = isBlendSubscriptionCartItem(item);
        const baseBlendUnitPriceCents = item.itemType === 'BLEND'
          ? blendUnitPriceByCartItemId.get(item.id) ?? item.unitPriceCents
          : item.unitPriceCents;
        const setup = isRecurringBlend ? getBlendSubscriptionSetupFromSnapshot(item.snapshot) : null;
        const discountPercent = Math.max(0, Math.round(Number(setup?.discountPercent) || BLEND_SUBSCRIPTION_DISCOUNT_PERCENT));
        const basePriceCents = isRecurringBlend
          ? Math.max(0, Math.round(Number(item.snapshot?.basePriceCents ?? setup?.basePriceCents) || baseBlendUnitPriceCents))
          : baseBlendUnitPriceCents;
        const quantity = isRecurringBlend ? 1 : item.qty;
        const unitPriceCents = isRecurringBlend
          ? discountBlendSubscriptionPriceCents(basePriceCents, discountPercent)
          : baseBlendUnitPriceCents;
        return {
          item,
          isRecurringBlend,
          quantity,
          unitPriceCents,
          basePriceCents,
          discountPercent,
          subscriptionSetup: setup,
          lineSubtotalCents: unitPriceCents * quantity,
        };
      };
      const pricedCartItems = cart.items.map(buildCartItemPricing);
      const subtotalCents = pricedCartItems.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
      const normalizedCartDiscountItems = pricedCartItems.map(({ item, isRecurringBlend, quantity, unitPriceCents, lineSubtotalCents }) => ({
        itemType: isRecurringBlend ? 'SUBSCRIPTION' : item.itemType,
        quantity,
        unitPriceCents,
        lineSubtotalCents,
        productId: typeof item.snapshot?.productId === 'string' ? item.snapshot.productId : null,
        variantId: typeof item.snapshot?.variantId === 'string' ? item.snapshot.variantId : item.variantId || null,
        subscriptionPlanId: item.subscriptionPlanId
          || (typeof item.snapshot?.planId === 'string' ? item.snapshot.planId : null),
        isGift: isGiftCartItem(item),
      }));
      const productSubtotalCents = normalizedCartDiscountItems.reduce((sum, item) => {
        if (item.itemType === 'VARIANT' || item.itemType === 'PACK' || item.itemType === 'SUBSCRIPTION') {
          return sum + item.lineSubtotalCents;
        }
        return sum;
      }, 0);

      const discounts = await prisma.discount.findMany();
      const totalRedemptions = await prisma.discountRedemption.groupBy({
        by: ['discountId'],
        _count: { _all: true },
      });
      const customerRedemptions = effectiveCheckoutEmail
        ? await prisma.discountRedemption.groupBy({
          by: ['discountId'],
          where: { customerEmail: effectiveCheckoutEmail },
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
        customerEmail: effectiveCheckoutEmail,
      }));
      const quotedOffer = await resolveBoxtalQuoteSelection({
        mode: resolvedShippingSelection.mode,
        requestedOfferCode: resolvedShippingSelection.offerCode,
        countryCode: shippingAddress?.countryCode || resolvedShippingSelection.countryCode,
        postalCode: shippingAddress?.postalCode || resolvedShippingSelection.postalCode,
        city: shippingAddress?.city || resolvedShippingSelection.city,
        addressLine1: shippingAddress?.address1 || null,
        declaredValueEur: subtotalCents / 100,
      });
      const effectiveShippingSelection = resolveOrderShippingSelection({
        ...resolvedShippingSelection,
        countryCode: shippingAddress?.countryCode || resolvedShippingSelection.countryCode,
        postalCode: shippingAddress?.postalCode || resolvedShippingSelection.postalCode,
        city: shippingAddress?.city || resolvedShippingSelection.city,
        ...(quotedOffer
          ? {
            offerId: quotedOffer.offerId,
            offerCode: quotedOffer.offerCode,
            offerLabel: quotedOffer.offerLabel,
          }
          : {}),
      });
      if (effectiveShippingSelection.mode === 'RELAY'
        && !effectiveShippingSelection.offerId
        && !effectiveShippingSelection.offerCode) {
        return res.status(400).json({
          error: t("backend.index.shipping_pickup_point"),
        });
      }
      const originalShippingCents = resolveBaseShippingCents({
        settings,
        mode: effectiveShippingSelection.mode,
        countryCode: effectiveShippingSelection.countryCode || null,
        postalCode: effectiveShippingSelection.postalCode || null,
      });
      const summary = computeDiscounts({
        discounts,
        usageById,
        subtotalCents,
        productSubtotalCents,
        shippingCents: originalShippingCents,
        items: normalizedCartDiscountItems,
        appliedCode: appliedDiscountCode,
        customerEmail: effectiveCheckoutEmail,
        isFirstOrderEligible,
        now: new Date(),
      });
      const firstOrderOnlyError = resolveFirstOrderOnlyDiscountError(summary, appliedDiscountCode);
      if (firstOrderOnlyError) {
        return res.status(409).json({ error: firstOrderOnlyError });
      }

      const orderItems = pricedCartItems.map(({ item, isRecurringBlend, quantity, unitPriceCents, basePriceCents, discountPercent, subscriptionSetup, lineSubtotalCents }) => {
        let snapshot = item.snapshot;
        if (isRecurringBlend && subscriptionSetup) {
          const subscriptionShippingCents = resolveShippingCents({
            settings,
            mode: effectiveShippingSelection.mode,
            countryCode: shippingAddress?.countryCode || effectiveShippingSelection.countryCode,
            postalCode: shippingAddress?.postalCode || effectiveShippingSelection.postalCode,
            city: shippingAddress?.city || effectiveShippingSelection.city,
            subtotalCents: unitPriceCents,
          });
          snapshot = {
            ...item.snapshot,
            priceCents: unitPriceCents,
            basePriceCents,
            purchaseMode: 'SUBSCRIPTION',
            sourceType: subscriptionSetup.sourceType,
            listingId: subscriptionSetup.listingId,
            subscriptionSetup: {
              ...subscriptionSetup,
              basePriceCents,
              unitPriceCents,
              shippingCents: subscriptionShippingCents,
              discountPercent,
            },
          };
        }
        return {
          itemType: isRecurringBlend ? 'SUBSCRIPTION' : item.itemType,
          qty: quantity,
          unitPriceCents,
          snapshot,
          lineSubtotalCents,
          lineDiscountCents: 0,
          lineTotalCents: lineSubtotalCents,
          subscriptionPlanId: item.subscriptionPlanId || null,
        };
      });
      const shippingCents = summary.shippingCents;
      const totalCents = summary.totalCents;
      const shippingAddressSnapshot = shippingAddress
        ? {
          salutation: shippingAddress.salutation || null,
          firstName: shippingAddress.firstName,
          lastName: shippingAddress.lastName,
          address1: shippingAddress.address1,
          address2: shippingAddress.address2 || null,
          postalCode: shippingAddress.postalCode,
          city: shippingAddress.city,
          countryCode: shippingAddress.countryCode,
          phoneE164: shippingAddress.phoneE164,
        }
        : null;
      const billingAddressSnapshot = billingAddress
        ? {
          salutation: billingAddress.salutation || null,
          firstName: billingAddress.firstName,
          lastName: billingAddress.lastName,
          address1: billingAddress.address1,
          address2: billingAddress.address2 || null,
          postalCode: billingAddress.postalCode,
          city: billingAddress.city,
          countryCode: billingAddress.countryCode,
          phoneE164: billingAddress.phoneE164,
        }
        : null;
      const pendingOrderData = {
        customerId: customer.id,
        userId: null,
        customerEmailSnapshot: effectiveCheckoutEmail,
        cartId: cart.id,
        status: 'PENDING',
        subtotal: subtotalCents / 100,
        shippingCost: shippingCents / 100,
        tax: 0,
        total: totalCents / 100,
        subtotalCents,
        shippingCents,
        discountTotalCents: summary.discountTotalCents,
        totalCents,
        appliedDiscounts: summary.discountLines,
        appliedDiscountCode: summary.appliedCode,
        paymentMethod: 'stripe',
        paymentStatus: 'pending',
        stripeSessionId: null,
        comment: typeof comment === 'string' && comment.trim() ? comment.trim() : null,
        shippingAddress: shippingAddress ? checkoutAddressToString(shippingAddress) : (customer.address || ''),
        billingAddressSnapshot,
        shippingAddressSnapshot,
        shippingProvider: effectiveShippingSelection.offerId || effectiveShippingSelection.offerCode ? 'BOXTAL' : null,
        shippingMode: effectiveShippingSelection.mode || null,
        shippingOfferId: effectiveShippingSelection.offerId || null,
        shippingOfferCode: effectiveShippingSelection.offerCode || null,
        shippingOfferLabel: effectiveShippingSelection.offerLabel || null,
        relayPointId: effectiveShippingSelection.relayPoint?.id || null,
        relayPointLabel: effectiveShippingSelection.relayPoint?.name || null,
        relayNetwork: effectiveShippingSelection.relayPoint?.network || null,
        shippingMeta: {
          ...effectiveShippingSelection,
          ...(quotedOffer ? { quoteMeta: quotedOffer.quoteMeta || null } : {}),
        },
      };
      const existingPendingOrder = await prisma.order.findFirst({
        where: {
          customerId: customer.id,
          cartId: cart.id,
          status: 'PENDING',
          paymentStatus: { not: 'completed' },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      const order = existingPendingOrder
        ? await prisma.$transaction(async (tx) => {
          await tx.orderItem.deleteMany({ where: { orderId: existingPendingOrder.id } });
          return tx.order.update({
            where: { id: existingPendingOrder.id },
            data: {
              ...pendingOrderData,
              items: {
                create: orderItems,
              },
            },
            include: { items: true },
          });
        })
        : await prisma.order.create({
          data: {
            ...pendingOrderData,
            orderNumber: `ORD-${Date.now()}`,
            items: {
              create: orderItems,
            },
          },
          include: { items: true },
        });
      if (totalCents <= 0) {
        await finalizePaidOrder(order.id);
        return res.json({
          orderId: order.id,
          paymentIntentId: null,
          clientSecret: null,
          totals: {
            subtotalCents,
            shippingCents,
            discountTotalCents: summary.discountTotalCents,
            totalCents,
          },
        });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalCents,
        currency: (settings.currency || 'EUR').toLowerCase(),
        automatic_payment_methods: { enabled: true },
        customer: hasBlendSubscriptionItems ? await ensureStripeCustomerForCustomer(customer) : undefined,
        setup_future_usage: hasBlendSubscriptionItems ? 'off_session' : undefined,
        receipt_email: effectiveCheckoutEmail || undefined,
        metadata: {
          orderId: order.id,
          cartId: cart.id,
          customerId: customer.id,
          customerEmail: effectiveCheckoutEmail || '',
          containsBlendSubscription: hasBlendSubscriptionItems ? 'true' : 'false',
        },
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { stripeSessionId: paymentIntent.id },
      });
      res.json({
        orderId: order.id,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        totals: {
          subtotalCents,
          shippingCents,
          discountTotalCents: summary.discountTotalCents,
          totalCents,
        },
      });
    } catch (error) {
      const pricingError = toBlendPricingErrorResponse(error);
      if (pricingError) {
        return res.status(400).json({ error: pricingError.message, code: pricingError.code });
      }
      console.error('Error creating payment intent checkout:', error);
      res.status(500).json({ error: 'Failed to create payment intent checkout' });
    }
  });

  app.post('/api/checkout/one-time', requireCustomer, async (req, res) => {
    try {
      if (!stripe) {
        return res.status(501).json({ error: 'Stripe is not configured' });
      }
      const { shippingSelection, appliedDiscountCode } = req.body || {};
      const customer = req.customer;
      const normalizedCustomerEmail = normalizeEmail(customer.email);
      const resolvedShippingSelection = resolveOrderShippingSelection(shippingSelection);
      let cart = await getActiveCart(customer.id);
      cart = (await syncAutomaticGiftCartItems({ customer, cartId: cart.id })) || cart;
      if (!cart.items || cart.items.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
      }
      if (cart.items.some((item) => item.itemType === 'SUBSCRIPTION')) {
        return res.status(409).json({ error: t("backend.index.payment_abonnements_must") });
      }

      let settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
      if (!settings) {
        settings = await prisma.storeSettings.create({ data: { id: 'default' } });
      }
      const blendUnitPriceByCartItemId = new Map();
      const blendCartItems = cart.items.filter((item) => item.itemType === 'BLEND');
      if (blendCartItems.length > 0) {
        const blendIngredientIds = Array.from(new Set(blendCartItems.flatMap((item) => (Array.isArray(item.snapshot?.ingredientIds)
          ? item.snapshot.ingredientIds
            .filter((id) => typeof id === 'string')
            .map((id) => id.trim())
            .filter(Boolean)
          : []))));
        if (blendIngredientIds.length === 0) {
          return res.status(400).json({ error: 'Ingredient identifiers are required for blend cart items.' });
        }
        const blendIngredients = await prisma.ingredient.findMany({
          where: { id: { in: blendIngredientIds } },
          select: { id: true, name: true, category: true, price: true },
        });
        const ingredientById = new Map(blendIngredients.map((ingredient) => [ingredient.id, ingredient]));
        for (const item of blendCartItems) {
          const ingredientIds = Array.isArray(item.snapshot?.ingredientIds)
            ? item.snapshot.ingredientIds
              .filter((id) => typeof id === 'string')
              .map((id) => id.trim())
              .filter(Boolean)
            : [];
          if (ingredientIds.length === 0) {
            return res.status(400).json({ error: 'Ingredient identifiers are required for blend cart items.' });
          }
          const resolvedIngredients = ingredientIds.map((id) => ingredientById.get(id)).filter(Boolean);
          if (resolvedIngredients.length !== ingredientIds.length) {
            return res.status(404).json({ error: 'One or more ingredients not found' });
          }
          const blendFormat = typeof item.snapshot?.blendFormat === 'string'
            ? item.snapshot.blendFormat
            : DEFAULT_BLEND_FORMAT;
          try {
            const unitPriceCents = computeBlendUnitPriceCents(resolvedIngredients, { blendFormat });
            blendUnitPriceByCartItemId.set(item.id, unitPriceCents);
          } catch (pricingError) {
            const errorPayload = toBlendPricingErrorResponse(pricingError);
            if (errorPayload) {
              return res.status(400).json({ error: errorPayload.message, code: errorPayload.code });
            }
            throw pricingError;
          }
        }
      }

      const resolveCartItemUnitPriceCents = (item) => item.itemType === 'BLEND'
        ? blendUnitPriceByCartItemId.get(item.id) ?? item.unitPriceCents
        : item.unitPriceCents;
      const orderItems = cart.items.map((item) => {
        const unitPriceCents = resolveCartItemUnitPriceCents(item);
        const lineSubtotalCents = unitPriceCents * item.qty;
        return {
          itemType: item.itemType,
          qty: item.qty,
          unitPriceCents,
          snapshot: item.snapshot,
          lineSubtotalCents,
          lineDiscountCents: 0,
          lineTotalCents: lineSubtotalCents,
          subscriptionPlanId: item.subscriptionPlanId || null,
        };
      });
      const subtotalCents = orderItems.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
      const normalizedCartDiscountItems = cart.items.map((item) => ({
        itemType: item.itemType,
        quantity: item.qty,
        unitPriceCents: resolveCartItemUnitPriceCents(item),
        lineSubtotalCents: resolveCartItemUnitPriceCents(item) * item.qty,
        productId: typeof item.snapshot?.productId === 'string' ? item.snapshot.productId : null,
        variantId: typeof item.snapshot?.variantId === 'string' ? item.snapshot.variantId : item.variantId || null,
        subscriptionPlanId: item.subscriptionPlanId
          || (typeof item.snapshot?.planId === 'string' ? item.snapshot.planId : null),
        isGift: isGiftCartItem(item),
      }));
      const productSubtotalCents = normalizedCartDiscountItems.reduce((sum, item) => {
        if (item.itemType === 'VARIANT' || item.itemType === 'PACK' || item.itemType === 'SUBSCRIPTION') {
          return sum + item.lineSubtotalCents;
        }
        return sum;
      }, 0);

      const discounts = await prisma.discount.findMany();
      const totalRedemptions = await prisma.discountRedemption.groupBy({
        by: ['discountId'],
        _count: { _all: true },
      });
      const customerRedemptions = normalizedCustomerEmail
        ? await prisma.discountRedemption.groupBy({
          by: ['discountId'],
          where: { customerEmail: normalizedCustomerEmail },
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
        customerEmail: normalizedCustomerEmail,
      }));
      const quotedOffer = await resolveBoxtalQuoteSelection({
        mode: resolvedShippingSelection.mode,
        requestedOfferCode: resolvedShippingSelection.offerCode,
        countryCode: customer.country || resolvedShippingSelection.countryCode,
        postalCode: customer.postalCode || resolvedShippingSelection.postalCode,
        city: customer.city || resolvedShippingSelection.city,
        addressLine1: customer.address || null,
        declaredValueEur: subtotalCents / 100,
      });
      const effectiveShippingSelection = resolveOrderShippingSelection({
        ...resolvedShippingSelection,
        countryCode: customer.country || resolvedShippingSelection.countryCode,
        postalCode: customer.postalCode || resolvedShippingSelection.postalCode,
        city: customer.city || resolvedShippingSelection.city,
        ...(quotedOffer
          ? {
            offerId: quotedOffer.offerId,
            offerCode: quotedOffer.offerCode,
            offerLabel: quotedOffer.offerLabel,
          }
          : {}),
      });
      if (effectiveShippingSelection.mode === 'RELAY'
        && !effectiveShippingSelection.offerId
        && !effectiveShippingSelection.offerCode) {
        return res.status(400).json({
          error: t("backend.index.shipping_pickup_point"),
        });
      }

      const originalShippingCents = resolveBaseShippingCents({
        settings,
        mode: effectiveShippingSelection.mode,
        countryCode: effectiveShippingSelection.countryCode || null,
        postalCode: effectiveShippingSelection.postalCode || null,
      });
      const summary = computeDiscounts({
        discounts,
        usageById,
        subtotalCents,
        productSubtotalCents,
        shippingCents: originalShippingCents,
        items: normalizedCartDiscountItems,
        appliedCode: appliedDiscountCode,
        customerEmail: normalizedCustomerEmail,
        isFirstOrderEligible,
        now: new Date(),
      });
      const firstOrderOnlyError = resolveFirstOrderOnlyDiscountError(summary, appliedDiscountCode);
      if (firstOrderOnlyError) {
        return res.status(409).json({ error: firstOrderOnlyError });
      }

      const shippingCents = summary.shippingCents;
      const totalCents = summary.totalCents;
      const subtotalDiscountCents = summary.discountLines
        .filter((line) => line.type !== 'FREE_SHIPPING')
        .reduce((sum, line) => sum + line.amountCents, 0);
      const pendingOrderData = {
        customerId: customer.id,
        userId: null,
        customerEmailSnapshot: normalizedCustomerEmail,
        cartId: cart.id,
        status: 'PENDING',
        subtotal: subtotalCents / 100,
        shippingCost: shippingCents / 100,
        tax: 0,
        total: totalCents / 100,
        subtotalCents,
        shippingCents,
        discountTotalCents: summary.discountTotalCents,
        totalCents,
        appliedDiscounts: summary.discountLines,
        appliedDiscountCode: summary.appliedCode,
        paymentMethod: 'stripe',
        paymentStatus: 'pending',
        stripeSessionId: null,
        shippingAddress: customer.address || '',
        shippingProvider: effectiveShippingSelection.offerId || effectiveShippingSelection.offerCode ? 'BOXTAL' : null,
        shippingMode: effectiveShippingSelection.mode || null,
        shippingOfferId: effectiveShippingSelection.offerId || null,
        shippingOfferCode: effectiveShippingSelection.offerCode || null,
        shippingOfferLabel: effectiveShippingSelection.offerLabel || null,
        relayPointId: effectiveShippingSelection.relayPoint?.id || null,
        relayPointLabel: effectiveShippingSelection.relayPoint?.name || null,
        relayNetwork: effectiveShippingSelection.relayPoint?.network || null,
        shippingMeta: {
          ...effectiveShippingSelection,
          ...(quotedOffer ? { quoteMeta: quotedOffer.quoteMeta || null } : {}),
        },
      };
      const existingPendingOrder = await prisma.order.findFirst({
        where: {
          customerId: customer.id,
          cartId: cart.id,
          status: 'PENDING',
          paymentStatus: { not: 'completed' },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      const order = existingPendingOrder
        ? await prisma.$transaction(async (tx) => {
          await tx.orderItem.deleteMany({ where: { orderId: existingPendingOrder.id } });
          return tx.order.update({
            where: { id: existingPendingOrder.id },
            data: {
              ...pendingOrderData,
              items: {
                create: orderItems,
              },
            },
            include: { items: true },
          });
        })
        : await prisma.order.create({
          data: {
            ...pendingOrderData,
            orderNumber: `ORD-${Date.now()}`,
            items: {
              create: orderItems,
            },
          },
          include: { items: true },
        });

      const lineItems = cart.items.map((item) => {
        const title = item.snapshot?.title || 'Article';
        return {
          price_data: {
            currency: 'eur',
            product_data: { name: title },
            unit_amount: item.unitPriceCents,
          },
          quantity: item.qty,
        };
      });
      if (summary.shippingCents > 0) {
        lineItems.push({
          price_data: {
            currency: 'eur',
            product_data: { name: t("backend.index.shipping") },
            unit_amount: summary.shippingCents,
          },
          quantity: 1,
        });
      }
      let discountsPayload;
      if (subtotalDiscountCents > 0) {
        const coupon = await stripe.coupons.create({
          amount_off: subtotalDiscountCents,
          currency: 'eur',
          duration: 'once',
          name: 'Remise',
        });
        discountsPayload = [{ coupon: coupon.id }];
      }
      const success = process.env.STRIPE_SUCCESS_URL || `${WEB_BASE_URL}/order?stripe=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancel = process.env.STRIPE_CANCEL_URL || `${WEB_BASE_URL}/cart`;
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: lineItems,
        discounts: discountsPayload,
        success_url: success,
        cancel_url: cancel,
        customer_email: normalizedCustomerEmail || undefined,
        metadata: {
          orderId: order.id,
          cartId: cart.id,
          customerId: customer.id,
          appliedDiscountCode: summary.appliedCode || '',
          discountTotalCents: String(summary.discountTotalCents),
          discountLines: JSON.stringify(summary.discountLines || []),
          shippingSelection: effectiveShippingSelection ? JSON.stringify(effectiveShippingSelection) : '',
        },
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { stripeSessionId: session.id },
      });
      res.json({ url: session.url, id: session.id });
    } catch (error) {
      const pricingError = toBlendPricingErrorResponse(error);
      if (pricingError) {
        return res.status(400).json({ error: pricingError.message, code: pricingError.code });
      }
      console.error('Error creating checkout session:', error);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });
}
