// @ts-nocheck
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { computeDiscounts, FIRST_ORDER_ONLY_NOT_APPLIED_MESSAGE } from './lib/discounts.js';
import { createShippingOrder, getParcelPoints, getShippingDocument, getShippingTracking, quoteShippingOffer } from './lib/boxtal.js';
import { t } from "./lib/i18n.js";
import {
    applyBlendListingTranslations,
    applyIngredientTranslations,
    applyProductTranslations,
    getAllowedTranslationFields,
    loadEntityTranslations,
    resolveLocaleVariants,
    sanitizeEntityTranslationValue,
} from './lib/entity-translations.js';
import { createBlendService } from './modules/blend/service.js';
import { createCommonService } from './modules/common/service.js';
import { registerAutomationRoutes } from './modules/admin/automation-routes.js';
import { registerAdminAuthRoutes } from './modules/admin/auth-routes.js';
import { registerBlendListingRoutes } from './modules/admin/blend-listing-routes.js';
import { registerAdminCommerceRoutes } from './modules/admin/commerce-routes.js';
import { registerAdminCustomerRoutes } from './modules/admin/customer-routes.js';
import { registerAdminEmailRoutes } from './modules/admin/email-routes.js';
import { registerAdminPackRoutes } from './modules/admin/pack-routes.js';
import { registerAdminProductRoutes } from './modules/admin/product-routes.js';
import { registerRedirectRuleRoutes } from './modules/admin/redirect-rule-routes.js';
import { createAdminSecurityService } from './modules/admin/security-service.js';
import { registerStoreSettingsRoutes } from './modules/admin/store-settings-routes.js';
import { registerSubscriptionPlanRoutes } from './modules/admin/subscription-plan-routes.js';
import { registerTranslationRoutes } from './modules/admin/translation-routes.js';
import { registerAccountRoutes } from './modules/account/routes.js';
import { createAuthSessionService } from './modules/auth/session-service.js';
import { registerCheckoutOrderRoutes } from './modules/checkout/order-routes.js';
import { registerCheckoutRoutes } from './modules/checkout/routes.js';
import { registerIngredientRoutes } from './modules/catalog/ingredient-routes.js';
import { registerProductPublicRoutes } from './modules/catalog/product-routes.js';
import { createCatalogService } from './modules/catalog/service.js';
import { registerMediaRoutes } from './modules/admin/media-routes.js';
import { registerCustomerAuthRoutes } from './modules/customer/auth-routes.js';
import { createCartService } from './modules/customer/cart-service.js';
import { registerCustomerCartRoutes } from './modules/customer/cart-routes.js';
import { registerCustomerOAuthRoutes } from './modules/customer/oauth-routes.js';
import { createWishlistService } from './modules/customer/wishlist-service.js';
import { registerCustomerWishlistRoutes } from './modules/customer/wishlist-routes.js';
import { createAutomationService } from './modules/automation/service.js';
import { createDiscountEligibilityService } from './modules/discount/eligibility-service.js';
import { createEmailLinkService } from './modules/email/link-service.js';
import { createEmailService } from './modules/email/service.js';
import { createEmailTemplateService } from './modules/email/template-service.js';
import { createMediaService } from './modules/media/service.js';
import { createOrderWorkflowService } from './modules/order/service.js';
import { registerStripeWebhookRoutes } from './modules/payment/stripe-webhook-routes.js';
import { registerPublicSystemRoutes } from './modules/public/system-routes.js';
import { createRedirectService } from './modules/redirect/service.js';
import { createShippingConfigService } from './modules/shipping/config-service.js';
import { createShippingService } from './modules/shipping/service.js';
import { registerStorefrontRoutes } from './modules/storefront/routes.js';
import { createSubscriptionService } from './modules/subscription/service.js';
import { createSchemaService } from './modules/system/schema-service.js';
const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(CURRENT_DIR, '../.env') });

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function describeDatabaseTarget(databaseUrl?: string): string {
    if (!databaseUrl) {
        return 'DATABASE_URL is not set';
    }
    try {
        const parsedUrl = new URL(databaseUrl);
        return `${parsedUrl.hostname}:${parsedUrl.port || '5432'}`;
    }
    catch {
        return 'DATABASE_URL is set but could not be parsed';
    }
}

function getDatabaseStartupHint(): string {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        return 'Set DATABASE_URL in backend/.env before starting the backend.';
    }
    try {
        const parsedUrl = new URL(databaseUrl);
        if (LOCAL_DATABASE_HOSTS.has(parsedUrl.hostname)) {
            return process.env.RAILWAY_DATABASE_URL
                ? 'No local PostgreSQL server is reachable. Start PostgreSQL on localhost:5432 or copy RAILWAY_DATABASE_URL into DATABASE_URL in backend/.env.'
                : 'No local PostgreSQL server is reachable. Start PostgreSQL on localhost:5432 or update DATABASE_URL in backend/.env.';
        }
    }
    catch {
        return 'Check that DATABASE_URL in backend/.env is valid.';
    }
    return 'Check that the configured database is reachable from this machine.';
}

