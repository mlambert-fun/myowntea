// @ts-nocheck
export function createSubscriptionService({
  BLEND_FORMAT_LABELS,
  BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
  BLEND_SUBSCRIPTION_KIND,
  DEFAULT_BLEND_FORMAT,
  buildBlendSubscriptionTitle,
  buildWishlistCreationSnapshot,
  checkoutAddressToString,
  finalizePaidOrder,
  getBlendSubscriptionSetupFromSnapshot,
  normalizeBlendFormat,
  normalizeBlendSubscriptionIntervalCount,
  prisma,
  resolveOrderShippingSelection,
  stripe,
  t,
}) {
  const serializeSubscriptionShippingSelectionSnapshot = (selection) => {
    const resolved = resolveOrderShippingSelection(selection);
    return {
      mode: resolved.mode,
      offerId: resolved.offerId || null,
      offerCode: resolved.offerCode || null,
      offerLabel: resolved.offerLabel || null,
      countryCode: resolved.countryCode || null,
      postalCode: resolved.postalCode || null,
      city: resolved.city || null,
      relayPoint: resolved.relayPoint
        ? {
            id: resolved.relayPoint.id || null,
            name: resolved.relayPoint.name || null,
            network: resolved.relayPoint.network || null,
            postalCode: resolved.relayPoint.postalCode || null,
            city: resolved.relayPoint.city || null,
            countryCode: resolved.relayPoint.countryCode || null,
            latitude:
              typeof resolved.relayPoint.latitude === 'number' ? resolved.relayPoint.latitude : null,
            longitude:
              typeof resolved.relayPoint.longitude === 'number' ? resolved.relayPoint.longitude : null,
          }
        : null,
    };
  };

  const addressRecordToCheckoutAddress = (address) => {
    if (!address) {
      return null;
    }
    return {
      salutation: address.salutation || null,
      firstName: address.firstName,
      lastName: address.lastName,
      countryCode: address.countryCode,
      postalCode: address.postalCode,
      city: address.city,
      address1: address.address1,
      address2: address.address2 || null,
      phoneE164: address.phoneE164,
    };
  };

  const buildBlendSubscriptionSnapshot = async (params) => {
    if (params.sourceType === 'LISTING') {
      const listing = await prisma.blendListing.findUnique({
        where: { id: params.listingId },
        include: {
          blend: {
            include: {
              ingredients: {
                include: {
                  ingredient: {
                    select: {
                      id: true,
                      name: true,
                      color: true,
                      category: true,
                      price: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!listing || !listing.isActive) {
        throw new Error('BLEND_LISTING_NOT_FOUND');
      }
      const ingredientIds = (listing.blend?.ingredients || [])
        .map((entry) => entry.ingredientId || entry.ingredient?.id)
        .filter(Boolean);
      if (ingredientIds.length === 0) {
        throw new Error('BLEND_LISTING_EMPTY');
      }
      const snapshot = await buildWishlistCreationSnapshot({
        name: buildBlendSubscriptionTitle(listing.title, 'My Own Tea Signature'),
        ingredientIds,
        blendFormat: params.blendFormat,
      });
      return {
        ...snapshot,
        sourceType: 'LISTING',
        listingId: listing.id,
        listingSlug: listing.slug,
        title: buildBlendSubscriptionTitle(listing.title, snapshot.title),
      };
    }

    const title = buildBlendSubscriptionTitle(params.title, 'Mon rituel signature');
    const snapshot = await buildWishlistCreationSnapshot({
      name: title,
      ingredientIds: params.ingredientIds,
      blendFormat: params.blendFormat,
    });
    return {
      ...snapshot,
      sourceType: 'CUSTOM',
      title,
    };
  };

  const getDefaultBlendSubscriptionAddresses = async (customerId) => {
    const [shippingAddress, billingAddress] = await Promise.all([
      prisma.address.findFirst({
        where: { customerId, isDefaultShipping: true },
        orderBy: [{ createdAt: 'desc' }],
      }),
      prisma.address.findFirst({
        where: { customerId, isDefaultBilling: true },
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);
    return {
      shippingAddress,
      billingAddress: billingAddress || shippingAddress || null,
    };
  };

  const ensureStripeCustomerForCustomer = async (customer) => {
    if (!stripe) {
      throw new Error('STRIPE_NOT_CONFIGURED');
    }
    if (customer.stripeCustomerId) {
      return customer.stripeCustomerId;
    }
    const createdStripeCustomer = await stripe.customers.create({
      email: customer.email || undefined,
      name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || undefined,
      phone: customer.phoneE164 || customer.phone || undefined,
      metadata: {
        customerId: customer.id,
      },
    });
    await prisma.customer.update({
      where: { id: customer.id },
      data: { stripeCustomerId: createdStripeCustomer.id },
    });
    customer.stripeCustomerId = createdStripeCustomer.id;
    return createdStripeCustomer.id;
  };

  const toStripeCardPaymentMethodSummary = (paymentMethod) => {
    if (!paymentMethod || paymentMethod.type !== 'card' || !paymentMethod.card) {
      return null;
    }
    return {
      id: paymentMethod.id,
      brand: paymentMethod.card.brand || 'card',
      last4: paymentMethod.card.last4 || '0000',
      expMonth: paymentMethod.card.exp_month || null,
      expYear: paymentMethod.card.exp_year || null,
    };
  };

  const getStripeCustomerDefaultPaymentMethodSummary = async (customer) => {
    if (!stripe) {
      return null;
    }
    const stripeCustomerId = await ensureStripeCustomerForCustomer(customer);
    const stripeCustomer = await stripe.customers.retrieve(stripeCustomerId);
    if (!stripeCustomer || stripeCustomer.deleted) {
      return null;
    }
    let paymentMethodId =
      typeof stripeCustomer.invoice_settings?.default_payment_method === 'string'
        ? stripeCustomer.invoice_settings.default_payment_method
        : typeof stripeCustomer.invoice_settings?.default_payment_method?.id === 'string'
          ? stripeCustomer.invoice_settings.default_payment_method.id
          : null;
    if (!paymentMethodId) {
      const activeSubscription = await prisma.subscription.findFirst({
        where: {
          customerId: customer.id,
          stripeSubscriptionId: { not: null },
          status: { notIn: ['canceled', 'incomplete_expired'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (activeSubscription?.stripeSubscriptionId) {
        const stripeSubscription = await stripe.subscriptions.retrieve(
          activeSubscription.stripeSubscriptionId
        );
        paymentMethodId =
          typeof stripeSubscription.default_payment_method === 'string'
            ? stripeSubscription.default_payment_method
            : typeof stripeSubscription.default_payment_method?.id === 'string'
              ? stripeSubscription.default_payment_method.id
              : null;
      }
    }
    if (!paymentMethodId) {
      return null;
    }
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    return toStripeCardPaymentMethodSummary(paymentMethod);
  };

  const isSubscriptionOrderSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== 'object') {
      return false;
    }
    const purchaseMode =
      typeof snapshot.purchaseMode === 'string' ? snapshot.purchaseMode.trim().toUpperCase() : '';
    if (purchaseMode === 'SUBSCRIPTION') {
      return true;
    }
    if (snapshot.subscriptionSetup && typeof snapshot.subscriptionSetup === 'object') {
      return true;
    }
    return Boolean(snapshot.subscription && typeof snapshot.subscription === 'object');
  };

  const isSubscriptionOrderItem = (item) => {
    if (!item) {
      return false;
    }
    if (item.itemType === 'SUBSCRIPTION') {
      return true;
    }
    return isSubscriptionOrderSnapshot(item.snapshot);
  };

  const resolveSubscriptionInvoiceTitleFromOrder = (order) => {
    if (!Array.isArray(order?.items)) {
      return null;
    }
    const subscriptionItem = order.items.find((item) => isSubscriptionOrderItem(item));
    const snapshot =
      subscriptionItem?.snapshot && typeof subscriptionItem.snapshot === 'object'
        ? subscriptionItem.snapshot
        : null;
    const candidates = [snapshot?.title, snapshot?.name, snapshot?.productTitle];
    const resolved = candidates.find(
      (value) => typeof value === 'string' && value.trim().length > 0
    );
    return resolved ? resolved.trim() : null;
  };

  const buildAccountOrderInvoiceNumber = (orderNumber, fallbackId) => {
    const base =
      typeof orderNumber === 'string' && orderNumber.trim().length > 0
        ? orderNumber.trim()
        : typeof fallbackId === 'string' && fallbackId.trim().length > 0
          ? fallbackId.trim()
          : '';
    if (!base) {
      return 'FAC-UNKNOWN';
    }
    return `FAC-${base.replace(/^(ORD|SUB)-/, '')}`;
  };

  const listInternalSubscriptionInvoicesForCustomer = async (customer) => {
    const orders = await prisma.order.findMany({
      where: {
        customerId: customer.id,
        paymentStatus: { in: ['completed', 'paid'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        orderNumber: true,
        totalCents: true,
        createdAt: true,
        stripeInvoiceId: true,
        items: {
          select: {
            itemType: true,
            snapshot: true,
          },
        },
      },
    });

    return orders
      .filter(
        (order) =>
          Array.isArray(order.items) && order.items.some((item) => isSubscriptionOrderItem(item))
      )
      .map((order) => ({
        id: `order_${order.id}`,
        linkedStripeInvoiceId:
          typeof order.stripeInvoiceId === 'string' && order.stripeInvoiceId.trim().length > 0
            ? order.stripeInvoiceId.trim()
            : null,
        number: buildAccountOrderInvoiceNumber(order.orderNumber, order.id),
        status: 'paid',
        currency: 'EUR',
        totalCents: Math.max(0, Math.round(Number(order.totalCents) || 0)),
        amountPaidCents: Math.max(0, Math.round(Number(order.totalCents) || 0)),
        hostedInvoiceUrl: null,
        invoicePdf: null,
        invoiceUrl: `/account/order/${order.id}/invoice`,
        createdAt:
          order.createdAt instanceof Date
            ? order.createdAt.toISOString()
            : new Date(order.createdAt || Date.now()).toISOString(),
        subscriptionTitle: resolveSubscriptionInvoiceTitleFromOrder(order),
      }));
  };

  const listStripeInvoicesForCustomer = async (customer) => {
    if (!stripe) {
      return [];
    }
    const stripeCustomerId = await ensureStripeCustomerForCustomer(customer);
    const [subscriptions, internalInvoices, invoices] = await Promise.all([
      prisma.subscription.findMany({
        where: { customerId: customer.id },
        select: { stripeSubscriptionId: true, title: true },
      }),
      listInternalSubscriptionInvoicesForCustomer(customer),
      stripe.invoices.list({
        customer: stripeCustomerId,
        limit: 24,
      }),
    ]);

    const subscriptionTitleByStripeId = new Map(
      subscriptions
        .filter((entry) => typeof entry.stripeSubscriptionId === 'string' && entry.stripeSubscriptionId)
        .map((entry) => [entry.stripeSubscriptionId, entry.title || null])
    );
    const stripeInvoiceById = new Map(
      invoices.data
        .filter((invoice) => typeof invoice?.id === 'string' && invoice.id)
        .map((invoice) => [invoice.id, invoice])
    );
    const internalStripeInvoiceIds = new Set(
      internalInvoices.map((invoice) => invoice.linkedStripeInvoiceId).filter(Boolean)
    );

    const mergedInternalInvoices = internalInvoices.map((invoice) => {
      const stripeInvoice = invoice.linkedStripeInvoiceId
        ? stripeInvoiceById.get(invoice.linkedStripeInvoiceId)
        : null;
      const stripeSubscriptionId =
        typeof stripeInvoice?.subscription === 'string'
          ? stripeInvoice.subscription
          : typeof stripeInvoice?.subscription?.id === 'string'
            ? stripeInvoice.subscription.id
            : null;
      const lineDescription =
        Array.isArray(stripeInvoice?.lines?.data) && stripeInvoice.lines.data.length > 0
          ? stripeInvoice.lines.data[0]?.description || null
          : null;
      return {
        id: stripeInvoice?.id || invoice.id,
        number: stripeInvoice?.number || invoice.number,
        status: stripeInvoice?.status || invoice.status,
        currency: String(stripeInvoice?.currency || invoice.currency || 'eur').toUpperCase(),
        totalCents: invoice.totalCents,
        amountPaidCents: invoice.amountPaidCents,
        hostedInvoiceUrl: stripeInvoice?.hosted_invoice_url || null,
        invoicePdf: stripeInvoice?.invoice_pdf || null,
        invoiceUrl: invoice.invoiceUrl || null,
        createdAt: invoice.createdAt,
        subscriptionTitle:
          invoice.subscriptionTitle ||
          (stripeSubscriptionId && subscriptionTitleByStripeId.get(stripeSubscriptionId)) ||
          lineDescription ||
          null,
      };
    });

    const stripeOnlyInvoices = invoices.data
      .filter((invoice) => {
        if (internalStripeInvoiceIds.has(invoice.id)) {
          return false;
        }
        const totalCents = Math.max(0, Math.round(Number(invoice.total) || 0));
        const amountPaidCents = Math.max(0, Math.round(Number(invoice.amount_paid) || 0));
        if (invoice.billing_reason === 'subscription_create' && totalCents === 0 && amountPaidCents === 0) {
          return false;
        }
        return true;
      })
      .map((invoice) => {
        const stripeSubscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : typeof invoice.subscription?.id === 'string'
              ? invoice.subscription.id
              : null;
        const lineDescription =
          Array.isArray(invoice.lines?.data) && invoice.lines.data.length > 0
            ? invoice.lines.data[0]?.description || null
            : null;
        return {
          id: invoice.id,
          number: invoice.number || invoice.id,
          status: invoice.status || 'open',
          currency: String(invoice.currency || 'eur').toUpperCase(),
          totalCents: Math.max(0, Math.round(Number(invoice.total) || 0)),
          amountPaidCents: Math.max(0, Math.round(Number(invoice.amount_paid) || 0)),
          hostedInvoiceUrl: invoice.hosted_invoice_url || null,
          invoicePdf: invoice.invoice_pdf || null,
          invoiceUrl: null,
          createdAt: invoice.created
            ? new Date(invoice.created * 1000).toISOString()
            : new Date().toISOString(),
          subscriptionTitle:
            (stripeSubscriptionId && subscriptionTitleByStripeId.get(stripeSubscriptionId)) ||
            lineDescription ||
            null,
        };
      });

    return [...mergedInternalInvoices, ...stripeOnlyInvoices].sort((left, right) => {
      const rightDate = Date.parse(right.createdAt || '');
      const leftDate = Date.parse(left.createdAt || '');
      return (Number.isFinite(rightDate) ? rightDate : 0) - (Number.isFinite(leftDate) ? leftDate : 0);
    });
  };

  const serializeBlendSubscriptionMetadata = (params) => ({
    subscriptionKind: BLEND_SUBSCRIPTION_KIND,
    customerId: params.customerId,
    sourceType: params.sourceType,
    listingId: params.listingId || '',
    title: params.title,
    ingredientIds: Array.isArray(params.ingredientIds) ? params.ingredientIds.join(',') : '',
    blendFormat: params.blendFormat,
    intervalCount: String(params.intervalCount),
    basePriceCents: String(params.basePriceCents),
    unitPriceCents: String(params.unitPriceCents),
    shippingCents: String(params.shippingCents),
    discountPercent: String(params.discountPercent),
  });

  const parseBlendSubscriptionMetadata = (metadata) => {
    const sourceType = metadata?.sourceType === 'LISTING' ? 'LISTING' : 'CUSTOM';
    const ingredientIds =
      typeof metadata?.ingredientIds === 'string'
        ? metadata.ingredientIds
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];
    return {
      customerId: typeof metadata?.customerId === 'string' ? metadata.customerId.trim() : '',
      sourceType,
      listingId:
        typeof metadata?.listingId === 'string' && metadata.listingId.trim().length > 0
          ? metadata.listingId.trim()
          : null,
      title: buildBlendSubscriptionTitle(typeof metadata?.title === 'string' ? metadata.title : ''),
      ingredientIds,
      blendFormat: normalizeBlendFormat(metadata?.blendFormat || DEFAULT_BLEND_FORMAT),
      intervalCount: normalizeBlendSubscriptionIntervalCount(metadata?.intervalCount),
      basePriceCents: Math.max(0, Math.round(Number(metadata?.basePriceCents) || 0)),
      unitPriceCents: Math.max(0, Math.round(Number(metadata?.unitPriceCents) || 0)),
      shippingCents: Math.max(0, Math.round(Number(metadata?.shippingCents) || 0)),
      discountPercent: Math.max(0, Math.round(Number(metadata?.discountPercent) || 0)),
    };
  };

  const buildBlendSubscriptionStripeLineItems = (params) => {
    const lineItems = [
      {
        price_data: {
          currency: 'eur',
          unit_amount: params.unitPriceCents,
          recurring: {
            interval: 'month',
            interval_count: params.intervalCount,
          },
          product_data: {
            name: params.title,
            description: `${BLEND_FORMAT_LABELS[params.blendFormat]} · -${params.discountPercent}% abonnement`,
          },
        },
        quantity: 1,
      },
    ];
    if (params.shippingCents > 0) {
      lineItems.push({
        price_data: {
          currency: 'eur',
          unit_amount: params.shippingCents,
          recurring: {
            interval: 'month',
            interval_count: params.intervalCount,
          },
          product_data: {
            name: t("backend.index.subscription_shipping_line"),
            description: t("backend.index.subscription_shipping_line_description"),
          },
        },
        quantity: 1,
      });
    }
    return lineItems;
  };

  const buildBlendSubscriptionStripeSubscriptionItems = async (params) => {
    if (!stripe) {
      return [];
    }
    const subscriptionProduct = await stripe.products.create(
      {
        name: params.title,
        description: `${BLEND_FORMAT_LABELS[params.blendFormat]} · -${params.discountPercent}% abonnement`,
      },
      {
        idempotencyKey: `${params.idempotencyKeyPrefix}-blend-product`,
      }
    );
    const lineItems = [
      {
        price_data: {
          currency: 'eur',
          unit_amount: params.unitPriceCents,
          recurring: {
            interval: 'month',
            interval_count: params.intervalCount,
          },
          product: subscriptionProduct.id,
        },
        quantity: 1,
      },
    ];
    if (params.shippingCents > 0) {
      const shippingProduct = await stripe.products.create(
        {
          name: t("backend.index.subscription_shipping_line"),
          description: t("backend.index.subscription_shipping_line_description"),
        },
        {
          idempotencyKey: `${params.idempotencyKeyPrefix}-shipping-product`,
        }
      );
      lineItems.push({
        price_data: {
          currency: 'eur',
          unit_amount: params.shippingCents,
          recurring: {
            interval: 'month',
            interval_count: params.intervalCount,
          },
          product: shippingProduct.id,
        },
        quantity: 1,
      });
    }
    return lineItems;
  };

  const stripeTimestampToDate = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return null;
    }
    return new Date(value * 1000);
  };

  const upsertBlendSubscriptionRecord = async ({ customer, stripeSubscription, metadata, snapshot }) =>
    prisma.subscription.upsert({
      where: { stripeSubscriptionId: stripeSubscription.id },
      update: {
        kind: BLEND_SUBSCRIPTION_KIND,
        title: metadata.title,
        status: stripeSubscription.status || 'active',
        stripePriceId:
          typeof stripeSubscription?.items?.data?.[0]?.price?.id === 'string'
            ? stripeSubscription.items.data[0].price.id
            : null,
        currency: 'EUR',
        interval: 'month',
        intervalCount: metadata.intervalCount,
        unitPriceCents: metadata.unitPriceCents,
        shippingCents: metadata.shippingCents,
        discountPercent: metadata.discountPercent || BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
        blendListingId: metadata.listingId,
        blendFormat: metadata.blendFormat,
        currentPeriodEnd: stripeTimestampToDate(stripeSubscription.current_period_end),
        cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
        cancelledAt: stripeTimestampToDate(stripeSubscription.canceled_at),
        snapshot,
      },
      create: {
        customerId: customer.id,
        kind: BLEND_SUBSCRIPTION_KIND,
        title: metadata.title,
        status: stripeSubscription.status || 'active',
        stripeSubscriptionId: stripeSubscription.id,
        stripePriceId:
          typeof stripeSubscription?.items?.data?.[0]?.price?.id === 'string'
            ? stripeSubscription.items.data[0].price.id
            : null,
        currency: 'EUR',
        interval: 'month',
        intervalCount: metadata.intervalCount,
        unitPriceCents: metadata.unitPriceCents,
        shippingCents: metadata.shippingCents,
        discountPercent: metadata.discountPercent || BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
        blendListingId: metadata.listingId,
        blendFormat: metadata.blendFormat,
        currentPeriodEnd: stripeTimestampToDate(stripeSubscription.current_period_end),
        cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
        cancelledAt: stripeTimestampToDate(stripeSubscription.canceled_at),
        snapshot,
      },
    });

  const computeBlendSubscriptionTrialEndTimestamp = (intervalCount) => {
    const nextBillingDate = new Date();
    nextBillingDate.setMonth(
      nextBillingDate.getMonth() + normalizeBlendSubscriptionIntervalCount(intervalCount)
    );
    return Math.floor(nextBillingDate.getTime() / 1000);
  };

  const extractPendingBlendSubscriptionSetupsFromOrder = (order) => {
    if (!Array.isArray(order?.items)) {
      return [];
    }
    return order.items
      .map((item) => {
        if (!item?.snapshot || typeof item.snapshot !== 'object') {
          return null;
        }
        const snapshot = item.snapshot;
        const setup = getBlendSubscriptionSetupFromSnapshot(snapshot);
        if (!setup) {
          return null;
        }
        if (snapshot.subscription?.stripeSubscriptionId) {
          return {
            itemId: item.id,
            snapshot,
            setup,
            stripeSubscriptionId: snapshot.subscription.stripeSubscriptionId,
            alreadyCreated: true,
          };
        }
        return {
          itemId: item.id,
          snapshot,
          setup,
          alreadyCreated: false,
        };
      })
      .filter(Boolean);
  };

  const ensureBlendSubscriptionsFromPaidOrder = async ({ order, paymentIntent }) => {
    if (!stripe || !order?.customerId) {
      return [];
    }
    const extractedItems = extractPendingBlendSubscriptionSetupsFromOrder(order);
    if (extractedItems.length === 0) {
      return [];
    }

    const customer =
      order.customer || (await prisma.customer.findUnique({ where: { id: order.customerId } }));
    if (!customer) {
      throw new Error('BLEND_SUBSCRIPTION_CUSTOMER_NOT_FOUND');
    }

    const stripeCustomerId = await ensureStripeCustomerForCustomer(customer);
    const paymentMethodId =
      typeof paymentIntent?.payment_method === 'string'
        ? paymentIntent.payment_method
        : typeof paymentIntent?.payment_method?.id === 'string'
          ? paymentIntent.payment_method.id
          : null;
    if (!paymentMethodId) {
      throw new Error('BLEND_SUBSCRIPTION_PAYMENT_METHOD_REQUIRED');
    }

    try {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!message.toLowerCase().includes('already attached')) {
        throw error;
      }
    }

    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    const subscriptionIds = [];
    const shippingSelectionSnapshot = serializeSubscriptionShippingSelectionSnapshot(
      order.shippingMeta || null
    );
    for (const extracted of extractedItems) {
      if (extracted.alreadyCreated && extracted.stripeSubscriptionId) {
        subscriptionIds.push(extracted.stripeSubscriptionId);
        continue;
      }

      const metadata = serializeBlendSubscriptionMetadata({
        customerId: customer.id,
        sourceType: extracted.setup.sourceType === 'LISTING' ? 'LISTING' : 'CUSTOM',
        listingId: extracted.setup.listingId || null,
        title: extracted.setup.title,
        ingredientIds: Array.isArray(extracted.snapshot.ingredientIds)
          ? extracted.snapshot.ingredientIds
          : [],
        blendFormat: normalizeBlendFormat(
          extracted.setup.blendFormat || extracted.snapshot.blendFormat || DEFAULT_BLEND_FORMAT
        ),
        intervalCount: normalizeBlendSubscriptionIntervalCount(extracted.setup.intervalCount),
        basePriceCents: Math.max(
          0,
          Math.round(
            Number(
              extracted.setup.basePriceCents ||
                extracted.snapshot.basePriceCents ||
                extracted.snapshot.priceCents
            ) || 0
          )
        ),
        unitPriceCents: Math.max(
          0,
          Math.round(Number(extracted.setup.unitPriceCents || extracted.snapshot.priceCents) || 0)
        ),
        shippingCents: Math.max(0, Math.round(Number(extracted.setup.shippingCents) || 0)),
        discountPercent: Math.max(
          0,
          Math.round(
            Number(extracted.setup.discountPercent) || BLEND_SUBSCRIPTION_DISCOUNT_PERCENT
          )
        ),
      });

      const stripeSubscriptionItems = await buildBlendSubscriptionStripeSubscriptionItems({
        idempotencyKeyPrefix: `blend-subscription-order-${order.id}-${extracted.itemId}`,
        title: metadata.title,
        blendFormat: metadata.blendFormat,
        intervalCount: metadata.intervalCount,
        unitPriceCents: metadata.unitPriceCents,
        shippingCents: metadata.shippingCents,
        discountPercent: metadata.discountPercent || BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
      });

      const stripeSubscription = await stripe.subscriptions.create(
        {
          customer: stripeCustomerId,
          default_payment_method: paymentMethodId,
          items: stripeSubscriptionItems,
          metadata,
          trial_end: computeBlendSubscriptionTrialEndTimestamp(metadata.intervalCount),
        },
        {
          idempotencyKey: `blend-subscription-order-${order.id}-${extracted.itemId}`,
        }
      );

      const subscriptionSnapshot = {
        ...extracted.snapshot,
        sourceType: metadata.sourceType,
        listingId: metadata.listingId,
        basePriceCents: metadata.basePriceCents || extracted.snapshot.priceCents,
        shippingAddress: order.shippingAddressSnapshot || null,
        billingAddress: order.billingAddressSnapshot || order.shippingAddressSnapshot || null,
        shippingSelection: shippingSelectionSnapshot,
        shippingMode: order.shippingMode || shippingSelectionSnapshot.mode || null,
        shippingOfferId: order.shippingOfferId || shippingSelectionSnapshot.offerId || null,
        shippingOfferCode: order.shippingOfferCode || shippingSelectionSnapshot.offerCode || null,
        shippingOfferLabel:
          order.shippingOfferLabel || shippingSelectionSnapshot.offerLabel || null,
        relayPointId: order.relayPointId || shippingSelectionSnapshot.relayPoint?.id || null,
        relayPointLabel:
          order.relayPointLabel || shippingSelectionSnapshot.relayPoint?.name || null,
        relayNetwork: order.relayNetwork || shippingSelectionSnapshot.relayPoint?.network || null,
      };

      await upsertBlendSubscriptionRecord({
        customer,
        stripeSubscription,
        metadata: parseBlendSubscriptionMetadata(metadata),
        snapshot: subscriptionSnapshot,
      });

      await prisma.orderItem.update({
        where: { id: extracted.itemId },
        data: {
          snapshot: {
            ...extracted.snapshot,
            shippingSelection: shippingSelectionSnapshot,
            subscription: {
              kind: BLEND_SUBSCRIPTION_KIND,
              stripeSubscriptionId: stripeSubscription.id,
              interval: 'month',
              intervalCount: metadata.intervalCount,
              discountPercent:
                metadata.discountPercent || BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
              status: stripeSubscription.status || 'active',
            },
            subscriptionSetup: {
              ...extracted.setup,
              shippingCents: metadata.shippingCents,
              stripeSubscriptionId: stripeSubscription.id,
            },
          },
        },
      });

      subscriptionIds.push(stripeSubscription.id);
    }
    return subscriptionIds;
  };

  const recoverMissingBlendSubscriptionsForCustomer = async (customer) => {
    if (!stripe || !customer?.id) {
      return;
    }
    const candidateOrders = await prisma.order.findMany({
      where: {
        customerId: customer.id,
        paymentStatus: 'completed',
      },
      include: {
        items: true,
        customer: true,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 25,
    });
    for (const order of candidateOrders) {
      const pendingItems = extractPendingBlendSubscriptionSetupsFromOrder(order).filter(
        (item) => !item.alreadyCreated
      );
      if (pendingItems.length === 0) {
        continue;
      }
      const paymentIntentId =
        typeof order.stripeSessionId === 'string' &&
        order.stripeSessionId.trim().startsWith('pi_')
          ? order.stripeSessionId.trim()
          : null;
      if (!paymentIntentId) {
        continue;
      }
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (paymentIntent.status === 'succeeded') {
          await ensureBlendSubscriptionsFromPaidOrder({
            order,
            paymentIntent,
          });
        }
      } catch (error) {
        console.error(`Failed to recover subscriptions for order ${order.orderNumber}:`, error);
      }
    }
  };

  const createBlendSubscriptionOrderFromInvoice = async ({
    customer,
    subscription,
    invoice,
  }) => {
    if (!customer || !subscription) {
      return null;
    }
    if (!invoice?.id) {
      throw new Error('STRIPE_INVOICE_ID_REQUIRED');
    }

    const existingOrder = await prisma.order.findUnique({
      where: { stripeInvoiceId: invoice.id },
      select: { id: true },
    });
    if (existingOrder) {
      return existingOrder;
    }

    const snapshot =
      subscription.snapshot && typeof subscription.snapshot === 'object'
        ? subscription.snapshot
        : {};
    const storedShippingSelection = serializeSubscriptionShippingSelectionSnapshot(
      snapshot.shippingSelection || null
    );
    const defaultAddresses =
      storedShippingSelection.mode === 'HOME'
        ? await getDefaultBlendSubscriptionAddresses(customer.id)
        : { shippingAddress: null, billingAddress: null };
    const shippingAddressSnapshot =
      storedShippingSelection.mode === 'HOME'
        ? addressRecordToCheckoutAddress(defaultAddresses.shippingAddress || null) ||
          addressRecordToCheckoutAddress(snapshot.shippingAddress || null)
        : addressRecordToCheckoutAddress(snapshot.shippingAddress || null);
    const billingAddressSnapshot =
      storedShippingSelection.mode === 'HOME'
        ? addressRecordToCheckoutAddress(defaultAddresses.billingAddress || null) ||
          addressRecordToCheckoutAddress(snapshot.billingAddress || null) ||
          shippingAddressSnapshot
        : addressRecordToCheckoutAddress(snapshot.billingAddress || null) ||
          shippingAddressSnapshot;
    const shippingAddress = shippingAddressSnapshot
      ? checkoutAddressToString(shippingAddressSnapshot)
      : customer.address || '';
    const blendTitle =
      typeof subscription.title === 'string' && subscription.title.trim().length > 0
        ? subscription.title.trim()
        : buildBlendSubscriptionTitle(snapshot.title || '');
    const ingredientIds = Array.isArray(snapshot.ingredientIds) ? snapshot.ingredientIds : [];
    const ingredients = Array.isArray(snapshot.ingredients) ? snapshot.ingredients : [];
    const originalPriceCents = Math.max(
      0,
      Math.round(
        Number(snapshot.basePriceCents || snapshot.priceCents || subscription.unitPriceCents) || 0
      )
    );
    const unitPriceCents = Math.max(0, Math.round(Number(subscription.unitPriceCents) || 0));
    const shippingCents = Math.max(0, Math.round(Number(subscription.shippingCents) || 0));

    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        userId: customer.userId || null,
        orderNumber: `SUB-${Date.now()}`,
        status: 'CONFIRMED',
        subtotal: unitPriceCents / 100,
        shippingCost: shippingCents / 100,
        tax: 0,
        total: (unitPriceCents + shippingCents) / 100,
        subtotalCents: unitPriceCents,
        shippingCents,
        discountTotalCents: Math.max(0, originalPriceCents - unitPriceCents),
        totalCents: unitPriceCents + shippingCents,
        paymentMethod: 'stripe_subscription',
        paymentStatus: 'completed',
        stripeSessionId: typeof invoice.payment_intent === 'string' ? invoice.payment_intent : null,
        stripeInvoiceId: invoice.id,
        shippingAddress,
        shippingProvider:
          storedShippingSelection.offerId || storedShippingSelection.offerCode ? 'BOXTAL' : null,
        shippingMode: storedShippingSelection.mode || null,
        shippingOfferId: storedShippingSelection.offerId || null,
        shippingOfferCode: storedShippingSelection.offerCode || null,
        shippingOfferLabel: storedShippingSelection.offerLabel || null,
        relayPointId: storedShippingSelection.relayPoint?.id || null,
        relayPointLabel: storedShippingSelection.relayPoint?.name || null,
        relayNetwork: storedShippingSelection.relayPoint?.network || null,
        shippingMeta: storedShippingSelection,
        billingAddressSnapshot,
        shippingAddressSnapshot,
        items: {
          create: [
            {
              itemType: 'BLEND',
              qty: 1,
              unitPriceCents,
              lineSubtotalCents: unitPriceCents,
              lineDiscountCents: Math.max(0, originalPriceCents - unitPriceCents),
              lineTotalCents: unitPriceCents,
              snapshot: {
                title: blendTitle,
                ingredientIds,
                ingredients,
                blendFormat: subscription.blendFormat || snapshot.blendFormat || DEFAULT_BLEND_FORMAT,
                blendFormatLabel:
                  snapshot.blendFormatLabel ||
                  BLEND_FORMAT_LABELS[subscription.blendFormat || DEFAULT_BLEND_FORMAT],
                blendColor: snapshot.blendColor || '#C4A77D',
                priceCents: unitPriceCents,
                basePriceCents: originalPriceCents,
                shippingSelection: storedShippingSelection,
                subscription: {
                  kind: subscription.kind,
                  stripeSubscriptionId: subscription.stripeSubscriptionId,
                  interval: subscription.interval,
                  intervalCount: subscription.intervalCount,
                  discountPercent: subscription.discountPercent,
                },
              },
            },
          ],
        },
      },
    });

    await finalizePaidOrder(order.id, 'stripe_webhook:invoice.paid');
    return order;
  };

  return {
    addressRecordToCheckoutAddress,
    buildBlendSubscriptionSnapshot,
    buildBlendSubscriptionStripeLineItems,
    createBlendSubscriptionOrderFromInvoice,
    ensureBlendSubscriptionsFromPaidOrder,
    ensureStripeCustomerForCustomer,
    getDefaultBlendSubscriptionAddresses,
    getStripeCustomerDefaultPaymentMethodSummary,
    listStripeInvoicesForCustomer,
    parseBlendSubscriptionMetadata,
    recoverMissingBlendSubscriptionsForCustomer,
    serializeBlendSubscriptionMetadata,
    stripeTimestampToDate,
    upsertBlendSubscriptionRecord,
  };
}
