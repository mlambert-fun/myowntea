type BoxtalConfig = {
  baseUrl: string;
  accessKey: string;
  secretKey: string;
};

type BoxtalRequestOptions = {
  method?: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  responseType?: 'json' | 'text';
};

const BOXTAL_DEBUG_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isBoxtalDebugEnabled() {
  const raw = String(process.env.BOXTAL_DEBUG || '').trim().toLowerCase();
  return BOXTAL_DEBUG_TRUE_VALUES.has(raw);
}

function shortRandomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function maybeMaskEmail(value: string) {
  const trimmed = value.trim();
  const at = trimmed.indexOf('@');
  if (at <= 1) return '<masked-email>';
  return `${trimmed.slice(0, 1)}***${trimmed.slice(at - 1)}`;
}

function maybeMaskPhone(value: string) {
  const digits = value.replace(/\D+/g, '');
  if (digits.length < 4) return '<masked-phone>';
  return `***${digits.slice(-4)}`;
}

function sanitizeBoxtalLogValue(value: unknown, parentKey = ''): unknown {
  const key = String(parentKey || '').toLowerCase();
  if (
    key.includes('authorization') ||
    key.includes('secret') ||
    key.includes('token') ||
    key.includes('password') ||
    key.includes('signature') ||
    key === 'accesskey' ||
    key === 'access_key'
  ) {
    return '<redacted>';
  }
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (key.includes('email')) return maybeMaskEmail(value);
    if (key.includes('phone') || key.includes('dialcode') || key.includes('number')) return maybeMaskPhone(value);
    return value.length > 250 ? `${value.slice(0, 250)}...[truncated]` : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeBoxtalLogValue(item, parentKey));
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      output[k] = sanitizeBoxtalLogValue(v, k);
    });
    return output;
  }
  return value;
}

function boxtalDebugLog(event: string, payload: Record<string, unknown>) {
  if (!isBoxtalDebugEnabled()) return;
  const safe = sanitizeBoxtalLogValue(payload);
  try {
    console.log(`[boxtal][debug] ${event}`, JSON.stringify(safe));
  } catch {
    console.log(`[boxtal][debug] ${event}`, safe);
  }
}

function getConfig(): BoxtalConfig {
  let baseUrl = process.env.BOXTAL_BASE_URL || 'https://api.boxtal.com';
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
  if (baseUrl.endsWith('/shipping')) {
    baseUrl = baseUrl.replace(/\/shipping$/, '');
  }
  const accessKey = process.env.BOXTAL_ACCESS_KEY || '';
  const secretKey = process.env.BOXTAL_SECRET_KEY || '';

  if (!accessKey || !secretKey) {
    throw new Error('Boxtal credentials are missing');
  }

  return { baseUrl, accessKey, secretKey };
}

