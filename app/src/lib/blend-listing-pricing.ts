import type { BlendListing } from '@/api/client';
import { computeBlendUnitPriceCents, type BlendPricingIngredient } from '@/lib/blend-pricing';
import { DEFAULT_BLEND_FORMAT, normalizeBlendFormat, type BlendFormatCode } from '@/lib/blend-format';

const toSafeCents = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.round(numeric));
};

const toFallbackPricingIngredient = (entry: any): BlendPricingIngredient | null => {
  const ingredient = entry?.ingredient || entry;
  if (!ingredient || typeof ingredient !== 'object') return null;
  return {
    id: typeof ingredient.id === 'string' ? ingredient.id : undefined,
    name: typeof ingredient.name === 'string' ? ingredient.name : undefined,
    category: typeof ingredient.category === 'string' ? ingredient.category : undefined,
    price: typeof ingredient.price === 'number' && Number.isFinite(ingredient.price) ? ingredient.price : 0,
    basePrice:
      typeof ingredient.basePrice === 'number' && Number.isFinite(ingredient.basePrice)
        ? ingredient.basePrice
        : undefined,
  };
};

const buildFallbackPricingIngredients = (listing: BlendListing): BlendPricingIngredient[] => {
  const entries = Array.isArray(listing?.blend?.ingredients) ? listing.blend.ingredients : [];
  return entries.map((entry) => toFallbackPricingIngredient(entry)).filter((entry): entry is BlendPricingIngredient => Boolean(entry));
};

export const getBlendListingPriceByFormatCents = (
  listing: BlendListing,
  blendFormat: BlendFormatCode | string = DEFAULT_BLEND_FORMAT
) => {
  const normalizedFormat = normalizeBlendFormat(blendFormat || DEFAULT_BLEND_FORMAT);
  const backendByFormat = toSafeCents(listing?.priceByFormatCents?.[normalizedFormat]);
  if (backendByFormat !== null) {
    return backendByFormat;
  }

  if (normalizedFormat === 'POUCH_100G') {
    const backendPouch = toSafeCents(listing?.priceCents);
    if (backendPouch !== null) {
      return backendPouch;
    }
  }

  const fallbackIngredients = buildFallbackPricingIngredients(listing);
  return computeBlendUnitPriceCents(fallbackIngredients, { blendFormat: normalizedFormat });
};

