const API_URL = 'http://localhost:5000/api';

export interface Ingredient {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  description?: string;
  longDescription?: string | null;
  image?: string;
  imageUrl?: string;
  color?: string;
  intensity?: number;
  umami?: number;
  sweetness?: number;
  thickness?: number;
  finish?: number;
  benefits?: string[];
  flavor?: string | null;
  flavors?: string[];
  dayMoments?: string[] | null;
  infusionTime?: string | null;
  dosage?: string | null;
  temperature?: string | null;
  preparation?: string | null;
  origin?: string | null;
  pairing?: string | null;
  isActive?: boolean;
  stock: number;
}

export interface CreateOrderDto {
  customerInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
  };
  items: Array<{
    ingredientId: string;
    quantity: number;
    unitPrice: number;
  }>;
}

export interface DiscountLine {
  label: string;
  amountCents: number;
  type: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING' | 'BOGO' | 'TIERED' | 'BUNDLE' | 'SALE_PRICE' | 'SUBSCRIPTION' | 'GIFT';
  discountId: string;
  scope?: 'ORDER' | 'SHIPPING' | 'PRODUCTS' | 'CATEGORIES';
}

export interface ShippingOffer {
  id?: string | null;
  code: string;
  label: string;
  mode: 'HOME' | 'RELAY';
}

export interface RelayPoint {
  id: string;
  network?: string;
  name?: string;
  address1?: string;
  address2?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface ShippingSelection {
  mode?: 'HOME' | 'RELAY';
  offerId?: string;
  offerCode?: string;
  offerLabel?: string;
  relayPoint?: RelayPoint | null;
}

export interface CheckoutAddressInput {
  salutation?: 'MME' | 'MR';
  firstName: string;
  lastName: string;
  countryCode: string;
  postalCode: string;
  city: string;
  address1: string;
  address2?: string;
  phoneE164: string;
}

export interface CheckoutPaymentIntentResponse {
  orderId: string;
  paymentIntentId?: string | null;
  clientSecret?: string | null;
  totals: {
    subtotalCents: number;
    shippingCents: number;
    discountTotalCents: number;
    totalCents: number;
  };
}

export interface ShippingQuote {
  shippingCents: number;
  defaultShippingCents: number;
  mode?: 'HOME' | 'RELAY' | null;
  offerId?: string | null;
  offerCode?: string | null;
  offerLabel?: string | null;
  source?: string | null;
}

export interface ShippingAllowedCountriesResponse {
  allowedCountries: string[];
}

export interface StoreSettings {
  id: string;
  freeShippingThresholdCents: number;
  defaultShippingCents: number;
  currency: string;
}

export interface CartSummary {
  subtotalCents: number;
  shippingCents: number;
  originalShippingCents: number;
  discountTotalCents: number;
  totalCents: number;
  discountLines: DiscountLine[];
  matchedDiscounts: Array<{ id: string; title: string; method: string; type: string; code?: string | null; amountCents: number }>;
  messages: string[];
  appliedCode: string | null;
  freeShippingProgress: null | {
    thresholdCents: number;
    remainingCents: number;
    progress: number;
    isUnlocked: boolean;
    discountId: string;
  };
}

async function fetchAPI(endpoint: string, options?: RequestInit) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let message = `API error: ${response.statusText}`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  return response.json();
}

