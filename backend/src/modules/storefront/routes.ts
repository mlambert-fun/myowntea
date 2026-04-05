// @ts-nocheck
export function registerStorefrontRoutes(app, deps) {
  const {
    crypto,
    extractShippingSelection,
    getAllowedShippingCountries,
    getParcelPoints,
    isShippingCountryAllowed,
    normalizeShippingOfferCode,
    normalizeShippingOfferId,
    normalizeStoreContactField,
    prisma,
    resolveBoxtalQuoteSelection,
    resolveOrderShippingSelection,
    resolveShippingQuote,
    syncShipmentTrackingFromPayload,
    t,
  } = deps;

  app.get('/api/store-settings', async (_req, res) => {
    try {
      let settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
      if (!settings) {
        settings = await prisma.storeSettings.create({ data: { id: 'default' } });
      }
      res.json(settings);
    } catch (error) {
      console.error('Error fetching store settings:', error);
      res.status(500).json({ error: 'Failed to fetch store settings' });
    }
  });

  app.put('/api/store-settings', async (req, res) => {
    try {
      const {
        freeShippingThresholdCents,
        defaultShippingCents,
        frHomeShippingCents,
        frRelayShippingCents,
        beHomeShippingCents,
        beRelayShippingCents,
        europeShippingCents,
        internationalShippingCents,
        currency,
        shopAddress,
        shopPhone,
        contactEmail,
      } = req.body;
      const normalizedShopAddress = normalizeStoreContactField(shopAddress);
      const normalizedShopPhone = normalizeStoreContactField(shopPhone);
      const normalizedContactEmail = normalizeStoreContactField(contactEmail);
      const settings = await prisma.storeSettings.upsert({
        where: { id: 'default' },
        update: {
          freeShippingThresholdCents: typeof freeShippingThresholdCents === 'number' ? freeShippingThresholdCents : undefined,
          defaultShippingCents: typeof defaultShippingCents === 'number' ? defaultShippingCents : undefined,
          frHomeShippingCents: typeof frHomeShippingCents === 'number' ? frHomeShippingCents : undefined,
          frRelayShippingCents: typeof frRelayShippingCents === 'number' ? frRelayShippingCents : undefined,
          beHomeShippingCents: typeof beHomeShippingCents === 'number' ? beHomeShippingCents : undefined,
          beRelayShippingCents: typeof beRelayShippingCents === 'number' ? beRelayShippingCents : undefined,
          europeShippingCents: typeof europeShippingCents === 'number' ? europeShippingCents : undefined,
          internationalShippingCents: typeof internationalShippingCents === 'number' ? internationalShippingCents : undefined,
          currency: typeof currency === 'string' ? currency : undefined,
          shopAddress: normalizedShopAddress || undefined,
          shopPhone: normalizedShopPhone || undefined,
          contactEmail: normalizedContactEmail || undefined,
        },
        create: {
          id: 'default',
          freeShippingThresholdCents: typeof freeShippingThresholdCents === 'number' ? freeShippingThresholdCents : 4500,
          defaultShippingCents: typeof defaultShippingCents === 'number' ? defaultShippingCents : 550,
          frHomeShippingCents: typeof frHomeShippingCents === 'number'
            ? frHomeShippingCents
            : (typeof defaultShippingCents === 'number' ? defaultShippingCents : 550),
          frRelayShippingCents: typeof frRelayShippingCents === 'number' ? frRelayShippingCents : 460,
          beHomeShippingCents: typeof beHomeShippingCents === 'number' ? beHomeShippingCents : 900,
          beRelayShippingCents: typeof beRelayShippingCents === 'number' ? beRelayShippingCents : 550,
          europeShippingCents: typeof europeShippingCents === 'number' ? europeShippingCents : 750,
          internationalShippingCents: typeof internationalShippingCents === 'number' ? internationalShippingCents : 1590,
          currency: typeof currency === 'string' ? currency : 'EUR',
          ...(normalizedShopAddress ? { shopAddress: normalizedShopAddress } : {}),
          ...(normalizedShopPhone ? { shopPhone: normalizedShopPhone } : {}),
          ...(normalizedContactEmail ? { contactEmail: normalizedContactEmail } : {}),
        },
      });
      res.json(settings);
    } catch (error) {
      console.error('Error updating store settings:', error);
      res.status(500).json({ error: 'Failed to update store settings' });
    }
  });

  app.get('/api/shipping/offers', async (_req, res) => {
    const homeOfferCode = normalizeShippingOfferCode(process.env.BOXTAL_HOME_OFFER_CODE);
    const relayOfferCode = normalizeShippingOfferCode(process.env.BOXTAL_RELAY_OFFER_CODE);
    const homeOfferId = normalizeShippingOfferId(process.env.BOXTAL_HOME_OFFER_ID);
    const relayOfferId = normalizeShippingOfferId(process.env.BOXTAL_RELAY_OFFER_ID);
    const offers = [
      homeOfferCode
        ? {
          id: homeOfferId,
          code: homeOfferCode,
          label: t("backend.index.shipping_home"),
          mode: 'HOME',
        }
        : null,
      relayOfferCode
        ? {
          id: relayOfferId,
          code: relayOfferCode,
          label: 'Point relais (Mondial Relay)',
          mode: 'RELAY',
        }
        : null,
    ].filter(Boolean);
    res.json(offers);
  });

  app.get('/api/shipping/allowed-countries', async (_req, res) => {
    res.json({ allowedCountries: getAllowedShippingCountries() });
  });

  app.get('/api/shipping/quote', async (req, res) => {
    try {
      const shippingSelection = extractShippingSelection(req);
      if (shippingSelection.countryCode && !isShippingCountryAllowed(shippingSelection.countryCode)) {
        const allowed = getAllowedShippingCountries();
        return res.status(400).json({
          error: `Delivery is not available for this country. Allowed countries: ${allowed.join(', ')}`,
        });
      }
      const quotedOffer = await resolveBoxtalQuoteSelection({
        mode: shippingSelection.mode,
        requestedOfferCode: shippingSelection.offerCode,
        countryCode: shippingSelection.countryCode,
        postalCode: shippingSelection.postalCode,
        city: shippingSelection.city,
      });
      const resolvedShippingSelection = resolveOrderShippingSelection({
        ...shippingSelection,
        ...(quotedOffer
          ? {
            offerId: quotedOffer.offerId,
            offerCode: quotedOffer.offerCode,
            offerLabel: quotedOffer.offerLabel,
          }
          : {}),
      });
      const shippingQuote = await resolveShippingQuote(resolvedShippingSelection);
      res.json({
        shippingCents: shippingQuote.shippingCents,
        defaultShippingCents: shippingQuote.defaultShippingCents,
        mode: shippingQuote.mode || resolvedShippingSelection.mode || null,
        zone: shippingQuote.zone || null,
        supportsRelay: Boolean(shippingQuote.supportsRelay),
        freeShippingThresholdCents: typeof shippingQuote.freeShippingThresholdCents === 'number'
          ? shippingQuote.freeShippingThresholdCents
          : null,
        offerId: resolvedShippingSelection.offerId || null,
        offerCode: resolvedShippingSelection.offerCode || null,
        offerLabel: resolvedShippingSelection.offerLabel || null,
        source: quotedOffer?.quoteMeta?.source || null,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to compute shipping quote' });
    }
  });

  app.get('/api/shipping/relay-points', async (req, res) => {
    try {
      const { postalCode, city, countryCode, shippingOfferCode, limit } = req.query;
      if (!postalCode || !countryCode) {
        return res.status(400).json({ error: 'postalCode and countryCode are required' });
      }
      if (!isShippingCountryAllowed(countryCode)) {
        const allowed = getAllowedShippingCountries();
        return res.status(400).json({
          error: `Relay delivery is not available for this country. Allowed countries: ${allowed.join(', ')}`,
        });
      }
      const offerCode = shippingOfferCode || process.env.BOXTAL_RELAY_OFFER_CODE || undefined;
      const points = await getParcelPoints({
        postalCode,
        city,
        countryCode,
        shippingOfferCode: offerCode,
        limit: limit ? Number(limit) : 10,
      });
      res.json(points);
    } catch (error) {
      console.error('Error fetching relay points:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch relay points';
      res.json({ items: [], error: message });
    }
  });

  app.post('/api/shipping/webhook/boxtal', async (req, res) => {
    try {
      const signature = req.header('x-bxt-signature') || '';
      const secret = process.env.BOXTAL_WEBHOOK_SECRET || '';
      if (secret) {
        const rawBody = req.rawBody;
        const body = rawBody ? Buffer.from(rawBody) : Buffer.from('');
        const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
        if (!signature || signature !== expected) {
          return res.status(401).json({ error: 'Invalid webhook signature' });
        }
      }
      const payload = req.body;
      const shippingOrderId =
        payload.shippingOrder?.id ||
        payload.shippingOrderId ||
        payload.shippingOrder?.shippingOrderId ||
        null;
      const eventType = payload.eventType || payload.type || 'unknown';
      const status = payload.status || payload.shippingOrder?.status || null;
      const trackingNumber = payload.trackingNumber || payload.shippingOrder?.trackingNumber || null;
      const labelUrl = payload.labelUrl || payload.documentUrl || null;
      const occurredAt = payload.eventDate ? new Date(payload.eventDate) : null;
      let transitionedTo = [];
      if (shippingOrderId) {
        const shipment = await prisma.shipment.findFirst({ where: { providerOrderId: shippingOrderId } });
        if (shipment) {
          await prisma.shipmentEvent.create({
            data: {
              shipmentId: shipment.id,
              eventType: String(eventType),
              status: status ? String(status) : null,
              occurredAt: occurredAt || undefined,
              payload,
            },
          });
          const synced = await syncShipmentTrackingFromPayload({
            shipmentId: shipment.id,
            providerStatus: status ? String(status) : null,
            trackingNumber: trackingNumber || shipment.trackingNumber,
            trackingUrl: payload.trackingUrl || payload.tracking?.url || payload.tracking?.trackingUrl || null,
            labelUrl: labelUrl || shipment.labelUrl,
            response: payload,
            actorType: 'webhook',
            actorId: 'boxtal',
            reason: `Webhook Boxtal (${String(eventType)})`,
          });
          transitionedTo = synced.orderSync.transitionedTo;
        }
      }
      res.json({ ok: true, transitionedTo });
    } catch (error) {
      console.error('Error handling Boxtal webhook:', error);
      res.status(500).json({ error: 'Failed to process webhook' });
    }
  });
}
