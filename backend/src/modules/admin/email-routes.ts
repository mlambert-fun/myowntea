// @ts-nocheck
export function registerAdminEmailRoutes(app, deps) {
  const {
    buildCustomerEmailTemplate,
    buildMarketingEmailContent,
    buildOrderNotificationEmailContent,
    buildPasswordResetEmail,
    buildSecurityEmailContent,
    crypto,
    ensureOrderWorkflowTables,
    listEmailDeliveries,
    normalizeEmail,
    prisma,
    queueEmailDelivery,
    resolveResetPasswordUrl,
    retryEmailDeliveryNow,
    t,
    toNonEmptyStringOrNull,
    WEB_BASE_URL,
  } = deps;

  app.get('/api/admin/emails', async (req, res) => {
    try {
      const page = Number(req.query.page || 1);
      const pageSize = Number(req.query.pageSize || 50);
      const status = typeof req.query.status === 'string' ? req.query.status : null;
      const type = typeof req.query.type === 'string' ? req.query.type : null;
      const recipient = typeof req.query.recipient === 'string' ? req.query.recipient : null;
      const data = await listEmailDeliveries({
        page,
        pageSize,
        status,
        type,
        recipient,
      });
      res.json(data);
    } catch (error) {
      console.error('Error fetching email deliveries:', error);
      res.status(500).json({ error: 'Failed to fetch email deliveries' });
    }
  });

  app.get('/api/admin/emails/metrics', async (req, res) => {
    try {
      await ensureOrderWorkflowTables();
      const days = Math.max(1, Math.min(365, Number(req.query.days || 30)));
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const aggregates = await prisma.$queryRaw`
      SELECT
        COUNT(*)::int AS "total",
        COUNT(*) FILTER (WHERE "status" = 'SENT')::int AS "sent",
        COUNT(*) FILTER (WHERE "status" = 'FAILED')::int AS "failed",
        COUNT(*) FILTER (WHERE "status" = 'RETRY')::int AS "retry",
        COUNT(*) FILTER (WHERE "status" = 'PENDING')::int AS "pending"
      FROM "EmailDelivery"
      WHERE "createdAt" >= ${cutoff}
    `;
      const campaignBreakdown = await prisma.$queryRaw`
      SELECT
        "type",
        COUNT(*)::int AS "total",
        COUNT(*) FILTER (WHERE "status" = 'SENT')::int AS "sent",
        COUNT(*) FILTER (WHERE "status" = 'FAILED')::int AS "failed"
      FROM "EmailDelivery"
      WHERE "createdAt" >= ${cutoff}
        AND "campaignKey" IS NOT NULL
      GROUP BY "type"
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `;
      const conversionRows = await prisma.$queryRaw`
      SELECT
        COUNT(DISTINCT l."id")::int AS "touches",
        COUNT(DISTINCT o."id")::int AS "conversions",
        COALESCE(SUM(o."totalCents"), 0)::bigint AS "revenueCents"
      FROM "EmailCampaignLog" l
      LEFT JOIN "Order" o
        ON o."customerId" = l."customerId"
       AND o."createdAt" > l."createdAt"
       AND o."createdAt" <= (l."createdAt" + INTERVAL '7 days')
       AND (
         o."paymentStatus" = 'completed'
         OR o."status" IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
       )
      WHERE l."createdAt" >= ${cutoff}
    `;
      const summary = Array.isArray(aggregates) && aggregates.length > 0 ? aggregates[0] : {
        total: 0,
        sent: 0,
        failed: 0,
        retry: 0,
        pending: 0,
      };
      const conversion = Array.isArray(conversionRows) && conversionRows.length > 0 ? conversionRows[0] : {
        touches: 0,
        conversions: 0,
        revenueCents: 0,
      };
      res.json({
        days,
        summary: {
          total: Number(summary.total || 0),
          sent: Number(summary.sent || 0),
          failed: Number(summary.failed || 0),
          retry: Number(summary.retry || 0),
          pending: Number(summary.pending || 0),
        },
        conversion: {
          touches: Number(conversion.touches || 0),
          conversions: Number(conversion.conversions || 0),
          conversionRate: Number(conversion.touches || 0) > 0
            ? Number(conversion.conversions || 0) / Number(conversion.touches || 1)
            : 0,
          revenueCents: Number(conversion.revenueCents || 0),
        },
        campaigns: Array.isArray(campaignBreakdown) ? campaignBreakdown : [],
      });
    } catch (error) {
      console.error('Error fetching email metrics:', error);
      res.status(500).json({ error: 'Failed to fetch email metrics' });
    }
  });

  app.post('/api/admin/emails/test', async (req, res) => {
    try {
      const to = normalizeEmail(req.body?.to);
      if (!to) {
        return res.status(400).json({ error: 'Valid "to" email is required' });
      }

      const firstName = toNonEmptyStringOrNull(req.body?.firstName) || 'Bonjour';
      const requestedTemplateType = String(toNonEmptyStringOrNull(req.body?.templateType) || '').trim().toUpperCase();
      const requestedSubject = toNonEmptyStringOrNull(req.body?.subject);
      const marketingTypes = new Set([
        'WELCOME_J0',
        'WELCOME_J3',
        'ABANDONED_CART_H1',
        'ABANDONED_CART_H24',
        'POST_PURCHASE_CROSSSELL_J3',
        'POST_PURCHASE_REVIEW_J7',
        'REORDER_J21',
        'REORDER_J35',
        'WINBACK_45',
        'WINBACK_90',
      ]);

      let content = null;
      let subject = requestedSubject || t("backend.index.email_test_own");
      if (requestedTemplateType === 'PASSWORD_RESET') {
        const resetUrl = toNonEmptyStringOrNull(req.body?.resetUrl) || resolveResetPasswordUrl(crypto.randomBytes(24).toString('hex'));
        content = buildPasswordResetEmail({
          firstName,
          resetUrl,
        });
        subject = requestedSubject || t("backend.index.reinitialisation_password_own");
      } else if (requestedTemplateType === 'ACCOUNT_PASSWORD_CHANGED' || requestedTemplateType === 'ACCOUNT_EMAIL_CHANGED') {
        content = buildSecurityEmailContent({
          type: requestedTemplateType,
          firstName,
          oldEmail: req.body?.oldEmail || 'ancien@example.com',
          newEmail: req.body?.newEmail || to,
        });
        subject = requestedSubject || content.subject;
      } else if (requestedTemplateType.startsWith('ORDER_')) {
        const fakeOrder = {
          id: 'test-order-id',
          orderNumber: 'ORD-TEST-EMAIL',
          status: requestedTemplateType.replace(/^ORDER_/, ''),
          totalCents: Number.isFinite(Number(req.body?.totalCents)) ? Number(req.body.totalCents) : 3290,
          trackingUrl: toNonEmptyStringOrNull(req.body?.trackingUrl) || null,
          customer: { firstName },
          items: [
            {
              snapshot: { title: 'Infusion Signature' },
              qty: 1,
              lineTotalCents: 3290,
            },
          ],
        };
        content = buildOrderNotificationEmailContent({
          type: requestedTemplateType,
          order: fakeOrder,
        });
        subject = requestedSubject || content.subject;
      } else if (marketingTypes.has(requestedTemplateType)) {
        content = buildMarketingEmailContent({
          type: requestedTemplateType,
          firstName,
          payload: {},
          unsubscribeUrl: null,
        });
        subject = requestedSubject || content.subject;
      } else {
        const genericContent = buildCustomerEmailTemplate({
          title: t("backend.index.email_test_new"),
          previewText: t("backend.index.verification_rendu_email"),
          greeting: `${firstName},`,
          paragraphs: [
            t("backend.index.ceci_email_test"),
            t("backend.index.utilise_new_template"),
          ],
          ctaLabel: t("backend.index.view_store"),
          ctaUrl: `${WEB_BASE_URL}/creations`,
          footnote: t("backend.index.message_envoye_fins"),
        });
        content = { subject: requestedSubject || t("backend.index.email_test_own"), text: genericContent.text, html: genericContent.html };
        subject = requestedSubject || t("backend.index.email_test_own");
      }

      const deliveryId = await queueEmailDelivery({
        customerId: null,
        orderId: null,
        campaignKey: null,
        type: 'ADMIN_TEST_EMAIL',
        recipient: to,
        subject,
        text: content.text,
        html: content.html,
        metadata: {
          source: 'admin_test',
          templateType: requestedTemplateType || 'GENERIC',
        },
      });
      const result = await retryEmailDeliveryNow(deliveryId);
      res.json({
        delivery: result.row,
        metrics: result.metrics,
        templateType: requestedTemplateType || 'GENERIC',
      });
    } catch (error) {
      console.error('Error sending admin test email:', error);
      res.status(500).json({ error: 'Failed to send test email' });
    }
  });

  app.post('/api/admin/emails/:id/resend', async (req, res) => {
    try {
      const id = req.params.id;
      const payload = await retryEmailDeliveryNow(id);
      res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'EMAIL_NOT_FOUND') {
        return res.status(404).json({ error: 'Email delivery not found' });
      }
      console.error('Error retrying email delivery:', error);
      res.status(500).json({ error: 'Failed to resend email' });
    }
  });
}
