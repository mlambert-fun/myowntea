// @ts-nocheck
export function registerCheckoutOrderRoutes(app, deps) {
  const {
    bcrypt,
    computeBlendUnitPriceCents,
    computeDiscounts,
    ensureBlendSubscriptionsFromPaidOrder,
    ensureBoxtalShipmentForOrder,
    finalizePaidOrder,
    getOrderForWorkflow,
    hasPaidOrConfirmedOrder,
    logOrderNotification,
    normalizeEmail,
    normalizeIngredientLookupKey,
    parseStripeShippingSelectionMetadata,
    prisma,
    requireCustomer,
    resolveBaseShippingCents,
    resolveBlendIngredientsForPricing,
    resolveBoxtalQuoteSelection,
    resolveFirstOrderOnlyDiscountError,
    resolveOrderShippingSelection,
    stripe,
    t,
    toBlendPricingErrorResponse,
  } = deps;

  app.post('/api/orders/stripe-success', async (req, res) => {
    try {
      if (!stripe) {
        return res.status(501).json({ error: 'Stripe is not configured' });
      }
      const { sessionId, items, appliedDiscountCode, shippingSelection } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Cart items are required' });
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['customer_details'],
      });
      if (session.payment_status !== 'paid') {
        return res.status(400).json({ error: 'Payment not completed' });
      }

      const ingredientIds = Array.from(new Set(items.flatMap((item) => (item.ingredientIds || []).filter(Boolean))));
      const ingredientNames = Array.from(new Set(items.flatMap((item) => (item.ingredientNames || []).filter(Boolean))));
      const ingredients = ingredientNames.length > 0
        ? await prisma.ingredient.findMany({
          select: { id: true, price: true, name: true, color: true, category: true },
        })
        : await prisma.ingredient.findMany({
          where: { id: { in: ingredientIds } },
          select: { id: true, price: true, name: true, color: true, category: true },
        });
      const ingredientById = new Map(ingredients.map((ing) => [ing.id, ing]));
      const ingredientByName = new Map(ingredients.map((ing) => [normalizeIngredientLookupKey(ing.name), ing]));

      const orderItems = [];
      const normalizedStripeSuccessItems = [];
      let subtotalCents = 0;
      items.forEach((item) => {
        const quantity = Math.max(1, item.quantity || 1);
        const resolvedIngredients = resolveBlendIngredientsForPricing({
          ingredientIds: item.ingredientIds,
          ingredientNames: item.ingredientNames,
          ingredientById,
          ingredientByName,
        });
        const unitPriceCents = computeBlendUnitPriceCents(resolvedIngredients, {
          blendFormat: item.blendFormat,
        });
        resolvedIngredients.forEach((ingredient) => {
          orderItems.push({
            quantity,
            price: ingredient.price,
            ingredientName: ingredient.name || t("backend.index.ingredient_2"),
            ingredientColor: ingredient.color || '#6B7280',
          });
        });
        normalizedStripeSuccessItems.push({
          itemType: item.itemType || 'BLEND',
          quantity,
          unitPriceCents,
          lineSubtotalCents: unitPriceCents * quantity,
          productId: typeof item.productId === 'string' ? item.productId : null,
          variantId: typeof item.variantId === 'string' ? item.variantId : null,
          subscriptionPlanId: typeof item.subscriptionPlanId === 'string' ? item.subscriptionPlanId : null,
        });
        subtotalCents += unitPriceCents * quantity;
      });

      let settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
      if (!settings) {
        settings = await prisma.storeSettings.create({ data: { id: 'default' } });
      }

      const discounts = await prisma.discount.findMany();
      const totalRedemptions = await prisma.discountRedemption.groupBy({
        by: ['discountId'],
        _count: { _all: true },
      });
      const customerEmail = session.customer_details.email || session.customer_email || null;
      const normalizedCustomerEmail = normalizeEmail(customerEmail);
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
        customerEmail: normalizedCustomerEmail,
      }));
      const initialBaseShippingCents = resolveBaseShippingCents({
        settings,
        mode: shippingSelection?.mode,
        countryCode: shippingSelection?.countryCode || session.customer_details.address?.country || null,
        postalCode: shippingSelection?.postalCode || session.customer_details.address?.postal_code || null,
      });
      let summary = computeDiscounts({
        discounts,
        usageById,
        subtotalCents,
        productSubtotalCents: 0,
        shippingCents: initialBaseShippingCents,
        items: normalizedStripeSuccessItems,
        appliedCode: appliedDiscountCode,
        customerEmail: normalizedCustomerEmail,
        isFirstOrderEligible,
        now: new Date(),
      });

      const email = normalizedCustomerEmail || `guest-${Date.now()}@myowntea.com`;
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        const passwordHash = await bcrypt.hash(`stripe-${Date.now()}`, 10);
        user = await prisma.user.create({
          data: {
            email,
            passwordHash,
            role: 'CUSTOMER',
          },
        });
      }

      let customer = await prisma.customer.findUnique({ where: { userId: user.id } });
      if (!customer) {
        const fullName = session.customer_details.name || 'Client Stripe';
        const [firstName, ...rest] = fullName.split(' ');
        const lastName = rest.join(' ') || 'Stripe';
        const address = session.customer_details.address;
        customer = await prisma.customer.create({
          data: {
            userId: user.id,
            authProvider: 'PASSWORD',
            firstName: firstName || 'Client',
            lastName,
            phone: session.customer_details.phone || null,
            address: address.line1 || t("backend.index.address_indisponible"),
            city: address.city || 'Ville',
            postalCode: address.postal_code || '00000',
            country: address.country || 'FR',
          },
        });
      }

      const metadataSelection = parseStripeShippingSelectionMetadata(session.metadata?.shippingSelection);
      const resolvedSelection = resolveOrderShippingSelection(shippingSelection || metadataSelection || null);
      const quotedSelection = await resolveBoxtalQuoteSelection({
        mode: resolvedSelection.mode,
        requestedOfferCode: resolvedSelection.offerCode,
        countryCode: customer.country || resolvedSelection.countryCode || session.customer_details.address?.country,
        postalCode: customer.postalCode || resolvedSelection.postalCode || session.customer_details.address?.postal_code,
        city: customer.city || resolvedSelection.city || session.customer_details.address?.city,
        addressLine1: customer.address || session.customer_details.address?.line1 || null,
        declaredValueEur: summary.subtotalCents / 100,
      });
      const effectiveResolvedSelection = resolveOrderShippingSelection({
        ...resolvedSelection,
        countryCode: customer.country || resolvedSelection.countryCode || session.customer_details.address?.country,
        postalCode: customer.postalCode || resolvedSelection.postalCode || session.customer_details.address?.postal_code,
        city: customer.city || resolvedSelection.city || session.customer_details.address?.city,
        ...(quotedSelection
          ? {
            offerId: quotedSelection.offerId,
            offerCode: quotedSelection.offerCode,
            offerLabel: quotedSelection.offerLabel,
          }
          : {}),
      });
      const isFirstOrderEligibleAtCreation = !(await hasPaidOrConfirmedOrder({
        customerId: customer.id,
        userId: user.id,
        customerEmail: normalizedCustomerEmail,
      }));
      const finalBaseShippingCents = resolveBaseShippingCents({
        settings,
        mode: effectiveResolvedSelection.mode,
        countryCode: effectiveResolvedSelection.countryCode || null,
        postalCode: effectiveResolvedSelection.postalCode || null,
      });
      if (isFirstOrderEligibleAtCreation !== isFirstOrderEligible || finalBaseShippingCents !== initialBaseShippingCents) {
        summary = computeDiscounts({
          discounts,
          usageById,
          subtotalCents,
          productSubtotalCents: 0,
          shippingCents: finalBaseShippingCents,
          items: normalizedStripeSuccessItems,
          appliedCode: appliedDiscountCode,
          customerEmail: normalizedCustomerEmail,
          isFirstOrderEligible: isFirstOrderEligibleAtCreation,
          now: new Date(),
        });
      }
      const firstOrderOnlyError = resolveFirstOrderOnlyDiscountError(summary, appliedDiscountCode);
      if (firstOrderOnlyError) {
        return res.status(409).json({ error: firstOrderOnlyError });
      }

      const order = await prisma.order.create({
        data: {
          userId: user.id,
          customerId: customer.id,
          customerEmailSnapshot: normalizedCustomerEmail,
          orderNumber: `ORD-${Date.now()}`,
          status: 'CONFIRMED',
          subtotal: summary.subtotalCents / 100,
          shippingCost: summary.shippingCents / 100,
          tax: 0,
          total: summary.totalCents / 100,
          subtotalCents: summary.subtotalCents,
          shippingCents: summary.shippingCents,
          discountTotalCents: summary.discountTotalCents,
          totalCents: summary.totalCents,
          appliedDiscounts: summary.discountLines,
          appliedDiscountCode: summary.appliedCode,
          paymentMethod: 'stripe',
          paymentStatus: 'completed',
          shippingAddress: customer.address,
          shippingProvider: effectiveResolvedSelection.offerId || effectiveResolvedSelection.offerCode ? 'BOXTAL' : null,
          shippingMode: effectiveResolvedSelection.mode || null,
          shippingOfferId: effectiveResolvedSelection.offerId || null,
          shippingOfferCode: effectiveResolvedSelection.offerCode || null,
          shippingOfferLabel: effectiveResolvedSelection.offerLabel || null,
          relayPointId: effectiveResolvedSelection.relayPoint?.id || null,
          relayPointLabel: effectiveResolvedSelection.relayPoint?.name || null,
          relayNetwork: effectiveResolvedSelection.relayPoint?.network || null,
          shippingMeta: {
            ...effectiveResolvedSelection,
            ...(quotedSelection ? { quoteMeta: quotedSelection.quoteMeta || null } : {}),
          },
          items: {
            create: orderItems,
          },
        },
      });
      const workflowOrder = await getOrderForWorkflow(order.id);
      if (workflowOrder) {
        await logOrderNotification({
          order: workflowOrder,
          type: 'ORDER_CONFIRMED',
          payload: {
            fromStatus: 'PENDING',
            toStatus: 'CONFIRMED',
            orderNumber: workflowOrder.orderNumber,
            reason: t("backend.index.payment_valid_stripe"),
          },
        });
      }
      if (summary.discountLines.length > 0) {
        await prisma.$transaction(summary.discountLines.map((line) => prisma.orderDiscountApplication.create({
          data: {
            orderId: order.id,
            discountId: line.discountId,
            label: line.label,
            type: line.type,
            scope: line.scope,
            amountCents: line.amountCents,
            snapshot: { scope: line.scope },
          },
        })));
      }
      await ensureBoxtalShipmentForOrder(order.id, 'orders_stripe_success');
      if (summary.matchedDiscounts.length > 0) {
        await prisma.$transaction([
          ...summary.matchedDiscounts.map((discount) => prisma.discountRedemption.create({
            data: {
              discountId: discount.id,
              orderId: order.id,
              customerEmail: normalizedCustomerEmail,
            },
          })),
          ...summary.matchedDiscounts.map((discount) => prisma.discount.update({
            where: { id: discount.id },
            data: { redemptionCount: { increment: 1 } },
          })),
        ]);
      }

      res.json({
        id: order.id,
        orderNumber: order.orderNumber,
        subtotalCents: summary.subtotalCents,
        shippingCents: summary.shippingCents,
        subtotalDiscountCents,
        discountTotalCents: summary.discountTotalCents,
        totalCents: summary.totalCents,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'INGREDIENT_NOT_FOUND') {
        return res.status(404).json({ error: 'One or more ingredients not found' });
      }
      const pricingError = toBlendPricingErrorResponse(error);
      if (pricingError) {
        return res.status(400).json({ error: pricingError.message, code: pricingError.code });
      }
      console.error('Error creating order from Stripe:', error);
      res.status(500).json({ error: 'Failed to create order' });
    }
  });

  app.get('/api/orders/by-session/:sessionId', requireCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const sessionId = req.params.sessionId;
      let order = await prisma.order.findFirst({
        where: { stripeSessionId: req.params.sessionId, customerId: customer.id },
        include: { items: true },
      });
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      const isOrderFinalized = order.status === 'CONFIRMED' && order.paymentStatus === 'completed';
      if (!isOrderFinalized && stripe) {
        try {
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          if (session.payment_status === 'paid') {
            await finalizePaidOrder(order.id);
            order = await prisma.order.findFirst({
              where: { id: order.id, customerId: customer.id },
              include: { items: true },
            });
            if (!order) {
              return res.status(404).json({ error: 'Order not found' });
            }
          }
        } catch {
          // keep original order payload when Stripe check fails
        }
      }
      if (order.paymentStatus === 'completed') {
        await ensureBoxtalShipmentForOrder(order.id, 'orders_by_session');
      }
      res.json(order);
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  });

  app.get('/api/orders/by-payment-intent/:paymentIntentId', requireCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const paymentIntentId = req.params.paymentIntentId;
      let order = await prisma.order.findFirst({
        where: { stripeSessionId: req.params.paymentIntentId, customerId: customer.id },
        include: { items: true },
      });
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      const isOrderFinalized = order.status === 'CONFIRMED' && order.paymentStatus === 'completed';
      if (!isOrderFinalized && stripe) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          if (paymentIntent.status === 'succeeded') {
            await finalizePaidOrder(order.id);
            await ensureBlendSubscriptionsFromPaidOrder({ order, paymentIntent });
            order = await prisma.order.findFirst({
              where: { id: order.id, customerId: customer.id },
              include: { items: true },
            });
            if (!order) {
              return res.status(404).json({ error: 'Order not found' });
            }
          }
        } catch {
          // keep original order payload when Stripe check fails
        }
      } else if (stripe && order.paymentStatus === 'completed') {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          if (paymentIntent.status === 'succeeded') {
            await ensureBlendSubscriptionsFromPaidOrder({ order, paymentIntent });
            order = await prisma.order.findFirst({
              where: { id: order.id, customerId: customer.id },
              include: { items: true },
            });
            if (!order) {
              return res.status(404).json({ error: 'Order not found' });
            }
          }
        } catch {
          // keep original order payload when Stripe check fails
        }
      }
      if (order.paymentStatus === 'completed') {
        await ensureBoxtalShipmentForOrder(order.id, 'orders_by_payment_intent');
      }
      res.json(order);
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  });

  app.post('/api/cart/validate', async (req, res) => {
    try {
      const { ingredientIds, total, blendFormat } = req.body;
      if (!Array.isArray(ingredientIds) || ingredientIds.length === 0 || typeof total !== 'number') {
        return res.status(400).json({ error: 'Invalid payload' });
      }
      if (new Set(ingredientIds).size !== ingredientIds.length) {
        return res.status(400).json({
          error: t("backend.index.meme_ingredient_peut"),
          code: 'BLEND_DUPLICATE_INGREDIENT',
        });
      }

      const ingredients = await prisma.ingredient.findMany({
        where: { id: { in: ingredientIds } },
        select: { id: true, price: true, category: true },
      });
      if (ingredients.length !== ingredientIds.length) {
        return res.status(404).json({ error: 'One or more ingredients not found' });
      }

      const expectedTotal = computeBlendUnitPriceCents(ingredients, { blendFormat }) / 100;
      const roundedExpected = Math.round(expectedTotal * 100) / 100;
      const roundedProvided = Math.round(total * 100) / 100;
      const isValid = Math.abs(roundedExpected - roundedProvided) <= 0.01;
      if (!isValid) {
        return res.status(400).json({ valid: false, expectedTotal: roundedExpected });
      }
      return res.json({ valid: true, expectedTotal: roundedExpected });
    } catch (error) {
      const pricingError = toBlendPricingErrorResponse(error);
      if (pricingError) {
        return res.status(400).json({ error: pricingError.message, code: pricingError.code });
      }
      console.error('Error validating cart total:', error);
      res.status(500).json({ error: 'Failed to validate total' });
    }
  });
}
