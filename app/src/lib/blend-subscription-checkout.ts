import type { BlendFormatCode } from '@/lib/blend-format';

export type PendingBlendSubscriptionCheckout = {
  sourceType: 'LISTING' | 'CUSTOM';
  listingId?: string;
  title: string;
  ingredientIds: string[];
  blendFormat: BlendFormatCode;
  intervalCount: 1 | 2 | 3;
  basePriceCents: number;
};

const BLEND_SUBSCRIPTION_CHECKOUT_STORAGE_KEY = 'blend_subscription_checkout';

export const writePendingBlendSubscriptionCheckout = (payload: PendingBlendSubscriptionCheckout) => {
  if (typeof window === 'undefined') {
    return;
  }

  sessionStorage.setItem(BLEND_SUBSCRIPTION_CHECKOUT_STORAGE_KEY, JSON.stringify(payload));
};

export const readPendingBlendSubscriptionCheckout = (): PendingBlendSubscriptionCheckout | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(BLEND_SUBSCRIPTION_CHECKOUT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PendingBlendSubscriptionCheckout;
    const ingredientIds = Array.isArray(parsed?.ingredientIds)
      ? parsed.ingredientIds.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [];

    if (!parsed?.title || ingredientIds.length === 0) {
      return null;
    }

    return {
      sourceType: parsed.sourceType === 'LISTING' ? 'LISTING' : 'CUSTOM',
      listingId: typeof parsed.listingId === 'string' && parsed.listingId.trim().length > 0 ? parsed.listingId.trim() : undefined,
      title: String(parsed.title || '').trim(),
      ingredientIds,
      blendFormat: parsed.blendFormat === 'MUSLIN_20' ? 'MUSLIN_20' : 'POUCH_100G',
      intervalCount: parsed.intervalCount === 2 || parsed.intervalCount === 3 ? parsed.intervalCount : 1,
      basePriceCents: Math.max(0, Math.round(Number(parsed.basePriceCents) || 0)),
    };
  } catch {
    return null;
  }
};

export const clearPendingBlendSubscriptionCheckout = () => {
  if (typeof window === 'undefined') {
    return;
  }

  sessionStorage.removeItem(BLEND_SUBSCRIPTION_CHECKOUT_STORAGE_KEY);
};
