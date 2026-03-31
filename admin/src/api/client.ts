const API_URL = 'http://localhost:5000';

interface AuthResponse {
  user: { id: string; email: string; role: string };
  token: string;
}

export interface AutomationJobConfig {
  id: string;
  name: string;
  description: string;
  intervalMs: number;
  intervalMinutes: number;
  enabled: boolean;
  running: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  updatedAt: string;
}

export interface AutomationJobRunResult {
  jobId: string;
  status: 'OK' | 'SKIPPED' | 'ERROR';
  message: string;
  metrics: Record<string, number>;
}

export interface EmailDeliveryRow {
  id: string;
  customerId?: string | null;
  orderId?: string | null;
  campaignKey?: string | null;
  type: string;
  channel: string;
  recipient: string;
  subject: string;
  status: string;
  provider?: string | null;
  providerMessageId?: string | null;
  error?: string | null;
  attemptCount: number;
  nextAttemptAt?: string | null;
  sentAt?: string | null;
  createdAt: string;
  updatedAt: string;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  customerEmail?: string | null;
  orderNumber?: string | null;
}

export interface EmailDeliveriesResponse {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  items: EmailDeliveryRow[];
}

export interface EmailMetricsResponse {
  days: number;
  summary: {
    total: number;
    sent: number;
    failed: number;
    retry: number;
    pending: number;
  };
  conversion: {
    touches: number;
    conversions: number;
    conversionRate: number;
    revenueCents: number;
  };
  campaigns: Array<{
    type: string;
    total: number;
    sent: number;
    failed: number;
  }>;
}

export type RedirectMatchType = 'EXACT' | 'PREFIX' | 'REGEX';

export interface RedirectRule {
  id: string;
  name: string;
  description?: string | null;
  sourcePath: string;
  matchType: RedirectMatchType;
  targetPath: string;
  statusCode: 301 | 302;
  isActive: boolean;
  priority: number;
  countryCodes: string[];
  locales: string[];
  abTestPercent: number;
  abTestTargetPath?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RedirectResolveResult {
  matched: boolean;
  targetPath?: string;
  statusCode?: 301 | 302;
  abVariantApplied?: boolean;
  rule?: {
    id: string;
    name: string;
    matchType: RedirectMatchType;
    sourcePath: string;
  };
}

export type TranslatableEntityType =
  | 'INGREDIENT'
  | 'PRODUCT'
  | 'PRODUCT_OPTION'
  | 'PRODUCT_OPTION_VALUE'
  | 'BLEND'
  | 'BLEND_LISTING';

export interface TranslationConfigEntry {
  entityType: TranslatableEntityType;
  fields: string[];
}

export interface TranslationConfigResponse {
  entities: TranslationConfigEntry[];
}

export interface EntityTranslationRow {
  id: string;
  entityType: TranslatableEntityType;
  entityId: string;
  field: string;
  locale: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface EntityTranslationsResponse {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  items: EntityTranslationRow[];
}

export const api = {
  // Auth
  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Login failed');
    return res.json();
  },

