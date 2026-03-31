import { DEFAULT_LOCALE_MARKET, readLocaleMarketPreference } from '@/lib/locale-market';
import { t } from '@/lib/i18n';

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
  countryCode?: string;
  postalCode?: string;
  city?: string;
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
    subtotalDiscountCents?: number;
    discountTotalCents: number;
    totalCents: number;
  };
}

export interface ShippingQuote {
  shippingCents: number;
  defaultShippingCents: number;
  zone?: 'FR_METRO' | 'EUROPE_DOM_TOM' | 'INTERNATIONAL' | null;
  supportsRelay?: boolean;
  freeShippingThresholdCents?: number | null;
  mode?: 'HOME' | 'RELAY' | null;
  offerId?: string | null;
  offerCode?: string | null;
  offerLabel?: string | null;
  source?: string | null;
}

export interface ShippingAllowedCountriesResponse {
  allowedCountries: string[];
}

export interface RedirectResolveResponse {
  matched: boolean;
  targetPath?: string;
  statusCode?: 301 | 302;
  abVariantApplied?: boolean;
  rule?: {
    id: string;
    name: string;
    matchType: 'EXACT' | 'PREFIX' | 'REGEX';
    sourcePath: string;
  };
}

export interface StoreSettings {
  id: string;
  freeShippingThresholdCents: number;
  defaultShippingCents: number;
  frHomeShippingCents: number;
  frRelayShippingCents: number;
  beHomeShippingCents: number;
  beRelayShippingCents: number;
  europeShippingCents: number;
  internationalShippingCents: number;
  currency: string;
  shopAddress: string;
  shopPhone: string;
  contactEmail: string;
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

const defaultApiErrorMessageByStatus = (status: number) => {
  if (status === 401) return t('app.lib.api_errors.not_authenticated');
  if (status === 403) return t('app.lib.api_errors.access_denied');
  if (status === 404) return t('app.lib.api_errors.resource_not_found');
  if (status >= 500) return t('app.lib.api_errors.server_error');
  return t('app.lib.api_errors.request_failed');
};

const API_ERROR_MESSAGE_TO_KEY: Record<string, string> = {
  'email and password required': 'app.lib.api_errors.email_password_required',
  'invalid credentials': 'app.lib.api_errors.invalid_credentials',
  'login failed': 'app.lib.api_errors.login_failed',
  'missing required fields': 'app.lib.api_errors.missing_required_fields',
  'password too short': 'app.lib.api_errors.password_too_short',
  'invalid salutation': 'app.lib.api_errors.invalid_salutation',
  'invalid birth date': 'app.lib.api_errors.invalid_birth_date',
  'invalid phone format': 'app.lib.api_errors.invalid_phone_format',
  'registration failed': 'app.lib.api_errors.registration_failed',
  'failed to process forgot password request': 'app.lib.api_errors.failed_process_forgot_password_request',
  'token is required': 'app.lib.api_errors.token_required',
  'failed to validate reset token': 'app.lib.api_errors.failed_validate_reset_token',
  'token and newpassword are required': 'app.lib.api_errors.token_new_password_required',
  'password must contain at least 8 characters': 'app.lib.api_errors.password_min_length',
  'invalid or expired reset token': 'app.lib.api_errors.invalid_or_expired_reset_token',
  'failed to reset password': 'app.lib.api_errors.failed_reset_password',
  'not authenticated': 'app.lib.api_errors.not_authenticated',
  'current password required': 'app.lib.api_errors.current_password_required',
  'invalid password': 'app.lib.api_errors.invalid_password',
  'password update not available': 'app.lib.api_errors.password_update_not_available',
  'email is required': 'app.lib.api_errors.email_required',
  'customer not found': 'app.lib.api_errors.customer_not_found',
  'failed to update email': 'app.lib.api_errors.failed_update_email',
  'failed to update password': 'app.lib.api_errors.failed_update_password',
  'failed to fetch profile': 'app.lib.api_errors.failed_fetch_profile',
  'address not found': 'app.lib.api_errors.resource_not_found',
};

const localizeApiErrorMessage = (rawMessage: unknown, status: number) => {
  const message = String(rawMessage || '').trim();
  if (!message) {
    return defaultApiErrorMessageByStatus(status);
  }
  const mappedKey = API_ERROR_MESSAGE_TO_KEY[message.toLowerCase()];
  if (mappedKey) {
    return t(mappedKey);
  }
  if (/^api error:/i.test(message)) {
    return defaultApiErrorMessageByStatus(status);
  }
  return message;
};

async function fetchAPI(endpoint: string, options?: RequestInit) {
  const locale = typeof window === 'undefined'
    ? DEFAULT_LOCALE_MARKET.locale
    : (readLocaleMarketPreference()?.locale || DEFAULT_LOCALE_MARKET.locale);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': locale,
        ...options?.headers,
      },
    });
  } catch {
    throw new Error(t('app.lib.api_errors.network_error'));
  }

  if (!response.ok) {
    let rawErrorMessage: string | undefined;
    try {
      const data = await response.json();
      if (typeof data?.error === 'string' && data.error.trim()) {
        rawErrorMessage = data.error;
      } else if (typeof data?.message === 'string' && data.message.trim()) {
        rawErrorMessage = data.message;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(localizeApiErrorMessage(rawErrorMessage || `API error: ${response.statusText}`, response.status));
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
  if (shippingSelection?.countryCode) {
    query.set('countryCode', shippingSelection.countryCode);
  }
  if (shippingSelection?.postalCode) {
    query.set('postalCode', shippingSelection.postalCode);
  }
  if (shippingSelection?.city) {
    query.set('city', shippingSelection.city);
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

export interface NewsletterSubscriptionResponse {
  ok: boolean;
  status: 'SUBSCRIBED' | 'UNSUBSCRIBED';
  message?: string;
  alreadySubscribed?: boolean;
}

export interface ContactMessageResponse {
  ok: boolean;
  message?: string;
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
    subtotalDiscountCents?: number;
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
    itemType?: 'BLEND' | 'VARIANT' | 'PACK' | 'SUBSCRIPTION';
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
  images?: string[];
  isActive: boolean;
  optionValues?: ProductOptionValue[];
}

export interface Product {
  id: string;
  type: string;
  title: string;
  slug: string;
  sku?: string | null;
  description?: string | null;
  additionalDetails?: string | null;
  tags?: string[];
  ranking: number;
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
  priceCents?: number;
  priceByFormatCents?: Partial<Record<'POUCH_100G' | 'MUSLIN_20', number>>;
  pricingErrorCode?: string | null;
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

export interface AccountSubscription {
  id: string;
  kind: string;
  title?: string | null;
  status: string;
  interval: string;
  intervalCount: number;
  currency: string;
  unitPriceCents: number;
  shippingCents: number;
  totalCents: number;
  discountPercent: number;
  blendFormat?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  snapshot?: any;
}

export interface AccountSubscriptionPaymentMethodSummary {
  id: string;
  brand: string;
  last4: string;
  expMonth?: number | null;
  expYear?: number | null;
}

export interface AccountSubscriptionInvoice {
  id: string;
  number: string;
  status: string;
  currency: string;
  totalCents: number;
  amountPaidCents: number;
  hostedInvoiceUrl?: string | null;
  invoicePdf?: string | null;
  invoiceUrl?: string | null;
  createdAt: string;
  subscriptionTitle?: string | null;
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
  itemType?: 'BLEND' | 'VARIANT';
  ingredientIds: string[];
  ingredients: WishlistCreationIngredient[];
  blendFormat?: 'POUCH_100G' | 'MUSLIN_20';
  base: {
    colors: Array<{ hex: string }>;
  };
  blendColor: string;
  priceCents: number;
  productId?: string | null;
  productSlug?: string | null;
  variantId?: string | null;
  sku?: string | null;
  imageUrl?: string | null;
  selectedOptions?: Array<{
    name: string;
    value: string;
  }>;
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
    marketingEmailsOptIn?: boolean;
    reminderEmailsOptIn?: boolean;
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

  async subscribeNewsletter(payload: {
    email: string;
    consent: boolean;
    source?: string;
    consentVersion?: string;
  }): Promise<NewsletterSubscriptionResponse> {
    return fetchAPI('/newsletter/subscribe', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async unsubscribeNewsletter(payload: {
    email: string;
    source?: string;
  }): Promise<NewsletterSubscriptionResponse> {
    return fetchAPI('/newsletter/unsubscribe', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async sendContactMessage(payload: {
    fullName: string;
    email: string;
    subject: string;
    orderNumber?: string;
    message: string;
    source?: string;
  }): Promise<ContactMessageResponse> {
    return fetchAPI('/contact', {
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
    purchaseMode?: 'ONE_TIME' | 'SUBSCRIPTION';
    sourceType?: 'LISTING' | 'CUSTOM';
    listingId?: string;
    intervalCount?: 1 | 2 | 3;
    basePriceCents?: number;
    variantId?: string;
    productId?: string;
    subscriptionPlanId?: string;
    items?: Array<{
      itemType: 'BLEND' | 'VARIANT' | 'PACK' | 'SUBSCRIPTION';
      qty?: number;
      name?: string;
      ingredientIds?: string[];
      blendFormat?: 'POUCH_100G' | 'MUSLIN_20';
      purchaseMode?: 'ONE_TIME' | 'SUBSCRIPTION';
      sourceType?: 'LISTING' | 'CUSTOM';
      listingId?: string;
      intervalCount?: 1 | 2 | 3;
      basePriceCents?: number;
      variantId?: string;
      productId?: string;
      subscriptionPlanId?: string;
    }>;
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
    ingredientIds?: string[];
    blendFormat?: 'POUCH_100G' | 'MUSLIN_20';
    productId?: string;
    variantId?: string;
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

  async checkoutBlendSubscription(payload: {
    sourceType: 'LISTING' | 'CUSTOM';
    listingId?: string;
    title?: string;
    ingredientIds?: string[];
    blendFormat?: 'POUCH_100G' | 'MUSLIN_20';
    intervalCount?: 1 | 2 | 3;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<{
    url: string | null;
    id?: string;
    pricing?: {
      basePriceCents: number;
      unitPriceCents: number;
      shippingCents: number;
      totalCents: number;
      intervalCount: number;
    };
  }> {
    return fetchAPI('/checkout/blend-subscription', {
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

  async validateCartTotal(payload: { ingredientIds: string[]; total: number; blendFormat?: 'POUCH_100G' | 'MUSLIN_20' }) {
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
      blendFormat?: 'POUCH_100G' | 'MUSLIN_20';
      itemType?: 'BLEND' | 'VARIANT' | 'PACK' | 'SUBSCRIPTION';
      purchaseMode?: 'ONE_TIME' | 'SUBSCRIPTION';
      intervalCount?: 1 | 2 | 3;
      basePriceCents?: number;
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
    items: Array<{ name: string; ingredientIds: string[]; ingredientNames?: string[]; quantity: number; blendFormat?: 'POUCH_100G' | 'MUSLIN_20' }>;
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
    items: Array<{ name: string; ingredientIds: string[]; ingredientNames?: string[]; quantity: number; blendFormat?: 'POUCH_100G' | 'MUSLIN_20' }>;
    appliedDiscountCode?: string | null;
    shippingSelection?: ShippingSelection | null;
  }): Promise<{
    id: string;
    orderNumber: string;
    subtotalCents: number;
    shippingCents: number;
    subtotalDiscountCents?: number;
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

  async resolveRedirect(params: {
    path: string;
    locale?: string;
    countryCode?: string;
    seed?: string;
  }): Promise<RedirectResolveResponse> {
    const query = new URLSearchParams();
    query.set('path', params.path);
    if (params.locale) query.set('locale', params.locale);
    if (params.countryCode) query.set('countryCode', params.countryCode);
    if (params.seed) query.set('seed', params.seed);
    return fetchAPI(`/redirects/resolve?${query.toString()}`);
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

  async getAccountSubscriptions(): Promise<{ subscriptions: AccountSubscription[] }> {
    return fetchAPI('/account/subscriptions');
  },

  async getAccountSubscriptionPaymentMethod(): Promise<{ paymentMethod: AccountSubscriptionPaymentMethodSummary | null }> {
    return fetchAPI('/account/subscriptions/payment-method');
  },

  async createAccountSubscriptionSetupIntent(): Promise<{ setupIntentId: string; clientSecret: string | null }> {
    return fetchAPI('/account/subscriptions/payment-method/setup-intent', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async setAccountSubscriptionDefaultPaymentMethod(payload: { setupIntentId: string }): Promise<{ paymentMethod: AccountSubscriptionPaymentMethodSummary | null }> {
    return fetchAPI('/account/subscriptions/payment-method/default', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getAccountSubscriptionInvoices(): Promise<{ invoices: AccountSubscriptionInvoice[] }> {
    return fetchAPI('/account/subscriptions/invoices');
  },

  async cancelAccountSubscription(subscriptionId: string): Promise<{ subscription: AccountSubscription }> {
    return fetchAPI(`/account/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async reactivateAccountSubscription(subscriptionId: string): Promise<{ subscription: AccountSubscription }> {
    return fetchAPI(`/account/subscriptions/${subscriptionId}/reactivate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async createSubscriptionPortalSession(payload?: { returnUrl?: string }): Promise<{ url: string }> {
    return fetchAPI('/account/subscriptions/portal-session', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
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