const app = express();
const prisma = new PrismaClient({
    log: ['error', 'warn'],
});
const prismaAny = prisma;
const PORT = 5000;
const WEB_BASE_URL = process.env.WEB_BASE_URL || 'http://localhost:5173';
const ADMIN_BASE_URL = process.env.ADMIN_BASE_URL || 'http://localhost:3001';
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${PORT}`;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const RESET_PASSWORD_URL_BASE = process.env.RESET_PASSWORD_URL_BASE || `${WEB_BASE_URL}/reset-password`;
const MEDIA_DIR = process.env.MEDIA_DIR ||
    process.env.UPLOADS_DIR ||
    path.join(process.cwd(), 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });
const {
    BLEND_FORMAT_LABELS,
    BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
    BLEND_SUBSCRIPTION_KIND,
    DEFAULT_BLEND_FORMAT,
    buildBlendSubscriptionSetupSnapshot,
    buildBlendSubscriptionTitle,
    computeBlendUnitPriceCents,
    discountBlendSubscriptionPriceCents,
    getBlendSubscriptionSetupFromSnapshot,
    isBaseCategory,
    isBlendSubscriptionCartItem,
    normalizeBlendCartPurchaseMode,
    normalizeBlendFormat,
    normalizeBlendSubscriptionIntervalCount,
    normalizeIngredientLookupKey,
    normalizeWishlistCreationName,
    resolveBlendIngredientsForPricing,
    toBlendPricingErrorResponse,
} = createBlendService({ t });
const commonService = createCommonService();
const {
    mapBoxtalStatus,
    normalizeCode,
    normalizeEmail,
    resolveRequestIp,
    slugify,
    toJsonObjectRecord,
    toNonEmptyStringOrNull,
    toStatusOrNull,
} = commonService;
const FIRST_ORDER_ONLY_DISCOUNT_ERROR = t("backend.index.remise_reservee_first");
const discountEligibilityService = createDiscountEligibilityService({
    FIRST_ORDER_ONLY_DISCOUNT_ERROR,
    FIRST_ORDER_ONLY_NOT_APPLIED_MESSAGE,
    normalizeCode,
    normalizeEmail,
    prisma,
});
const {
    hasPaidOrConfirmedOrder,
    resolveFirstOrderOnlyDiscountError,
} = discountEligibilityService;
const ORDER_STATUS_TRANSITIONS = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['PROCESSING', 'CANCELLED'],
    PROCESSING: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED'],
    DELIVERED: ['REFUNDED'],
    CANCELLED: ['REFUNDED'],
    REFUNDED: [],
};
const ORDER_NOTIFICATION_BY_STATUS = {
    CONFIRMED: 'ORDER_CONFIRMED',
    PROCESSING: 'ORDER_PROCESSING',
    SHIPPED: 'ORDER_SHIPPED',
    DELIVERED: 'ORDER_DELIVERED',
    CANCELLED: 'ORDER_CANCELLED',
    REFUNDED: 'ORDER_REFUNDED',
};
const AUTOMATION_JOB_DEFAULTS = {
    reconcile_pending_payments: {
        name: t("backend.index.reconciliation_payments"),
        description: t("backend.index.verifie_orders_pending"),
        intervalMs: 5 * 60 * 1000,
    },
    sync_shipping_tracking: {
        name: 'Sync tracking transport',
        description: t("backend.index.synchronise_tracking_boxtal"),
        intervalMs: 10 * 60 * 1000,
    },
    auto_cancel_pending: {
        name: 'Auto-annulation PENDING',
        description: t("backend.index.canceled_automatiquement_orders"),
        intervalMs: 60 * 60 * 1000,
    },
    sla_watchdog: {
        name: 'Surveillance SLA',
        description: t("backend.index.signale_orders_bloquees"),
        intervalMs: 30 * 60 * 1000,
    },
    process_email_outbox: {
        name: t("backend.index.email_outbox"),
        description: t("backend.index.envoie_emails_transactionnels"),
        intervalMs: 2 * 60 * 1000,
    },
    email_welcome_lifecycle: {
        name: t("backend.index.email_welcome"),
        description: t("backend.index.declenche_sequences_welcome"),
        intervalMs: 30 * 60 * 1000,
    },
    email_abandoned_cart: {
        name: t("backend.index.email_carts_abandonnes"),
        description: t("backend.index.reminders_cart_none"),
        intervalMs: 30 * 60 * 1000,
    },
    email_post_purchase: {
        name: t("backend.index.email_post_achat"),
        description: t("backend.index.cross_sell_demande"),
        intervalMs: 60 * 60 * 1000,
    },
    email_reorder_reminders: {
        name: t("backend.index.email_reachat"),
        description: t("backend.index.reminders_reachat"),
        intervalMs: 12 * 60 * 60 * 1000,
    },
    email_winback: {
        name: t("backend.index.email_winback"),
        description: 'Relances inactifs J+45/J+90.',
        intervalMs: 24 * 60 * 60 * 1000,
    },
};
class OrderWorkflowError extends Error {
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
    }
}
const PASSWORD_RESET_TOKEN_TTL_MINUTES = (() => {
    const parsed = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 60);
    if (!Number.isFinite(parsed))
        return 60;
    return Math.min(24 * 60, Math.max(10, Math.round(parsed)));
})();
const PASSWORD_RESET_MAIL_FROM = toNonEmptyStringOrNull(process.env.MAIL_FROM) ||
    toNonEmptyStringOrNull(process.env.SMTP_FROM) ||
    'My Own Tea <no-reply@myowntea.local>';
const EMAIL_REPLY_TO = toNonEmptyStringOrNull(process.env.EMAIL_REPLY_TO);
const EMAIL_UNSUBSCRIBE_SECRET = toNonEmptyStringOrNull(process.env.EMAIL_UNSUBSCRIBE_SECRET) || t("backend.index.password_dev_unsubscribe");
const EMAIL_OUTBOX_BATCH_SIZE = (() => {
    const parsed = Number(process.env.EMAIL_OUTBOX_BATCH_SIZE || 30);
    if (!Number.isFinite(parsed))
        return 30;
    return Math.min(200, Math.max(1, Math.round(parsed)));
})();
const EMAIL_OUTBOX_MAX_ATTEMPTS = (() => {
    const parsed = Number(process.env.EMAIL_OUTBOX_MAX_ATTEMPTS || 5);
    if (!Number.isFinite(parsed))
        return 5;
    return Math.min(20, Math.max(1, Math.round(parsed)));
})();
const EMAIL_OUTBOX_RETRY_BASE_MINUTES = (() => {
    const parsed = Number(process.env.EMAIL_OUTBOX_RETRY_BASE_MINUTES || 5);
    if (!Number.isFinite(parsed))
        return 5;
    return Math.min(120, Math.max(1, Math.round(parsed)));
})();
const EMAIL_PROVIDER_NAME = 'SMTP';
const emailLinkService = createEmailLinkService({
    API_BASE_URL,
    EMAIL_UNSUBSCRIBE_SECRET,
    RESET_PASSWORD_URL_BASE,
    crypto,
    toNonEmptyStringOrNull,
});
const {
    buildUnsubscribeUrl,
    hashPasswordResetToken,
    resolveResetPasswordUrl,
    verifyUnsubscribeToken,
} = emailLinkService;
const ADMIN_SESSION_TTL_HOURS = (() => {
    const parsed = Number(process.env.ADMIN_SESSION_TTL_HOURS || 12);
    if (!Number.isFinite(parsed))
        return 12;
    return Math.min(24 * 7, Math.max(1, Math.round(parsed)));
})();
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecretKey
    ? new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' })
    : null;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URL = process.env.GOOGLE_REDIRECT_URL || '';
const GOOGLE_OAUTH_SCOPE = 'openid email profile';
const GOOGLE_OAUTH_COOKIE_STATE = 'mot_google_state';
const GOOGLE_OAUTH_COOKIE_VERIFIER = 'mot_google_verifier';
const GOOGLE_OAUTH_TTL_MS = 10 * 60 * 1000;
const SESSION_COOKIE = 'mot_session';
const ADMIN_SESSION_COOKIE = 'mot_admin_session';
const SESSION_TTL_DAYS = 30;
const schemaService = createSchemaService({
    AUTOMATION_JOB_DEFAULTS,
    prisma,
});
const {
    ensureOrderWorkflowTables,
    ensurePasswordResetTable,
} = schemaService;
const authSessionService = createAuthSessionService({
    ADMIN_SESSION_COOKIE,
    ADMIN_SESSION_TTL_HOURS,
    GOOGLE_OAUTH_TTL_MS,
    SESSION_COOKIE,
    SESSION_TTL_DAYS,
    WEB_BASE_URL,
    crypto,
    prisma,
});
const {
    base64UrlEncode,
    clearAdminSessionCookie,
    clearOAuthCookie,
    clearSessionCookie,
    createCodeChallenge,
    createCodeVerifier,
    getSessionCustomer,
    parseCookies,
    redirectWithError,
    requireAccountCustomer,
    requireCustomer,
    setAdminSessionCookie,
    setOAuthCookie,
    setSessionCookie,
} = authSessionService;
const emailTemplateService = createEmailTemplateService({
    PASSWORD_RESET_TOKEN_TTL_MINUTES,
    WEB_BASE_URL,
    t,
    toJsonObjectRecord,
    toNonEmptyStringOrNull,
    toStatusOrNull,
});
const {
    buildCustomerEmailTemplate,
    buildOrderNotificationEmailContent,
    buildPasswordResetEmail,
    escapeHtml,
    resolveOrderSubtotalDiscountCents,
} = emailTemplateService;
const adminSecurityService = createAdminSecurityService({
    ADMIN_SESSION_COOKIE,
    ADMIN_SESSION_TTL_HOURS,
    clearAdminSessionCookie,
    crypto,
    normalizeEmail,
    parseCookies,
    prisma,
    resolveRequestIp,
    toNonEmptyStringOrNull,
});
const {
    ADMIN_TOTP_DIGITS,
    ADMIN_TOTP_ISSUER,
    ADMIN_TOTP_PERIOD_SECONDS,
    adminMutationAudit,
    buildAdminTotpUri,
    clearAdminAuthFailures,
    consumeAdminAuthChallenge,
    consumeOutstandingAdminChallengesForUser,
    createAdminAuthChallenge,
    createAdminSession,
    decryptAdminSecret,
    decryptAdminSecretWithMetadata,
    destroyAdminSessionByToken,
    encryptAdminSecret,
    ensureAdminSecurityTables,
    formatAdminTotpSecret,
    generateAdminTotpSecret,
    getAdminAuthChallengeById,
    getAdminAuthRetryAfterSeconds,
    getAdminMfaConfigByUserId,
    getAdminSessionRecord,
    getAdminUserByEmail,
    hasExceededAdminAuthRateLimit,
    logAdminAuditEvent,
    normalizeAdminTotpCode,
    recordAdminAuthFailure,
    requireAdminApi,
    resolveAdminAuthRateLimitKey,
    serializeAdminUser,
    upsertAdminMfaConfig,
    verifyAdminTotpCode,
} = adminSecurityService;
const emailService = createEmailService({
    EMAIL_OUTBOX_BATCH_SIZE,
    EMAIL_OUTBOX_MAX_ATTEMPTS,
    EMAIL_OUTBOX_RETRY_BASE_MINUTES,
    EMAIL_PROVIDER_NAME,
    EMAIL_REPLY_TO,
    PASSWORD_RESET_MAIL_FROM,
    WEB_BASE_URL,
    buildCustomerEmailTemplate,
    buildPasswordResetEmail,
    buildUnsubscribeUrl,
    ensureOrderWorkflowTables,
    normalizeEmail,
    nodemailer,
    prisma,
    t,
    toJsonObjectRecord,
    toNonEmptyStringOrNull,
    crypto,
});
const {
    buildMarketingEmailContent,
    buildSecurityEmailContent,
    ensureEmailPreference,
    listEmailDeliveries,
    processEmailOutboxBatch,
    queueCampaignEmail,
    queueEmailDelivery,
    recordEmailConsentEvent,
    retryEmailDeliveryNow,
    sendPasswordResetEmail,
    syncCustomerMarketingPreferenceByEmail,
    updateEmailPreference,
    upsertNewsletterSubscription,
} = emailService;
const catalogService = createCatalogService({
    applyBlendListingTranslations,
    applyIngredientTranslations,
    applyProductTranslations,
    computeBlendUnitPriceCents,
    getAllowedTranslationFields,
    isBaseCategory,
    loadEntityTranslations,
    prisma,
    resolveLocaleVariants,
    slugify,
    t,
    toBlendPricingErrorResponse,
    toNonEmptyStringOrNull,
});
const {
    assertBlendPricingIngredients,
    ensureUniqueBlendListingSlug,
    localizeBlendListingsForRequest,
    localizeIngredientsForRequest,
    localizeProductsForRequest,
    mapAdminProductForApi,
    mapProductForApi,
    mapProductVariant,
    normalizeBaseFields,
    normalizeIngredientIds,
    normalizeProductTags,
    normalizeStoreContactField,
    normalizeTasteMetric,
    normalizeVariantImages,
    parseBlendListingRanking,
    parseProductRanking,
    serializeBlendListingWithPricing,
    toBlendPricingErrorPayload,
    toBlendPricingIngredientsFromBlendEntries,
} = catalogService;
const mediaService = createMediaService({
    MEDIA_DIR,
    crypto,
    fs,
    multer,
    normalizeVariantImages,
    path,
    prisma,
    slugify,
});
const {
    collectUsedMediaPaths,
    deleteUnusedMediaFiles,
    listMediaFiles,
    upload,
} = mediaService;
const redirectService = createRedirectService({
    SESSION_COOKIE,
    crypto,
    parseCookies,
    prisma,
    prismaAny,
});
const {
    createRedirectRuleRow,
    deleteRedirectRuleRow,
    listRedirectRuleRows,
    resolveRedirectByRequest,
    serializeRedirectRule,
    updateRedirectRuleRow,
} = redirectService;
const wishlistService = createWishlistService({
    BLEND_FORMAT_LABELS,
    DEFAULT_BLEND_FORMAT,
    computeBlendUnitPriceCents,
    crypto,
    isBaseCategory,
    normalizeBlendFormat,
    normalizeWishlistCreationName,
    prisma,
    prismaAny,
    t,
});
const {
    buildWishlistAccessorySkuMap,
    buildWishlistCreationSnapshot,
    buildWishlistPricingIngredientMap,
    buildWishlistVariantSnapshot,
    createWishlistRow,
    deleteWishlistRow,
    listWishlistRows,
    serializeWishlistCreation,
} = wishlistService;
const shippingConfigService = createShippingConfigService({
    prisma,
    t,
    toNonEmptyStringOrNull,
});
const {
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
} = shippingConfigService;
const shippingService = createShippingService({
    getShippingOfferLabelByMode,
    getStoreSettings,
    normalizeShippingMode,
    normalizeShippingOfferCode,
    normalizeShippingOfferId,
    quoteShippingOffer,
    resolveCheckoutShippingQuote,
    toNonEmptyStringOrNull,
});
const {
    extractShippingSelection,
    getAllowedShippingCountries,
    isShippingCountryAllowed,
    parseBoxtalLabelUrl,
    parseBoxtalTrackingPayload,
    resolveBaseShippingCents,
    resolveBoxtalQuoteSelection,
    resolveShippingCents,
    resolveShippingQuote,
} = shippingService;
const orderWorkflowService = createOrderWorkflowService({
    ORDER_NOTIFICATION_BY_STATUS,
    ORDER_STATUS_TRANSITIONS,
    OrderWorkflowError,
    buildOrderNotificationEmailContent,
    createShippingOrder,
    crypto,
    ensureEmailPreference,
    ensureOrderWorkflowTables,
    mapBoxtalStatus,
    normalizeShippingMode,
    prisma,
    queueEmailDelivery,
    t,
    toJsonObjectRecord,
    toNonEmptyStringOrNull,
    toStatusOrNull,
});
const {
    computeAvailableOrderTransitions,
    ensureBoxtalShipmentForOrder,
    finalizePaidOrder,
    getOrderForWorkflow,
    hasRecentNotification,
    listOrderStatusHistory,
    logOrderNotification,
    syncShipmentTrackingFromPayload,
    transitionOrderStatus,
} = orderWorkflowService;
const subscriptionService = createSubscriptionService({
    BLEND_FORMAT_LABELS,
    BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
    BLEND_SUBSCRIPTION_KIND,
    DEFAULT_BLEND_FORMAT,
    buildBlendSubscriptionTitle,
    buildWishlistCreationSnapshot,
    checkoutAddressToString,
    finalizePaidOrder,
    getBlendSubscriptionSetupFromSnapshot,
    normalizeBlendFormat,
    normalizeBlendSubscriptionIntervalCount,
    prisma,
    resolveOrderShippingSelection,
    stripe,
    t,
});
const {
    addressRecordToCheckoutAddress,
    buildBlendSubscriptionSnapshot,
    buildBlendSubscriptionStripeLineItems,
    createBlendSubscriptionOrderFromInvoice,
    ensureBlendSubscriptionsFromPaidOrder,
    ensureStripeCustomerForCustomer,
    getDefaultBlendSubscriptionAddresses,
    getStripeCustomerDefaultPaymentMethodSummary,
    listStripeInvoicesForCustomer,
    parseBlendSubscriptionMetadata,
    recoverMissingBlendSubscriptionsForCustomer,
    serializeBlendSubscriptionMetadata,
    stripeTimestampToDate,
    upsertBlendSubscriptionRecord,
} = subscriptionService;
const automationService = createAutomationService({
    AUTOMATION_JOB_DEFAULTS,
    EMAIL_OUTBOX_BATCH_SIZE,
    ensureOrderWorkflowTables,
    finalizePaidOrder,
    getOrderForWorkflow,
    getShippingTracking,
    hasRecentNotification,
    logOrderNotification,
    parseBoxtalTrackingPayload,
    prisma,
    processEmailOutboxBatch,
    queueCampaignEmail,
    stripe,
    syncShipmentTrackingFromPayload,
    t,
    toNonEmptyStringOrNull,
    toStatusOrNull,
    transitionOrderStatus,
});
const {
    clampAutomationIntervalMs,
    executeAutomationJob,
    getAutomationJobConfig,
    isAutomationJobId,
    listAutomationJobConfigs,
    scheduleAutomationJobs,
    serializeAutomationJobConfig,
    startAutomationScheduler,
    stopAutomationScheduler,
    updateAutomationJobConfig,
} = automationService;
// Middleware
app.use(cors({
    origin: [WEB_BASE_URL, ADMIN_BASE_URL, API_BASE_URL],
    credentials: true,
}));
app.use((_req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});
app.use(express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/media', express.static(MEDIA_DIR));
registerPublicSystemRoutes(app, {
    ADMIN_BASE_URL,
    buildCustomerEmailTemplate,
    ensureOrderWorkflowTables,
    escapeHtml,
    normalizeEmail,
    prisma,
    queueEmailDelivery,
    recordEmailConsentEvent,
    resolveRedirectByRequest,
    resolveRequestIp,
    retryEmailDeliveryNow,
    syncCustomerMarketingPreferenceByEmail,
    t,
    toNonEmptyStringOrNull,
    updateEmailPreference,
    upsertNewsletterSubscription,
    verifyUnsubscribeToken,
});
registerCustomerOAuthRoutes(app, {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_COOKIE_STATE,
    GOOGLE_OAUTH_COOKIE_VERIFIER,
    GOOGLE_OAUTH_SCOPE,
    GOOGLE_REDIRECT_URL,
    SESSION_TTL_DAYS,
    WEB_BASE_URL,
    base64UrlEncode,
    clearOAuthCookie,
    createCodeChallenge,
    createCodeVerifier,
    crypto,
    parseCookies,
    prisma,
    redirectWithError,
    setOAuthCookie,
    setSessionCookie,
});
registerAdminAuthRoutes(app, {
    ADMIN_SESSION_COOKIE,
    ADMIN_TOTP_DIGITS,
    ADMIN_TOTP_ISSUER,
    ADMIN_TOTP_PERIOD_SECONDS,
    bcrypt,
    buildAdminTotpUri,
    clearAdminAuthFailures,
    clearAdminSessionCookie,
    consumeAdminAuthChallenge,
    consumeOutstandingAdminChallengesForUser,
    createAdminAuthChallenge,
    createAdminSession,
    decryptAdminSecret,
    decryptAdminSecretWithMetadata,
    destroyAdminSessionByToken,
    encryptAdminSecret,
    ensureAdminSecurityTables,
    formatAdminTotpSecret,
    generateAdminTotpSecret,
    getAdminAuthChallengeById,
    getAdminAuthRetryAfterSeconds,
    getAdminMfaConfigByUserId,
    getAdminSessionRecord,
    getAdminUserByEmail,
    hasExceededAdminAuthRateLimit,
    logAdminAuditEvent,
    normalizeAdminTotpCode,
    normalizeEmail,
    parseCookies,
    prisma,
    recordAdminAuthFailure,
    resolveAdminAuthRateLimitKey,
    resolveRequestIp,
    serializeAdminUser,
    setAdminSessionCookie,
    toNonEmptyStringOrNull,
    upsertAdminMfaConfig,
    verifyAdminTotpCode,
});
registerCustomerAuthRoutes(app, {
    PASSWORD_RESET_TOKEN_TTL_MINUTES,
    SESSION_COOKIE,
    SESSION_TTL_DAYS,
    bcrypt,
    clearSessionCookie,
    crypto,
    ensurePasswordResetTable,
    getSessionCustomer,
    hashPasswordResetToken,
    normalizeEmail,
    parseCookies,
    prisma,
    recordEmailConsentEvent,
    resolveRequestIp,
    resolveResetPasswordUrl,
    sendPasswordResetEmail,
    setSessionCookie,
    t,
    toNonEmptyStringOrNull,
    updateEmailPreference,
    upsertNewsletterSubscription,
});
registerProductPublicRoutes(app, {
    localizeProductsForRequest,
    mapProductForApi,
    prisma,
});
app.use('/api/admin', requireAdminApi, adminMutationAudit);
// Uploads (admin)
registerMediaRoutes(app, {
    collectUsedMediaPaths,
    fs,
    listMediaFiles,
    MEDIA_DIR,
    multer,
    PUBLIC_BASE_URL,
    upload,
});
// Products (admin)
registerAdminProductRoutes(app, {
    deleteUnusedMediaFiles,
    mapAdminProductForApi,
    mapProductVariant,
    normalizeProductTags,
    normalizeVariantImages,
    parseProductRanking,
    prisma,
});
// Packs (admin)
registerAdminPackRoutes(app, {
    prisma,
});
// Subscription plans
registerSubscriptionPlanRoutes(app, {
    prisma,
});
// Blend listings
registerBlendListingRoutes(app, {
    assertBlendPricingIngredients,
    ensureUniqueBlendListingSlug,
    localizeBlendListingsForRequest,
    normalizeIngredientIds,
    parseBlendListingRanking,
    prisma,
    serializeBlendListingWithPricing,
    slugify,
    toBlendPricingErrorPayload,
    toBlendPricingIngredientsFromBlendEntries,
});
// Store settings (admin)
registerStoreSettingsRoutes(app, {
    normalizeStoreContactField,
    prisma,
});
// Redirect rules (admin)
registerRedirectRuleRoutes(app, {
    createRedirectRuleRow,
    deleteRedirectRuleRow,
    listRedirectRuleRows,
    serializeRedirectRule,
    updateRedirectRuleRow,
});
// Automation jobs (admin)
registerAutomationRoutes(app, {
    clampAutomationIntervalMs,
    executeAutomationJob,
    getAutomationJobConfig,
    isAutomationJobId,
    listAutomationJobConfigs,
    scheduleAutomationJobs,
    serializeAutomationJobConfig,
    updateAutomationJobConfig,
});
// Emails (admin)
registerAdminEmailRoutes(app, {
    buildCustomerEmailTemplate,
    buildMarketingEmailContent,
    buildOrderNotificationEmailContent,
    buildPasswordResetEmail,
    buildSecurityEmailContent,
    crypto,
    ensureOrderWorkflowTables,
    listEmailDeliveries,
    normalizeEmail,
    prisma,
    queueEmailDelivery,
    resolveResetPasswordUrl,
    retryEmailDeliveryNow,
    t,
    toNonEmptyStringOrNull,
    WEB_BASE_URL,
});
// Customers (admin)
registerAdminCustomerRoutes(app, {
    buildWishlistAccessorySkuMap,
    buildWishlistPricingIngredientMap,
    deleteWishlistRow,
    listWishlistRows,
    prisma,
    serializeWishlistCreation,
});
registerAccountRoutes(app, {
    WEB_BASE_URL,
    bcrypt,
    buildSecurityEmailContent,
    ensureEmailPreference,
    ensureStripeCustomerForCustomer,
    getStripeCustomerDefaultPaymentMethodSummary,
    listStripeInvoicesForCustomer,
    normalizeEmail,
    prisma,
    queueEmailDelivery,
    recordEmailConsentEvent,
    recoverMissingBlendSubscriptionsForCustomer,
    requireAccountCustomer,
    resolveOrderSubtotalDiscountCents,
    resolveRequestIp,
    stripe,
    stripeTimestampToDate,
    t,
    toNonEmptyStringOrNull,
    updateEmailPreference,
    upsertNewsletterSubscription,
});
const cartService = createCartService({
    hasPaidOrConfirmedOrder,
    normalizeEmail,
    prisma,
});
const {
    getActiveCart,
    isGiftCartItem,
    serializeCart,
    syncAutomaticGiftCartItems,
    touchCartUpdatedAt,
} = cartService;
registerCustomerCartRoutes(app, {
    BLEND_FORMAT_LABELS,
    BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
    DEFAULT_BLEND_FORMAT,
    buildBlendSubscriptionSetupSnapshot,
    computeBlendUnitPriceCents,
    discountBlendSubscriptionPriceCents,
    extractShippingSelection,
    getActiveCart,
    normalizeBlendCartPurchaseMode,
    normalizeBlendFormat,
    normalizeBlendSubscriptionIntervalCount,
    prisma,
    requireCustomer,
    resolveShippingQuote,
    serializeCart,
    syncAutomaticGiftCartItems,
    t,
    toBlendPricingErrorResponse,
    touchCartUpdatedAt,
});
registerCustomerWishlistRoutes(app, {
    DEFAULT_BLEND_FORMAT,
    buildWishlistAccessorySkuMap,
    buildWishlistCreationSnapshot,
    buildWishlistPricingIngredientMap,
    buildWishlistVariantSnapshot,
    createWishlistRow,
    deleteWishlistRow,
    listWishlistRows,
    normalizeBlendFormat,
    requireAccountCustomer,
    serializeWishlistCreation,
    toBlendPricingErrorResponse,
});
// Create ingredient
registerIngredientRoutes(app, {
    adminMutationAudit,
    localizeIngredientsForRequest,
    normalizeBaseFields,
    normalizeTasteMetric,
    prisma,
    requireAdminApi,
});
registerTranslationRoutes(app, {
    getAllowedTranslationFields,
    prisma,
    sanitizeEntityTranslationValue,
});
registerStorefrontRoutes(app, {
    crypto,
    extractShippingSelection,
    getAllowedShippingCountries,
    getParcelPoints,
    isShippingCountryAllowed,
    normalizeShippingOfferCode,
    normalizeShippingOfferId,
    normalizeStoreContactField,
    prisma,
    resolveBoxtalQuoteSelection,
    resolveOrderShippingSelection,
    resolveShippingQuote,
    syncShipmentTrackingFromPayload,
    t,
});
registerStripeWebhookRoutes(app, {
    BLEND_SUBSCRIPTION_KIND,
    buildWishlistCreationSnapshot,
    createBlendSubscriptionOrderFromInvoice,
    ensureBlendSubscriptionsFromPaidOrder,
    finalizePaidOrder,
    getDefaultBlendSubscriptionAddresses,
    parseBlendSubscriptionMetadata,
    prisma,
    stripe,
    stripeTimestampToDate,
    upsertBlendSubscriptionRecord,
});
// Discounts CRUD (admin)
registerAdminCommerceRoutes(app, {
    adminMutationAudit,
    computeAvailableOrderTransitions,
    ensureBoxtalShipmentForOrder,
    getShippingDocument,
    getShippingTracking,
    listOrderStatusHistory,
    normalizeCode,
    OrderWorkflowError,
    parseBoxtalLabelUrl,
    parseBoxtalTrackingPayload,
    prisma,
    requireAdminApi,
    syncShipmentTrackingFromPayload,
    t,
    toNonEmptyStringOrNull,
    toStatusOrNull,
    transitionOrderStatus,
});
registerCheckoutRoutes(app, {
    BLEND_SUBSCRIPTION_DISCOUNT_PERCENT,
    BLEND_SUBSCRIPTION_KIND,
    DEFAULT_BLEND_FORMAT,
    WEB_BASE_URL,
    addressRecordToCheckoutAddress,
    bcrypt,
    buildBlendSubscriptionSnapshot,
    buildBlendSubscriptionStripeLineItems,
    checkoutAddressToString,
    computeBlendUnitPriceCents,
    computeDiscounts,
    discountBlendSubscriptionPriceCents,
    ensureBlendSubscriptionsFromPaidOrder,
    ensureBoxtalShipmentForOrder,
    ensureStripeCustomerForCustomer,
    finalizePaidOrder,
    getActiveCart,
    getBlendSubscriptionSetupFromSnapshot,
    getDefaultBlendSubscriptionAddresses,
    getOrderForWorkflow,
    getSessionCustomer,
    hasPaidOrConfirmedOrder,
    isBlendSubscriptionCartItem,
    isGiftCartItem,
    logOrderNotification,
    normalizeBlendFormat,
    normalizeBlendSubscriptionIntervalCount,
    normalizeCheckoutAddressInput,
    normalizeEmail,
    normalizeIngredientLookupKey,
    parseBlendSubscriptionMetadata,
    parseStripeShippingSelectionMetadata,
    prisma,
    requireAccountCustomer,
    requireCustomer,
    resolveBaseShippingCents,
    resolveBlendIngredientsForPricing,
    resolveBoxtalQuoteSelection,
    resolveFirstOrderOnlyDiscountError,
    resolveOrderShippingSelection,
    resolveShippingCents,
    serializeBlendSubscriptionMetadata,
    stripe,
    syncAutomaticGiftCartItems,
    t,
    toBlendPricingErrorResponse,
});
registerCheckoutOrderRoutes(app, {
    bcrypt,
    computeBlendUnitPriceCents,
    computeDiscounts,
    ensureBlendSubscriptionsFromPaidOrder,
    ensureBoxtalShipmentForOrder,
    finalizePaidOrder,
    getOrderForWorkflow,
    hasPaidOrConfirmedOrder,
    logOrderNotification,
    normalizeEmail,
    normalizeIngredientLookupKey,
    parseStripeShippingSelectionMetadata,
    prisma,
    requireCustomer,
    resolveBaseShippingCents,
    resolveBlendIngredientsForPricing,
    resolveBoxtalQuoteSelection,
    resolveFirstOrderOnlyDiscountError,
    resolveOrderShippingSelection,
    stripe,
    t,
    toBlendPricingErrorResponse,
});
let server: ReturnType<typeof app.listen> | null = null;
let shutdownPromise: Promise<void> | null = null;
let shutdownHandlersRegistered = false;

async function closeServer(exitCode = 0) {
    if (shutdownPromise) {
        await shutdownPromise;
        return;
    }
    shutdownPromise = (async () => {
        await stopAutomationScheduler();
        await prisma.$disconnect();
        if (server) {
            await new Promise<void>((resolve) => {
                server?.close(() => resolve());
            });
            server = null;
        }
    })();
    await shutdownPromise;
    process.exit(exitCode);
}

function registerShutdownHandlers() {
    if (shutdownHandlersRegistered) {
        return;
    }
    shutdownHandlersRegistered = true;
    process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await closeServer(0);
    });
    process.on('SIGTERM', async () => {
        await closeServer(0);
    });
}

export function startServer() {
    if (server) {
        return server;
    }
    server = app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Admin app login: ${ADMIN_BASE_URL}/login`);
        console.log(`Process ID: ${process.pid}`);
        prisma.$queryRaw `SELECT 1`
            .then(async () => {
            console.log('Database connected');
            await ensureOrderWorkflowTables();
            await ensureAdminSecurityTables();
            await startAutomationScheduler();
            console.log('Automation jobs scheduler started');
        })
            .catch((err) => {
            console.error('Database error:', err.message);
            console.error(`Database target: ${describeDatabaseTarget(process.env.DATABASE_URL)}`);
            console.error(getDatabaseStartupHint());
        });
    });
    server.on('error', (err) => {
        console.error('Server error:', err.message);
        process.exit(1);
    });
    registerShutdownHandlers();
    return server;
}

export { app, prisma };