  async uploadImage(file: File, folder: string, token: string) {
    const formData = new FormData();
    formData.append('folder', folder);
    formData.append('file', file);

    const res = await fetch(`${API_URL}/api/admin/uploads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    if (!res.ok) {
      let message = 'Upload failed';
      try {
        const data = await res.json();
        if (data.error) message = data.error;
      } catch {
        // ignore parse errors
      }
      throw new Error(message);
    }
    return res.json();
  },

  // Ingredients
  async getIngredients() {
    const res = await fetch(`${API_URL}/api/ingredients`);
    return res.json();
  },

  async createIngredient(data: any, token: string) {
    const res = await fetch(`${API_URL}/api/ingredients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateIngredient(id: string, data: any, token: string) {
    const res = await fetch(`${API_URL}/api/ingredients/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async deleteIngredient(id: string, token: string) {
    const res = await fetch(`${API_URL}/api/ingredients/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      let message = 'Delete failed';
      try {
        const data = await res.json();
        if (data.error) message = data.error;
      } catch {
        // ignore parse errors
      }
      throw new Error(message);
    }
    if (res.status === 204) return null;
    return res.json();
  },

  // Orders
  async getOrders(token: string) {
    const res = await fetch(`${API_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  async getOrder(id: string, token: string) {
    const res = await fetch(`${API_URL}/api/orders/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  async updateOrderStatus(
    id: string,
    statusOrPayload:
      | string
      | {
          status: string;
          reason?: string | null;
          trackingNumber?: string | null;
          trackingUrl?: string | null;
          shippingProvider?: string | null;
        },
    token: string
  ) {
    const payload =
      typeof statusOrPayload === 'string' ? { status: statusOrPayload } : statusOrPayload;
    const res = await fetch(`${API_URL}/api/orders/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || 'Failed to update order status');
    }
    return res.json();
  },

  // Shipments
  async getShipments(token: string) {
    const res = await fetch(`${API_URL}/api/shipments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  async getShipment(id: string, token: string) {
    const res = await fetch(`${API_URL}/api/shipments/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  async refreshShipmentLabel(id: string, token: string) {
    const res = await fetch(`${API_URL}/api/shipments/${id}/refresh-label`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  async refreshShipmentTracking(id: string, token: string) {
    const res = await fetch(`${API_URL}/api/shipments/${id}/refresh-tracking`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  // Discounts
  async getDiscounts() {
    const res = await fetch(`${API_URL}/api/discounts`);
    return res.json();
  },

  async getDiscount(id: string) {
    const res = await fetch(`${API_URL}/api/discounts/${id}`);
    return res.json();
  },

  async createDiscount(data: any, token: string) {
    const res = await fetch(`${API_URL}/api/discounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateDiscount(id: string, data: any, token: string) {
    const res = await fetch(`${API_URL}/api/discounts/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateDiscountStatus(id: string, status: string, token: string) {
    const res = await fetch(`${API_URL}/api/discounts/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
    return res.json();
  },

  // Products (admin)
  async getAdminProducts() {
    const res = await fetch(`${API_URL}/api/admin/products`);
    return res.json();
  },

  async getAdminProduct(id: string) {
    const res = await fetch(`${API_URL}/api/admin/products/${id}`);
    return res.json();
  },

  async createProduct(data: any, token: string) {
    const res = await fetch(`${API_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateProduct(id: string, data: any, token: string) {
    const res = await fetch(`${API_URL}/api/admin/products/${id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      }
    );
    return res.json();
  },

  async deleteProduct(id: string, token: string) {
    const res = await fetch(`${API_URL}/api/admin/products/${id}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.status === 204) return null;
    return res.json();
  },

  // Packs
  async getAdminPacks() {
    const res = await fetch(`${API_URL}/api/admin/packs`);
    return res.json();
  },

  async getPackItems(packProductId: string) {
    const res = await fetch(`${API_URL}/api/admin/packs/${packProductId}/items`);
    return res.json();
  },

  async createPackItem(packProductId: string, data: { componentVariantId: string; qty: number }, token: string) {
    const res = await fetch(`${API_URL}/api/admin/packs/${packProductId}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updatePackItem(id: string, data: { qty: number }, token: string) {
    const res = await fetch(`${API_URL}/api/admin/pack-items/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async deletePackItem(id: string, token: string) {
    const res = await fetch(`${API_URL}/api/admin/pack-items/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 204) return null;
    return res.json();
  },

  // Blend listings
  async getAdminBlendListings() {
    const res = await fetch(`${API_URL}/api/admin/blend-listings`);
    return res.json();
  },

  async createBlendListing(data: any, token: string) {
    const res = await fetch(`${API_URL}/api/admin/blend-listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateBlendListing(id: string, data: any, token: string) {
    const res = await fetch(`${API_URL}/api/admin/blend-listings/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async deleteBlendListing(id: string, token: string) {
    const res = await fetch(`${API_URL}/api/admin/blend-listings/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 204) {
      let message = 'Delete failed';
      try {
        const data = await res.json();
        if (data.error) message = data.error;
      } catch {
        // ignore parse errors
      }
      throw new Error(message);
    }
    if (res.status === 204) return null;
    return res.json();
  },

  // Subscription plans
  async getAdminSubscriptionPlans() {
    const res = await fetch(`${API_URL}/api/admin/subscription-plans`);
    return res.json();
  },

  async createSubscriptionPlan(data: any, token: string) {
    const res = await fetch(`${API_URL}/api/admin/subscription-plans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateSubscriptionPlan(id: string, data: any, token: string) {
    const res = await fetch(`${API_URL}/api/admin/subscription-plans/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async deleteSubscriptionPlan(id: string, token: string) {
    const res = await fetch(`${API_URL}/api/admin/subscription-plans/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 204) return null;
    return res.json();
  },

  async getProductOptions(productId: string) {
    const res = await fetch(`${API_URL}/api/admin/products/${productId}/options`);
    return res.json();
  },

  async createOption(productId: string, data: any, token: string) {
    const res = await fetch(`${API_URL}/api/admin/products/${productId}/options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateOption(id: string, data: any, token: string) {
    const res = await fetch(`${API_URL}/api/admin/options/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async deleteOption(id: string, token: string) {
    const res = await fetch(`${API_URL}/api/admin/options/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 204) return null;
    return res.json();
  },

  async createOptionValue(optionId: string, data: any, token: string) {
    const res = await fetch(`${API_URL}/api/admin/options/${optionId}/values`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateOptionValue(id: string, data: any, token: string) {
    const res = await fetch(`${API_URL}/api/admin/option-values/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async deleteOptionValue(id: string, token: string) {
    const res = await fetch(`${API_URL}/api/admin/option-values/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 204) return null;
    return res.json();
  },

  async getProductVariants(productId: string) {
    const res = await fetch(`${API_URL}/api/admin/products/${productId}/variants`);
    return res.json();
  },

  async createVariant(productId: string, data: any, token: string) {
    const res = await fetch(`${API_URL}/api/admin/products/${productId}/variants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateVariant(id: string, data: any, token: string) {
    const res = await fetch(`${API_URL}/api/admin/variants/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async deleteVariant(id: string, token: string) {
    const res = await fetch(`${API_URL}/api/admin/variants/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 204) return null;
    return res.json();
  },

  // Customers (admin)
  async getCustomers() {
    const res = await fetch(`${API_URL}/api/admin/customers`);
    return res.json();
  },

  async getCustomer(id: string) {
    const res = await fetch(`${API_URL}/api/admin/customers/${id}`);
    return res.json();
  },

  async getCustomerWishlists(id: string) {
    const res = await fetch(`${API_URL}/api/admin/customers/${id}/wishlists`);
    return res.json();
  },

  async deleteCustomer(id: string, token: string) {
    const res = await fetch(`${API_URL}/api/admin/customers/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || 'Failed to delete customer');
    }
    if (res.status === 204) return null;
    return res.json();
  },

  // Carts (admin)
  async getCarts() {
    const res = await fetch(`${API_URL}/api/admin/carts?t=${Date.now()}`, {
      cache: 'no-store',
    });
    return res.json();
  },

  // Store settings (admin)
  async getStoreSettings() {
    const res = await fetch(`${API_URL}/api/admin/store-settings`);
    return res.json();
  },

  async updateStoreSettings(data: any, token: string) {
    const res = await fetch(`${API_URL}/api/admin/store-settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Redirect rules (admin)
  async getRedirectRules(token: string): Promise<RedirectRule[]> {
    const res = await fetch(`${API_URL}/api/admin/redirect-rules`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || 'Failed to fetch redirect rules');
    }
    return Array.isArray(body) ? (body as RedirectRule[]) : [];
  },

  async createRedirectRule(data: Partial<RedirectRule>, token: string): Promise<RedirectRule> {
    const res = await fetch(`${API_URL}/api/admin/redirect-rules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || 'Failed to create redirect rule');
    }
    return body as RedirectRule;
  },

  async updateRedirectRule(id: string, data: Partial<RedirectRule>, token: string): Promise<RedirectRule> {
    const res = await fetch(`${API_URL}/api/admin/redirect-rules/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || 'Failed to update redirect rule');
    }
    return body as RedirectRule;
  },

  async deleteRedirectRule(id: string, token: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/admin/redirect-rules/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 204) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || 'Failed to delete redirect rule');
    }
  },

  async resolveRedirectRule(params: {
    path: string;
    locale?: string;
    countryCode?: string;
    seed?: string;
  }): Promise<RedirectResolveResult> {
    const query = new URLSearchParams();
    query.set('path', params.path);
    if (params.locale) query.set('locale', params.locale);
    if (params.countryCode) query.set('countryCode', params.countryCode);
    if (params.seed) query.set('seed', params.seed);
    const res = await fetch(`${API_URL}/api/redirects/resolve?${query.toString()}`);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || 'Failed to resolve redirect');
    }
    return body as RedirectResolveResult;
  },

  // Business translations (admin)
  async getTranslationsConfig(token: string): Promise<TranslationConfigResponse> {
    const res = await fetch(`${API_URL}/api/admin/translations/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || 'Failed to fetch translation config');
    }
    return body as TranslationConfigResponse;
  },

  async getTranslations(
    params: {
      entityType?: TranslatableEntityType | '';
      entityId?: string;
      locale?: string;
      field?: string;
      page?: number;
      pageSize?: number;
    },
    token: string
  ): Promise<EntityTranslationsResponse> {
    const query = new URLSearchParams();
    if (params.entityType) query.set('entityType', params.entityType);
    if (params.entityId) query.set('entityId', params.entityId);
    if (params.locale) query.set('locale', params.locale);
    if (params.field) query.set('field', params.field);
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${API_URL}/api/admin/translations${suffix}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || 'Failed to fetch translations');
    }
    return body as EntityTranslationsResponse;
  },

  async upsertTranslations(
    payload: {
      entityType: TranslatableEntityType;
      entityId: string;
      locale: string;
      values: Record<string, unknown>;
    },
    token: string
  ): Promise<{ ok: boolean; count: number; items: EntityTranslationRow[] }> {
    const res = await fetch(`${API_URL}/api/admin/translations/upsert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || 'Failed to upsert translation');
    }
    return body as { ok: boolean; count: number; items: EntityTranslationRow[] };
  },

  async deleteTranslation(id: string, token: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/admin/translations/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 204) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || 'Failed to delete translation');
    }
  },

  // Automation jobs (admin)
  async getAutomationJobs(token: string): Promise<AutomationJobConfig[]> {
    const res = await fetch(`${API_URL}/api/admin/automation/jobs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body.error || 'Failed to fetch automation jobs');
    }
    return res.json();
  },

  async updateAutomationJob(
    id: string,
    data: { enabled?: boolean; intervalMs?: number; intervalMinutes?: number },
    token: string
  ): Promise<AutomationJobConfig> {
    const res = await fetch(`${API_URL}/api/admin/automation/jobs/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body.error || 'Failed to update automation job');
    }
    return res.json();
  },

  async runAutomationJob(
    id: string,
    token: string
  ): Promise<{ job: AutomationJobConfig | null; result: AutomationJobRunResult }> {
    const res = await fetch(`${API_URL}/api/admin/automation/jobs/${id}/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to run automation job');
    }
    return payload as { job: AutomationJobConfig | null; result: AutomationJobRunResult };
  },

  async getEmailDeliveries(
    params: { page?: number; pageSize?: number; status?: string; type?: string; recipient?: string },
    token: string
  ): Promise<EmailDeliveriesResponse> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.status) query.set('status', params.status);
    if (params.type) query.set('type', params.type);
    if (params.recipient) query.set('recipient', params.recipient);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${API_URL}/api/admin/emails${suffix}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || 'Failed to fetch emails');
    }
    return body as EmailDeliveriesResponse;
  },

  async resendEmailDelivery(id: string, token: string): Promise<{ row: EmailDeliveryRow | null; metrics: Record<string, number> }> {
    const res = await fetch(`${API_URL}/api/admin/emails/${id}/resend`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || 'Failed to resend email');
    }
    return body as { row: EmailDeliveryRow | null; metrics: Record<string, number> };
  },

  async sendAdminTestEmail(payload: { to: string; subject?: string; text?: string; html?: string }, token: string) {
    const res = await fetch(`${API_URL}/api/admin/emails/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || 'Failed to send test email');
    }
    return body;
  },

  async getEmailMetrics(days = 30, token: string): Promise<EmailMetricsResponse> {
    const res = await fetch(`${API_URL}/api/admin/emails/metrics?days=${encodeURIComponent(String(days))}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || 'Failed to fetch email metrics');
    }
    return body as EmailMetricsResponse;
  },
};
