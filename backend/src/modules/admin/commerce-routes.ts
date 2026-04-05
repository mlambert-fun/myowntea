// @ts-nocheck
export function registerAdminCommerceRoutes(app, deps) {
  const {
    adminMutationAudit,
    computeAvailableOrderTransitions,
    ensureBoxtalShipmentForOrder,
    getShippingDocument,
    getShippingTracking,
    listOrderStatusHistory,
    normalizeCode,
    OrderWorkflowError,
    parseBoxtalLabelUrl,
    parseBoxtalTrackingPayload,
    prisma,
    requireAdminApi,
    syncShipmentTrackingFromPayload,
    t,
    toNonEmptyStringOrNull,
    toStatusOrNull,
    transitionOrderStatus,
  } = deps;

  const withOrderCustomerEmailFallback = (order) => {
    if (!order) {
      return order;
    }
    const resolveStoredTranslation = (value, fallback = null) => {
      if (typeof value !== 'string') {
        return fallback;
      }
      const trimmed = value.trim();
      if (!trimmed || trimmed.toLowerCase() === 'null') {
        return fallback;
      }
      return trimmed.includes('.') ? t(trimmed, trimmed) : trimmed;
    };
    if (!order.customer) {
      return {
        ...order,
        shippingOfferLabel: resolveStoredTranslation(order.shippingOfferLabel, order.shippingOfferLabel || null),
      };
    }
    return {
      ...order,
      shippingOfferLabel: resolveStoredTranslation(order.shippingOfferLabel, order.shippingOfferLabel || null),
      customer: {
        ...order.customer,
        email: order.customer.email || order.customerEmailSnapshot || null,
        firstName: resolveStoredTranslation(order.customer.firstName, null),
        lastName: resolveStoredTranslation(order.customer.lastName, null),
      },
    };
  };

  const normalizeDiscountConfigInput = (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
        throw new Error('Discount config must be a JSON object');
      } catch (_error) {
        throw new Error('Discount config must be a valid JSON object');
      }
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }
    throw new Error('Discount config must be a JSON object');
  };

  const validateDiscountPayload = (params) => {
    const type = String(params.type || '');
    const config = params.config && typeof params.config === 'object' ? params.config : {};
    if (
      type === 'PERCENTAGE' &&
      (!params.valuePercent || params.valuePercent <= 0 || params.valuePercent > 100)
    ) {
      return 'Percentage value must be between 1 and 100';
    }
    if (type === 'FIXED' && (!params.valueCents || params.valueCents <= 0)) {
      return 'Fixed value must be greater than 0';
    }
    if (type === 'BOGO') {
      const buyQty = Number(config.buyQty || 1);
      const getQty = Number(config.getQty || 1);
      if (!Number.isFinite(buyQty) || buyQty <= 0 || !Number.isFinite(getQty) || getQty <= 0) {
        return 'BOGO config requires positive buyQty/getQty';
      }
    }
    if (type === 'TIERED') {
      const tiers = Array.isArray(config.tiers) ? config.tiers : [];
      const hasValidTier = tiers.some((tier) => {
        const percent = Number(tier?.percent || 0);
        const fixedCents = Number(tier?.fixedCents || 0);
        return (Number.isFinite(percent) && percent > 0) || (Number.isFinite(fixedCents) && fixedCents > 0);
      });
      if (!hasValidTier) {
        return 'TIERED config requires at least one tier with percent or fixedCents';
      }
    }
    if (type === 'BUNDLE') {
      const requiredQty = Number(config.requiredQty || 2);
      const bundlePriceCents = Number(config.bundlePriceCents || 0);
      const percentOff = Number(config.percentOff || 0);
      const fixedOffCents = Number(config.fixedOffCents || 0);
      const hasRule = bundlePriceCents > 0 || percentOff > 0 || fixedOffCents > 0;
      if (!Number.isFinite(requiredQty) || requiredQty < 2 || !hasRule) {
        return 'BUNDLE config requires requiredQty >= 2 and bundlePriceCents or percentOff or fixedOffCents';
      }
    }
    if (type === 'SALE_PRICE') {
      const saleUnitPriceCents = Number(config.saleUnitPriceCents || 0);
      const percentOff = Number(config.percentOff || 0);
      const fixedOffCents = Number(config.fixedOffCents || 0);
      if (!(saleUnitPriceCents > 0 || percentOff > 0 || fixedOffCents > 0)) {
        return 'SALE_PRICE config requires saleUnitPriceCents or percentOff or fixedOffCents';
      }
    }
    if (type === 'SUBSCRIPTION') {
      const percentOff = Number(config.percentOff || params.valuePercent || 0);
      const fixedOffCents = Number(config.fixedOffCents || params.valueCents || 0);
      if (!(percentOff > 0 || fixedOffCents > 0)) {
        return 'SUBSCRIPTION discount requires percentOff/valuePercent or fixedOffCents/valueCents';
      }
    }
    if (type === 'GIFT') {
      const giftValueCents = Number(config.giftValueCents || params.valueCents || 0);
      const triggerMinimumSubtotalCents = Number(
        config.triggerMinimumSubtotalCents || params.minimumSubtotalCents || 0
      );
      const triggerProductIds = Array.isArray(config.triggerProductIds)
        ? config.triggerProductIds.filter(Boolean)
        : [];
      const triggerVariantIds = Array.isArray(config.triggerVariantIds)
        ? config.triggerVariantIds.filter(Boolean)
        : [];
      const hasTrigger =
        triggerMinimumSubtotalCents > 0 ||
        triggerProductIds.length > 0 ||
        triggerVariantIds.length > 0;
      if (!hasTrigger || giftValueCents <= 0) {
        return 'GIFT config requires giftValueCents and a trigger (minimum subtotal or product/variant ids)';
      }
    }
    return null;
  };

  app.get('/api/discounts', requireAdminApi, async (req, res) => {
    try {
      const discounts = await prisma.discount.findMany({
        orderBy: { createdAt: 'desc' },
      });
      res.json(discounts);
    } catch (error) {
      console.error('Error fetching discounts:', error);
      res.status(500).json({ error: 'Failed to fetch discounts' });
    }
  });

  app.get('/api/discounts/:id', requireAdminApi, async (req, res) => {
    try {
      const discount = await prisma.discount.findUnique({ where: { id: req.params.id } });
      if (!discount) {
        return res.status(404).json({ error: 'Discount not found' });
      }
      res.json(discount);
    } catch (error) {
      console.error('Error fetching discount:', error);
      res.status(500).json({ error: 'Failed to fetch discount' });
    }
  });

  app.post('/api/discounts', requireAdminApi, adminMutationAudit, async (req, res) => {
    try {
      const { title, method, code, type, scope, valuePercent, valueCents, minimumSubtotalCents, startAt, endAt, usageLimitTotal, usageLimitPerCustomer, stackable, firstOrderOnly, status, config } = req.body;
      if (!title || !method || !type) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const normalizedCode = method === 'CODE' ? normalizeCode(code) : null;
      if (method === 'CODE' && !normalizedCode) {
        return res.status(400).json({ error: 'Code is required for code discounts' });
      }

      const parsedConfig = normalizeDiscountConfigInput(config);
      const validationError = validateDiscountPayload({
        type,
        valuePercent,
        valueCents,
        minimumSubtotalCents,
        config: parsedConfig,
      });

      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const normalizedValuePercent = typeof valuePercent === 'number' && Number.isFinite(valuePercent) ? valuePercent : null;
      const normalizedValueCents = typeof valueCents === 'number' && Number.isFinite(valueCents) ? valueCents : null;
      const discount = await prisma.discount.create({
        data: {
          title,
          method,
          code: normalizedCode,
          type,
          scope: scope || 'ORDER',
          config: parsedConfig === undefined ? null : parsedConfig,
          valuePercent: normalizedValuePercent,
          valueCents: normalizedValueCents,
          minimumSubtotalCents: typeof minimumSubtotalCents === 'number' ? minimumSubtotalCents : 0,
          startAt: startAt ? new Date(startAt) : null,
          endAt: endAt ? new Date(endAt) : null,
          usageLimitTotal: typeof usageLimitTotal === 'number' ? usageLimitTotal : null,
          usageLimitPerCustomer: typeof usageLimitPerCustomer === 'number' ? usageLimitPerCustomer : null,
          stackable: Boolean(stackable),
          firstOrderOnly: Boolean(firstOrderOnly),
          status: status || 'DRAFT',
        },
      });
      res.status(201).json(discount);
    } catch (error) {
      console.error('Error creating discount:', error);
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Discount code already exists' });
      }
      res.status(500).json({ error: 'Failed to create discount' });
    }
  });

  app.put('/api/discounts/:id', requireAdminApi, adminMutationAudit, async (req, res) => {
    try {
      const { title, method, code, type, scope, valuePercent, valueCents, minimumSubtotalCents, startAt, endAt, usageLimitTotal, usageLimitPerCustomer, stackable, firstOrderOnly, status, config } = req.body;
      const normalizedCode = method === 'CODE' ? normalizeCode(code) : null;
      if (method === 'CODE' && !normalizedCode) {
        return res.status(400).json({ error: 'Code is required for code discounts' });
      }

      const parsedConfig = normalizeDiscountConfigInput(config);
      const validationError = validateDiscountPayload({
        type,
        valuePercent,
        valueCents,
        minimumSubtotalCents,
        config: parsedConfig,
      });

      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const normalizedValuePercent = typeof valuePercent === 'number' && Number.isFinite(valuePercent) ? valuePercent : null;
      const normalizedValueCents = typeof valueCents === 'number' && Number.isFinite(valueCents) ? valueCents : null;
      const discount = await prisma.discount.update({
        where: { id: req.params.id },
        data: {
          title,
          method,
          code: normalizedCode,
          type,
          scope: scope || 'ORDER',
          config: parsedConfig,
          valuePercent: normalizedValuePercent,
          valueCents: normalizedValueCents,
          minimumSubtotalCents: typeof minimumSubtotalCents === 'number' ? minimumSubtotalCents : 0,
          startAt: startAt ? new Date(startAt) : null,
          endAt: endAt ? new Date(endAt) : null,
          usageLimitTotal: typeof usageLimitTotal === 'number' ? usageLimitTotal : null,
          usageLimitPerCustomer: typeof usageLimitPerCustomer === 'number' ? usageLimitPerCustomer : null,
          stackable: Boolean(stackable),
          firstOrderOnly: typeof firstOrderOnly === 'boolean' ? firstOrderOnly : undefined,
          status: status || 'DRAFT',
        },
      });
      res.json(discount);
    } catch (error) {
      console.error('Error updating discount:', error);
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Discount code already exists' });
      }
      res.status(500).json({ error: 'Failed to update discount' });
    }
  });

  app.patch('/api/discounts/:id/status', requireAdminApi, adminMutationAudit, async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }

      const discount = await prisma.discount.update({
        where: { id: req.params.id },
        data: { status },
      });
      res.json(discount);
    } catch (error) {
      console.error('Error updating discount status:', error);
      res.status(500).json({ error: 'Failed to update discount status' });
    }
  });

  app.get('/api/orders', requireAdminApi, async (req, res) => {
    try {
      const orders = await prisma.order.findMany({
        include: { items: true, customer: true, shipment: true },
        orderBy: { createdAt: 'desc' },
      });
      const serialized = orders.map((order) => ({
        ...withOrderCustomerEmailFallback(order),
        availableTransitions: computeAvailableOrderTransitions(order),
      }));
      res.json(serialized);
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });

  app.get('/api/orders/:id', requireAdminApi, async (req, res) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: req.params.id },
        include: { items: true, customer: true, paymentRecord: true, shipment: true },
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const statusHistory = await listOrderStatusHistory(order.id);
      res.json({
        ...withOrderCustomerEmailFallback(order),
        availableTransitions: computeAvailableOrderTransitions(order),
        statusHistory,
      });
    } catch (error) {
      console.error('Error fetching order:', error);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  });

  app.post('/api/orders/:id/create-shipment', requireAdminApi, adminMutationAudit, async (req, res) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: req.params.id },
        select: { id: true, orderNumber: true },
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const shipment = await ensureBoxtalShipmentForOrder(order.id, 'admin_manual_retry', { throwOnError: true });
      if (!shipment) {
        return res.status(409).json({
          error: 'Shipment was not created. Verify payment status, shipping offer and Boxtal configuration.',
        });
      }

      const refreshed = await prisma.shipment.findUnique({
        where: { id: shipment.id },
        include: {
          order: {
            select: { id: true, orderNumber: true },
          },
        },
      });
      return res.json({ shipment: refreshed });
    } catch (error) {
      console.error('Error creating shipment from order:', error);
      const message = error instanceof Error ? error.message : 'Failed to create shipment from order';
      return res.status(500).json({ error: message });
    }
  });

  app.patch('/api/orders/:id/status', requireAdminApi, adminMutationAudit, async (req, res) => {
    try {
      const { status, reason, trackingNumber, trackingUrl, shippingProvider } = req.body;
      const toStatus = toStatusOrNull(status);
      if (!toStatus) {
        return res.status(400).json({ error: 'Valid status is required' });
      }

      const order = await transitionOrderStatus({
        orderId: req.params.id,
        toStatus,
        reason: toNonEmptyStringOrNull(reason) || null,
        actorType: 'admin',
        actorId: req.adminUser?.id || null,
        trackingNumber,
        trackingUrl,
        shippingProvider,
      });

      const statusHistory = await listOrderStatusHistory(order.id);
      res.json({
        ...order,
        statusHistory,
      });
    } catch (error) {
      if (error instanceof OrderWorkflowError) {
        if (error.code === 'ORDER_NOT_FOUND') {
          return res.status(404).json({ error: error.message, code: error.code });
        }

        if (
          error.code === 'TRANSITION_NOT_ALLOWED' ||
          error.code === 'PAYMENT_NOT_COMPLETED' ||
          error.code === 'TRACKING_REQUIRED' ||
          error.code === 'STOCK_UNAVAILABLE'
        ) {
          return res.status(409).json({ error: error.message, code: error.code, details: error.details || null });
        }

        return res.status(400).json({ error: error.message, code: error.code, details: error.details || null });
      }

      console.error('Error updating order status:', error);
      res.status(500).json({ error: 'Failed to update order status' });
    }
  });

  app.get('/api/shipments', requireAdminApi, async (_req, res) => {
    try {
      const shipments = await prisma.shipment.findMany({
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              createdAt: true,
              customerEmailSnapshot: true,
              customer: { select: { firstName: true, lastName: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      res.json(shipments.map((shipment) => ({
        ...shipment,
        order: withOrderCustomerEmailFallback(shipment.order),
      })));
    } catch (error) {
      console.error('Error fetching shipments:', error);
      res.status(500).json({ error: 'Failed to fetch shipments' });
    }
  });

  app.get('/api/shipments/:id', requireAdminApi, async (req, res) => {
    try {
      const shipment = await prisma.shipment.findUnique({
        where: { id: req.params.id },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              createdAt: true,
              customerEmailSnapshot: true,
              customer: { select: { firstName: true, lastName: true, email: true } },
            },
          },
          events: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (!shipment) {
        return res.status(404).json({ error: 'Shipment not found' });
      }

      res.json({
        ...shipment,
        order: withOrderCustomerEmailFallback(shipment.order),
      });
    } catch (error) {
      console.error('Error fetching shipment:', error);
      res.status(500).json({ error: 'Failed to fetch shipment' });
    }
  });

  app.post('/api/shipments/:id/refresh-label', requireAdminApi, adminMutationAudit, async (req, res) => {
    try {
      const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
      if (!shipment || !shipment.providerOrderId) {
        return res.status(404).json({ error: 'Shipment not found' });
      }

      const document = await getShippingDocument(shipment.providerOrderId);
      const labelUrl = parseBoxtalLabelUrl(document);
      const updated = await prisma.shipment.update({
        where: { id: shipment.id },
        data: { labelUrl, response: document },
      });
      res.json(updated);
    } catch (error) {
      console.error('Error refreshing label:', error);
      res.status(500).json({ error: 'Failed to refresh label' });
    }
  });

  app.post('/api/shipments/:id/refresh-tracking', requireAdminApi, adminMutationAudit, async (req, res) => {
    try {
      const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
      if (!shipment || !shipment.providerOrderId) {
        return res.status(404).json({ error: 'Shipment not found' });
      }

      const tracking = await getShippingTracking(shipment.providerOrderId);
      const parsedTracking = parseBoxtalTrackingPayload(tracking, shipment.trackingNumber);
      const synced = await syncShipmentTrackingFromPayload({
        shipmentId: shipment.id,
        providerStatus: parsedTracking.providerStatus,
        trackingNumber: parsedTracking.trackingNumber,
        trackingUrl: parsedTracking.trackingUrl,
        response: tracking,
        actorType: 'admin',
        actorId: req.adminUser?.id || 'manual_tracking_refresh',
        reason: t('backend.index.rafraichissement_manuel_tracking'),
      });

      res.json({
        ...synced.shipment,
        transitionedTo: synced.orderSync.transitionedTo,
        mappedStatus: synced.mappedStatus,
      });
    } catch (error) {
      console.error('Error refreshing tracking:', error);
      res.status(500).json({ error: 'Failed to refresh tracking' });
    }
  });
}
