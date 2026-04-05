// @ts-nocheck
export function createShippingConfigService({ prisma, t, toNonEmptyStringOrNull }) {
  const getNormalizedStoreShippingRates = (settings) => {
    const toNonNegativeInt = (value, fallback) => {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.round(parsed));
      }
      return Math.max(0, Math.round(Number(fallback) || 0));
    };

    const defaultShippingCents = toNonNegativeInt(settings?.defaultShippingCents, 550);
    return {
      defaultShippingCents,
      freeShippingThresholdCents: toNonNegativeInt(settings?.freeShippingThresholdCents, 4500),
      frHomeShippingCents: toNonNegativeInt(settings?.frHomeShippingCents, defaultShippingCents),
      frRelayShippingCents: toNonNegativeInt(settings?.frRelayShippingCents, defaultShippingCents),
      beHomeShippingCents: toNonNegativeInt(settings?.beHomeShippingCents, 900),
      beRelayShippingCents: toNonNegativeInt(settings?.beRelayShippingCents, 550),
      europeShippingCents: toNonNegativeInt(settings?.europeShippingCents, defaultShippingCents),
      internationalShippingCents: toNonNegativeInt(
        settings?.internationalShippingCents,
        defaultShippingCents
      ),
    };
  };

  const normalizeShippingMode = (value) => {
    if (value === 'HOME' || value === 'RELAY') {
      return value;
    }
    return undefined;
  };

  const normalizeShippingOfferId = (value) => {
    const raw = toNonEmptyStringOrNull(value);
    if (!raw || raw === '""' || raw === "''") {
      return null;
    }
    const unquoted = raw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();
    return unquoted.length > 0 ? unquoted : null;
  };

  const normalizeShippingOfferCode = (value) => {
    const raw = toNonEmptyStringOrNull(value);
    if (!raw || raw === '""' || raw === "''") {
      return null;
    }
    const unquoted = raw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();
    return unquoted.length > 0 ? unquoted : null;
  };

  const getConfiguredShippingOfferCode = (mode) => {
    if (mode === 'RELAY') {
      return normalizeShippingOfferCode(process.env.BOXTAL_RELAY_OFFER_CODE);
    }
    if (mode === 'HOME') {
      return normalizeShippingOfferCode(process.env.BOXTAL_HOME_OFFER_CODE);
    }
    return null;
  };

  const getShippingOfferLabelByMode = (mode) => {
    if (mode === 'RELAY') {
      return 'Point relais (Mondial Relay)';
    }
    if (mode === 'HOME') {
      return t('backend.index.shipping_home');
    }
    return null;
  };

  const getStoreSettings = async () => {
    let settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
    if (!settings) {
      settings = await prisma.storeSettings.create({ data: { id: 'default' } });
    }
    return settings;
  };

  const isDomTomPostalCode = (postalCode) => {
    const normalized = String(postalCode || '').replace(/\s+/g, '');
    return /^97|^98/.test(normalized);
  };

  const resolveCheckoutShippingZone = (countryCode, postalCode) => {
    const normalizedCountry = String(countryCode || 'FR').trim().toUpperCase();
    if (normalizedCountry === 'FR' && !isDomTomPostalCode(postalCode)) {
      return 'FR_METRO';
    }
    if (normalizedCountry === 'BE') {
      return 'EUROPE_DOM_TOM';
    }
    if (normalizedCountry === 'FR') {
      return isDomTomPostalCode(postalCode) ? 'EUROPE_DOM_TOM' : 'FR_METRO';
    }
    return 'INTERNATIONAL';
  };

  const resolveCheckoutShippingQuote = (params) => {
    const rates = getNormalizedStoreShippingRates(
      params?.settings || {
        defaultShippingCents: params?.defaultCents,
        freeShippingThresholdCents: params?.freeShippingThresholdCents,
        frHomeShippingCents: params?.frHomeShippingCents,
        frRelayShippingCents: params?.frRelayShippingCents,
        beHomeShippingCents: params?.beHomeShippingCents,
        beRelayShippingCents: params?.beRelayShippingCents,
        europeShippingCents: params?.europeShippingCents,
        internationalShippingCents: params?.internationalShippingCents,
      }
    );
    const zone = resolveCheckoutShippingZone(params.countryCode, params.postalCode);
    const normalizedCountry = String(params.countryCode || 'FR').trim().toUpperCase();
    const supportsRelay =
      zone === 'FR_METRO' || (zone === 'EUROPE_DOM_TOM' && normalizedCountry === 'BE');
    const mode = params.mode === 'RELAY' && supportsRelay ? 'RELAY' : 'HOME';
    const thresholdCents = zone === 'FR_METRO' ? rates.freeShippingThresholdCents : null;
    const subtotalCents = Number.isFinite(params?.subtotalCents)
      ? Number(params.subtotalCents)
      : null;

    let baseShippingCents = rates.defaultShippingCents;
    if (zone === 'FR_METRO') {
      baseShippingCents = mode === 'RELAY' ? rates.frRelayShippingCents : rates.frHomeShippingCents;
    } else if (normalizedCountry === 'BE') {
      baseShippingCents = mode === 'RELAY' ? rates.beRelayShippingCents : rates.beHomeShippingCents;
    } else if (zone === 'EUROPE_DOM_TOM') {
      baseShippingCents = rates.europeShippingCents;
    } else {
      baseShippingCents = rates.internationalShippingCents;
    }

    const shippingCents =
      thresholdCents !== null &&
      subtotalCents !== null &&
      subtotalCents >= thresholdCents
        ? 0
        : baseShippingCents;

    return {
      zone,
      mode,
      supportsRelay,
      shippingCents,
      baseShippingCents,
      thresholdCents,
      defaultShippingCents: rates.defaultShippingCents,
    };
  };

  const normalizeCheckoutAddressInput = (value, fieldName) => {
    if (!value || typeof value !== 'object') {
      throw new Error(`${fieldName} is required`);
    }
    const data = value;
    const firstName = String(data.firstName || '').trim();
    const lastName = String(data.lastName || '').trim();
    const countryCode = String(data.countryCode || '').trim().toUpperCase();
    const postalCode = String(data.postalCode || '').trim();
    const city = String(data.city || '').trim();
    const address1 = String(data.address1 || '').trim();
    const address2 = String(data.address2 || '').trim();
    const phoneE164 = String(data.phoneE164 || '').trim();
    const salutationRaw = String(data.salutation || '').trim().toUpperCase();
    const salutation = salutationRaw === 'MME' || salutationRaw === 'MR' ? salutationRaw : null;

    if (!firstName) throw new Error(`${fieldName}.firstName is required`);
    if (!lastName) throw new Error(`${fieldName}.lastName is required`);
    if (!countryCode) throw new Error(`${fieldName}.countryCode is required`);
    if (!postalCode) throw new Error(`${fieldName}.postalCode is required`);
    if (!city) throw new Error(`${fieldName}.city is required`);
    if (!address1) throw new Error(`${fieldName}.address1 is required`);
    if (!phoneE164 || !/^\+[1-9]\d{1,14}$/.test(phoneE164)) {
      throw new Error(`${fieldName}.phoneE164 is invalid`);
    }

    return {
      salutation,
      firstName,
      lastName,
      countryCode,
      postalCode,
      city,
      address1,
      address2: address2 || null,
      phoneE164,
    };
  };

  const checkoutAddressToString = (address) =>
    [
      `${address.firstName} ${address.lastName}`.trim(),
      address.address1,
      address.address2 || '',
      `${address.postalCode} ${address.city}`.trim(),
      address.countryCode,
    ]
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join(', ');

  const resolveOrderShippingSelection = (selection) => {
    const mode = normalizeShippingMode(selection?.mode) || null;
    const offerId = normalizeShippingOfferId(selection?.offerId);
    const offerCode =
      normalizeShippingOfferCode(selection?.offerCode) || getConfiguredShippingOfferCode(mode);
    const offerLabel =
      toNonEmptyStringOrNull(selection?.offerLabel) || getShippingOfferLabelByMode(mode);
    const countryCode = toNonEmptyStringOrNull(selection?.countryCode);
    const postalCode = toNonEmptyStringOrNull(selection?.postalCode);
    const city = toNonEmptyStringOrNull(selection?.city);
    const relayPoint =
      selection && typeof selection.relayPoint === 'object' ? selection.relayPoint : null;

    return {
      mode,
      offerId: offerId || null,
      offerCode: offerCode || null,
      offerLabel: offerLabel || null,
      countryCode: countryCode || null,
      postalCode: postalCode || null,
      city: city || null,
      relayPoint,
    };
  };

  const parseStripeShippingSelectionMetadata = (value) => {
    const raw = toNonEmptyStringOrNull(value);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  };

  return {
    checkoutAddressToString,
    getShippingOfferLabelByMode,
    getStoreSettings,
    normalizeCheckoutAddressInput,
    normalizeShippingMode,
    normalizeShippingOfferCode,
    normalizeShippingOfferId,
    parseStripeShippingSelectionMetadata,
    resolveCheckoutShippingQuote,
    resolveOrderShippingSelection,
  };
}
