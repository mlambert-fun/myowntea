// @ts-nocheck
export function createAutomationService({
  AUTOMATION_JOB_DEFAULTS,
  EMAIL_OUTBOX_BATCH_SIZE,
  ensureOrderWorkflowTables,
  finalizePaidOrder,
  getOrderForWorkflow,
  getShippingTracking,
  hasRecentNotification,
  logOrderNotification,
  parseBoxtalTrackingPayload,
  prisma,
  processEmailOutboxBatch,
  queueCampaignEmail,
  stripe,
  syncShipmentTrackingFromPayload,
  t,
  toNonEmptyStringOrNull,
  toStatusOrNull,
  transitionOrderStatus,
}) {
  const AUTOMATION_JOB_IDS = Object.keys(AUTOMATION_JOB_DEFAULTS);
  const MIN_AUTOMATION_INTERVAL_MS = 60 * 1000;
  const MAX_AUTOMATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
  const automationRuntime = AUTOMATION_JOB_IDS.reduce((acc, jobId) => {
    acc[jobId] = { timer: null, running: false };
    return acc;
  }, {});
  let automationSchedulerStarted = false;

  const isAutomationJobId = (value) => {
    if (typeof value !== 'string') {
      return false;
    }
    return AUTOMATION_JOB_IDS.includes(value);
  };

  const clampAutomationIntervalMs = (value) => {
    if (!Number.isFinite(value)) {
      return MIN_AUTOMATION_INTERVAL_MS;
    }
    const rounded = Math.round(value);
    return Math.min(MAX_AUTOMATION_INTERVAL_MS, Math.max(MIN_AUTOMATION_INTERVAL_MS, rounded));
  };

  const parsePositiveIntEnv = (name, fallback) => {
    const parsed = Number(process.env[name] || '');
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.round(parsed);
  };

  const listAutomationJobConfigs = async () => {
    await ensureOrderWorkflowTables();
    const rows = await prisma.$queryRaw`
      SELECT
        "id",
        "name",
        "description",
        "intervalMs",
        "enabled",
        "lastRunAt",
        "nextRunAt",
        "lastStatus",
        "lastError",
        "updatedAt"
      FROM "AutomationJobConfig"
      ORDER BY "name" ASC
    `;
    const filtered = rows.filter((row) => isAutomationJobId(row.id));
    filtered.sort((a, b) => AUTOMATION_JOB_IDS.indexOf(a.id) - AUTOMATION_JOB_IDS.indexOf(b.id));
    return filtered;
  };

  const getAutomationJobConfig = async (jobId) => {
    await ensureOrderWorkflowTables();
    const rows = await prisma.$queryRaw`
      SELECT
        "id",
        "name",
        "description",
        "intervalMs",
        "enabled",
        "lastRunAt",
        "nextRunAt",
        "lastStatus",
        "lastError",
        "updatedAt"
      FROM "AutomationJobConfig"
      WHERE "id" = ${jobId}
      LIMIT 1
    `;
    const row = rows[0] || null;
    if (!row || !isAutomationJobId(row.id)) {
      return null;
    }
    return {
      ...row,
      id: row.id,
    };
  };

  const updateAutomationJobConfig = async (params) => {
    await ensureOrderWorkflowTables();
    const intervalMs =
      params.intervalMs === undefined ? null : clampAutomationIntervalMs(params.intervalMs);
    const enabled = params.enabled === undefined ? null : params.enabled;
    await prisma.$executeRaw`
      UPDATE "AutomationJobConfig"
      SET
        "enabled" = COALESCE(${enabled}, "enabled"),
        "intervalMs" = COALESCE(${intervalMs}, "intervalMs"),
        "updatedAt" = NOW()
      WHERE "id" = ${params.jobId}
    `;
  };

  const updateAutomationJobRunState = async (params) => {
    await ensureOrderWorkflowTables();
    await prisma.$executeRaw`
      UPDATE "AutomationJobConfig"
      SET
        "lastRunAt" = ${params.lastRunAt},
        "nextRunAt" = ${params.nextRunAt},
        "lastStatus" = ${params.lastStatus},
        "lastError" = ${params.lastError},
        "updatedAt" = NOW()
      WHERE "id" = ${params.jobId}
    `;
  };

  const setAutomationJobNextRunAt = async (jobId, nextRunAt) => {
    await ensureOrderWorkflowTables();
    await prisma.$executeRaw`
      UPDATE "AutomationJobConfig"
      SET
        "nextRunAt" = ${nextRunAt},
        "updatedAt" = NOW()
      WHERE "id" = ${jobId}
    `;
  };

  const serializeAutomationJobConfig = (config) => ({
    ...config,
    intervalMinutes: Math.max(1, Math.round(config.intervalMs / 60000)),
    running: automationRuntime[config.id]?.running ?? false,
  });

  const clearAutomationJobTimer = (jobId) => {
    const timer = automationRuntime[jobId].timer;
    if (timer) {
      clearInterval(timer);
      automationRuntime[jobId].timer = null;
    }
  };

  const stopAutomationScheduler = async () => {
    for (const jobId of AUTOMATION_JOB_IDS) {
      clearAutomationJobTimer(jobId);
      await setAutomationJobNextRunAt(jobId, null);
    }
    automationSchedulerStarted = false;
  };

  const isStripeReferencePaid = async (reference) => {
    if (!stripe) {
      return false;
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(reference);
      if (session.payment_status === 'paid') {
        return true;
      }
    } catch {
      // Ignore and fallback to payment intent retrieval
    }
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(reference);
      if (paymentIntent.status === 'succeeded') {
        return true;
      }
    } catch {
      // Ignore invalid payment intent ids
    }
    return false;
  };

  const runReconcilePendingPaymentsJob = async () => {
    const metrics = {
      scanned: 0,
      finalized: 0,
      skippedNoReference: 0,
      failedChecks: 0,
    };
    if (!stripe) {
      return {
        jobId: 'reconcile_pending_payments',
        status: 'SKIPPED',
        message: t("backend.index.stripe_non_configure"),
        metrics,
      };
    }
    const pendingOrders = await prisma.order.findMany({
      where: {
        status: 'PENDING',
        paymentStatus: { not: 'completed' },
        stripeSessionId: { not: null },
      },
      select: {
        id: true,
        stripeSessionId: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    for (const order of pendingOrders) {
      const reference = toNonEmptyStringOrNull(order.stripeSessionId);
      if (!reference) {
        metrics.skippedNoReference += 1;
        continue;
      }
      metrics.scanned += 1;
      try {
        const paid = await isStripeReferencePaid(reference);
        if (!paid) {
          continue;
        }
        await finalizePaidOrder(order.id, 'job:reconcile_pending_payments');
        metrics.finalized += 1;
      } catch (error) {
        metrics.failedChecks += 1;
        console.error(`[automation][reconcile_pending_payments] order ${order.id}:`, error);
      }
    }
    return {
      jobId: 'reconcile_pending_payments',
      status: 'OK',
      message: `${metrics.finalized} commande(s) finalisee(s)`,
      metrics,
    };
  };

  const runSyncShippingTrackingJob = async () => {
    const metrics = {
      scanned: 0,
      synced: 0,
      transitioned: 0,
      failed: 0,
    };
    const boxtalConfigured = Boolean(process.env.BOXTAL_ACCESS_KEY && process.env.BOXTAL_SECRET_KEY);
    if (!boxtalConfigured) {
      return {
        jobId: 'sync_shipping_tracking',
        status: 'SKIPPED',
        message: t("backend.index.boxtal_non_configure"),
        metrics,
      };
    }
    const shipments = await prisma.shipment.findMany({
      where: {
        provider: 'BOXTAL',
        providerOrderId: { not: null },
        statusInternal: { notIn: ['DELIVERED', 'CANCELLED'] },
      },
      select: {
        id: true,
        providerOrderId: true,
      },
      orderBy: { updatedAt: 'asc' },
      take: 120,
    });
    for (const shipment of shipments) {
      const providerOrderId = toNonEmptyStringOrNull(shipment.providerOrderId);
      if (!providerOrderId) {
        continue;
      }
      metrics.scanned += 1;
      try {
        const tracking = await getShippingTracking(providerOrderId);
        const parsedTracking = parseBoxtalTrackingPayload(tracking);
        const synced = await syncShipmentTrackingFromPayload({
          shipmentId: shipment.id,
          providerStatus: parsedTracking.providerStatus,
          trackingNumber: parsedTracking.trackingNumber,
          trackingUrl: parsedTracking.trackingUrl,
          response: tracking,
          actorType: 'job',
          actorId: 'sync_shipping_tracking',
          reason: t("backend.index.synchronisation_automatique_tracking"),
        });
        metrics.synced += 1;
        metrics.transitioned += synced.orderSync.transitionedTo.length;
      } catch (error) {
        metrics.failed += 1;
        console.error(`[automation][sync_shipping_tracking] shipment ${shipment.id}:`, error);
      }
    }
    return {
      jobId: 'sync_shipping_tracking',
      status: 'OK',
      message: `${metrics.synced} expedition(s) synchronisee(s)`,
      metrics,
    };
  };

  const runAutoCancelPendingJob = async () => {
    const metrics = {
      scanned: 0,
      cancelled: 0,
      failed: 0,
    };
    const pendingExpiryHours = parsePositiveIntEnv('ORDER_PENDING_EXPIRY_HOURS', 24);
    const cutoff = new Date(Date.now() - pendingExpiryHours * 60 * 60 * 1000);
    const staleOrders = await prisma.order.findMany({
      where: {
        status: 'PENDING',
        paymentStatus: { not: 'completed' },
        createdAt: { lte: cutoff },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    for (const staleOrder of staleOrders) {
      metrics.scanned += 1;
      try {
        await transitionOrderStatus({
          orderId: staleOrder.id,
          toStatus: 'CANCELLED',
          reason: `Annulation automatique apres ${pendingExpiryHours}h sans paiement`,
          actorType: 'job',
          actorId: 'auto_cancel_pending',
        });
        metrics.cancelled += 1;
      } catch (error) {
        metrics.failed += 1;
        console.error(`[automation][auto_cancel_pending] order ${staleOrder.id}:`, error);
      }
    }
    return {
      jobId: 'auto_cancel_pending',
      status: 'OK',
      message: `${metrics.cancelled} commande(s) annulee(s)`,
      metrics,
    };
  };

  const runSlaWatchdogJob = async () => {
    const metrics = {
      scanned: 0,
      alerted: 0,
      skippedRecentNotification: 0,
      failed: 0,
    };
    const confirmedSlaHours = parsePositiveIntEnv('ORDER_SLA_CONFIRMED_HOURS', 24);
    const processingSlaHours = parsePositiveIntEnv('ORDER_SLA_PROCESSING_HOURS', 72);
    const confirmedCutoff = new Date(Date.now() - confirmedSlaHours * 60 * 60 * 1000);
    const processingCutoff = new Date(Date.now() - processingSlaHours * 60 * 60 * 1000);
    const staleOrders = await prisma.order.findMany({
      where: {
        OR: [
          { status: 'CONFIRMED', createdAt: { lte: confirmedCutoff } },
          { status: 'PROCESSING', createdAt: { lte: processingCutoff } },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    for (const staleOrder of staleOrders) {
      metrics.scanned += 1;
      try {
        const order = await getOrderForWorkflow(staleOrder.id);
        if (!order) {
          continue;
        }
        const status = toStatusOrNull(order.status);
        if (status !== 'CONFIRMED' && status !== 'PROCESSING') {
          continue;
        }
        const notificationType =
          status === 'CONFIRMED' ? 'ORDER_SLA_CONFIRMED' : 'ORDER_SLA_PROCESSING';
        if (await hasRecentNotification(order.id, notificationType, 12 * 60)) {
          metrics.skippedRecentNotification += 1;
          continue;
        }
        const elapsedHours = Math.floor((Date.now() - order.createdAt.getTime()) / (60 * 60 * 1000));
        await logOrderNotification({
          order,
          type: notificationType,
          channel: 'internal',
          payload: {
            orderNumber: order.orderNumber,
            status,
            elapsedHours,
            thresholdHours: status === 'CONFIRMED' ? confirmedSlaHours : processingSlaHours,
          },
        });
        metrics.alerted += 1;
      } catch (error) {
        metrics.failed += 1;
        console.error(`[automation][sla_watchdog] order ${staleOrder.id}:`, error);
      }
    }
    return {
      jobId: 'sla_watchdog',
      status: 'OK',
      message: `${metrics.alerted} alerte(s) SLA enregistree(s)`,
      metrics,
    };
  };

  const runProcessEmailOutboxJob = async () => {
    const metrics = await processEmailOutboxBatch(EMAIL_OUTBOX_BATCH_SIZE);
    return {
      jobId: 'process_email_outbox',
      status: 'OK',
      message: `${metrics.sent} email(s) envoye(s), ${metrics.retried} en retry`,
      metrics,
    };
  };

  const runEmailWelcomeLifecycleJob = async () => {
    const metrics = {
      scanned: 0,
      queued: 0,
      skipped: 0,
      failed: 0,
    };
    const customers = await prisma.$queryRaw`
      SELECT
        c."id",
        c."email",
        c."firstName",
        c."createdAt"
      FROM "Customer" c
      WHERE c."email" IS NOT NULL
      ORDER BY c."createdAt" DESC
      LIMIT 400
    `;
    const now = Date.now();
    for (const customer of Array.isArray(customers) ? customers : []) {
      metrics.scanned += 1;
      try {
        const email = toNonEmptyStringOrNull(customer.email);
        if (!email) {
          metrics.skipped += 1;
          continue;
        }
        const createdAt = new Date(customer.createdAt);
        if (Number.isNaN(createdAt.getTime())) {
          metrics.skipped += 1;
          continue;
        }
        const ageHours = (now - createdAt.getTime()) / (60 * 60 * 1000);
        if (ageHours >= 0 && ageHours <= 48) {
          const queued = await queueCampaignEmail({
            customerId: customer.id,
            recipient: email,
            firstName: customer.firstName,
            type: 'WELCOME_J0',
            campaignKey: `WELCOME_J0:${customer.id}`,
          });
          if (queued.queued) metrics.queued += 1;
          else metrics.skipped += 1;
        }
        if (ageHours >= 72) {
          const queued = await queueCampaignEmail({
            customerId: customer.id,
            recipient: email,
            firstName: customer.firstName,
            type: 'WELCOME_J3',
            campaignKey: `WELCOME_J3:${customer.id}`,
          });
          if (queued.queued) metrics.queued += 1;
          else metrics.skipped += 1;
        }
      } catch (error) {
        metrics.failed += 1;
        console.error(`[automation][email_welcome_lifecycle] customer ${customer.id}:`, error);
      }
    }
    return {
      jobId: 'email_welcome_lifecycle',
      status: 'OK',
      message: `${metrics.queued} campagne(s) welcome queued`,
      metrics,
    };
  };

  const runEmailAbandonedCartJob = async () => {
    const metrics = {
      scanned: 0,
      queued: 0,
      skipped: 0,
      failed: 0,
    };
    const carts = await prisma.$queryRaw`
      SELECT
        c."id",
        c."customerId",
        c."updatedAt",
        cu."email",
        cu."firstName"
      FROM "Cart" c
      JOIN "Customer" cu ON cu."id" = c."customerId"
      WHERE c."status" = 'ACTIVE'::"CartStatus"
        AND cu."email" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "CartItem" ci WHERE ci."cartId" = c."id"
        )
      ORDER BY c."updatedAt" ASC
      LIMIT 300
    `;
    const now = Date.now();
    for (const cart of Array.isArray(carts) ? carts : []) {
      metrics.scanned += 1;
      try {
        const email = toNonEmptyStringOrNull(cart.email);
        if (!email) {
          metrics.skipped += 1;
          continue;
        }
        const updatedAt = new Date(cart.updatedAt);
        if (Number.isNaN(updatedAt.getTime())) {
          metrics.skipped += 1;
          continue;
        }
        const elapsedHours = (now - updatedAt.getTime()) / (60 * 60 * 1000);
        if (elapsedHours < 1) {
          metrics.skipped += 1;
          continue;
        }
        const orderAfterCart = await prisma.$queryRaw`
          SELECT "id"
          FROM "Order"
          WHERE "customerId" = ${cart.customerId}
            AND "createdAt" > ${updatedAt}
            AND (
              "paymentStatus" = ${'completed'}
              OR "status" IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
            )
          LIMIT 1
        `;
        if (Array.isArray(orderAfterCart) && orderAfterCart.length > 0) {
          metrics.skipped += 1;
          continue;
        }
        if (elapsedHours >= 1 && elapsedHours < 24) {
          const queued = await queueCampaignEmail({
            customerId: cart.customerId,
            recipient: email,
            firstName: cart.firstName,
            cartId: cart.id,
            type: 'ABANDONED_CART_H1',
            campaignKey: `ABANDONED_CART_H1:${cart.id}`,
          });
          if (queued.queued) metrics.queued += 1;
          else metrics.skipped += 1;
        }
        if (elapsedHours >= 24) {
          const queued = await queueCampaignEmail({
            customerId: cart.customerId,
            recipient: email,
            firstName: cart.firstName,
            cartId: cart.id,
            type: 'ABANDONED_CART_H24',
            campaignKey: `ABANDONED_CART_H24:${cart.id}`,
          });
          if (queued.queued) metrics.queued += 1;
          else metrics.skipped += 1;
        }
      } catch (error) {
        metrics.failed += 1;
        console.error(`[automation][email_abandoned_cart] cart ${cart.id}:`, error);
      }
    }
    return {
      jobId: 'email_abandoned_cart',
      status: 'OK',
      message: `${metrics.queued} relance(s) panier queued`,
      metrics,
    };
  };

  const runEmailPostPurchaseJob = async () => {
    const metrics = {
      scanned: 0,
      queued: 0,
      skipped: 0,
      failed: 0,
    };
    const deliveredOrders = await prisma.$queryRaw`
      SELECT
        o."id" AS "orderId",
        o."orderNumber",
        o."customerId",
        c."email",
        c."firstName",
        MAX(h."createdAt") AS "deliveredAt"
      FROM "Order" o
      JOIN "Customer" c ON c."id" = o."customerId"
      JOIN "OrderStatusHistory" h ON h."orderId" = o."id" AND h."toStatus" = 'DELIVERED'
      WHERE c."email" IS NOT NULL
      GROUP BY o."id", o."orderNumber", o."customerId", c."email", c."firstName"
      ORDER BY MAX(h."createdAt") DESC
      LIMIT 400
    `;
    const now = Date.now();
    for (const row of Array.isArray(deliveredOrders) ? deliveredOrders : []) {
      metrics.scanned += 1;
      try {
        const email = toNonEmptyStringOrNull(row.email);
        if (!email) {
          metrics.skipped += 1;
          continue;
        }
        const deliveredAt = new Date(row.deliveredAt);
        if (Number.isNaN(deliveredAt.getTime())) {
          metrics.skipped += 1;
          continue;
        }
        const elapsedDays = (now - deliveredAt.getTime()) / (24 * 60 * 60 * 1000);
        if (elapsedDays >= 3) {
          const queued = await queueCampaignEmail({
            customerId: row.customerId,
            recipient: email,
            firstName: row.firstName,
            orderId: row.orderId,
            type: 'POST_PURCHASE_CROSSSELL_J3',
            campaignKey: `POST_PURCHASE_CROSSSELL_J3:${row.orderId}`,
          });
          if (queued.queued) metrics.queued += 1;
          else metrics.skipped += 1;
        }
        if (elapsedDays >= 7) {
          const queued = await queueCampaignEmail({
            customerId: row.customerId,
            recipient: email,
            firstName: row.firstName,
            orderId: row.orderId,
            type: 'POST_PURCHASE_REVIEW_J7',
            campaignKey: `POST_PURCHASE_REVIEW_J7:${row.orderId}`,
          });
          if (queued.queued) metrics.queued += 1;
          else metrics.skipped += 1;
        }
      } catch (error) {
        metrics.failed += 1;
        console.error(`[automation][email_post_purchase] order ${row.orderId}:`, error);
      }
    }
    return {
      jobId: 'email_post_purchase',
      status: 'OK',
      message: `${metrics.queued} email(s) post-achat queued`,
      metrics,
    };
  };

  const runEmailReorderRemindersJob = async () => {
    const metrics = {
      scanned: 0,
      queued: 0,
      skipped: 0,
      failed: 0,
    };
    const customers = await prisma.$queryRaw`
      SELECT
        c."id",
        c."email",
        c."firstName",
        MAX(h."createdAt") AS "lastDeliveredAt"
      FROM "Customer" c
      JOIN "Order" o ON o."customerId" = c."id"
      JOIN "OrderStatusHistory" h ON h."orderId" = o."id" AND h."toStatus" = 'DELIVERED'
      WHERE c."email" IS NOT NULL
      GROUP BY c."id", c."email", c."firstName"
      ORDER BY MAX(h."createdAt") DESC
      LIMIT 400
    `;
    const now = Date.now();
    for (const customer of Array.isArray(customers) ? customers : []) {
      metrics.scanned += 1;
      try {
        const email = toNonEmptyStringOrNull(customer.email);
        if (!email) {
          metrics.skipped += 1;
          continue;
        }
        const lastDeliveredAt = new Date(customer.lastDeliveredAt);
        if (Number.isNaN(lastDeliveredAt.getTime())) {
          metrics.skipped += 1;
          continue;
        }
        const hasRecentOrder = await prisma.$queryRaw`
          SELECT "id"
          FROM "Order"
          WHERE "customerId" = ${customer.id}
            AND "createdAt" > ${lastDeliveredAt}
            AND (
              "paymentStatus" = ${'completed'}
              OR "status" IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
            )
          LIMIT 1
        `;
        if (Array.isArray(hasRecentOrder) && hasRecentOrder.length > 0) {
          metrics.skipped += 1;
          continue;
        }
        const elapsedDays = (now - lastDeliveredAt.getTime()) / (24 * 60 * 60 * 1000);
        if (elapsedDays >= 21) {
          const queued = await queueCampaignEmail({
            customerId: customer.id,
            recipient: email,
            firstName: customer.firstName,
            type: 'REORDER_J21',
            campaignKey: `REORDER_J21:${customer.id}`,
          });
          if (queued.queued) metrics.queued += 1;
          else metrics.skipped += 1;
        }
        if (elapsedDays >= 35) {
          const queued = await queueCampaignEmail({
            customerId: customer.id,
            recipient: email,
            firstName: customer.firstName,
            type: 'REORDER_J35',
            campaignKey: `REORDER_J35:${customer.id}`,
          });
          if (queued.queued) metrics.queued += 1;
          else metrics.skipped += 1;
        }
      } catch (error) {
        metrics.failed += 1;
        console.error(`[automation][email_reorder_reminders] customer ${customer.id}:`, error);
      }
    }
    return {
      jobId: 'email_reorder_reminders',
      status: 'OK',
      message: `${metrics.queued} relance(s) reachat queued`,
      metrics,
    };
  };

  const runEmailWinbackJob = async () => {
    const metrics = {
      scanned: 0,
      queued: 0,
      skipped: 0,
      failed: 0,
    };
    const customers = await prisma.$queryRaw`
      SELECT
        c."id",
        c."email",
        c."firstName",
        MAX(o."createdAt") AS "lastOrderAt"
      FROM "Customer" c
      JOIN "Order" o ON o."customerId" = c."id"
      WHERE c."email" IS NOT NULL
        AND (
          o."paymentStatus" = ${'completed'}
          OR o."status" IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
        )
      GROUP BY c."id", c."email", c."firstName"
      ORDER BY MAX(o."createdAt") DESC
      LIMIT 400
    `;
    const now = Date.now();
    for (const customer of Array.isArray(customers) ? customers : []) {
      metrics.scanned += 1;
      try {
        const email = toNonEmptyStringOrNull(customer.email);
        if (!email) {
          metrics.skipped += 1;
          continue;
        }
        const lastOrderAt = new Date(customer.lastOrderAt);
        if (Number.isNaN(lastOrderAt.getTime())) {
          metrics.skipped += 1;
          continue;
        }
        const elapsedDays = (now - lastOrderAt.getTime()) / (24 * 60 * 60 * 1000);
        if (elapsedDays >= 45) {
          const queued = await queueCampaignEmail({
            customerId: customer.id,
            recipient: email,
            firstName: customer.firstName,
            type: 'WINBACK_45',
            campaignKey: `WINBACK_45:${customer.id}`,
          });
          if (queued.queued) metrics.queued += 1;
          else metrics.skipped += 1;
        }
        if (elapsedDays >= 90) {
          const queued = await queueCampaignEmail({
            customerId: customer.id,
            recipient: email,
            firstName: customer.firstName,
            type: 'WINBACK_90',
            campaignKey: `WINBACK_90:${customer.id}`,
          });
          if (queued.queued) metrics.queued += 1;
          else metrics.skipped += 1;
        }
      } catch (error) {
        metrics.failed += 1;
        console.error(`[automation][email_winback] customer ${customer.id}:`, error);
      }
    }
    return {
      jobId: 'email_winback',
      status: 'OK',
      message: `${metrics.queued} campagne(s) winback queued`,
      metrics,
    };
  };

  const AUTOMATION_JOB_HANDLERS = {
    reconcile_pending_payments: runReconcilePendingPaymentsJob,
    sync_shipping_tracking: runSyncShippingTrackingJob,
    auto_cancel_pending: runAutoCancelPendingJob,
    sla_watchdog: runSlaWatchdogJob,
    process_email_outbox: runProcessEmailOutboxJob,
    email_welcome_lifecycle: runEmailWelcomeLifecycleJob,
    email_abandoned_cart: runEmailAbandonedCartJob,
    email_post_purchase: runEmailPostPurchaseJob,
    email_reorder_reminders: runEmailReorderRemindersJob,
    email_winback: runEmailWinbackJob,
  };

  const executeAutomationJob = async (jobId, trigger) => {
    await ensureOrderWorkflowTables();
    const config = await getAutomationJobConfig(jobId);
    if (!config) {
      return {
        jobId,
        status: 'ERROR',
        message: t("backend.index.configuration_job_not_found"),
        metrics: {},
      };
    }
    if (trigger === 'scheduler' && !config.enabled) {
      return {
        jobId,
        status: 'SKIPPED',
        message: t("backend.index.job_desactive"),
        metrics: {},
      };
    }
    if (automationRuntime[jobId].running) {
      return {
        jobId,
        status: 'SKIPPED',
        message: t("backend.index.execution_deja_cours"),
        metrics: {},
      };
    }
    automationRuntime[jobId].running = true;
    await updateAutomationJobRunState({
      jobId,
      lastRunAt: config.lastRunAt,
      nextRunAt: config.nextRunAt,
      lastStatus: 'RUNNING',
      lastError: null,
    });
    try {
      const handler = AUTOMATION_JOB_HANDLERS[jobId];
      const result = await handler();
      const latestConfig = await getAutomationJobConfig(jobId);
      const intervalMs = clampAutomationIntervalMs(latestConfig.intervalMs || config.intervalMs);
      const nextRunAt = latestConfig.enabled ? new Date(Date.now() + intervalMs) : null;
      await updateAutomationJobRunState({
        jobId,
        lastRunAt: new Date(),
        nextRunAt,
        lastStatus: result.status,
        lastError: result.status === 'ERROR' ? result.message : null,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      console.error(`[automation][${jobId}]`, error);
      const latestConfig = await getAutomationJobConfig(jobId);
      const intervalMs = clampAutomationIntervalMs(latestConfig.intervalMs || config.intervalMs);
      const nextRunAt = latestConfig.enabled ? new Date(Date.now() + intervalMs) : null;
      await updateAutomationJobRunState({
        jobId,
        lastRunAt: new Date(),
        nextRunAt,
        lastStatus: 'ERROR',
        lastError: message,
      });
      return {
        jobId,
        status: 'ERROR',
        message,
        metrics: {},
      };
    } finally {
      automationRuntime[jobId].running = false;
    }
  };

  const scheduleAutomationJobs = async () => {
    await ensureOrderWorkflowTables();
    const configs = await listAutomationJobConfigs();
    const configById = new Map(configs.map((config) => [config.id, config]));
    for (const jobId of AUTOMATION_JOB_IDS) {
      clearAutomationJobTimer(jobId);
      const config = configById.get(jobId);
      if (!config || !config.enabled) {
        await setAutomationJobNextRunAt(jobId, null);
        continue;
      }
      const intervalMs = clampAutomationIntervalMs(config.intervalMs);
      if (intervalMs !== config.intervalMs) {
        await updateAutomationJobConfig({ jobId, intervalMs });
      }
      const nextRunAt = new Date(Date.now() + intervalMs);
      await setAutomationJobNextRunAt(jobId, nextRunAt);
      automationRuntime[jobId].timer = setInterval(() => {
        void executeAutomationJob(jobId, 'scheduler');
      }, intervalMs);
    }
  };

  const startAutomationScheduler = async () => {
    if (automationSchedulerStarted) {
      return;
    }
    automationSchedulerStarted = true;
    try {
      await scheduleAutomationJobs();
    } catch (error) {
      automationSchedulerStarted = false;
      throw error;
    }
  };

  return {
    clampAutomationIntervalMs,
    executeAutomationJob,
    getAutomationJobConfig,
    isAutomationJobId,
    listAutomationJobConfigs,
    scheduleAutomationJobs,
    serializeAutomationJobConfig,
    startAutomationScheduler,
    stopAutomationScheduler,
    updateAutomationJobConfig,
  };
}
