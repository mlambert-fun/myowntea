// @ts-nocheck
export function registerPublicSystemRoutes(app, deps) {
  const {
    ADMIN_BASE_URL,
    buildCustomerEmailTemplate,
    ensureOrderWorkflowTables,
    escapeHtml,
    normalizeEmail,
    prisma,
    queueEmailDelivery,
    recordEmailConsentEvent,
    resolveRedirectByRequest,
    resolveRequestIp,
    retryEmailDeliveryNow,
    syncCustomerMarketingPreferenceByEmail,
    t,
    toNonEmptyStringOrNull,
    updateEmailPreference,
    upsertNewsletterSubscription,
    verifyUnsubscribeToken,
  } = deps;

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/redirects/resolve', async (req, res) => {
    try {
      const decision = await resolveRedirectByRequest(req);
      return res.json(decision);
    } catch (error) {
      console.error('Error resolving redirect:', error);
      return res.status(500).json({ error: 'Failed to resolve redirect' });
    }
  });

  app.get('/api/email/unsubscribe', async (req, res) => {
    try {
      const rawToken = typeof req.query.unsubscribe === 'string'
        ? req.query.unsubscribe
        : (typeof req.query.token === 'string' ? req.query.token : null);
      const decoded = verifyUnsubscribeToken(rawToken);
      if (!decoded) {
        return res.status(400).send('<h1>Lien de desinscription invalide.</h1>');
      }

      const customer = await prisma.customer.findUnique({
        where: { id: decoded.customerId },
        select: { id: true, email: true },
      });
      const customerEmail = normalizeEmail(customer?.email);
      if (!customer || !customerEmail || customerEmail !== normalizeEmail(decoded.email)) {
        return res.status(404).send('<h1>Compte introuvable.</h1>');
      }

      const requestIp = resolveRequestIp(req);
      const userAgent = toNonEmptyStringOrNull(req.header('user-agent'));

      await updateEmailPreference(customer.id, {
        marketingOptIn: false,
        abandonedCartOptIn: false,
        postPurchaseOptIn: false,
        reorderOptIn: false,
        winbackOptIn: false,
      });
      await upsertNewsletterSubscription({
        email: customerEmail,
        status: 'UNSUBSCRIBED',
        marketingConsent: false,
        source: 'UNSUBSCRIBE_LINK',
        ipAddress: requestIp,
        userAgent,
      });
      await recordEmailConsentEvent({
        customerId: customer.id,
        email: customerEmail,
        action: 'OPT_OUT',
        source: 'UNSUBSCRIBE_LINK',
        ipAddress: requestIp,
        userAgent,
        metadata: { via: 'token_link' },
      });

      return res.send('<h1>Vous etes desinscrit(e) des emails marketing.</h1><p>Les emails transactionnels resteront actifs.</p>');
    } catch (error) {
      console.error('Unsubscribe error:', error);
      return res.status(500).send('<h1>Erreur de desinscription.</h1>');
    }
  });

  app.post('/api/newsletter/subscribe', async (req, res) => {
    try {
      await ensureOrderWorkflowTables();
      const email = normalizeEmail(req.body?.email);
      const consent = req.body?.consent === true;
      const source = toNonEmptyStringOrNull(req.body?.source) || 'FOOTER_NEWSLETTER';
      const consentVersion = toNonEmptyStringOrNull(req.body?.consentVersion);

      if (!email) {
        return res.status(400).json({ error: t("backend.index.email_required_2") });
      }
      if (!consent) {
        return res.status(400).json({ error: t("backend.index.consentement_required_signup") });
      }

      const requestIp = resolveRequestIp(req);
      const userAgent = toNonEmptyStringOrNull(req.header('user-agent'));
      const existingRows = await prisma.$queryRaw`
      SELECT "status"
      FROM "NewsletterSubscription"
      WHERE "email" = ${email}
      LIMIT 1
    `;
      const existingStatus = Array.isArray(existingRows) && existingRows.length > 0
        ? String(existingRows[0]?.status || '').toUpperCase()
        : null;

      const customer = await syncCustomerMarketingPreferenceByEmail({
        email,
        marketingOptIn: true,
      });

      await upsertNewsletterSubscription({
        email,
        status: 'SUBSCRIBED',
        marketingConsent: true,
        source,
        ipAddress: requestIp,
        userAgent,
      });
      await recordEmailConsentEvent({
        customerId: customer?.id || null,
        email,
        action: 'OPT_IN',
        source,
        ipAddress: requestIp,
        userAgent,
        metadata: {
          consentVersion: consentVersion || 'v1',
          via: 'footer_form',
        },
      });

      return res.status(existingStatus === 'SUBSCRIBED' ? 200 : 201).json({
        ok: true,
        status: 'SUBSCRIBED',
        alreadySubscribed: existingStatus === 'SUBSCRIBED',
        message: existingStatus === 'SUBSCRIBED'
          ? t("backend.index.vous_etes_deja") : t("backend.index.signup_newsletter_confirmed"),
      });
    } catch (error) {
      console.error('Newsletter subscribe error:', error);
      return res.status(500).json({ error: t("backend.index.failed_save_signup") });
    }
  });

  app.post('/api/newsletter/unsubscribe', async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const source = toNonEmptyStringOrNull(req.body?.source) || 'FOOTER_NEWSLETTER';

      if (!email) {
        return res.status(400).json({ error: t("backend.index.email_required_2") });
      }

      const requestIp = resolveRequestIp(req);
      const userAgent = toNonEmptyStringOrNull(req.header('user-agent'));
      const customer = await syncCustomerMarketingPreferenceByEmail({
        email,
        marketingOptIn: false,
      });

      await upsertNewsletterSubscription({
        email,
        status: 'UNSUBSCRIBED',
        marketingConsent: false,
        source,
        ipAddress: requestIp,
        userAgent,
      });
      await recordEmailConsentEvent({
        customerId: customer?.id || null,
        email,
        action: 'OPT_OUT',
        source,
        ipAddress: requestIp,
        userAgent,
        metadata: {
          via: 'footer_form',
        },
      });

      return res.json({
        ok: true,
        status: 'UNSUBSCRIBED',
        message: t("backend.index.desinscription_prise_account"),
      });
    } catch (error) {
      console.error('Newsletter unsubscribe error:', error);
      return res.status(500).json({ error: t("backend.index.failed_save_desinscription") });
    }
  });

  app.post('/api/contact', async (req, res) => {
    try {
      const fullName = toNonEmptyStringOrNull(req.body?.fullName);
      const email = toNonEmptyStringOrNull(req.body?.email);
      const subject = toNonEmptyStringOrNull(req.body?.subject);
      const orderNumber = toNonEmptyStringOrNull(req.body?.orderNumber);
      const message = toNonEmptyStringOrNull(req.body?.message);
      const source = toNonEmptyStringOrNull(req.body?.source) || 'CONTACT_PAGE';

      if (!fullName || !email || !subject || !message) {
        return res.status(400).json({ error: t("backend.index.contact_invalid_payload") });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: t("backend.index.contact_invalid_email") });
      }
      if (message.trim().length < 10) {
        return res.status(400).json({ error: t("backend.index.contact_message_too_short") });
      }

      const supportEmail = toNonEmptyStringOrNull(process.env.CONTACT_EMAIL) || 'contact@myowntea.fr';
      const detailsHtml = `
          <div style="margin:16px 0 0 0;padding:14px 16px;border:1px solid #E5E0D5;border-radius:12px;background:#FAF8F3;color:#374151;font-size:14px;line-height:1.7;">
            ${escapeHtml(message).replace(/\n/g, '<br />')}
          </div>
        `;
      const emailContent = buildCustomerEmailTemplate({
        title: t("backend.index.contact_new_message"),
        greeting: t("backend.index.contact_team_hello"),
        paragraphs: [t("backend.index.contact_message_from_form")],
        infoRows: [
          { label: t("backend.index.contact_full_name"), value: fullName },
          { label: t("backend.index.contact_email"), value: email },
          { label: t("backend.index.contact_subject"), value: subject },
          ...(orderNumber ? [{ label: t("backend.index.contact_order_number"), value: orderNumber }] : []),
          { label: t("backend.index.contact_source"), value: source },
        ],
        detailsHtml,
        detailsTextLines: [message],
        footnote: t("backend.index.contact_reply_directly"),
      });

      const deliveryId = await queueEmailDelivery({
        customerId: null,
        orderId: null,
        campaignKey: null,
        type: 'CONTACT_FORM',
        recipient: supportEmail,
        subject: `${t("backend.index.contact_email_prefix")} ${subject}`,
        text: emailContent.text,
        html: emailContent.html,
        replyTo: email,
        metadata: {
          source,
          fullName,
          email,
          subject,
          orderNumber: orderNumber || null,
        },
      });

      await retryEmailDeliveryNow(deliveryId);
      return res.json({ ok: true, message: t("backend.index.contact_message_sent") });
    } catch (error) {
      console.error('Contact form error:', error);
      return res.status(500).json({ error: t("backend.index.contact_send_failed") });
    }
  });

  app.get('/', (_req, res) => {
    res.redirect(`${ADMIN_BASE_URL}/login`);
  });
}
