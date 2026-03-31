import type { WishlistCreation } from '@/api/client';

const normalizeWishlistId = (value?: string | null) => {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : null;
};

const getAccessoryWishlistKeys = (input: { variantId?: string | null; productId?: string | null }) => {
  const variantId = normalizeWishlistId(input.variantId);
  const productId = normalizeWishlistId(input.productId);

  return {
    variantKey: variantId ? `variant:${variantId}` : null,
    productKey: productId ? `product:${productId}` : null,
  };
};

export const buildAccessoryWishlistItemIdMap = (wishlistItems: WishlistCreation[]) => {
  const map = new Map<string, string>();

  wishlistItems.forEach((item) => {
    const { variantKey, productKey } = getAccessoryWishlistKeys({
      variantId: item.variantId,
      productId: item.productId,
    });

    if (variantKey && !map.has(variantKey)) {
      map.set(variantKey, item.id);
    }

    if (productKey && !map.has(productKey)) {
      map.set(productKey, item.id);
    }
  });

  return map;
};

export const findMatchingAccessoryWishlistItemId = (
  wishlistItemIdsByKey: Map<string, string>,
  input: { variantId?: string | null; productId?: string | null }
) => {
  const { variantKey, productKey } = getAccessoryWishlistKeys(input);

  if (variantKey) {
    return wishlistItemIdsByKey.get(variantKey) ?? null;
  }

  if (productKey) {
    return wishlistItemIdsByKey.get(productKey) ?? null;
  }

  return null;
};