function buildQuery(query?: BoxtalRequestOptions['query']) {
  if (!query) return '';
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.append(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function boxtalRequest<T>({
  method = 'GET',
  path,
  query,
  body,
  responseType = 'json',
}: BoxtalRequestOptions): Promise<T> {
  const { baseUrl, accessKey, secretKey } = getConfig();
  const auth = Buffer.from(`${accessKey}:${secretKey}`).toString('base64');
  const url = `${baseUrl}${path}${buildQuery(query)}`;
  const requestId = shortRandomId();
  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    Accept: responseType === 'text' ? 'application/xml, text/xml, */*' : 'application/json',
  };
  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
  }

  boxtalDebugLog('request', {
    requestId,
    method,
    path,
    query: query || null,
    body: body || null,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    boxtalDebugLog('network_error', {
      requestId,
      method,
      path,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const text = response.status === 204 ? '' : await response.text();
  boxtalDebugLog('response', {
    requestId,
    method,
    path,
    status: response.status,
    ok: response.ok,
    body: text || null,
  });

  if (!response.ok) {
    throw new Error(`Boxtal API error (${response.status}): ${text}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  if (!text) {
    return {} as T;
  }
  if (responseType === 'text') {
    return text as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(
      `Boxtal API parse error (${response.status}): ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function escapeRegex(value: string) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function extractXmlTag(source: string, tag: string): string | null {
  const normalizedTag = String(tag || '').trim();
  if (!normalizedTag) return null;
  const regex = new RegExp(`<${escapeRegex(normalizedTag)}>([\\s\\S]*?)</${escapeRegex(normalizedTag)}>`, 'i');
  const match = source.match(regex);
  if (!match) return null;
  return match[1] ?? null;
}

function extractXmlTagPath(source: string, path: string[]): string | null {
  let current = source;
  for (const tag of path) {
    const next = extractXmlTag(current, tag);
    if (next === null) return null;
    current = next;
  }
  return decodeXmlEntities(current.trim());
}

function toNumberOrNull(value: string | null | undefined) {
  if (!value) return null;
  const normalized = String(value).trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNonEmptyStringOrNull(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOfferIdMap(): Record<string, string> {
  const raw = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPING_OFFER_ID_MAP);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const output: Record<string, string> = {};
    Object.entries(parsed).forEach(([key, value]) => {
      const mapKey = String(key || '').trim().toUpperCase();
      const mapValue = toNonEmptyStringOrNull(value);
      if (!mapKey || !mapValue) return;
      output[mapKey] = mapValue;
    });
    return output;
  } catch {
    return {};
  }
}

function resolveConfiguredOfferId(params: {
  requestedOfferCode?: string | null;
  mode?: 'HOME' | 'RELAY' | null;
}) {
  const byCode = parseOfferIdMap();
  const normalizedCode = String(params.requestedOfferCode || '').trim().toUpperCase();
  if (normalizedCode && byCode[normalizedCode]) {
    return byCode[normalizedCode];
  }
  if (params.mode === 'RELAY') {
    return toNonEmptyStringOrNull(process.env.BOXTAL_RELAY_OFFER_ID);
  }
  if (params.mode === 'HOME') {
    return toNonEmptyStringOrNull(process.env.BOXTAL_HOME_OFFER_ID);
  }
  return null;
}

type LegacyQuoteOffer = {
  offerCode: string | null;
  offerId: string | null;
  operatorCode: string | null;
  operatorLabel: string | null;
  serviceCode: string | null;
  serviceLabel: string | null;
  collectionType: string | null;
  deliveryType: string | null;
  priceTaxInclusive: number | null;
};

function parseLegacyQuoteOffers(xml: string): LegacyQuoteOffer[] {
  const blocks = [...String(xml).matchAll(/<offer>([\s\S]*?)<\/offer>/gi)].map((match) => match[1]);
  return blocks.map((block) => {
    const operatorCode = extractXmlTagPath(block, ['operator', 'code']);
    const serviceCode = extractXmlTagPath(block, ['service', 'code']);
    const explicitOfferCode =
      extractXmlTagPath(block, ['shippingOfferCode']) ||
      extractXmlTagPath(block, ['shipping_offer_code']) ||
      extractXmlTagPath(block, ['offerCode']);
    const offerCode = explicitOfferCode || (operatorCode && serviceCode ? `${operatorCode}-${serviceCode}` : null);
    const offerId =
      extractXmlTagPath(block, ['shippingOfferId']) ||
      extractXmlTagPath(block, ['shipping_offer_id']) ||
      extractXmlTagPath(block, ['offerId']) ||
      extractXmlTagPath(block, ['offer_id']) ||
      extractXmlTagPath(block, ['id']);
    return {
      offerCode: toNonEmptyStringOrNull(offerCode),
      offerId: toNonEmptyStringOrNull(offerId),
      operatorCode: toNonEmptyStringOrNull(operatorCode),
      operatorLabel: toNonEmptyStringOrNull(extractXmlTagPath(block, ['operator', 'label'])),
      serviceCode: toNonEmptyStringOrNull(serviceCode),
      serviceLabel: toNonEmptyStringOrNull(extractXmlTagPath(block, ['service', 'label'])),
      collectionType: toNonEmptyStringOrNull(extractXmlTagPath(block, ['collection', 'type', 'code'])),
      deliveryType: toNonEmptyStringOrNull(extractXmlTagPath(block, ['delivery', 'type', 'code'])),
      priceTaxInclusive: toNumberOrNull(extractXmlTagPath(block, ['price', 'tax-inclusive'])),
    };
  });
}

function isRelayOffer(offer: LegacyQuoteOffer) {
  const relaySignals = [
    offer.deliveryType,
    offer.collectionType,
    offer.serviceCode,
    offer.serviceLabel,
    offer.offerCode,
  ]
    .map((value) => String(value || '').toUpperCase())
    .join(' ');
  return (
    relaySignals.includes('PICKUP_POINT') ||
    relaySignals.includes('RELAY') ||
    relaySignals.includes('RELAIS') ||
    relaySignals.includes('POINT')
  );
}

function selectLegacyQuoteOffer(params: {
  offers: LegacyQuoteOffer[];
  mode?: 'HOME' | 'RELAY' | null;
  requestedOfferCode?: string | null;
}) {
  const normalizedRequestedCode = String(params.requestedOfferCode || '').trim().toUpperCase();
  const matchedByCode = normalizedRequestedCode
    ? params.offers.filter((offer) => String(offer.offerCode || '').trim().toUpperCase() === normalizedRequestedCode)
    : [];
  const source = matchedByCode.length > 0 ? matchedByCode : params.offers;
  const byMode =
    params.mode === 'RELAY'
      ? source.filter((offer) => isRelayOffer(offer))
      : params.mode === 'HOME'
      ? source.filter((offer) => !isRelayOffer(offer))
      : source;
  const candidates = byMode.length > 0 ? byMode : source;
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const left = a.priceTaxInclusive;
    const right = b.priceTaxInclusive;
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
  });
  return sorted[0];
}

function nextBusinessDateIsoString() {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}

export async function quoteShippingOffer(params: {
  mode?: 'HOME' | 'RELAY' | null;
  countryCode: string;
  postalCode: string;
  city: string;
  addressLine1?: string | null;
  requestedOfferCode?: string | null;
  declaredValueEur?: number;
}) {
  const shipperCountryCode = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_COUNTRY) || 'FR';
  const shipperPostalCode = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_POSTAL_CODE) || '59150';
  const shipperCity = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_CITY) || 'Wattrelos';
  const shipperAddressLine1 = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_ADDRESS1) || '31 rue Lacordaire';
  const shipperType = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_LEGACY_TYPE) || 'entreprise';
  const recipientType = toNonEmptyStringOrNull(process.env.BOXTAL_RECIPIENT_LEGACY_TYPE) || 'particulier';
  const contentCode = toNonEmptyStringOrNull(process.env.BOXTAL_CONTENT_CODE) || '40110';
  const parcelWeightKg = Number(process.env.BOXTAL_PARCEL_WEIGHT_KG || 0.5);
  const parcelLengthCm = Number(process.env.BOXTAL_PARCEL_LENGTH_CM || 20);
  const parcelWidthCm = Number(process.env.BOXTAL_PARCEL_WIDTH_CM || 20);
  const parcelHeightCm = Number(process.env.BOXTAL_PARCEL_HEIGHT_CM || 10);
  const requestedOfferCode = toNonEmptyStringOrNull(params.requestedOfferCode);
  const declaredValue = Number.isFinite(params.declaredValueEur)
    ? Math.max(0.01, Number(params.declaredValueEur))
    : Math.max(0.01, Number(process.env.BOXTAL_QUOTE_DECLARED_VALUE_EUR || 20));

  const query = {
    'shipper.pays': shipperCountryCode,
    'shipper.code_postal': shipperPostalCode,
    'shipper.ville': shipperCity,
    'shipper.type': shipperType,
    'shipper.adresse': shipperAddressLine1,
    'recipient.pays': String(params.countryCode || '').trim().toUpperCase(),
    'recipient.code_postal': String(params.postalCode || '').trim(),
    'recipient.ville': String(params.city || '').trim(),
    'recipient.type': recipientType,
    'recipient.adresse': toNonEmptyStringOrNull(params.addressLine1) || 'Adresse destinataire',
    'colis_1.poids': Number.isFinite(parcelWeightKg) && parcelWeightKg > 0 ? parcelWeightKg : 0.5,
    'colis_1.longueur': Number.isFinite(parcelLengthCm) && parcelLengthCm > 0 ? parcelLengthCm : 20,
    'colis_1.largeur': Number.isFinite(parcelWidthCm) && parcelWidthCm > 0 ? parcelWidthCm : 20,
    'colis_1.hauteur': Number.isFinite(parcelHeightCm) && parcelHeightCm > 0 ? parcelHeightCm : 10,
    collecte: nextBusinessDateIsoString(),
    delai: 'aucun',
    content_code: contentCode,
    valeur: declaredValue.toFixed(2),
    platform: 'myowntea',
    platform_version: '1.0.0',
    module_version: '1.0.0',
    ...(requestedOfferCode
      ? {
          operator: requestedOfferCode.split('-')[0] || undefined,
          service: requestedOfferCode.split('-').slice(1).join('-') || undefined,
        }
      : {}),
  };

  const xml = await boxtalRequest<string>({
    path: '/v1/cotation',
    query,
    responseType: 'text',
  });
  const offers = parseLegacyQuoteOffers(xml);
  const selected = selectLegacyQuoteOffer({
    offers,
    mode: params.mode || null,
    requestedOfferCode,
  });
  const selectedOfferCode = toNonEmptyStringOrNull(selected?.offerCode) || requestedOfferCode;
  const selectedOfferId =
    toNonEmptyStringOrNull(selected?.offerId) ||
    resolveConfiguredOfferId({
      requestedOfferCode: selectedOfferCode || requestedOfferCode || null,
      mode: params.mode || null,
    });

  boxtalDebugLog('quote_selected', {
    requestedMode: params.mode || null,
    requestedOfferCode: requestedOfferCode || null,
    selectedOfferCode: selectedOfferCode || null,
    selectedOfferId: selectedOfferId || null,
    selectedPriceTaxInclusive: selected?.priceTaxInclusive ?? null,
    offersCount: offers.length,
  });

  return {
    offerCode: selectedOfferCode || null,
    offerId: selectedOfferId || null,
    offerLabel: toNonEmptyStringOrNull(selected?.serviceLabel),
    priceTaxInclusive: selected?.priceTaxInclusive ?? null,
    offersCount: offers.length,
  };
}

