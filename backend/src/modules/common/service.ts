// @ts-nocheck
export function createCommonService() {
  const normalizeCode = (code) => (code || '').trim().toUpperCase() || null;

  const normalizeEmail = (email) => {
    const normalized = String(email || '').trim().toLowerCase();
    return normalized || null;
  };

  const mapBoxtalStatus = (status) => {
    if (!status) return 'UNKNOWN';
    const normalized = String(status).trim().toUpperCase();
    if (['PENDING', 'CREATED', 'CONFIRMED', 'REGISTERED'].includes(normalized)) return 'CREATED';
    if (['DOCUMENT_CREATED', 'LABEL_CREATED', 'READY'].includes(normalized)) return 'LABEL_CREATED';
    if (
      [
        'ANNOUNCED',
        'IN_TRANSIT',
        'PICKED_UP',
        'SHIPPED',
        'IN_DELIVERY',
        'OUT_FOR_DELIVERY',
        'REACHED_DELIVERY_PICKUP_POINT',
        'FAILED_ATTEMPT',
        'EXCEPTION',
      ].includes(normalized)
    ) {
      return 'IN_TRANSIT';
    }
    if (['DELIVERED', 'DELIVERED_TO_PARCEL_POINT'].includes(normalized)) return 'DELIVERED';
    if (['CANCELLED', 'CANCELED', 'REFUSED', 'RETURNED'].includes(normalized)) return 'CANCELLED';
    return 'UNKNOWN';
  };

  const slugify = (value) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

  const toStatusOrNull = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    return [
      'PENDING',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
      'REFUNDED',
    ].includes(normalized)
      ? normalized
      : null;
  };

  const toJsonObjectRecord = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value;
  };

  const toNonEmptyStringOrNull = (value) => {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  };

  const resolveRequestIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      return toNonEmptyStringOrNull(forwarded[0]) || null;
    }
    if (typeof forwarded === 'string') {
      return toNonEmptyStringOrNull(forwarded.split(',')[0]) || null;
    }
    return toNonEmptyStringOrNull(req.ip) || null;
  };

  return {
    mapBoxtalStatus,
    normalizeCode,
    normalizeEmail,
    resolveRequestIp,
    slugify,
    toJsonObjectRecord,
    toNonEmptyStringOrNull,
    toStatusOrNull,
  };
}
