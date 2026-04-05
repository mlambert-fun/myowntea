import assert from 'node:assert/strict';
import test from 'node:test';

import { createShippingService } from './service.js';

function createService() {
  return createShippingService({
    getShippingOfferLabelByMode: (mode: string) => (mode === 'RELAY' ? 'Point relais' : 'Domicile'),
    getStoreSettings: async () => ({
      id: 'default',
    }),
    normalizeShippingMode: (value: unknown) => {
      const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
      return normalized === 'HOME' || normalized === 'RELAY' ? normalized : null;
    },
    normalizeShippingOfferCode: (value: unknown) =>
      typeof value === 'string' && value.trim().length > 0 ? value.trim().toUpperCase() : null,
    normalizeShippingOfferId: (value: unknown) =>
      typeof value === 'string' && value.trim().length > 0 ? value.trim() : null,
    quoteShippingOffer: async () => null,
    resolveCheckoutShippingQuote: (params: Record<string, unknown>) => ({
      shippingCents: params.mode === 'RELAY' ? 460 : 590,
      defaultShippingCents: 590,
      mode: params.mode,
      zone: params.countryCode === 'BE' ? 'BE' : 'FR',
      supportsRelay: params.countryCode !== 'US',
      thresholdCents: 4500,
    }),
    toNonEmptyStringOrNull: (value: unknown) =>
      typeof value === 'string' && value.trim().length > 0 ? value.trim() : null,
  });
}

test('shipping service prioritizes query params over request body selection', () => {
  const service = createService();
  const selection = service.extractShippingSelection({
    query: {
      mode: 'relay',
      offerCode: 'mpr',
      countryCode: 'FR',
      postalCode: '59000',
      city: 'Lille',
    },
    body: {
      shippingSelection: {
        mode: 'home',
        offerCode: 'dom',
        countryCode: 'BE',
        postalCode: '1000',
        city: 'Brussels',
      },
    },
  });

  assert.deepEqual(selection, {
    mode: 'RELAY',
    offerId: null,
    offerCode: 'mpr',
    countryCode: 'FR',
    postalCode: '59000',
    city: 'Lille',
  });
});

test('shipping service extracts tracking payload details with sensible fallbacks', () => {
  const service = createService();
  const parsed = service.parseBoxtalTrackingPayload(
    {
      content: [
        {
          status: 'IN_TRANSIT',
          trackingNumber: 'TRACK123',
          packageTrackingUrl: 'https://tracking.example/track123',
        },
      ],
    },
    null
  );

  assert.deepEqual(parsed, {
    providerStatus: 'IN_TRANSIT',
    trackingNumber: 'TRACK123',
    trackingUrl: 'https://tracking.example/track123',
  });
});
