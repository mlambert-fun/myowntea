// @ts-nocheck
export function createShippingService({
  getShippingOfferLabelByMode,
  getStoreSettings,
  normalizeShippingMode,
  normalizeShippingOfferCode,
  normalizeShippingOfferId,
  quoteShippingOffer,
  resolveCheckoutShippingQuote,
  toNonEmptyStringOrNull,
}) {
  const asObjectOrNull = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : null;

  const parseBoxtalTrackingPayload = (payload, fallbackTrackingNumber = null) => {
    const root = asObjectOrNull(payload) || {};
    const trackingObject = asObjectOrNull(root.tracking);
    const contentList = Array.isArray(root.content) ? root.content : [];
    const contentFirst = asObjectOrNull(contentList[0]);
    const providerStatus =
      toNonEmptyStringOrNull(contentFirst?.status) ||
      toNonEmptyStringOrNull(trackingObject?.status) ||
      toNonEmptyStringOrNull(root.status) ||
      null;
    const trackingNumber =
      toNonEmptyStringOrNull(contentFirst?.trackingNumber) ||
      toNonEmptyStringOrNull(contentFirst?.packageId) ||
      toNonEmptyStringOrNull(trackingObject?.trackingNumber) ||
      toNonEmptyStringOrNull(root.trackingNumber) ||
      toNonEmptyStringOrNull(fallbackTrackingNumber) ||
      null;
    const trackingUrl =
      toNonEmptyStringOrNull(contentFirst?.packageTrackingUrl) ||
      toNonEmptyStringOrNull(contentFirst?.trackingUrl) ||
      toNonEmptyStringOrNull(trackingObject?.url) ||
      toNonEmptyStringOrNull(trackingObject?.trackingUrl) ||
      toNonEmptyStringOrNull(root.trackingUrl) ||
      toNonEmptyStringOrNull(root.packageTrackingUrl) ||
      null;
    return { providerStatus, trackingNumber, trackingUrl };
  };

  const parseBoxtalLabelUrl = (payload) => {
    const root = asObjectOrNull(payload) || {};
    const contentList = Array.isArray(root.content) ? root.content : [];
    const documentsList = Array.isArray(root.documents) ? root.documents : [];
    const contentFirst = asObjectOrNull(contentList[0]);
    const documentFirst = asObjectOrNull(documentsList[0]);
    const shippingDocument = asObjectOrNull(root.shippingDocument);
    return (
      toNonEmptyStringOrNull(contentFirst?.url) ||
      toNonEmptyStringOrNull(documentFirst?.url) ||
      toNonEmptyStringOrNull(shippingDocument?.url) ||
      toNonEmptyStringOrNull(root.url) ||
      null
    );
  };

  const getAllowedShippingCountries = () => {
    const parsed = (process.env.BOXTAL_ALLOWED_COUNTRIES || 'FR')
      .split(',')
      .map((country) => country.trim().toUpperCase())
      .filter(Boolean);
    return parsed.length > 0 ? parsed : ['FR'];
  };

  const isShippingCountryAllowed = (countryCode) => {
    const normalized = String(countryCode || '').trim().toUpperCase();
    if (!normalized) {
      return false;
    }
    return getAllowedShippingCountries().includes(normalized);
  };

  const extractShippingSelection = (req) => {
    const queryMode = normalizeShippingMode(req.query.mode);
    const queryOfferId = typeof req.query.offerId === 'string' ? req.query.offerId : undefined;
    const queryOfferCode = typeof req.query.offerCode === 'string' ? req.query.offerCode : undefined;
    const queryCountryCode =
      typeof req.query.countryCode === 'string' ? req.query.countryCode : undefined;
    const queryPostalCode =
      typeof req.query.postalCode === 'string' ? req.query.postalCode : undefined;
    const queryCity = typeof req.query.city === 'string' ? req.query.city : undefined;
    const bodySelection =
      (req.body && typeof req.body.shippingSelection === 'object' ? req.body.shippingSelection : {}) ||
      {};
    const bodyMode = normalizeShippingMode(bodySelection.mode ?? req.body?.mode);
    const bodyOfferId =
      typeof bodySelection.offerId === 'string'
        ? bodySelection.offerId
        : typeof req.body?.offerId === 'string'
          ? req.body.offerId
          : undefined;
    const bodyOfferCode =
      typeof bodySelection.offerCode === 'string'
        ? bodySelection.offerCode
        : typeof req.body?.offerCode === 'string'
          ? req.body.offerCode
          : undefined;
    const bodyCountryCode =
      typeof bodySelection.countryCode === 'string'
        ? bodySelection.countryCode
        : typeof req.body?.countryCode === 'string'
          ? req.body.countryCode
          : undefined;
    const bodyPostalCode =
      typeof bodySelection.postalCode === 'string'
        ? bodySelection.postalCode
        : typeof req.body?.postalCode === 'string'
          ? req.body.postalCode
          : undefined;
    const bodyCity =
      typeof bodySelection.city === 'string'
        ? bodySelection.city
        : typeof req.body?.city === 'string'
          ? req.body.city
          : undefined;
    return {
      mode: queryMode ?? bodyMode,
      offerId: queryOfferId ?? bodyOfferId ?? null,
      offerCode: queryOfferCode ?? bodyOfferCode ?? null,
      countryCode: queryCountryCode ?? bodyCountryCode ?? null,
      postalCode: queryPostalCode ?? bodyPostalCode ?? null,
      city: queryCity ?? bodyCity ?? null,
    };
  };

  const resolveShippingQuote = async (selection) => {
    const settings = await getStoreSettings();
    const quote = resolveCheckoutShippingQuote({
      settings,
      mode: selection.mode,
      countryCode: selection.countryCode || null,
      postalCode: selection.postalCode || null,
    });
    return {
      shippingCents: quote.shippingCents,
      defaultShippingCents: quote.defaultShippingCents,
      mode: quote.mode,
      zone: quote.zone,
      supportsRelay: quote.supportsRelay,
      freeShippingThresholdCents: quote.thresholdCents,
    };
  };

  const resolveBoxtalQuoteSelection = async (params) => {
    const mode = normalizeShippingMode(params?.mode);
    if (!mode) {
      return null;
    }
    const countryCode = String(params?.countryCode || '').trim().toUpperCase();
    const postalCode = String(params?.postalCode || '').trim();
    const city = String(params?.city || '').trim();
    if (!countryCode || !postalCode || !city) {
      return null;
    }
    try {
      const quote = await quoteShippingOffer({
        mode,
        countryCode,
        postalCode,
        city,
        addressLine1: toNonEmptyStringOrNull(params?.addressLine1) || null,
        requestedOfferCode: normalizeShippingOfferCode(params?.requestedOfferCode),
        declaredValueEur: Number.isFinite(params?.declaredValueEur)
          ? Number(params.declaredValueEur)
          : undefined,
      });
      if (!quote?.offerCode && !quote?.offerId) {
        return null;
      }
      return {
        mode,
        offerId: normalizeShippingOfferId(quote.offerId),
        offerCode: normalizeShippingOfferCode(quote.offerCode),
        offerLabel:
          toNonEmptyStringOrNull(quote.offerLabel) || getShippingOfferLabelByMode(mode),
        quoteMeta: {
          source: 'boxtal_v1_cotation',
          offersCount: Number.isFinite(quote.offersCount) ? quote.offersCount : null,
          priceTaxInclusive: Number.isFinite(quote.priceTaxInclusive)
            ? quote.priceTaxInclusive
            : null,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[shipping] Boxtal quote failed (${mode}): ${message}`);
      return null;
    }
  };

  const resolveShippingCents = (params) => resolveCheckoutShippingQuote(params).shippingCents;

  const resolveBaseShippingCents = (params) => {
    const quote = resolveCheckoutShippingQuote(params);
    if (typeof quote.baseShippingCents === 'number') {
      return quote.baseShippingCents;
    }
    return quote.shippingCents;
  };

  return {
    extractShippingSelection,
    getAllowedShippingCountries,
    isShippingCountryAllowed,
    parseBoxtalLabelUrl,
    parseBoxtalTrackingPayload,
    resolveBaseShippingCents,
    resolveBoxtalQuoteSelection,
    resolveShippingCents,
    resolveShippingQuote,
  };
}
