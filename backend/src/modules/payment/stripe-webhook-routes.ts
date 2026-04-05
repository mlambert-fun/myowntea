// @ts-nocheck
export function registerStripeWebhookRoutes(app, deps) {
  const {
    BLEND_SUBSCRIPTION_KIND,
    buildWishlistCreationSnapshot,
    createBlendSubscriptionOrderFromInvoice,
    ensureBlendSubscriptionsFromPaidOrder,
    finalizePaidOrder,
    getDefaultBlendSubscriptionAddresses,
    parseBlendSubscriptionMetadata,
    prisma,
    stripe,
    stripeTimestampToDate,
    upsertBlendSubscriptionRecord,
  } = deps;

  const normalizeStripeEmail = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || null;
  };

  app.post('/api/stripe/webhook', async (req, res) => {
    try {
      if (!stripe) {
        return res.status(501).json({ error: 'Stripe is not configured' });
      }
      const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
      if (!secret) {
        return res.status(400).json({ error: 'Webhook secret not configured' });
      }

      const signature = req.header('stripe-signature') || '';
      let event;
      try {
        event = stripe.webhooks.constructEvent(req.rawBody, signature, secret);
      } catch (_err) {
        return res.status(400).json({ error: 'Invalid signature' });
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        if (session.mode === 'subscription' || session.subscription) {
          const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
          const stripeCustomerId = typeof session.customer === 'string' ? session.customer : null;

          if (session.metadata?.subscriptionKind === BLEND_SUBSCRIPTION_KIND && stripeSubscriptionId) {
            const metadata = parseBlendSubscriptionMetadata(session.metadata || {});
            let customer = metadata.customerId
              ? await prisma.customer.findUnique({ where: { id: metadata.customerId } })
              : null;
            if (!customer && session.customer_email) {
              customer = await prisma.customer.findUnique({ where: { email: session.customer_email } });
            }

            if (customer) {
              if (stripeCustomerId && customer.stripeCustomerId !== stripeCustomerId) {
                await prisma.customer.update({
                  where: { id: customer.id },
                  data: { stripeCustomerId },
                });
                customer.stripeCustomerId = stripeCustomerId;
              }

              const stripeSubscription = stripe
                ? await stripe.subscriptions.retrieve(stripeSubscriptionId)
                : null;
              const { shippingAddress, billingAddress } = await getDefaultBlendSubscriptionAddresses(customer.id);
              const rebuiltSnapshot = await buildWishlistCreationSnapshot({
                name: metadata.title,
                ingredientIds: metadata.ingredientIds,
                blendFormat: metadata.blendFormat,
              });
              await upsertBlendSubscriptionRecord({
                customer,
                stripeSubscription,
                metadata,
                snapshot: {
                  ...rebuiltSnapshot,
                  sourceType: metadata.sourceType,
                  listingId: metadata.listingId,
                  basePriceCents: metadata.basePriceCents || rebuiltSnapshot.priceCents,
                  shippingAddress: shippingAddress || null,
                  billingAddress: billingAddress || shippingAddress || null,
                },
              });
            }

            return res.json({ received: true });
          }

          const planId = session.metadata.planId || null;
          const customerId = session.metadata.customerId || null;
          if (planId && stripeSubscriptionId) {
            const plan = await prisma.subscriptionPlan.findUnique({
              where: { id: planId },
              include: { product: true },
            });
            if (plan) {
              let customer = customerId
                ? await prisma.customer.findUnique({ where: { id: customerId } })
                : null;
              if (!customer && session.customer_email) {
                customer = await prisma.customer.findUnique({ where: { email: session.customer_email } });
              }
              if (customer) {
                if (stripeCustomerId && customer.stripeCustomerId !== stripeCustomerId) {
                  await prisma.customer.update({
                    where: { id: customer.id },
                    data: { stripeCustomerId },
                  });
                }

                const existingOrder = await prisma.order.findFirst({ where: { stripeSessionId: session.id } });
                if (!existingOrder) {
                  await prisma.order.create({
                    data: {
                      customerId: customer.id,
                      userId: null,
                      orderNumber: `ORD-${Date.now()}`,
                      status: 'CONFIRMED',
                      subtotal: plan.product.priceCents / 100,
                      shippingCost: 0,
                      tax: 0,
                      total: plan.product.priceCents / 100,
                      subtotalCents: plan.product.priceCents,
                      shippingCents: 0,
                      discountTotalCents: 0,
                      totalCents: plan.product.priceCents,
                      paymentMethod: 'stripe',
                      paymentStatus: 'completed',
                      stripeSessionId: session.id,
                      shippingAddress: customer.address || '',
                      items: {
                        create: [
                          {
                            itemType: 'SUBSCRIPTION',
                            qty: 1,
                            unitPriceCents: plan.product.priceCents,
                            lineSubtotalCents: plan.product.priceCents,
                            lineDiscountCents: 0,
                            lineTotalCents: plan.product.priceCents,
                            subscriptionPlanId: plan.id,
                            snapshot: {
                              title: plan.product.title,
                              productId: plan.product.id,
                              planId: plan.id,
                              stripePriceId: plan.stripePriceId,
                              interval: plan.interval,
                              intervalCount: plan.intervalCount,
                            },
                          },
                        ],
                      },
                    },
                  });
                  await prisma.subscription.create({
                    data: {
                      customerId: customer.id,
                      planId: plan.id,
                      kind: 'PLAN',
                      title: plan.product.title,
                      status: 'active',
                      stripeSubscriptionId,
                      stripePriceId: plan.stripePriceId,
                      currency: 'EUR',
                      interval: plan.interval,
                      intervalCount: plan.intervalCount,
                      unitPriceCents: plan.product.priceCents,
                    },
                  });
                  const cart = await prisma.cart.findFirst({ where: { customerId: customer.id, status: 'ACTIVE' } });
                  if (cart) {
                    await prisma.cart.update({ where: { id: cart.id }, data: { status: 'ORDERED' } });
                    await prisma.cart.create({ data: { customerId: customer.id, status: 'ACTIVE', currency: 'EUR' } });
                  }
                }
              }
            }
          }

          return res.json({ received: true });
        }

        const orderId = session.metadata.orderId || null;
        const stripeSessionId = session.id;
        let order = orderId ? await prisma.order.findUnique({ where: { id: orderId } }) : null;
        if (!order) {
          order = await prisma.order.findFirst({ where: { stripeSessionId } });
        }
        if (order) {
          const normalizedSessionEmail = normalizeStripeEmail(session.customer_email);
          const updateData = {
            ...(!order.stripeSessionId ? { stripeSessionId } : {}),
            ...(!order.customerEmailSnapshot && normalizedSessionEmail
              ? { customerEmailSnapshot: normalizedSessionEmail }
              : {}),
          };
          if (Object.keys(updateData).length > 0) {
            await prisma.order.update({
              where: { id: order.id },
              data: updateData,
            });
            if (!order.stripeSessionId) {
              order.stripeSessionId = stripeSessionId;
            }
            if (!order.customerEmailSnapshot && normalizedSessionEmail) {
              order.customerEmailSnapshot = normalizedSessionEmail;
            }
          }
          await finalizePaidOrder(order.id, 'stripe_webhook:checkout.session.completed');
        }
      }

      if (event.type === 'invoice.paid') {
        const invoice = event.data.object;
        const stripeSubscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
        if (stripeSubscriptionId) {
          const subscription = await prisma.subscription.findUnique({
            where: { stripeSubscriptionId },
            include: { customer: true },
          });
          if (subscription?.kind === BLEND_SUBSCRIPTION_KIND) {
            await createBlendSubscriptionOrderFromInvoice({
              customer: subscription.customer,
              subscription,
              invoice,
            });
          }
        }
      }

      if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const stripeSubscription = event.data.object;
        if (typeof stripeSubscription?.id === 'string') {
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: stripeSubscription.id },
            data: {
              status: stripeSubscription.status || (event.type === 'customer.subscription.deleted' ? 'canceled' : undefined),
              currentPeriodEnd: stripeTimestampToDate(stripeSubscription.current_period_end),
              cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
              cancelledAt: stripeTimestampToDate(stripeSubscription.canceled_at),
            },
          });
        }
      }

      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const orderIdFromMetadata = paymentIntent.metadata.orderId || null;
        let order = orderIdFromMetadata
          ? await prisma.order.findUnique({ where: { id: orderIdFromMetadata }, include: { items: true, customer: true } })
          : null;
        if (!order) {
          order = await prisma.order.findFirst({ where: { stripeSessionId: paymentIntent.id }, include: { items: true, customer: true } });
        }
        if (order) {
          const normalizedReceiptEmail = normalizeStripeEmail(paymentIntent.receipt_email);
          const updateData = {
            ...(!order.stripeSessionId ? { stripeSessionId: paymentIntent.id } : {}),
            ...(!order.customerEmailSnapshot && normalizedReceiptEmail
              ? { customerEmailSnapshot: normalizedReceiptEmail }
              : {}),
          };
          if (Object.keys(updateData).length > 0) {
            await prisma.order.update({
              where: { id: order.id },
              data: updateData,
            });
            if (!order.stripeSessionId) {
              order.stripeSessionId = paymentIntent.id;
            }
            if (!order.customerEmailSnapshot && normalizedReceiptEmail) {
              order.customerEmailSnapshot = normalizedReceiptEmail;
            }
          }
          await finalizePaidOrder(order.id, 'stripe_webhook:payment_intent.succeeded');
          await ensureBlendSubscriptionsFromPaidOrder({
            order,
            paymentIntent,
          });
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Stripe webhook error:', error);
      res.status(500).json({ error: 'Failed to process webhook' });
    }
  });
}
