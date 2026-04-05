// @ts-nocheck
export function registerStoreSettingsRoutes(app, deps) {
  const { normalizeStoreContactField, prisma } = deps;

  app.get('/api/admin/store-settings', async (_req, res) => {
    try {
      const settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
      if (!settings) {
        const created = await prisma.storeSettings.create({
          data: {
            id: 'default',
            freeShippingThresholdCents: 4500,
            defaultShippingCents: 550,
            frHomeShippingCents: 550,
            frRelayShippingCents: 460,
            beHomeShippingCents: 900,
            beRelayShippingCents: 550,
            europeShippingCents: 750,
            internationalShippingCents: 1590,
            currency: 'EUR',
          },
        });
        return res.json(created);
      }
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch store settings' });
    }
  });

  app.patch('/api/admin/store-settings', async (req, res) => {
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
          ...(freeShippingThresholdCents !== undefined ? { freeShippingThresholdCents } : {}),
          ...(defaultShippingCents !== undefined ? { defaultShippingCents } : {}),
          ...(frHomeShippingCents !== undefined ? { frHomeShippingCents } : {}),
          ...(frRelayShippingCents !== undefined ? { frRelayShippingCents } : {}),
          ...(beHomeShippingCents !== undefined ? { beHomeShippingCents } : {}),
          ...(beRelayShippingCents !== undefined ? { beRelayShippingCents } : {}),
          ...(europeShippingCents !== undefined ? { europeShippingCents } : {}),
          ...(internationalShippingCents !== undefined ? { internationalShippingCents } : {}),
          ...(currency !== undefined ? { currency } : {}),
          ...(normalizedShopAddress ? { shopAddress: normalizedShopAddress } : {}),
          ...(normalizedShopPhone ? { shopPhone: normalizedShopPhone } : {}),
          ...(normalizedContactEmail ? { contactEmail: normalizedContactEmail } : {}),
        },
        create: {
          id: 'default',
          freeShippingThresholdCents: freeShippingThresholdCents ?? 4500,
          defaultShippingCents: defaultShippingCents ?? 550,
          frHomeShippingCents: frHomeShippingCents ?? (defaultShippingCents ?? 550),
          frRelayShippingCents: frRelayShippingCents ?? 460,
          beHomeShippingCents: beHomeShippingCents ?? 900,
          beRelayShippingCents: beRelayShippingCents ?? 550,
          europeShippingCents: europeShippingCents ?? 750,
          internationalShippingCents: internationalShippingCents ?? 1590,
          currency: typeof currency === 'string' && currency.trim().length > 0 ? currency.trim() : 'EUR',
          ...(normalizedShopAddress ? { shopAddress: normalizedShopAddress } : {}),
          ...(normalizedShopPhone ? { shopPhone: normalizedShopPhone } : {}),
          ...(normalizedContactEmail ? { contactEmail: normalizedContactEmail } : {}),
        },
      });
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update store settings' });
    }
  });
}