const shippingSelectionQuery = (shippingSelection?: ShippingSelection | null) => {
  const query = new URLSearchParams();
  if (shippingSelection?.mode) {
    query.set('mode', shippingSelection.mode);
  }
  if (shippingSelection?.offerId) {
    query.set('offerId', shippingSelection.offerId);
  }
  if (shippingSelection?.offerCode) {
    query.set('offerCode', shippingSelection.offerCode);
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
};

export interface CustomerProfile {
  id: string;
  email: string | null;
  authProvider?: 'PASSWORD' | 'GOOGLE' | null;
  salutation?: 'MME' | 'MR' | null;
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  phoneE164?: string | null;
}

export interface AccountAddress {
  id: string;
  customerId: string;
  salutation?: 'MME' | 'MR' | null;
  firstName: string;
  lastName: string;
  countryCode: string;
  postalCode: string;
  city: string;
  hamlet?: string | null;
  address1: string;
  address2?: string | null;
  phoneE164: string;
  isDefaultBilling: boolean;
  isDefaultShipping: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountAddressPayload {
  salutation?: 'MME' | 'MR' | null;
  firstName: string;
  lastName: string;
  countryCode: string;
  postalCode: string;
  city: string;
  hamlet?: string | null;
  address1: string;
  address2?: string | null;
  phoneE164: string;
  isDefaultBilling?: boolean;
  isDefaultShipping?: boolean;
}

export interface AccountOrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  createdAt: string;
}

export interface AccountOrderListResponse {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  orders: AccountOrderSummary[];
}

export interface ForgotPasswordResponse {
  ok: boolean;
  message: string;
}

export interface ResetPasswordValidateResponse {
  valid: boolean;
  expiresAt?: string;
  error?: string;
}

export interface AddressSnapshot {
  salutation?: 'MME' | 'MR' | null;
  firstName?: string | null;
  lastName?: string | null;
  address1?: string | null;
  address2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  countryCode?: string | null;
  phoneE164?: string | null;
}

export interface EmailPreferences {
  transactionalOptIn: boolean;
  marketingOptIn: boolean;
  abandonedCartOptIn: boolean;
  postPurchaseOptIn: boolean;
  reorderOptIn: boolean;
  winbackOptIn: boolean;
  updatedAt?: string;
}

export interface AccountOrderDetail {
  id: string;
  reference: string;
  status: string;
  createdAt: string;
  totals: {
    subtotalCents: number;
    shippingCents: number;
    discountTotalCents: number;
    totalCents: number;
  };
  payment: {
    method?: string | null;
    status?: string | null;
    stripeSessionId?: string | null;
  };
  shipping: {
    carrier?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    offerLabel?: string | null;
    mode?: string | null;
  };
  items: Array<{
    id: string;
    qty: number;
    unitPriceCents: number;
    lineTotalCents: number;
    lineSubtotalCents: number;
    lineDiscountCents: number;
    snapshot?: any;
  }>;
  billingAddress?: AddressSnapshot | null;
  shippingAddress?: AddressSnapshot | null;
}

export interface ProductOptionValue {
  id: string;
  value: string;
  optionId: string;
  position: number;
  optionName?: string;
}

export interface ProductOption {
  id: string;
  name: string;
  position: number;
  values: ProductOptionValue[];
}

export interface ProductVariant {
  id: string;
  sku?: string | null;
  priceCents: number;
  stockQty?: number | null;
  imageUrl?: string | null;
  isActive: boolean;
  optionValues?: ProductOptionValue[];
}

export interface Product {
  id: string;
  type: string;
  title: string;
  slug: string;
  description?: string | null;
  isActive: boolean;
  images?: string[];
  priceCents?: number;
  stockQty?: number | null;
  options?: ProductOption[];
  variants?: ProductVariant[];
  defaultVariant?: ProductVariant | null;
}

export interface CartItemResponse {
  id: string;
  itemType: 'BLEND' | 'VARIANT' | 'PACK' | 'SUBSCRIPTION';
  qty: number;
  unitPriceCents: number;
  snapshot: any;
  isGift?: boolean;
  subscriptionPlanId?: string | null;
  lineSubtotalCents: number;
  lineDiscountCents: number;
  lineTotalCents: number;
}

export interface BlendListing {
  id: string;
  blendId: string;
  createdFromOrderId?: string | null;
  createdBy?: string | null;
  ranking: number;
  title: string;
  slug: string;
  description?: string | null;
  coverImageUrl?: string | null;
  isActive: boolean;
  blend?: {
    id?: string;
    name?: string;
    description?: string | null;
    color?: string;
    coverImageUrl?: string | null;
    ingredients?: Array<{
      id?: string;
      ingredientId?: string;
      quantity?: number;
      ingredient?: {
        id?: string;
        name?: string;
        category?: string;
        color?: string;
        price?: number;
        dayMoments?: string[] | null;
        infusionTime?: string | null;
        dosage?: string | null;
        temperature?: string | null;
        preparation?: string | null;
        origin?: string | null;
      };
      name?: string;
      category?: string;
      dayMoments?: string[] | null;
      infusionTime?: string | null;
      dosage?: string | null;
      temperature?: string | null;
      preparation?: string | null;
      origin?: string | null;
    }>;
  } | null;
  createdFromOrder?: {
    id: string;
    orderNumber: string;
    customer?: {
      firstName?: string | null;
      lastName?: string | null;
    } | null;
  } | null;
}

export interface SubscriptionPlan {
  id: string;
  productId: string;
  interval: string;
  intervalCount: number;
  stripePriceId: string;
  isActive: boolean;
  product?: Product;
}

export interface CartResponse {
  id: string;
  status: string;
  currency: string;
  items: CartItemResponse[];
  totals: {
    subtotalCents: number;
    shippingCents: number;
    discountTotalCents: number;
    totalCents: number;
  };
}

export interface WishlistCreationIngredient {
  id: string;
  name: string;
  color: string;
  category: string;
}

export interface WishlistCreation {
  id: string;
  createdAt: string;
  name: string;
  ingredientIds: string[];
  ingredients: WishlistCreationIngredient[];
  blendFormat?: 'POUCH_100G' | 'MUSLIN_20';
  base: {
    colors: Array<{ hex: string }>;
  };
  blendColor: string;
  priceCents: number;
}

export const api = {
  async getMe(): Promise<{ customer: CustomerProfile }> {
    return fetchAPI('/me');
  },

  async register(payload: {
    email: string;
    password: string;
    salutation?: 'MME' | 'MR' | null;
    firstName?: string;
    lastName?: string;
    birthDate?: string | null;
    phoneE164?: string | null;
  }) {
    return fetchAPI('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async login(payload: { email: string; password: string }) {
    return fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async forgotPassword(payload: { email: string }): Promise<ForgotPasswordResponse> {
    return fetchAPI('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async validateResetPasswordToken(token: string): Promise<ResetPasswordValidateResponse> {
    const query = new URLSearchParams({ token });
    return fetchAPI(`/auth/reset-password/validate?${query.toString()}`);
  },

  async resetPassword(payload: { token: string; newPassword: string }): Promise<{ ok: boolean; message?: string }> {
    return fetchAPI('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async createGuestSession(payload?: { guestCustomerId?: string | null }) {
    return fetchAPI('/auth/guest', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  async logout() {
    return fetchAPI('/auth/logout', { method: 'POST' });
  },

  async getCart(shippingSelection?: ShippingSelection | null): Promise<CartResponse> {
    return fetchAPI(`/cart${shippingSelectionQuery(shippingSelection)}`);
  },

  async addCartItem(payload: {
    itemType?: 'BLEND' | 'VARIANT' | 'PACK' | 'SUBSCRIPTION';
    qty?: number;
    name?: string;
    ingredientIds?: string[];
    blendFormat?: 'POUCH_100G' | 'MUSLIN_20';
    variantId?: string;
    productId?: string;
    subscriptionPlanId?: string;
    items?: Array<{ itemType: 'BLEND' | 'VARIANT' | 'PACK' | 'SUBSCRIPTION'; qty?: number; name?: string; ingredientIds?: string[]; blendFormat?: 'POUCH_100G' | 'MUSLIN_20'; variantId?: string; productId?: string; subscriptionPlanId?: string }>;
  }, shippingSelection?: ShippingSelection | null): Promise<CartResponse> {
    return fetchAPI(`/cart/items${shippingSelectionQuery(shippingSelection)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateCartItem(id: string, qty: number, shippingSelection?: ShippingSelection | null): Promise<CartResponse> {
    return fetchAPI(`/cart/items/${id}${shippingSelectionQuery(shippingSelection)}`, {
      method: 'PATCH',
      body: JSON.stringify({ qty }),
    });
  },

  async removeCartItem(id: string, shippingSelection?: ShippingSelection | null): Promise<CartResponse> {
    return fetchAPI(`/cart/items/${id}${shippingSelectionQuery(shippingSelection)}`, { method: 'DELETE' });
  },

  async getWishlist(): Promise<WishlistCreation[]> {
    return fetchAPI('/wishlist');
  },

  async addWishlistItem(payload: {
    name?: string;
    ingredientIds: string[];
    blendFormat?: 'POUCH_100G' | 'MUSLIN_20';
  }): Promise<WishlistCreation> {
    return fetchAPI('/wishlist', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async removeWishlistItem(id: string): Promise<{ success: boolean }> {
    return fetchAPI(`/wishlist/${id}`, { method: 'DELETE' });
  },

  async getProducts(type?: string): Promise<Product[]> {
    const query = type ? `?type=${encodeURIComponent(type)}` : '';
    return fetchAPI(`/products${query}`);
  },

  async getProduct(slug: string): Promise<Product> {
    return fetchAPI(`/products/${slug}`);
  },

  async checkoutOneTime(payload?: { appliedDiscountCode?: string | null; shippingSelection?: ShippingSelection | null }): Promise<{ url: string | null; id?: string }> {
    return fetchAPI('/checkout/one-time', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  async createCheckoutPaymentIntent(payload: {
    appliedDiscountCode?: string | null;
    comment?: string;
    shippingSelection?: ShippingSelection | null;
    shippingAddress: CheckoutAddressInput;
    billingAddress?: CheckoutAddressInput | null;
  }): Promise<CheckoutPaymentIntentResponse> {
    return fetchAPI('/checkout/payment-intent', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async checkoutSubscription(payload: { planId: string; successUrl?: string; cancelUrl?: string }): Promise<{ url: string | null; id?: string }> {
    return fetchAPI('/checkout/subscription', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getOrderBySession(sessionId: string) {
    return fetchAPI(`/orders/by-session/${sessionId}`);
  },

  async getOrderByPaymentIntent(paymentIntentId: string) {
    return fetchAPI(`/orders/by-payment-intent/${paymentIntentId}`);
  },

  // Ingredients
  async getIngredients(): Promise<Ingredient[]> {
    return fetchAPI('/ingredients');
  },

  async getIngredient(id: string): Promise<Ingredient> {
    return fetchAPI(`/ingredients/${id}`);
  },

  async validateCartTotal(payload: { ingredientIds: string[]; total: number }) {
    return fetchAPI('/cart/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getCartSummary(payload: {
    items: Array<{
      ingredientIds?: string[];
      ingredientNames?: string[];
      quantity: number;
      unitPriceCents?: number;
      lineSubtotalCents?: number;
      itemType?: 'BLEND' | 'VARIANT' | 'PACK' | 'SUBSCRIPTION';
      productId?: string | null;
      variantId?: string | null;
      subscriptionPlanId?: string | null;
      isGift?: boolean;
    }>;
    appliedDiscountCode?: string | null;
    customerEmail?: string | null;
    shippingSelection?: ShippingSelection | null;
  }): Promise<CartSummary> {
    return fetchAPI('/cart/summary', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async createStripeCheckoutSession(payload: {
    items: Array<{ name: string; ingredientIds: string[]; ingredientNames?: string[]; quantity: number }>;
    appliedDiscountCode?: string | null;
    customerEmail?: string | null;
    shippingSelection?: ShippingSelection | null;
  }): Promise<{ url: string | null; id?: string }> {
    return fetchAPI('/checkout/stripe-session', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async createStripeOrder(payload: {
    sessionId: string;
    items: Array<{ name: string; ingredientIds: string[]; ingredientNames?: string[]; quantity: number }>;
    appliedDiscountCode?: string | null;
    shippingSelection?: ShippingSelection | null;
  }): Promise<{
    id: string;
    orderNumber: string;
    subtotalCents: number;
    shippingCents: number;
    discountTotalCents: number;
    totalCents: number;
  }> {
    return fetchAPI('/orders/stripe-success', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getShippingOffers(): Promise<ShippingOffer[]> {
    return fetchAPI('/shipping/offers');
  },

  async getShippingQuote(shippingSelection?: ShippingSelection | null): Promise<ShippingQuote> {
    return fetchAPI(`/shipping/quote${shippingSelectionQuery(shippingSelection)}`);
  },

  async getShippingAllowedCountries(): Promise<ShippingAllowedCountriesResponse> {
    return fetchAPI('/shipping/allowed-countries');
  },

  async getStoreSettings(): Promise<StoreSettings> {
    return fetchAPI('/store-settings');
  },

  async getBlendListings(): Promise<BlendListing[]> {
    return fetchAPI('/blend-listings');
  },

  async getBlendListing(slug: string): Promise<BlendListing> {
    return fetchAPI(`/blend-listings/${slug}`);
  },

  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return fetchAPI('/subscription-plans');
  },

  async getRelayPoints(params: {
    postalCode: string;
    countryCode: string;
    city?: string;
    shippingOfferCode?: string;
  }) {
    const query = new URLSearchParams({
      postalCode: params.postalCode,
      countryCode: params.countryCode,
      ...(params.city ? { city: params.city } : {}),
      ...(params.shippingOfferCode ? { shippingOfferCode: params.shippingOfferCode } : {}),
    });
    return fetchAPI(`/shipping/relay-points?${query.toString()}`);
  },

  // Orders
  async createOrder(orderData: CreateOrderDto) {
    return fetchAPI('/orders', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
  },

  // Account
  async getAccountOrders(page = 1, pageSize = 10): Promise<AccountOrderListResponse> {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    return fetchAPI(`/account/orders?${query.toString()}`);
  },

  async getAccountOrder(orderId: string): Promise<AccountOrderDetail> {
    return fetchAPI(`/account/orders/${orderId}`);
  },

  async getAccountAddresses(): Promise<{ addresses: AccountAddress[] }> {
    return fetchAPI('/account/addresses');
  },

  async createAccountAddress(payload: AccountAddressPayload) {
    return fetchAPI('/account/addresses', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateAccountAddress(id: string, payload: Partial<AccountAddressPayload>) {
    return fetchAPI(`/account/addresses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deleteAccountAddress(id: string) {
    return fetchAPI(`/account/addresses/${id}`, { method: 'DELETE' });
  },

  async setAccountAddressDefaults(payload: { defaultBillingId?: string | null; defaultShippingId?: string | null }) {
    return fetchAPI('/account/addresses/defaults', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async updateAccountProfile(payload: { salutation?: 'MME' | 'MR' | null; firstName: string; lastName: string; birthDate?: string | null; phoneE164?: string | null }) {
    return fetchAPI('/account/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async updateAccountEmail(payload: { email: string; currentPassword?: string }) {
    return fetchAPI('/account/email', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async updateAccountPassword(payload: { currentPassword: string; newPassword: string }) {
    return fetchAPI('/account/password', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async getEmailPreferences(): Promise<{ preferences: EmailPreferences }> {
    return fetchAPI('/account/email-preferences');
  },

  async updateEmailPreferences(payload: Partial<EmailPreferences>): Promise<{ preferences: EmailPreferences }> {
    return fetchAPI('/account/email-preferences', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  // Auth (legacy)
};
