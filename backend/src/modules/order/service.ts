// @ts-nocheck
export function createOrderWorkflowService({
  ORDER_NOTIFICATION_BY_STATUS,
  ORDER_STATUS_TRANSITIONS,
  OrderWorkflowError,
  buildOrderNotificationEmailContent,
  createShippingOrder,
  crypto,
  ensureEmailPreference,
  ensureOrderWorkflowTables,
  mapBoxtalStatus,
  normalizeShippingMode,
  prisma,
  queueEmailDelivery,
  t,
  toJsonObjectRecord,
  toNonEmptyStringOrNull,
  toStatusOrNull,
}) {
  const getOrderForWorkflow = (orderId) =>
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        customer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        shipment: true,
      },
    });

  const listOrderStatusHistory = async (orderId) => {
    await ensureOrderWorkflowTables();
    return prisma.$queryRaw`
      SELECT
        "id",
        "orderId",
        "fromStatus",
        "toStatus",
        "reason",
        "actorType",
        "actorId",
        "metadata",
        "createdAt"
      FROM "OrderStatusHistory"
      WHERE "orderId" = ${orderId}
      ORDER BY "createdAt" DESC
    `;
  };

  const recordOrderStatusHistory = async (params) => {
    await ensureOrderWorkflowTables();
    const id = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "OrderStatusHistory" (
        "id",
        "orderId",
        "fromStatus",
        "toStatus",
        "reason",
        "actorType",
        "actorId",
        "metadata",
        "createdAt"
      )
      VALUES (
        ${id},
        ${params.orderId},
        ${params.fromStatus},
        ${params.toStatus},
        ${params.reason || null},
        ${params.actorType},
        ${params.actorId || null},
        CAST(${JSON.stringify(params.metadata || {})} AS jsonb),
        NOW()
      )
    `;
  };

  const hasRecentNotification = async (orderId, type, lookbackMinutes) => {
    await ensureOrderWorkflowTables();
    const cutoff = new Date(Date.now() - lookbackMinutes * 60 * 1000);
    const rows = await prisma.$queryRaw`
      SELECT "id"
      FROM "OrderNotificationLog"
      WHERE "orderId" = ${orderId}
        AND "type" = ${type}
        AND "createdAt" >= ${cutoff}
      LIMIT 1
    `;
    return rows.length > 0;
  };

  const resolveOrderRecipientEmail = (order) =>
    toNonEmptyStringOrNull(order?.customer?.email) ||
    toNonEmptyStringOrNull(order?.customerEmailSnapshot);

  const logOrderNotification = async (params) => {
    await ensureOrderWorkflowTables();
    const recipient = resolveOrderRecipientEmail(params.order);
    const channel = params.channel || (recipient ? t("backend.index.email") : 'internal');
    if (await hasRecentNotification(params.order.id, params.type, 5)) {
      return;
    }
    const id = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "OrderNotificationLog" (
        "id",
        "orderId",
        "type",
        "channel",
        "recipient",
        "status",
        "payload",
        "createdAt",
        "sentAt"
      )
      VALUES (
        ${id},
        ${params.order.id},
        ${params.type},
        ${channel},
        ${recipient},
        ${'SENT'},
        CAST(${JSON.stringify(params.payload || {})} AS jsonb),
        NOW(),
        NOW()
      )
    `;
    if (channel === t("backend.index.email") && recipient) {
      const customerId = toNonEmptyStringOrNull(params.order.customer?.id);
      const preferences = customerId ? await ensureEmailPreference(customerId) : null;
      const canSendTransactional = preferences ? Boolean(preferences.transactionalOptIn) : true;
      if (canSendTransactional) {
        const content =
          params.emailContent ||
          buildOrderNotificationEmailContent({
            type: params.type,
            order: params.order,
            payload: params.payload || {},
          });
        await queueEmailDelivery({
          customerId: customerId || null,
          orderId: params.order.id,
          type: params.type,
          recipient,
          subject: content.subject,
          text: content.text,
          html: content.html,
          metadata: {
            source: 'order_notification',
            notificationLogId: id,
            type: params.type,
            orderNumber: params.order.orderNumber,
          },
        });
      }
    }
    console.log(
      `[notification] ${params.type} -> ${params.order.orderNumber} (${recipient || 'internal'})`
    );
  };

  const computeAvailableOrderTransitions = (order) => {
    const currentStatus = toStatusOrNull(order.status);
    if (!currentStatus) {
      return [];
    }
    const candidates = ORDER_STATUS_TRANSITIONS[currentStatus];
    const effectiveTracking =
      toNonEmptyStringOrNull(order.trackingNumber) ||
      toNonEmptyStringOrNull(order.shipment?.trackingNumber);
    const effectiveProvider =
      toNonEmptyStringOrNull(order.shippingProvider) ||
      toNonEmptyStringOrNull(order.shipment?.provider);
    return candidates.filter((target) => {
      if (target === 'CONFIRMED') {
        return order.paymentStatus === 'completed';
      }
      if (target === 'SHIPPED') {
        return Boolean(effectiveTracking && effectiveProvider);
      }
      return true;
    });
  };

  const adjustInventoryForOrderItems = async (items, direction) => {
    for (const item of items) {
      const type = String(item.itemType || '');
      if (type !== 'VARIANT' && type !== 'PACK') {
        continue;
      }
      const quantity = Math.max(1, Number(item.qty || 1));
      const snapshot = toJsonObjectRecord(item.snapshot);
      const variantId = toNonEmptyStringOrNull(snapshot.variantId);
      const productId = toNonEmptyStringOrNull(snapshot.productId);
      if (variantId) {
        const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
        if (!variant || variant.stockQty === null) {
          continue;
        }
        if (direction === 'reserve' && variant.stockQty < quantity) {
          throw new OrderWorkflowError(
            'STOCK_UNAVAILABLE',
            t("backend.index.stock_insuffisant_variant"),
            {
              variantId,
              available: variant.stockQty,
              required: quantity,
            }
          );
        }
        const nextQty =
          direction === 'reserve'
            ? Math.max(0, variant.stockQty - quantity)
            : variant.stockQty + quantity;
        await prisma.productVariant.update({
          where: { id: variantId },
          data: { stockQty: nextQty },
        });
        continue;
      }
      if (!productId) {
        continue;
      }
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product || product.stockQty === null) {
        continue;
      }
      if (direction === 'reserve' && product.stockQty < quantity) {
        throw new OrderWorkflowError(
          'STOCK_UNAVAILABLE',
          t("backend.index.stock_insuffisant_product"),
          {
            productId,
            available: product.stockQty,
            required: quantity,
          }
        );
      }
      const nextQty =
        direction === 'reserve'
          ? Math.max(0, product.stockQty - quantity)
          : product.stockQty + quantity;
      await prisma.product.update({
        where: { id: productId },
        data: { stockQty: nextQty },
      });
    }
  };

  const transitionOrderStatus = async (params) => {
    await ensureOrderWorkflowTables();
    const order = await getOrderForWorkflow(params.orderId);
    if (!order) {
      throw new OrderWorkflowError('ORDER_NOT_FOUND', t("backend.index.order_not_found"));
    }
    const fromStatus = toStatusOrNull(order.status);
    if (!fromStatus) {
      throw new OrderWorkflowError('INVALID_CURRENT_STATUS', 'Statut actuel invalide');
    }
    const toStatus = params.toStatus;
    const updateData = {};
    if (params.trackingNumber !== undefined) {
      updateData.trackingNumber = toNonEmptyStringOrNull(params.trackingNumber);
    }
    if (params.trackingUrl !== undefined) {
      updateData.trackingUrl = toNonEmptyStringOrNull(params.trackingUrl);
    }
    if (params.shippingProvider !== undefined) {
      updateData.shippingProvider = toNonEmptyStringOrNull(params.shippingProvider);
    }
    const validationOrder = {
      ...order,
      trackingNumber: updateData.trackingNumber ?? order.trackingNumber,
      shippingProvider: updateData.shippingProvider ?? order.shippingProvider,
    };
    if (fromStatus !== toStatus) {
      const available = computeAvailableOrderTransitions(validationOrder);
      if (!available.includes(toStatus)) {
        throw new OrderWorkflowError(
          'TRANSITION_NOT_ALLOWED',
          t("backend.index.transition_status_non"),
          {
            fromStatus,
            toStatus,
            availableTransitions: available,
          }
        );
      }
    }
    if (toStatus === 'CONFIRMED' && order.paymentStatus !== 'completed') {
      throw new OrderWorkflowError(
        'PAYMENT_NOT_COMPLETED',
        t("backend.index.payment_must_complete")
      );
    }
    if (
      toStatus === 'SHIPPED' &&
      !(
        toNonEmptyStringOrNull(validationOrder.trackingNumber) &&
        (toNonEmptyStringOrNull(validationOrder.shippingProvider) ||
          toNonEmptyStringOrNull(order.shipment?.provider))
      )
    ) {
      throw new OrderWorkflowError(
        'TRACKING_REQUIRED',
        t("backend.index.tracking_carrier_required")
      );
    }
    if (fromStatus !== toStatus) {
      if (toStatus === 'CONFIRMED' && fromStatus === 'PENDING') {
        await adjustInventoryForOrderItems(order.items, 'reserve');
      }
      if (
        toStatus === 'CANCELLED' &&
        (fromStatus === 'CONFIRMED' || fromStatus === 'PROCESSING')
      ) {
        await adjustInventoryForOrderItems(order.items, 'release');
      }
    }
    if (fromStatus !== toStatus) {
      updateData.status = toStatus;
    }
    if (toStatus === 'REFUNDED') {
      updateData.paymentStatus = 'refunded';
    }
    let updatedOrder = order;
    if (Object.keys(updateData).length > 0) {
      updatedOrder = await prisma.order.update({
        where: { id: order.id },
        data: updateData,
        include: {
          items: true,
          customer: { select: { id: true, email: true, firstName: true, lastName: true } },
          shipment: true,
        },
      });
    }
    if (fromStatus !== toStatus) {
      if (toStatus === 'CONFIRMED' && order.cartId) {
        await prisma.cart.update({
          where: { id: order.cartId },
          data: { status: 'ORDERED' },
        });
        const activeCart = await prisma.cart.findFirst({
          where: { customerId: order.customerId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!activeCart) {
          await prisma.cart.create({
            data: { customerId: order.customerId, status: 'ACTIVE', currency: 'EUR' },
          });
        }
      }
      await recordOrderStatusHistory({
        orderId: order.id,
        fromStatus,
        toStatus,
        reason: params.reason || null,
        actorType: params.actorType || 'admin',
        actorId: params.actorId || null,
        metadata: {
          trackingNumber:
            toNonEmptyStringOrNull(params.trackingNumber) ||
            toNonEmptyStringOrNull(updatedOrder.trackingNumber),
        },
      });
      const notificationType = ORDER_NOTIFICATION_BY_STATUS[toStatus];
      if (notificationType) {
        await logOrderNotification({
          order: updatedOrder,
          type: notificationType,
          payload: {
            fromStatus,
            toStatus,
            orderNumber: updatedOrder.orderNumber,
            reason: params.reason || null,
          },
        });
      }
    }
    return {
      ...updatedOrder,
      availableTransitions: computeAvailableOrderTransitions(updatedOrder),
    };
  };

  const ensureBoxtalShipmentForOrder = async (orderId, source = 'system', options = {}) => {
    const throwOnError = Boolean(options.throwOnError);
    if (!orderId) {
      return null;
    }
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        shipment: true,
      },
    });
    if (!order) {
      return null;
    }
    if (order.shipment) {
      return order.shipment;
    }
    const status = toStatusOrNull(order.status);
    if (!status || (status !== 'CONFIRMED' && status !== 'PROCESSING' && status !== 'SHIPPED')) {
      return null;
    }
    if (order.paymentStatus !== 'completed') {
      return null;
    }
    const offerId = toNonEmptyStringOrNull(order.shippingOfferId);
    const offerCode = toNonEmptyStringOrNull(order.shippingOfferCode);
    if (!offerId && !offerCode) {
      return null;
    }
    if (
      normalizeShippingMode(order.shippingMode) === 'RELAY' &&
      !toNonEmptyStringOrNull(order.relayPointId)
    ) {
      console.warn(`[shipping] relay point missing for order ${order.orderNumber}`);
      return null;
    }
    const shippingSnapshot = toJsonObjectRecord(order.shippingAddressSnapshot);
    const recipientFirstName =
      toNonEmptyStringOrNull(shippingSnapshot.firstName) ||
      toNonEmptyStringOrNull(order.customer?.firstName) ||
      'Client';
    const recipientLastName =
      toNonEmptyStringOrNull(shippingSnapshot.lastName) ||
      toNonEmptyStringOrNull(order.customer?.lastName) ||
      '';
    const recipientEmail = resolveOrderRecipientEmail(order);
    const recipientPhone =
      toNonEmptyStringOrNull(shippingSnapshot.phoneE164) ||
      toNonEmptyStringOrNull(order.customer?.phoneE164) ||
      toNonEmptyStringOrNull(order.customer?.phone) ||
      null;
    const recipientAddressLine1 =
      toNonEmptyStringOrNull(shippingSnapshot.address1) ||
      toNonEmptyStringOrNull(order.customer?.address) ||
      toNonEmptyStringOrNull(order.shippingAddress) ||
      t("backend.index.address_indisponible");
    const recipientAddressLine2 = toNonEmptyStringOrNull(shippingSnapshot.address2) || '';
    const recipientPostalCode =
      toNonEmptyStringOrNull(shippingSnapshot.postalCode) ||
      toNonEmptyStringOrNull(order.customer?.postalCode) ||
      '00000';
    const recipientCity =
      toNonEmptyStringOrNull(shippingSnapshot.city) ||
      toNonEmptyStringOrNull(order.customer?.city) ||
      'Ville';
    const recipientCountryCode =
      toNonEmptyStringOrNull(shippingSnapshot.countryCode) ||
      toNonEmptyStringOrNull(order.customer?.country) ||
      'FR';
    const shipperContactEmail =
      toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_EMAIL) || 'contact@myowntea.com';
    const shipperContactPhone =
      toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_PHONE) || '+33000000000';
    const shipperCompany =
      toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_COMPANY) || 'My Own Tea';
    const shipperAddressLine1 =
      toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_ADDRESS1) || '31 rue Lacordaire';
    const shipperAddressLine2 = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_ADDRESS2) || '';
    const shipperPostalCode =
      toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_POSTAL_CODE) || '59150';
    const shipperCity = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_CITY) || 'Wattrelos';
    const shipperCountryCode =
      toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_COUNTRY) || 'FR';
    const guessDialCode = (countryCode) => {
      const normalized = String(countryCode || 'FR').toUpperCase();
      if (normalized === 'FR') return '33';
      if (normalized === 'BE') return '32';
      if (normalized === 'LU') return '352';
      if (normalized === 'CH') return '41';
      return '33';
    };
    const toBoxtalPhone = (value, countryCode) => {
      const normalizedInput = String(value || '').trim();
      if (/^\+[1-9]\d{6,14}$/.test(normalizedInput)) {
        return normalizedInput;
      }
      const digits = String(value || '').replace(/\D+/g, '');
      if (!digits) {
        return null;
      }
      const dial = guessDialCode(countryCode);
      let number = digits;
      if (number.startsWith(dial)) {
        number = number.slice(dial.length);
      }
      if (number.startsWith('0')) {
        number = number.slice(1);
      }
      if (!number) {
        return null;
      }
      return `+${dial}${number}`;
    };
    const relayPointId = toNonEmptyStringOrNull(order.relayPointId);
    const orderTotalValue = Math.max(0.01, Number((Math.max(0, order.totalCents || 0) / 100).toFixed(2)));
    const shipperPhone = toBoxtalPhone(shipperContactPhone, shipperCountryCode);
    const recipientPhonePayload = toBoxtalPhone(recipientPhone, recipientCountryCode);
    const shipperFirstName =
      toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_CONTACT_FIRST_NAME) || 'My';
    const shipperLastName =
      toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_CONTACT_LAST_NAME) || 'Own Tea';
    const parcelWeightKg = Math.max(0.01, Number(process.env.BOXTAL_PARCEL_WEIGHT_KG || 0.5));
    const parcelLengthCm = Math.max(1, Number(process.env.BOXTAL_PARCEL_LENGTH_CM || 20));
    const parcelWidthCm = Math.max(1, Number(process.env.BOXTAL_PARCEL_WIDTH_CM || 20));
    const parcelHeightCm = Math.max(1, Number(process.env.BOXTAL_PARCEL_HEIGHT_CM || 10));
    const parcelDescription =
      process.env.BOXTAL_PARCEL_CONTENT_LABEL || `Commande ${order.orderNumber}`;
    const parcelValueCurrency = String(
      process.env.BOXTAL_PARCEL_VALUE_CURRENCY || 'EUR'
    ).toUpperCase();
    const buildBoxtalLocation = (params) => ({
      street: params.street,
      city: params.city,
      postalCode: params.postalCode,
      postCode: params.postalCode,
      countryIsoCode: String(params.countryCode || 'FR').toUpperCase(),
    });
    const shipmentFromAddress = {
      type: 'BUSINESS',
      contact: {
        firstName: shipperFirstName,
        lastName: shipperLastName,
        company: shipperCompany,
        email: shipperContactEmail,
        ...(shipperPhone ? { phone: shipperPhone } : {}),
      },
      location: buildBoxtalLocation({
        street: [shipperAddressLine1, shipperAddressLine2].filter(Boolean).join(', '),
        postalCode: shipperPostalCode,
        city: shipperCity,
        countryCode: shipperCountryCode,
      }),
    };
    const shipmentToAddress = {
      type: 'RESIDENTIAL',
      contact: {
        firstName: recipientFirstName,
        lastName: recipientLastName || 'Client',
        ...(recipientEmail ? { email: recipientEmail } : {}),
        ...(recipientPhonePayload ? { phone: recipientPhonePayload } : {}),
      },
      location: buildBoxtalLocation({
        street: [recipientAddressLine1, recipientAddressLine2].filter(Boolean).join(', '),
        postalCode: recipientPostalCode,
        city: recipientCity,
        countryCode: recipientCountryCode,
      }),
    };
    const shipmentPackages = [
      {
        type: 'PARCEL',
        value: {
          value: orderTotalValue,
          currencyIsoCode: parcelValueCurrency,
        },
        weight: parcelWeightKg,
        length: parcelLengthCm,
        width: parcelWidthCm,
        height: parcelHeightCm,
        description: parcelDescription,
      },
    ];
    const shippingPayload = {
      ...(offerId ? { shippingOfferId: offerId } : {}),
      ...(!offerId && offerCode ? { shippingOfferCode: offerCode } : {}),
      shipment: {
        externalId: order.orderNumber,
        fromAddress: shipmentFromAddress,
        toAddress: shipmentToAddress,
        returnAddress: shipmentFromAddress,
        packages: shipmentPackages,
        ...(relayPointId ? { pickupPointCode: relayPointId } : {}),
      },
    };
    try {
      const response = await createShippingOrder(shippingPayload);
      const responseContent =
        response && typeof response.content === 'object' ? response.content : null;
      const boxtalOrderId =
        toNonEmptyStringOrNull(responseContent?.id) ||
        toNonEmptyStringOrNull(response.shippingOrder?.id) ||
        toNonEmptyStringOrNull(response.shipment?.id) ||
        toNonEmptyStringOrNull(response.id) ||
        toNonEmptyStringOrNull(response.reference) ||
        toNonEmptyStringOrNull(response.orderId) ||
        null;
      const trackingNumber =
        toNonEmptyStringOrNull(responseContent?.trackingNumber) ||
        toNonEmptyStringOrNull(response.shippingOrder?.trackingNumber) ||
        toNonEmptyStringOrNull(response.shipment?.trackingNumber) ||
        toNonEmptyStringOrNull(response.trackingNumber) ||
        null;
      const providerStatus =
        toNonEmptyStringOrNull(responseContent?.status) ||
        toNonEmptyStringOrNull(response.shippingOrder?.status) ||
        toNonEmptyStringOrNull(response.shipment?.status) ||
        toNonEmptyStringOrNull(response.status) ||
        null;
      const shipment = await prisma.shipment.create({
        data: {
          orderId: order.id,
          provider: 'BOXTAL',
          providerOrderId: boxtalOrderId,
          offerId,
          offerCode,
          offerLabel: toNonEmptyStringOrNull(order.shippingOfferLabel),
          status: providerStatus,
          statusInternal: mapBoxtalStatus(providerStatus),
          trackingNumber,
          relayPointId: toNonEmptyStringOrNull(order.relayPointId),
          relayNetwork: toNonEmptyStringOrNull(order.relayNetwork),
          payload: shippingPayload,
          response,
        },
      });
      await prisma.order.update({
        where: { id: order.id },
        data: {
          shippingProvider: 'BOXTAL',
          trackingNumber: trackingNumber || undefined,
        },
      });
      return shipment;
    } catch (error) {
      if (error?.code === 'P2002') {
        return prisma.shipment.findUnique({ where: { orderId: order.id } });
      }
      console.error(
        `[shipping] failed to create Boxtal shipment for ${order.orderNumber} (${source}):`,
        error
      );
      if (throwOnError) {
        throw error;
      }
      return null;
    }
  };

  const finalizePaidOrder = async (orderId, source = 'payment_webhook') => {
    if (!orderId) {
      return null;
    }
    const order = await getOrderForWorkflow(orderId);
    if (!order) {
      return null;
    }
    if (order.paymentStatus !== 'completed') {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'completed' },
      });
    }
    const refreshed = await getOrderForWorkflow(order.id);
    if (!refreshed) {
      return null;
    }
    const status = toStatusOrNull(refreshed.status);
    if (status === 'PENDING') {
      await transitionOrderStatus({
        orderId: refreshed.id,
        toStatus: 'CONFIRMED',
        reason: t("backend.index.payment_valid_automatiquement"),
        actorType: 'system',
        actorId: source,
      });
    }
    await ensureBoxtalShipmentForOrder(refreshed.id, source);
    const finalized = await getOrderForWorkflow(refreshed.id);
    if (!finalized) {
      return null;
    }
    return {
      ...finalized,
      availableTransitions: computeAvailableOrderTransitions(finalized),
    };
  };

  const applyShipmentProgressToOrder = async (params) => {
    let order = await getOrderForWorkflow(params.orderId);
    if (!order) {
      return { transitionedTo: [] };
    }
    const normalizedTrackingNumber = toNonEmptyStringOrNull(params.trackingNumber);
    const normalizedTrackingUrl =
      params.trackingUrl === undefined ? undefined : toNonEmptyStringOrNull(params.trackingUrl);
    const normalizedProvider = toNonEmptyStringOrNull(params.shippingProvider);
    const shippingPatch = {};
    if (normalizedTrackingNumber && normalizedTrackingNumber !== order.trackingNumber) {
      shippingPatch.trackingNumber = normalizedTrackingNumber;
    }
    if (normalizedTrackingUrl !== undefined && normalizedTrackingUrl !== order.trackingUrl) {
      shippingPatch.trackingUrl = normalizedTrackingUrl;
    }
    if (normalizedProvider && normalizedProvider !== order.shippingProvider) {
      shippingPatch.shippingProvider = normalizedProvider;
    }
    if (Object.keys(shippingPatch).length > 0) {
      await prisma.order.update({
        where: { id: order.id },
        data: shippingPatch,
      });
      const refreshedOrder = await getOrderForWorkflow(order.id);
      if (!refreshedOrder) {
        return { transitionedTo: [] };
      }
      order = refreshedOrder;
    }
    const actorType = params.actorType || 'system';
    const actorId = params.actorId || null;
    const mappedStatus = String(params.mappedStatus || 'UNKNOWN').toUpperCase();
    const transitionedTo = [];
    const effectiveTrackingNumber =
      normalizedTrackingNumber ||
      toNonEmptyStringOrNull(order.trackingNumber) ||
      toNonEmptyStringOrNull(order.shipment?.trackingNumber);
    const effectiveTrackingUrl =
      normalizedTrackingUrl === undefined
        ? toNonEmptyStringOrNull(order.trackingUrl)
        : normalizedTrackingUrl;
    const effectiveProvider =
      normalizedProvider ||
      toNonEmptyStringOrNull(order.shippingProvider) ||
      toNonEmptyStringOrNull(order.shipment?.provider);
    const tryTransition = async (target, reason) => {
      if (!order) {
        return false;
      }
      const availableTransitions = computeAvailableOrderTransitions(order);
      if (!availableTransitions.includes(target)) {
        return false;
      }
      await transitionOrderStatus({
        orderId: order.id,
        toStatus: target,
        reason,
        actorType,
        actorId,
        ...(effectiveTrackingNumber ? { trackingNumber: effectiveTrackingNumber } : {}),
        ...(effectiveTrackingUrl ? { trackingUrl: effectiveTrackingUrl } : {}),
        ...(effectiveProvider ? { shippingProvider: effectiveProvider } : {}),
      });
      const refreshedOrder = await getOrderForWorkflow(order.id);
      if (refreshedOrder) {
        order = refreshedOrder;
      }
      transitionedTo.push(target);
      return true;
    };
    if (mappedStatus === 'IN_TRANSIT' || mappedStatus === 'DELIVERED') {
      if (toStatusOrNull(order.status) === 'CONFIRMED') {
        await tryTransition(
          'PROCESSING',
          params.reason || 'Passage automatique en preparation suite au tracking transporteur'
        );
      }
      if (toStatusOrNull(order.status) === 'PROCESSING') {
        await tryTransition(
          'SHIPPED',
          params.reason || 'Passage automatique en expedition suite au tracking transporteur'
        );
      }
    }
    if (mappedStatus === 'DELIVERED' && toStatusOrNull(order.status) === 'SHIPPED') {
      await tryTransition(
        'DELIVERED',
        params.reason || 'Passage automatique en livre suite au tracking transporteur'
      );
    }
    if (
      mappedStatus === 'CANCELLED' &&
      (toStatusOrNull(order.status) === 'PENDING' ||
        toStatusOrNull(order.status) === 'CONFIRMED' ||
        toStatusOrNull(order.status) === 'PROCESSING')
    ) {
      await tryTransition(
        'CANCELLED',
        params.reason || t("backend.index.order_canceled_automatiquement")
      );
    }
    return { transitionedTo };
  };

  const syncShipmentTrackingFromPayload = async (params) => {
    const shipment = await prisma.shipment.findUnique({ where: { id: params.shipmentId } });
    if (!shipment) {
      throw new OrderWorkflowError('SHIPMENT_NOT_FOUND', t("backend.index.shipment_not_found"));
    }
    const normalizedProviderStatus = toNonEmptyStringOrNull(params.providerStatus);
    const normalizedTrackingNumber = toNonEmptyStringOrNull(params.trackingNumber);
    const normalizedLabelUrl = toNonEmptyStringOrNull(params.labelUrl);
    const mappedStatus = mapBoxtalStatus(normalizedProviderStatus || shipment.status);
    const shipmentData = {
      status: normalizedProviderStatus || shipment.status,
      statusInternal: mappedStatus,
      trackingNumber: normalizedTrackingNumber || shipment.trackingNumber,
      labelUrl: normalizedLabelUrl || shipment.labelUrl,
    };
    if (params.response !== undefined) {
      shipmentData.response = params.response;
    }
    const updatedShipment = await prisma.shipment.update({
      where: { id: shipment.id },
      data: shipmentData,
    });
    const orderSync = await applyShipmentProgressToOrder({
      orderId: shipment.orderId,
      mappedStatus,
      trackingNumber: normalizedTrackingNumber || updatedShipment.trackingNumber || null,
      trackingUrl: params.trackingUrl || null,
      shippingProvider: shipment.provider || 'BOXTAL',
      actorType: params.actorType || 'system',
      actorId: params.actorId || null,
      reason: params.reason || null,
    });
    return { shipment: updatedShipment, mappedStatus, orderSync };
  };

  return {
    computeAvailableOrderTransitions,
    ensureBoxtalShipmentForOrder,
    finalizePaidOrder,
    getOrderForWorkflow,
    hasRecentNotification,
    listOrderStatusHistory,
    logOrderNotification,
    syncShipmentTrackingFromPayload,
    transitionOrderStatus,
  };
}
