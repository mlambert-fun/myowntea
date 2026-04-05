// @ts-nocheck
export function createEmailService({
  EMAIL_OUTBOX_BATCH_SIZE,
  EMAIL_OUTBOX_MAX_ATTEMPTS,
  EMAIL_OUTBOX_RETRY_BASE_MINUTES,
  EMAIL_PROVIDER_NAME,
  EMAIL_REPLY_TO,
  PASSWORD_RESET_MAIL_FROM,
  WEB_BASE_URL,
  buildCustomerEmailTemplate,
  buildPasswordResetEmail,
  buildUnsubscribeUrl,
  ensureOrderWorkflowTables,
  normalizeEmail,
  nodemailer,
  prisma,
  t,
  toJsonObjectRecord,
  toNonEmptyStringOrNull,
  crypto,
}) {
  const buildSecurityEmailContent = (params) => {
    const firstName = toNonEmptyStringOrNull(params.firstName) || 'Bonjour';
    const accountUrl = `${WEB_BASE_URL}/account/edit`;
    if (params.type === 'ACCOUNT_EMAIL_CHANGED') {
      const newEmail = toNonEmptyStringOrNull(params.newEmail) || t("backend.index.address_email");
      const oldEmail = toNonEmptyStringOrNull(params.oldEmail) || t("backend.index.address_prev");
      const content = buildCustomerEmailTemplate({
        title: t("backend.index.alert_securite_account"),
        previewText: t("backend.index.address_email_login"),
        greeting: `${firstName},`,
        paragraphs: [t("backend.index.nous_confirmons_edit"), t("backend.index.vous_etes_pas")],
        infoRows: [
          { label: t("backend.index.ancien_email"), value: oldEmail },
          { label: t("backend.index.nouvel_email"), value: newEmail },
        ],
        ctaLabel: t("backend.index.verifier_my_account"),
        ctaUrl: accountUrl,
        footnote: t("backend.index.conseil_securite_mettez"),
        accentColor: '#C2410C',
      });
      return {
        subject: t("backend.index.email_account_summer"),
        text: content.text,
        html: content.html,
      };
    }
    const content = buildCustomerEmailTemplate({
      title: t("backend.index.alert_securite_account"),
      previewText: t("backend.index.password_summer_updated"),
      greeting: `${firstName},`,
      paragraphs: [
        t("backend.index.password_account_own"),
        t("backend.index.vous_etes_pas_2"),
      ],
      ctaLabel: t("backend.index.verifier_my_account"),
      ctaUrl: accountUrl,
      footnote: t("backend.index.vous_suspectez_acces"),
      accentColor: '#C2410C',
    });
    return {
      subject: t("backend.index.password_summer_updated"),
      text: content.text,
      html: content.html,
    };
  };

  const ensureEmailPreference = async (customerId) => {
    if (!customerId) {
      return null;
    }
    await ensureOrderWorkflowTables();
    await prisma.$executeRaw`
      INSERT INTO "EmailPreference" ("id", "customerId", "createdAt", "updatedAt")
      VALUES (${crypto.randomUUID()}, ${customerId}, NOW(), NOW())
      ON CONFLICT ("customerId") DO NOTHING
    `;
    const rows = await prisma.$queryRaw`
      SELECT
        "id",
        "customerId",
        "transactionalOptIn",
        "marketingOptIn",
        "abandonedCartOptIn",
        "postPurchaseOptIn",
        "reorderOptIn",
        "winbackOptIn",
        "createdAt",
        "updatedAt"
      FROM "EmailPreference"
      WHERE "customerId" = ${customerId}
      LIMIT 1
    `;
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  };

  const updateEmailPreference = async (customerId, updates) => {
    const existing = await ensureEmailPreference(customerId);
    if (!existing) {
      return null;
    }
    const data = {
      transactionalOptIn:
        updates.transactionalOptIn !== undefined
          ? Boolean(updates.transactionalOptIn)
          : Boolean(existing.transactionalOptIn),
      marketingOptIn:
        updates.marketingOptIn !== undefined
          ? Boolean(updates.marketingOptIn)
          : Boolean(existing.marketingOptIn),
      abandonedCartOptIn:
        updates.abandonedCartOptIn !== undefined
          ? Boolean(updates.abandonedCartOptIn)
          : Boolean(existing.abandonedCartOptIn),
      postPurchaseOptIn:
        updates.postPurchaseOptIn !== undefined
          ? Boolean(updates.postPurchaseOptIn)
          : Boolean(existing.postPurchaseOptIn),
      reorderOptIn:
        updates.reorderOptIn !== undefined
          ? Boolean(updates.reorderOptIn)
          : Boolean(existing.reorderOptIn),
      winbackOptIn:
        updates.winbackOptIn !== undefined
          ? Boolean(updates.winbackOptIn)
          : Boolean(existing.winbackOptIn),
    };
    await prisma.$executeRaw`
      UPDATE "EmailPreference"
      SET
        "transactionalOptIn" = ${data.transactionalOptIn},
        "marketingOptIn" = ${data.marketingOptIn},
        "abandonedCartOptIn" = ${data.abandonedCartOptIn},
        "postPurchaseOptIn" = ${data.postPurchaseOptIn},
        "reorderOptIn" = ${data.reorderOptIn},
        "winbackOptIn" = ${data.winbackOptIn},
        "updatedAt" = NOW()
      WHERE "customerId" = ${customerId}
    `;
    return ensureEmailPreference(customerId);
  };

  const upsertNewsletterSubscription = async (params) => {
    const email = normalizeEmail(params.email);
    if (!email) {
      return null;
    }
    await ensureOrderWorkflowTables();
    const status = params.status === 'UNSUBSCRIBED' ? 'UNSUBSCRIBED' : 'SUBSCRIBED';
    const marketingConsent = Boolean(params.marketingConsent);
    const source = toNonEmptyStringOrNull(params.source);
    const ipAddress = toNonEmptyStringOrNull(params.ipAddress);
    const userAgent = toNonEmptyStringOrNull(params.userAgent);
    const subscribedAt = status === 'SUBSCRIBED' ? new Date() : null;
    const unsubscribedAt = status === 'UNSUBSCRIBED' ? new Date() : null;
    await prisma.$executeRaw`
      INSERT INTO "NewsletterSubscription" (
        "id",
        "email",
        "status",
        "marketingConsent",
        "consentSource",
        "consentIp",
        "consentUserAgent",
        "subscribedAt",
        "unsubscribedAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${crypto.randomUUID()},
        ${email},
        ${status},
        ${marketingConsent},
        ${source},
        ${ipAddress},
        ${userAgent},
        ${subscribedAt},
        ${unsubscribedAt},
        NOW(),
        NOW()
      )
      ON CONFLICT ("email") DO UPDATE SET
        "status" = ${status},
        "marketingConsent" = ${marketingConsent},
        "consentSource" = ${source},
        "consentIp" = ${ipAddress},
        "consentUserAgent" = ${userAgent},
        "subscribedAt" = CASE WHEN ${status === 'SUBSCRIBED'} THEN NOW() ELSE "NewsletterSubscription"."subscribedAt" END,
        "unsubscribedAt" = CASE WHEN ${status === 'UNSUBSCRIBED'} THEN NOW() ELSE NULL END,
        "updatedAt" = NOW()
    `;
    const rows = await prisma.$queryRaw`
      SELECT
        "id",
        "email",
        "status",
        "marketingConsent",
        "consentSource",
        "consentIp",
        "consentUserAgent",
        "subscribedAt",
        "unsubscribedAt",
        "createdAt",
        "updatedAt"
      FROM "NewsletterSubscription"
      WHERE "email" = ${email}
      LIMIT 1
    `;
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  };

  const recordEmailConsentEvent = async (params) => {
    const email = normalizeEmail(params.email);
    if (!email) {
      return;
    }
    await ensureOrderWorkflowTables();
    const action = params.action === 'OPT_OUT' ? 'OPT_OUT' : 'OPT_IN';
    const source = toNonEmptyStringOrNull(params.source);
    const ipAddress = toNonEmptyStringOrNull(params.ipAddress);
    const userAgent = toNonEmptyStringOrNull(params.userAgent);
    const metadata = toJsonObjectRecord(params.metadata);
    await prisma.$executeRaw`
      INSERT INTO "EmailConsentEvent" (
        "id",
        "customerId",
        "email",
        "channel",
        "purpose",
        "action",
        "source",
        "legalBasis",
        "ipAddress",
        "userAgent",
        "metadata",
        "createdAt"
      )
      VALUES (
        ${crypto.randomUUID()},
        ${params.customerId || null},
        ${email},
        ${t("backend.index.email_2")},
        ${'MARKETING'},
        ${action},
        ${source},
        ${'CONSENT'},
        ${ipAddress},
        ${userAgent},
        CAST(${JSON.stringify(metadata)} AS jsonb),
        NOW()
      )
    `;
  };

  const syncCustomerMarketingPreferenceByEmail = async (params) => {
    const email = normalizeEmail(params.email);
    if (!email) {
      return null;
    }
    const customer = await prisma.customer.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!customer) {
      return null;
    }
    if (params.marketingOptIn) {
      await updateEmailPreference(customer.id, { marketingOptIn: true });
    } else {
      await updateEmailPreference(customer.id, {
        marketingOptIn: false,
        abandonedCartOptIn: false,
        postPurchaseOptIn: false,
        reorderOptIn: false,
        winbackOptIn: false,
      });
    }
    return customer;
  };

  let smtpTransporterPromise = null;

  const getSmtpTransporter = async () => {
    if (smtpTransporterPromise) {
      return smtpTransporterPromise;
    }
    const host = toNonEmptyStringOrNull(process.env.SMTP_HOST);
    const user = toNonEmptyStringOrNull(process.env.SMTP_USER);
    const pass = toNonEmptyStringOrNull(process.env.SMTP_PASS);
    const portRaw = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true';
    if (!host || !user || !pass) {
      smtpTransporterPromise = Promise.resolve(null);
      return smtpTransporterPromise;
    }
    const transporter = nodemailer.createTransport({
      host,
      port: Number.isFinite(portRaw) ? Math.round(portRaw) : 587,
      secure,
      auth: { user, pass },
    });
    smtpTransporterPromise = Promise.resolve(transporter);
    return smtpTransporterPromise;
  };

  const dispatchEmailNow = async (params) => {
    const transporter = await getSmtpTransporter();
    if (!transporter) {
      console.log(`[mail][fallback] to=${params.to} subject=${params.subject}`);
      return {
        provider: 'FALLBACK',
        messageId: null,
        response: 'fallback-log-only',
      };
    }
    const unsubscribeUrl = toNonEmptyStringOrNull(params.unsubscribeUrl);
    const mailOptions = {
      from: PASSWORD_RESET_MAIL_FROM,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
      ...(toNonEmptyStringOrNull(params.replyTo || EMAIL_REPLY_TO)
        ? { replyTo: toNonEmptyStringOrNull(params.replyTo || EMAIL_REPLY_TO) }
        : {}),
      ...(unsubscribeUrl
        ? {
            headers: {
              'List-Unsubscribe': `<${unsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }
        : {}),
    };
    const info = await transporter.sendMail(mailOptions);
    return {
      provider: EMAIL_PROVIDER_NAME,
      messageId: toNonEmptyStringOrNull(info.messageId),
      response: toNonEmptyStringOrNull(info.response),
    };
  };

  const queueEmailDelivery = async (params) => {
    await ensureOrderWorkflowTables();
    const id = crypto.randomUUID();
    const payload = {
      text: params.text || '',
      html: params.html || '',
      replyTo: toNonEmptyStringOrNull(params.replyTo || EMAIL_REPLY_TO),
      unsubscribeUrl: toNonEmptyStringOrNull(params.unsubscribeUrl),
      metadata: toJsonObjectRecord(params.metadata),
    };
    await prisma.$executeRaw`
      INSERT INTO "EmailDelivery" (
        "id",
        "customerId",
        "orderId",
        "campaignKey",
        "type",
        "channel",
        "recipient",
        "subject",
        "payload",
        "status",
        "provider",
        "attemptCount",
        "nextAttemptAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${id},
        ${params.customerId || null},
        ${params.orderId || null},
        ${params.campaignKey || null},
        ${params.type},
        ${t("backend.index.email_2")},
        ${params.recipient},
        ${params.subject},
        CAST(${JSON.stringify(payload)} AS jsonb),
        ${'PENDING'},
        ${EMAIL_PROVIDER_NAME},
        0,
        NOW(),
        NOW(),
        NOW()
      )
    `;
    return id;
  };

  const computeRetryDelayMinutes = (attemptCount) => {
    const safeAttempt = Math.max(1, Number(attemptCount || 1));
    const multiplier = Math.min(64, Math.pow(2, safeAttempt - 1));
    return EMAIL_OUTBOX_RETRY_BASE_MINUTES * multiplier;
  };

  const processEmailOutboxBatch = async (limit = EMAIL_OUTBOX_BATCH_SIZE) => {
    await ensureOrderWorkflowTables();
    const effectiveLimit = Math.max(
      1,
      Math.min(200, Math.round(Number(limit) || EMAIL_OUTBOX_BATCH_SIZE))
    );
    const rows = await prisma.$queryRaw`
      SELECT
        "id",
        "recipient",
        "subject",
        "payload",
        "attemptCount",
        "status",
        "campaignKey"
      FROM "EmailDelivery"
      WHERE "status" IN ('PENDING', 'RETRY')
        AND COALESCE("nextAttemptAt", NOW()) <= NOW()
        AND "attemptCount" < ${EMAIL_OUTBOX_MAX_ATTEMPTS}
      ORDER BY "createdAt" ASC
      LIMIT ${effectiveLimit}
    `;
    const metrics = {
      scanned: Array.isArray(rows) ? rows.length : 0,
      sent: 0,
      retried: 0,
      failed: 0,
      skippedLocked: 0,
    };
    for (const row of Array.isArray(rows) ? rows : []) {
      const lockCount = await prisma.$executeRaw`
        UPDATE "EmailDelivery"
        SET "status" = ${'PROCESSING'}, "updatedAt" = NOW()
        WHERE "id" = ${row.id}
          AND "status" IN ('PENDING', 'RETRY')
      `;
      if (!lockCount) {
        metrics.skippedLocked += 1;
        continue;
      }
      const payload = toJsonObjectRecord(row.payload);
      try {
        const result = await dispatchEmailNow({
          to: row.recipient,
          subject: row.subject,
          text: toNonEmptyStringOrNull(payload.text) || '',
          html: toNonEmptyStringOrNull(payload.html) || '',
          replyTo: toNonEmptyStringOrNull(payload.replyTo) || EMAIL_REPLY_TO,
          unsubscribeUrl: toNonEmptyStringOrNull(payload.unsubscribeUrl),
        });
        await prisma.$executeRaw`
          UPDATE "EmailDelivery"
          SET
            "status" = ${'SENT'},
            "provider" = ${result.provider || EMAIL_PROVIDER_NAME},
            "providerMessageId" = ${result.messageId || null},
            "error" = NULL,
            "attemptCount" = COALESCE("attemptCount", 0) + 1,
            "sentAt" = NOW(),
            "updatedAt" = NOW()
          WHERE "id" = ${row.id}
        `;
        metrics.sent += 1;
      } catch (error) {
        const attemptCount = Math.max(0, Number(row.attemptCount || 0)) + 1;
        const reachedMax = attemptCount >= EMAIL_OUTBOX_MAX_ATTEMPTS;
        const delayMinutes = computeRetryDelayMinutes(attemptCount);
        const nextAttemptAt = new Date(Date.now() + delayMinutes * 60 * 1000);
        const message = error instanceof Error ? error.message : String(error);
        await prisma.$executeRaw`
          UPDATE "EmailDelivery"
          SET
            "status" = ${reachedMax ? 'FAILED' : 'RETRY'},
            "error" = ${message},
            "attemptCount" = ${attemptCount},
            "nextAttemptAt" = ${reachedMax ? null : nextAttemptAt},
            "updatedAt" = NOW()
          WHERE "id" = ${row.id}
        `;
        if (reachedMax) {
          metrics.failed += 1;
        } else {
          metrics.retried += 1;
        }
      }
    }
    return metrics;
  };

  const listEmailDeliveries = async (params = {}) => {
    await ensureOrderWorkflowTables();
    const safePage = Math.max(1, Number(params.page || 1));
    const safePageSize = Math.min(200, Math.max(1, Number(params.pageSize || 50)));
    const offset = (safePage - 1) * safePageSize;
    const statusFilter = toNonEmptyStringOrNull(params.status);
    const typeFilter = toNonEmptyStringOrNull(params.type);
    const recipientFilter = toNonEmptyStringOrNull(params.recipient);
    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT
        d."id",
        d."customerId",
        d."orderId",
        d."campaignKey",
        d."type",
        d."channel",
        d."recipient",
        d."subject",
        d."status",
        d."provider",
        d."providerMessageId",
        d."error",
        d."attemptCount",
        d."nextAttemptAt",
        d."sentAt",
        d."createdAt",
        d."updatedAt",
        c."firstName" AS "customerFirstName",
        c."lastName" AS "customerLastName",
        c."email" AS "customerEmail",
        o."orderNumber" AS "orderNumber"
      FROM "EmailDelivery" d
      LEFT JOIN "Customer" c ON c."id" = d."customerId"
      LEFT JOIN "Order" o ON o."id" = d."orderId"
      WHERE ($1::text IS NULL OR d."status" = $1::text)
        AND ($2::text IS NULL OR d."type" = $2::text)
        AND ($3::text IS NULL OR d."recipient" ILIKE ('%' || $3::text || '%'))
      ORDER BY d."createdAt" DESC
      LIMIT $4 OFFSET $5
    `,
      statusFilter,
      typeFilter,
      recipientFilter,
      safePageSize,
      offset
    );
    const totalRows = await prisma.$queryRawUnsafe(
      `
      SELECT COUNT(*)::int AS "count"
      FROM "EmailDelivery" d
      WHERE ($1::text IS NULL OR d."status" = $1::text)
        AND ($2::text IS NULL OR d."type" = $2::text)
        AND ($3::text IS NULL OR d."recipient" ILIKE ('%' || $3::text || '%'))
    `,
      statusFilter,
      typeFilter,
      recipientFilter
    );
    const totalCount =
      Array.isArray(totalRows) && totalRows.length > 0 ? Number(totalRows[0].count || 0) : 0;
    return {
      page: safePage,
      pageSize: safePageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / safePageSize)),
      items: Array.isArray(rows) ? rows : [],
    };
  };

  const getEmailDeliveryById = async (id) => {
    await ensureOrderWorkflowTables();
    const rows = await prisma.$queryRaw`
      SELECT
        "id",
        "customerId",
        "orderId",
        "campaignKey",
        "type",
        "channel",
        "recipient",
        "subject",
        "payload",
        "status",
        "provider",
        "providerMessageId",
        "error",
        "attemptCount",
        "nextAttemptAt",
        "sentAt",
        "createdAt",
        "updatedAt"
      FROM "EmailDelivery"
      WHERE "id" = ${id}
      LIMIT 1
    `;
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  };

  const retryEmailDeliveryNow = async (id) => {
    await ensureOrderWorkflowTables();
    const row = await getEmailDeliveryById(id);
    if (!row) {
      throw new Error('EMAIL_NOT_FOUND');
    }
    await prisma.$executeRaw`
      UPDATE "EmailDelivery"
      SET
        "status" = ${'PROCESSING'},
        "error" = NULL,
        "nextAttemptAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "id" = ${id}
    `;
    const payload = toJsonObjectRecord(row.payload);
    const metrics = {
      scanned: 1,
      sent: 0,
      retried: 0,
      failed: 0,
      skippedLocked: 0,
    };
    try {
      const result = await dispatchEmailNow({
        to: row.recipient,
        subject: row.subject,
        text: toNonEmptyStringOrNull(payload.text) || '',
        html: toNonEmptyStringOrNull(payload.html) || '',
        replyTo: toNonEmptyStringOrNull(payload.replyTo) || EMAIL_REPLY_TO,
        unsubscribeUrl: toNonEmptyStringOrNull(payload.unsubscribeUrl),
      });
      await prisma.$executeRaw`
        UPDATE "EmailDelivery"
        SET
          "status" = ${'SENT'},
          "provider" = ${result.provider || EMAIL_PROVIDER_NAME},
          "providerMessageId" = ${result.messageId || null},
          "error" = NULL,
          "attemptCount" = COALESCE("attemptCount", 0) + 1,
          "sentAt" = NOW(),
          "updatedAt" = NOW()
        WHERE "id" = ${id}
      `;
      metrics.sent = 1;
    } catch (error) {
      const attemptCount = Math.max(0, Number(row.attemptCount || 0)) + 1;
      const reachedMax = attemptCount >= EMAIL_OUTBOX_MAX_ATTEMPTS;
      const delayMinutes = computeRetryDelayMinutes(attemptCount);
      const nextAttemptAt = new Date(Date.now() + delayMinutes * 60 * 1000);
      const message = error instanceof Error ? error.message : String(error);
      await prisma.$executeRaw`
        UPDATE "EmailDelivery"
        SET
          "status" = ${reachedMax ? 'FAILED' : 'RETRY'},
          "error" = ${message},
          "attemptCount" = ${attemptCount},
          "nextAttemptAt" = ${reachedMax ? null : nextAttemptAt},
          "updatedAt" = NOW()
        WHERE "id" = ${id}
      `;
      if (reachedMax) {
        metrics.failed = 1;
      } else {
        metrics.retried = 1;
      }
    }
    return { row: await getEmailDeliveryById(id), metrics };
  };

  const getMarketingPreferenceFieldByCampaignType = (campaignType) => {
    const normalized = String(campaignType || '').trim().toUpperCase();
    if (normalized.startsWith('ABANDONED_CART_')) return 'abandonedCartOptIn';
    if (normalized.startsWith('POST_PURCHASE_')) return 'postPurchaseOptIn';
    if (normalized.startsWith('REORDER_')) return 'reorderOptIn';
    if (normalized.startsWith('WINBACK_')) return 'winbackOptIn';
    return null;
  };

  const canSendMarketingEmail = async (customerId, campaignType) => {
    const preferences = await ensureEmailPreference(customerId);
    if (!preferences) {
      return true;
    }
    if (!preferences.marketingOptIn) {
      return false;
    }
    const field = getMarketingPreferenceFieldByCampaignType(campaignType);
    if (!field) {
      return Boolean(preferences.marketingOptIn);
    }
    return Boolean(preferences[field]);
  };

  const reserveCampaignLog = async (params) => {
    await ensureOrderWorkflowTables();
    const rows = await prisma.$queryRaw`
      INSERT INTO "EmailCampaignLog" (
        "id",
        "customerId",
        "orderId",
        "cartId",
        "campaignKey",
        "emailDeliveryId",
        "createdAt"
      )
      VALUES (
        ${crypto.randomUUID()},
        ${params.customerId},
        ${params.orderId || null},
        ${params.cartId || null},
        ${params.campaignKey},
        NULL,
        NOW()
      )
      ON CONFLICT ("customerId", "campaignKey") DO NOTHING
      RETURNING "id"
    `;
    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }
    return rows[0].id || null;
  };

  const buildMarketingEmailContent = (params) => {
    const firstName = toNonEmptyStringOrNull(params.firstName) || 'Bonjour';
    const shopUrl = `${WEB_BASE_URL}/creations`;
    const cartUrl = `${WEB_BASE_URL}/cart`;
    const accountOrdersUrl = `${WEB_BASE_URL}/account/orders`;
    const orderId =
      toNonEmptyStringOrNull(params.payload?.orderId) || toNonEmptyStringOrNull(params.orderId);
    const orderUrl = orderId ? `${WEB_BASE_URL}/account/order/${orderId}` : accountOrdersUrl;
    const type = String(params.type || '').toUpperCase();
    const templates = {
      WELCOME_J0: {
        subject: 'Bienvenue chez My Own Tea',
        title: t("backend.index.welcome_atelier_infusion"),
        previewText: t("backend.index.create_first_infusion"),
        paragraphs: [
          "Merci d'avoir rejoint My Own Tea.",
          t("backend.index.composez_first_infusion"),
        ],
        ctaLabel: t("backend.index.commencer_my_blend"),
        ctaUrl: shopUrl,
      },
      WELCOME_J3: {
        subject: t("backend.index.besoin_idees_infusion"),
        title: t("backend.index.inspirations_bien_commencer"),
        previewText: t("backend.index.idees_simples_create"),
        paragraphs: [t("backend.index.vous_pouvez_partir"), t("backend.index.atelier_vous_guide")],
        ctaLabel: t("backend.index.view_inspirations"),
        ctaUrl: shopUrl,
      },
      ABANDONED_CART_H1: {
        subject: t("backend.index.cart_vous_attend"),
        title: t("backend.index.selection_toujours_available"),
        previewText: t("backend.index.reprenez_order_clic"),
        paragraphs: [t("backend.index.vous_avez_laisse"), t("backend.index.ils_encore_available")],
        ctaLabel: t("backend.index.reprendre_my_cart"),
        ctaUrl: cartUrl,
      },
      ABANDONED_CART_H24: {
        subject: t("backend.index.dernier_rappel_finalisez"),
        title: t("backend.index.cart_pret"),
        previewText: t("backend.index.finalisez_order_avant"),
        paragraphs: [t("backend.index.cart_toujours_attente"), t("backend.index.finalisez_order_recevoir")],
        ctaLabel: t("backend.index.finaliser_my_order"),
        ctaUrl: cartUrl,
      },
      POST_PURCHASE_CROSSSELL_J3: {
        subject: t("backend.index.nouvelles_idees_accompagner"),
        title: t("backend.index.prolongez_experience"),
        previewText: t("backend.index.decouvrez_suggestions_adaptees"),
        paragraphs: [
          t("backend.index.please_last_order"),
          t("backend.index.decouvrez_idees_complementaires"),
        ],
        ctaLabel: t("backend.index.view_suggestions"),
        ctaUrl: shopUrl,
      },
      POST_PURCHASE_REVIEW_J7: {
        subject: t("backend.index.avis_account_nous"),
        title: t("backend.index.comment_passee_degustation"),
        previewText: t("backend.index.back_nous_aide"),
        paragraphs: [
          t("backend.index.feedback_precieux_faire"),
          t("backend.index.partagez_back_order"),
        ],
        ctaLabel: t("backend.index.donner_my_avis"),
        ctaUrl: orderUrl,
      },
      REORDER_J21: {
        subject: t("backend.index.peut_temps_refaire"),
        title: t("backend.index.reassort_quelques_clics"),
        previewText: t("backend.index.retrouvez_flavors_preferees"),
        paragraphs: [
          t("backend.index.infusions_preferees_peut"),
          t("backend.index.relancez_facilement_new"),
        ],
        ctaLabel: 'Recommander',
        ctaUrl: shopUrl,
      },
      REORDER_J35: {
        subject: t("backend.index.reassort_infusion_rappel"),
        title: t("backend.index.next_reassort_pret"),
        previewText: t("backend.index.restez_toujours_approvisionne"),
        paragraphs: [
          t("backend.index.nous_vous_rappelons"),
          t("backend.index.conservez_routine_infusion"),
        ],
        ctaLabel: 'Commander maintenant',
        ctaUrl: shopUrl,
      },
      WINBACK_45: {
        subject: t("backend.index.nous_aimerions_vous"),
        title: t("backend.index.nouveautes_vous_attendent"),
        previewText: t("backend.index.revenez_decouvrir_latest"),
        paragraphs: [t("backend.index.cela_fait_moment"), t("backend.index.revenez_explorer_nouveautes")],
        ctaLabel: t("backend.index.revenir_store"),
        ctaUrl: shopUrl,
      },
      WINBACK_90: {
        subject: t("backend.index.toujours_interesse_own"),
        title: t("backend.index.serait_ravis_vous"),
        previewText: t("backend.index.retrouvez_rituels_infusion"),
        paragraphs: [t("backend.index.nous_serions_heureux"), t("backend.index.retrouvez_favoris_composez")],
        ctaLabel: t("backend.index.revenir_store"),
        ctaUrl: shopUrl,
      },
      DEFAULT: {
        subject: t("backend.index.nouvelles_own_tea"),
        title: 'Nouvelles inspirations infusion',
        previewText: t("backend.index.decouvrez_latest_nouveautes"),
        paragraphs: [t("backend.index.retrouvez_latest_nouveautes")],
        ctaLabel: t("backend.index.view_store"),
        ctaUrl: shopUrl,
      },
    };
    const selected = templates[type] || templates.DEFAULT;
    const content = buildCustomerEmailTemplate({
      title: selected.title,
      previewText: selected.previewText,
      greeting: `${firstName},`,
      paragraphs: selected.paragraphs,
      ctaLabel: selected.ctaLabel,
      ctaUrl: selected.ctaUrl,
      footnote: t("backend.index.vous_recevez_email"),
      unsubscribeUrl: params.unsubscribeUrl || null,
    });
    return {
      subject: selected.subject,
      text: content.text,
      html: content.html,
    };
  };

  const queueCampaignEmail = async (params) => {
    const customerId = toNonEmptyStringOrNull(params.customerId);
    const recipient = toNonEmptyStringOrNull(params.recipient);
    const campaignType = toNonEmptyStringOrNull(params.type);
    const campaignKey = toNonEmptyStringOrNull(params.campaignKey);
    if (!customerId || !recipient || !campaignType || !campaignKey) {
      return { queued: false, reason: 'INVALID_INPUT' };
    }
    const allowed = await canSendMarketingEmail(customerId, campaignType);
    if (!allowed) {
      return { queued: false, reason: 'PREFERENCE_BLOCKED' };
    }
    const logId = await reserveCampaignLog({
      customerId,
      orderId: params.orderId || null,
      cartId: params.cartId || null,
      campaignKey,
    });
    if (!logId) {
      return { queued: false, reason: 'ALREADY_SENT' };
    }
    const unsubscribeUrl = buildUnsubscribeUrl(customerId, recipient);
    const content = buildMarketingEmailContent({
      type: campaignType,
      firstName: params.firstName,
      orderId: params.orderId || null,
      payload: params.payload || {},
      unsubscribeUrl,
    });
    const deliveryId = await queueEmailDelivery({
      customerId,
      orderId: params.orderId || null,
      campaignKey,
      type: campaignType,
      recipient,
      subject: content.subject,
      text: content.text,
      html: content.html,
      unsubscribeUrl,
      metadata: {
        source: 'campaign',
        campaignKey,
        campaignType,
        logId,
      },
    });
    await prisma.$executeRaw`
      UPDATE "EmailCampaignLog"
      SET "emailDeliveryId" = ${deliveryId}
      WHERE "id" = ${logId}
    `;
    return { queued: true, deliveryId, logId };
  };

  const sendPasswordResetEmail = async (params) => {
    const emailContent = buildPasswordResetEmail({
      firstName: params.firstName,
      resetUrl: params.resetUrl,
    });
    const deliveryId = await queueEmailDelivery({
      customerId: params.customerId || null,
      orderId: null,
      campaignKey: null,
      type: 'PASSWORD_RESET',
      to: params.to,
      recipient: params.to,
      subject: t("backend.index.reinitialisation_password_own"),
      text: emailContent.text,
      html: emailContent.html,
      replyTo: EMAIL_REPLY_TO,
      metadata: {
        source: 'forgot_password',
        resetUrl: params.resetUrl,
      },
    });
    const sendResult = await retryEmailDeliveryNow(deliveryId);
    const delivery = sendResult.row;
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[mail][password-reset][sent] to=${params.to} status=${delivery?.status || 'unknown'} sent=${sendResult.metrics.sent}`
      );
    }
  };

  return {
    buildMarketingEmailContent,
    buildSecurityEmailContent,
    canSendMarketingEmail,
    ensureEmailPreference,
    listEmailDeliveries,
    processEmailOutboxBatch,
    queueCampaignEmail,
    queueEmailDelivery,
    recordEmailConsentEvent,
    retryEmailDeliveryNow,
    sendPasswordResetEmail,
    syncCustomerMarketingPreferenceByEmail,
    updateEmailPreference,
    upsertNewsletterSubscription,
  };
}
