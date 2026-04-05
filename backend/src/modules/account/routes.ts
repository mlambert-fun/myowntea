// @ts-nocheck
export function registerAccountRoutes(app, deps) {
  const {
    WEB_BASE_URL,
    bcrypt,
    buildSecurityEmailContent,
    ensureEmailPreference,
    ensureStripeCustomerForCustomer,
    getStripeCustomerDefaultPaymentMethodSummary,
    listStripeInvoicesForCustomer,
    normalizeEmail,
    prisma,
    queueEmailDelivery,
    recordEmailConsentEvent,
    recoverMissingBlendSubscriptionsForCustomer,
    requireAccountCustomer,
    resolveOrderSubtotalDiscountCents,
    resolveRequestIp,
    stripe,
    stripeTimestampToDate,
    t,
    toNonEmptyStringOrNull,
    updateEmailPreference,
    upsertNewsletterSubscription,
  } = deps;

  const parsePage = (value, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }
    return Math.floor(parsed);
  };

  const parsePageSize = (value, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }
    return Math.min(Math.floor(parsed), 50);
  };

  const normalizePhoneE164 = (value) => {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (!/^\+[1-9]\d{1,14}$/.test(trimmed)) {
      throw new Error('Invalid phone format');
    }
    return trimmed;
  };

  app.get('/api/account/orders', requireAccountCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const page = parsePage(req.query.page, 1);
      const pageSize = parsePageSize(req.query.pageSize, 10);
      const skip = (page - 1) * pageSize;
      const [totalCount, orders] = await Promise.all([
        prisma.order.count({ where: { customerId: customer.id } }),
        prisma.order.findMany({
          where: { customerId: customer.id },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalCents: true,
            createdAt: true,
          },
        }),
      ]);

      res.json({
        page,
        pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
        orders,
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });

  app.get('/api/account/orders/:orderId', requireAccountCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const order = await prisma.order.findFirst({
        where: { id: req.params.orderId, customerId: customer.id },
        include: { items: true, shipment: true },
      });
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const fallbackAddress = order.shippingAddress
        ? {
          address1: order.shippingAddress,
          address2: null,
          postalCode: null,
          city: null,
          countryCode: null,
          phoneE164: null,
          firstName: null,
          lastName: null,
          salutation: null,
        }
        : null;
      const subtotalDiscountCents = resolveOrderSubtotalDiscountCents(order);

      res.json({
        id: order.id,
        reference: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt,
        totals: {
          subtotalCents: order.subtotalCents,
          shippingCents: order.shippingCents,
          subtotalDiscountCents,
          discountTotalCents: order.discountTotalCents,
          totalCents: order.totalCents,
        },
        payment: {
          method: order.paymentMethod,
          status: order.paymentStatus,
          stripeSessionId: order.stripeSessionId,
        },
        shipping: {
          carrier: order.shippingProvider,
          trackingNumber: order.trackingNumber || order.shipment?.trackingNumber || null,
          trackingUrl: order.trackingUrl || null,
          offerLabel: order.shippingOfferLabel || null,
          mode: order.shippingMode || null,
        },
        items: order.items.map((item) => {
          const snapshot = item.snapshot && typeof item.snapshot === 'object' ? item.snapshot : null;
          const normalizedItemType = item.itemType === 'BLEND'
            && (String(snapshot?.purchaseMode || '').toUpperCase() === 'SUBSCRIPTION' || Boolean(snapshot?.subscriptionSetup))
            ? 'SUBSCRIPTION'
            : (item.itemType || 'BLEND');
          return {
            id: item.id,
            itemType: normalizedItemType,
            qty: item.qty ?? item.quantity,
            unitPriceCents: item.unitPriceCents,
            lineTotalCents: item.lineTotalCents,
            lineSubtotalCents: item.lineSubtotalCents,
            lineDiscountCents: item.lineDiscountCents,
            snapshot: item.snapshot,
          };
        }),
        billingAddress: order.billingAddressSnapshot || fallbackAddress,
        shippingAddress: order.shippingAddressSnapshot || fallbackAddress,
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  });

  app.get('/api/account/subscriptions', requireAccountCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      await recoverMissingBlendSubscriptionsForCustomer(customer);
      const subscriptions = await prisma.subscription.findMany({
        where: { customerId: customer.id },
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          kind: true,
          title: true,
          status: true,
          interval: true,
          intervalCount: true,
          currency: true,
          unitPriceCents: true,
          shippingCents: true,
          discountPercent: true,
          blendFormat: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          cancelledAt: true,
          createdAt: true,
          updatedAt: true,
          snapshot: true,
        },
      });
      res.json({
        subscriptions: subscriptions.map((subscription) => ({
          ...subscription,
          totalCents: (subscription.unitPriceCents || 0) + (subscription.shippingCents || 0),
        })),
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }
  });

  app.get('/api/account/subscriptions/payment-method', requireAccountCustomer, async (req, res) => {
    try {
      if (!stripe) {
        return res.status(501).json({ error: 'Stripe is not configured' });
      }
      const paymentMethod = await getStripeCustomerDefaultPaymentMethodSummary(req.customer);
      res.json({ paymentMethod });
    } catch (error) {
      console.error('Error fetching subscription payment method:', error);
      res.status(500).json({ error: 'Failed to fetch subscription payment method' });
    }
  });

  app.post('/api/account/subscriptions/payment-method/setup-intent', requireAccountCustomer, async (req, res) => {
    try {
      if (!stripe) {
        return res.status(501).json({ error: 'Stripe is not configured' });
      }
      const stripeCustomerId = await ensureStripeCustomerForCustomer(req.customer);
      const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        usage: 'off_session',
        payment_method_types: ['card'],
      });
      res.json({
        setupIntentId: setupIntent.id,
        clientSecret: setupIntent.client_secret,
      });
    } catch (error) {
      console.error('Error creating subscription setup intent:', error);
      res.status(500).json({ error: 'Failed to create setup intent' });
    }
  });

  app.post('/api/account/subscriptions/payment-method/default', requireAccountCustomer, async (req, res) => {
    try {
      if (!stripe) {
        return res.status(501).json({ error: 'Stripe is not configured' });
      }
      const setupIntentId = typeof req.body?.setupIntentId === 'string' ? req.body.setupIntentId.trim() : '';
      if (!setupIntentId) {
        return res.status(400).json({ error: 'setupIntentId is required' });
      }

      const stripeCustomerId = await ensureStripeCustomerForCustomer(req.customer);
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      const setupIntentCustomerId = typeof setupIntent.customer === 'string'
        ? setupIntent.customer
        : typeof setupIntent.customer?.id === 'string'
          ? setupIntent.customer.id
          : null;
      if (setupIntent.status !== 'succeeded' || setupIntentCustomerId !== stripeCustomerId) {
        return res.status(409).json({ error: 'Setup intent is not ready' });
      }

      const paymentMethodId = typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : typeof setupIntent.payment_method?.id === 'string'
          ? setupIntent.payment_method.id
          : null;
      if (!paymentMethodId) {
        return res.status(409).json({ error: 'Payment method is missing on setup intent' });
      }

      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      const subscriptions = await prisma.subscription.findMany({
        where: {
          customerId: req.customer.id,
          stripeSubscriptionId: { not: null },
          status: { notIn: ['canceled', 'incomplete_expired'] },
        },
        select: {
          id: true,
          stripeSubscriptionId: true,
        },
      });
      await Promise.all(subscriptions
        .filter((subscription) => typeof subscription.stripeSubscriptionId === 'string' && subscription.stripeSubscriptionId)
        .map((subscription) => stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          default_payment_method: paymentMethodId,
        })));

      const paymentMethod = await getStripeCustomerDefaultPaymentMethodSummary(req.customer);
      res.json({ paymentMethod });
    } catch (error) {
      console.error('Error updating subscription default payment method:', error);
      res.status(500).json({ error: 'Failed to update default payment method' });
    }
  });

  app.get('/api/account/subscriptions/invoices', requireAccountCustomer, async (req, res) => {
    try {
      if (!stripe) {
        return res.status(501).json({ error: 'Stripe is not configured' });
      }
      const invoices = await listStripeInvoicesForCustomer(req.customer);
      res.json({ invoices });
    } catch (error) {
      console.error('Error fetching subscription invoices:', error);
      res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  });

  app.post('/api/account/subscriptions/:id/cancel', requireAccountCustomer, async (req, res) => {
    try {
      if (!stripe) {
        return res.status(501).json({ error: 'Stripe is not configured' });
      }
      const subscription = await prisma.subscription.findFirst({
        where: {
          id: req.params.id,
          customerId: req.customer.id,
        },
      });
      if (!subscription?.stripeSubscriptionId) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      const stripeSubscription = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      const updated = await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: stripeSubscription.status || subscription.status,
          currentPeriodEnd: stripeTimestampToDate(stripeSubscription.current_period_end),
          cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
          cancelledAt: stripeTimestampToDate(stripeSubscription.canceled_at),
        },
      });

      res.json({
        subscription: {
          ...updated,
          totalCents: (updated.unitPriceCents || 0) + (updated.shippingCents || 0),
        },
      });
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  });

  app.post('/api/account/subscriptions/:id/reactivate', requireAccountCustomer, async (req, res) => {
    try {
      if (!stripe) {
        return res.status(501).json({ error: 'Stripe is not configured' });
      }
      const subscription = await prisma.subscription.findFirst({
        where: {
          id: req.params.id,
          customerId: req.customer.id,
        },
      });
      if (!subscription?.stripeSubscriptionId) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      const stripeSubscription = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
      const updated = await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: stripeSubscription.status || subscription.status,
          currentPeriodEnd: stripeTimestampToDate(stripeSubscription.current_period_end),
          cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
          cancelledAt: stripeTimestampToDate(stripeSubscription.canceled_at),
        },
      });

      res.json({
        subscription: {
          ...updated,
          totalCents: (updated.unitPriceCents || 0) + (updated.shippingCents || 0),
        },
      });
    } catch (error) {
      console.error('Error reactivating subscription:', error);
      res.status(500).json({ error: 'Failed to reactivate subscription' });
    }
  });

  app.post('/api/account/subscriptions/portal-session', requireAccountCustomer, async (req, res) => {
    try {
      if (!stripe) {
        return res.status(501).json({ error: 'Stripe is not configured' });
      }
      const customer = req.customer;
      const stripeCustomerId = await ensureStripeCustomerForCustomer(customer);
      const returnUrl = typeof req.body?.returnUrl === 'string' && req.body.returnUrl.trim().length > 0
        ? req.body.returnUrl.trim()
        : `${WEB_BASE_URL}/account/subscriptions`;
      const session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl,
      });
      res.json({ url: session.url });
    } catch (error) {
      console.error('Error creating Stripe portal session:', error);
      res.status(500).json({ error: 'Failed to create Stripe portal session' });
    }
  });

  app.get('/api/account/addresses', requireAccountCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const addresses = await prisma.address.findMany({
        where: { customerId: customer.id },
        orderBy: [{ isDefaultShipping: 'desc' }, { isDefaultBilling: 'desc' }, { createdAt: 'desc' }],
      });
      res.json({ addresses });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch addresses' });
    }
  });

  app.post('/api/account/addresses', requireAccountCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const { salutation, firstName, lastName, countryCode, postalCode, city, hamlet, address1, address2, phoneE164, isDefaultBilling, isDefaultShipping } = req.body;
      if (!firstName || !lastName || !countryCode || !postalCode || !city || !address1 || !phoneE164) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const normalizedPhone = normalizePhoneE164(phoneE164);
      if (!normalizedPhone) {
        return res.status(400).json({ error: 'Invalid phone format' });
      }

      const created = await prisma.$transaction(async (tx) => {
        if (isDefaultBilling) {
          await tx.address.updateMany({
            where: { customerId: customer.id, isDefaultBilling: true },
            data: { isDefaultBilling: false },
          });
        }
        if (isDefaultShipping) {
          await tx.address.updateMany({
            where: { customerId: customer.id, isDefaultShipping: true },
            data: { isDefaultShipping: false },
          });
        }
        return tx.address.create({
          data: {
            customerId: customer.id,
            salutation: salutation || null,
            firstName,
            lastName,
            countryCode,
            postalCode,
            city,
            hamlet: hamlet || null,
            address1,
            address2: address2 || null,
            phoneE164: normalizedPhone,
            isDefaultBilling: Boolean(isDefaultBilling),
            isDefaultShipping: Boolean(isDefaultShipping),
          },
        });
      });
      res.status(201).json({ address: created });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create address';
      if (message === 'Invalid phone format') {
        return res.status(400).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  });

  app.patch('/api/account/addresses/:id', requireAccountCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const { salutation, firstName, lastName, countryCode, postalCode, city, hamlet, address1, address2, phoneE164, isDefaultBilling, isDefaultShipping } = req.body;
      const normalizedPhone = phoneE164 ? normalizePhoneE164(phoneE164) : undefined;
      const updated = await prisma.$transaction(async (tx) => {
        if (isDefaultBilling) {
          await tx.address.updateMany({
            where: { customerId: customer.id, isDefaultBilling: true },
            data: { isDefaultBilling: false },
          });
        }
        if (isDefaultShipping) {
          await tx.address.updateMany({
            where: { customerId: customer.id, isDefaultShipping: true },
            data: { isDefaultShipping: false },
          });
        }
        const existing = await tx.address.findFirst({
          where: { id: req.params.id, customerId: customer.id },
        });
        if (!existing) {
          throw new Error('ADDRESS_NOT_FOUND');
        }
        return tx.address.update({
          where: { id: existing.id },
          data: {
            salutation: salutation !== undefined ? salutation : undefined,
            firstName: firstName !== undefined ? firstName : undefined,
            lastName: lastName !== undefined ? lastName : undefined,
            countryCode: countryCode !== undefined ? countryCode : undefined,
            postalCode: postalCode !== undefined ? postalCode : undefined,
            city: city !== undefined ? city : undefined,
            hamlet: hamlet !== undefined ? hamlet : undefined,
            address1: address1 !== undefined ? address1 : undefined,
            address2: address2 !== undefined ? address2 : undefined,
            phoneE164: typeof normalizedPhone === 'string' ? normalizedPhone : undefined,
            isDefaultBilling: typeof isDefaultBilling === 'boolean' ? isDefaultBilling : undefined,
            isDefaultShipping: typeof isDefaultShipping === 'boolean' ? isDefaultShipping : undefined,
          },
        });
      });
      res.json({ address: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update address';
      if (message === 'ADDRESS_NOT_FOUND') {
        return res.status(404).json({ error: 'Address not found' });
      }
      if (message === 'Invalid phone format') {
        return res.status(400).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  });

  app.delete('/api/account/addresses/:id', requireAccountCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const result = await prisma.address.deleteMany({
        where: { id: req.params.id, customerId: customer.id },
      });
      if (result.count === 0) {
        return res.status(404).json({ error: 'Address not found' });
      }
      res.json({ success: true });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to delete address' });
    }
  });

  app.patch('/api/account/addresses/defaults', requireAccountCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const { defaultBillingId, defaultShippingId } = req.body;
      await prisma.$transaction(async (tx) => {
        if (defaultBillingId) {
          const billingAddress = await tx.address.findFirst({
            where: { id: defaultBillingId, customerId: customer.id },
          });
          if (!billingAddress) {
            throw new Error('ADDRESS_NOT_FOUND');
          }
          await tx.address.updateMany({
            where: { customerId: customer.id, isDefaultBilling: true },
            data: { isDefaultBilling: false },
          });
          await tx.address.update({
            where: { id: billingAddress.id },
            data: { isDefaultBilling: true },
          });
        }
        if (defaultShippingId) {
          const shippingAddress = await tx.address.findFirst({
            where: { id: defaultShippingId, customerId: customer.id },
          });
          if (!shippingAddress) {
            throw new Error('ADDRESS_NOT_FOUND');
          }
          await tx.address.updateMany({
            where: { customerId: customer.id, isDefaultShipping: true },
            data: { isDefaultShipping: false },
          });
          await tx.address.update({
            where: { id: shippingAddress.id },
            data: { isDefaultShipping: true },
          });
        }
      });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update defaults';
      if (message === 'ADDRESS_NOT_FOUND') {
        return res.status(404).json({ error: 'Address not found' });
      }
      res.status(500).json({ error: 'Failed to update defaults' });
    }
  });

  app.get('/api/account/email-preferences', requireAccountCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const preferences = await ensureEmailPreference(customer.id);
      if (!preferences) {
        return res.status(404).json({ error: 'Preferences not found' });
      }
      res.json({
        preferences: {
          transactionalOptIn: Boolean(preferences.transactionalOptIn),
          marketingOptIn: Boolean(preferences.marketingOptIn),
          abandonedCartOptIn: Boolean(preferences.abandonedCartOptIn),
          postPurchaseOptIn: Boolean(preferences.postPurchaseOptIn),
          reorderOptIn: Boolean(preferences.reorderOptIn),
          winbackOptIn: Boolean(preferences.winbackOptIn),
          updatedAt: preferences.updatedAt,
        },
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch email preferences' });
    }
  });

  app.patch('/api/account/email-preferences', requireAccountCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const payload = req.body || {};
      const previous = await ensureEmailPreference(customer.id);
      const updated = await updateEmailPreference(customer.id, {
        transactionalOptIn: payload.transactionalOptIn,
        marketingOptIn: payload.marketingOptIn,
        abandonedCartOptIn: payload.abandonedCartOptIn,
        postPurchaseOptIn: payload.postPurchaseOptIn,
        reorderOptIn: payload.reorderOptIn,
        winbackOptIn: payload.winbackOptIn,
      });
      if (!updated) {
        return res.status(404).json({ error: 'Preferences not found' });
      }

      const customerEmail = normalizeEmail(customer.email);
      const marketingChanged = previous
        ? Boolean(previous.marketingOptIn) !== Boolean(updated.marketingOptIn)
        : payload.marketingOptIn !== undefined;
      if (customerEmail && marketingChanged) {
        const requestIp = resolveRequestIp(req);
        const userAgent = toNonEmptyStringOrNull(req.header('user-agent'));
        await upsertNewsletterSubscription({
          email: customerEmail,
          status: updated.marketingOptIn ? 'SUBSCRIBED' : 'UNSUBSCRIBED',
          marketingConsent: Boolean(updated.marketingOptIn),
          source: 'ACCOUNT_PREFERENCES',
          ipAddress: requestIp,
          userAgent,
        });
        await recordEmailConsentEvent({
          customerId: customer.id,
          email: customerEmail,
          action: updated.marketingOptIn ? 'OPT_IN' : 'OPT_OUT',
          source: 'ACCOUNT_PREFERENCES',
          ipAddress: requestIp,
          userAgent,
          metadata: {
            via: 'account_preferences',
          },
        });
      }

      res.json({
        preferences: {
          transactionalOptIn: Boolean(updated.transactionalOptIn),
          marketingOptIn: Boolean(updated.marketingOptIn),
          abandonedCartOptIn: Boolean(updated.abandonedCartOptIn),
          postPurchaseOptIn: Boolean(updated.postPurchaseOptIn),
          reorderOptIn: Boolean(updated.reorderOptIn),
          winbackOptIn: Boolean(updated.winbackOptIn),
          updatedAt: updated.updatedAt,
        },
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to update email preferences' });
    }
  });

  app.patch('/api/account/profile', requireAccountCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const { salutation, firstName, lastName, birthDate, phoneE164 } = req.body;
      if (!firstName || !lastName) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const parsedBirthDate = birthDate ? new Date(birthDate) : null;
      if (birthDate && Number.isNaN(parsedBirthDate.getTime())) {
        return res.status(400).json({ error: 'Invalid birth date' });
      }

      const normalizedPhone = normalizePhoneE164(phoneE164);
      const updated = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          salutation: salutation || null,
          firstName,
          lastName,
          birthDate: parsedBirthDate,
          phoneE164: normalizedPhone,
        },
      });

      res.json({
        customer: {
          id: updated.id,
          email: updated.email,
          authProvider: updated.authProvider,
          salutation: updated.salutation,
          firstName: updated.firstName,
          lastName: updated.lastName,
          birthDate: updated.birthDate,
          phoneE164: updated.phoneE164,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update profile';
      if (message === 'Invalid phone format') {
        return res.status(400).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  });

  app.patch('/api/account/email', requireAccountCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const { email, currentPassword } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const existing = await prisma.customer.findUnique({ where: { id: customer.id } });
      if (!existing) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      if (existing.passwordHash) {
        if (!currentPassword) {
          return res.status(400).json({ error: 'Current password required' });
        }
        const isValid = await bcrypt.compare(currentPassword, existing.passwordHash);
        if (!isValid) {
          return res.status(401).json({ error: 'Invalid password' });
        }
      }

      const normalizedEmail = email.toLowerCase();
      const conflict = await prisma.customer.findFirst({
        where: { email: normalizedEmail, id: { not: existing.id } },
      });
      if (conflict) {
        return res.status(409).json({ error: t("backend.index.email_already_use") });
      }

      const previousEmail = toNonEmptyStringOrNull(existing.email);
      const updated = await prisma.customer.update({
        where: { id: customer.id },
        data: { email: normalizedEmail },
      });

      const securityContent = buildSecurityEmailContent({
        type: 'ACCOUNT_EMAIL_CHANGED',
        firstName: updated.firstName,
        oldEmail: previousEmail,
        newEmail: updated.email,
      });
      if (updated.email) {
        await queueEmailDelivery({
          customerId: updated.id,
          type: 'ACCOUNT_EMAIL_CHANGED',
          recipient: updated.email,
          subject: securityContent.subject,
          text: securityContent.text,
          html: securityContent.html,
          metadata: {
            source: 'account_email_change',
            target: 'new_email',
            oldEmail: previousEmail,
            newEmail: updated.email,
          },
        });
      }
      if (previousEmail && previousEmail !== updated.email) {
        await queueEmailDelivery({
          customerId: updated.id,
          type: 'ACCOUNT_EMAIL_CHANGED',
          recipient: previousEmail,
          subject: securityContent.subject,
          text: securityContent.text,
          html: securityContent.html,
          metadata: {
            source: 'account_email_change',
            target: 'old_email',
            oldEmail: previousEmail,
            newEmail: updated.email,
          },
        });
      }

      res.json({
        customer: {
          id: updated.id,
          email: updated.email,
          authProvider: updated.authProvider,
          salutation: updated.salutation,
          firstName: updated.firstName,
          lastName: updated.lastName,
          birthDate: updated.birthDate,
          phoneE164: updated.phoneE164,
        },
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to update email' });
    }
  });

  app.patch('/api/account/password', requireAccountCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password too short' });
      }

      const existing = await prisma.customer.findUnique({ where: { id: customer.id } });
      if (!existing.passwordHash) {
        return res.status(400).json({ error: 'Password update not available' });
      }

      const isValid = await bcrypt.compare(currentPassword, existing.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid password' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await prisma.customer.update({
        where: { id: customer.id },
        data: { passwordHash },
      });

      const securityContent = buildSecurityEmailContent({
        type: 'ACCOUNT_PASSWORD_CHANGED',
        firstName: existing.firstName,
      });
      if (existing.email) {
        await queueEmailDelivery({
          customerId: existing.id,
          type: 'ACCOUNT_PASSWORD_CHANGED',
          recipient: existing.email,
          subject: securityContent.subject,
          text: securityContent.text,
          html: securityContent.html,
          metadata: {
            source: 'account_password_change',
          },
        });
      }

      res.json({ success: true });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to update password' });
    }
  });
}