function resolveParcelPointOperationTypes() {
  const configured = String(process.env.BOXTAL_PARCEL_POINT_OPERATION_TYPE || 'ARRIVAL')
    .trim()
    .toUpperCase();
  const primary = configured === 'DEPARTURE' ? 'DEPARTURE' : 'ARRIVAL';
  const secondary = primary === 'ARRIVAL' ? 'DEPARTURE' : 'ARRIVAL';
  return [primary, secondary];
}

export async function getParcelPoints(params: {
  shippingOfferCode?: string;
  countryCode: string;
  postalCode: string;
  city?: string;
  limit?: number;
}) {
  if (params.shippingOfferCode) {
    const operationTypes = resolveParcelPointOperationTypes();
    let lastError: unknown = null;
    for (const operationType of operationTypes) {
      try {
        return await boxtalRequest({
          path: '/shipping/v3.2/parcel-point-by-shipping-offer',
          query: {
            shippingOfferCode: params.shippingOfferCode,
            countryIsoCode: params.countryCode,
            postalCode: params.postalCode,
            city: params.city,
            limit: params.limit || 10,
            operationType,
          },
        });
      } catch (error) {
        lastError = error;
      }
    }
    // Some contracts/endpoints can still fail with offer code lookup; fallback to network search.
    if (lastError) {
      console.warn('Boxtal parcel-point-by-shipping-offer failed, fallback to network lookup');
    }
  }

  try {
    return await boxtalRequest({
      path: '/shipping/v3.2/parcel-point-by-network',
      query: {
        searchNetworks: 'MONDIAL_RELAY',
        countryIsoCode: params.countryCode,
        postalCode: params.postalCode,
        city: params.city,
        limit: params.limit || 10,
      },
    });
  } catch (_error) {
    return boxtalRequest({
      path: '/shipping/v3.1/parcel-point',
      query: {
        countryIsoCode: params.countryCode,
        postalCode: params.postalCode,
        city: params.city,
        limit: params.limit || 10,
      },
    });
  }
}

export async function createShippingOrder(payload: unknown) {
  return boxtalRequest({
    method: 'POST',
    path: '/shipping/v3.1/shipping-order',
    body: payload,
  });
}

export async function getShippingDocument(boxtalOrderId: string) {
  return boxtalRequest({
    path: `/shipping/v3.1/shipping-order/${boxtalOrderId}/shipping-document`,
  });
}

export async function getShippingTracking(boxtalOrderId: string) {
  return boxtalRequest({
    path: `/shipping/v3.1/shipping-order/${boxtalOrderId}/tracking`,
  });
}
