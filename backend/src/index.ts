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
import multer from 'multer';
import { computeDiscounts, FIRST_ORDER_ONLY_NOT_APPLIED_MESSAGE } from './lib/discounts.js';
import { createShippingOrder, getParcelPoints, getShippingDocument, getShippingTracking, quoteShippingOffer } from './lib/boxtal.js';
dotenv.config();
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
const normalizeCode = (code) => (code || '').trim().toUpperCase() || null;
const normalizeEmail = (email) => {
    const normalized = String(email || '').trim().toLowerCase();
    return normalized || null;
};
const FIRST_ORDER_ONLY_DISCOUNT_ERROR = 'Cette remise est réservée à la première commande. Vous avez déjà une commande payée ou confirmée.';
const hasPaidOrConfirmedOrder = async (params) => {
    const identityFilters = [];
    if (params.customerId) {
        identityFilters.push({ customerId: params.customerId });
    }
    if (params.userId) {
        identityFilters.push({ userId: params.userId });
    }
    const normalizedEmail = normalizeEmail(params.customerEmail);
    if (normalizedEmail) {
        identityFilters.push({ customer: { email: normalizedEmail } });
        identityFilters.push({ user: { email: normalizedEmail } });
    }
    if (identityFilters.length === 0)
        return false;
    const where = {
        AND: [
            { OR: identityFilters },
            {
                OR: [
                    { paymentStatus: 'completed' },
                    { status: 'CONFIRMED' },
                ],
            },
        ],
    };
    if (params.excludeOrderId) {
        where.AND.push({ id: { not: params.excludeOrderId } });
    }
    const existingOrder = await prisma.order.findFirst({
        where,
        select: { id: true },
    });
    return Boolean(existingOrder);
};
const resolveFirstOrderOnlyDiscountError = (summary, appliedCode) => {
    if (!normalizeCode(appliedCode))
        return null;
    if (summary.appliedCode)
        return null;
    if (Array.isArray(summary.messages) && summary.messages.includes(FIRST_ORDER_ONLY_NOT_APPLIED_MESSAGE)) {
        return FIRST_ORDER_ONLY_DISCOUNT_ERROR;
    }
    return null;
};
const sanitizeFolder = (value) => value
    .replace(/\\/g, '/')
    .replace(/\.+/g, '')
    .replace(/[^a-zA-Z0-9/_-]+/g, '')
    .replace(/^\//, '')
    .replace(/\/$/, '');
const extensionFromMime = (mime) => {
    if (mime === 'image/png')
        return '.png';
    if (mime === 'image/jpeg')
        return '.jpg';
    if (mime === 'image/webp')
        return '.webp';
    if (mime === 'image/gif')
        return '.gif';
    return '';
};
const extractMediaPath = (value) => {
    if (!value || value.startsWith('data:'))
        return null;
    if (value.startsWith('/media/'))
        return value;
    try {
        const url = new URL(value);
        return url.pathname.startsWith('/media/') ? url.pathname : null;
    }
    catch {
        const index = value.indexOf('/media/');
        return index >= 0 ? value.slice(index) : null;
    }
};
const listMediaFiles = (dir) => {
    if (!fs.existsSync(dir))
        return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory())
            return listMediaFiles(absolute);
        if (!entry.isFile())
            return [];
        const relative = path.relative(MEDIA_DIR, absolute).replace(/\\/g, '/');
        return [{ absolute, relative }];
    });
};
const mapBoxtalStatus = (status) => {
    if (!status)
        return 'UNKNOWN';
    const normalized = String(status).trim().toUpperCase();
    if (['PENDING', 'CREATED', 'CONFIRMED', 'REGISTERED'].includes(normalized))
        return 'CREATED';
    if (['DOCUMENT_CREATED', 'LABEL_CREATED', 'READY'].includes(normalized))
        return 'LABEL_CREATED';
    if (['ANNOUNCED', 'IN_TRANSIT', 'PICKED_UP', 'SHIPPED', 'IN_DELIVERY', 'OUT_FOR_DELIVERY', 'REACHED_DELIVERY_PICKUP_POINT', 'FAILED_ATTEMPT', 'EXCEPTION'].includes(normalized))
        return 'IN_TRANSIT';
    if (['DELIVERED', 'DELIVERED_TO_PARCEL_POINT'].includes(normalized))
        return 'DELIVERED';
    if (['CANCELLED', 'CANCELED', 'REFUSED', 'RETURNED'].includes(normalized))
        return 'CANCELLED';
    return 'UNKNOWN';
};
const asObjectOrNull = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const parseBoxtalTrackingPayload = (payload, fallbackTrackingNumber = null) => {
    const root = asObjectOrNull(payload) || {};
    const trackingObject = asObjectOrNull(root.tracking);
    const contentList = Array.isArray(root.content) ? root.content : [];
    const contentFirst = asObjectOrNull(contentList[0]);
    const providerStatus = toNonEmptyStringOrNull(contentFirst?.status) ||
        toNonEmptyStringOrNull(trackingObject?.status) ||
        toNonEmptyStringOrNull(root.status) ||
        null;
    const trackingNumber = toNonEmptyStringOrNull(contentFirst?.trackingNumber) ||
        toNonEmptyStringOrNull(contentFirst?.packageId) ||
        toNonEmptyStringOrNull(trackingObject?.trackingNumber) ||
        toNonEmptyStringOrNull(root.trackingNumber) ||
        toNonEmptyStringOrNull(fallbackTrackingNumber) ||
        null;
    const trackingUrl = toNonEmptyStringOrNull(contentFirst?.packageTrackingUrl) ||
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
    return toNonEmptyStringOrNull(contentFirst?.url) ||
        toNonEmptyStringOrNull(documentFirst?.url) ||
        toNonEmptyStringOrNull(shippingDocument?.url) ||
        toNonEmptyStringOrNull(root.url) ||
        null;
};
const resolveShippingCents = (params) => {
    const relayPrice = Number(process.env.BOXTAL_RELAY_PRICE_CENTS || '');
    const homePrice = Number(process.env.BOXTAL_HOME_PRICE_CENTS || '');
    if (params.mode === 'RELAY' && Number.isFinite(relayPrice) && relayPrice > 0)
        return relayPrice;
    if (params.mode === 'HOME' && Number.isFinite(homePrice) && homePrice > 0)
        return homePrice;
    return params.defaultCents;
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
    if (!normalized)
        return false;
    return getAllowedShippingCountries().includes(normalized);
};
const normalizeShippingMode = (value) => {
    if (value === 'HOME' || value === 'RELAY')
        return value;
    return undefined;
};
const normalizeShippingOfferId = (value) => {
    const raw = toNonEmptyStringOrNull(value);
    if (!raw)
        return null;
    if (raw === '""' || raw === "''")
        return null;
    const unquoted = raw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();
    return unquoted.length > 0 ? unquoted : null;
};
const extractShippingSelection = (req) => {
    const queryMode = normalizeShippingMode(req.query.mode);
    const queryOfferId = typeof req.query.offerId === 'string' ? req.query.offerId : undefined;
    const queryOfferCode = typeof req.query.offerCode === 'string' ? req.query.offerCode : undefined;
    const queryCountryCode = typeof req.query.countryCode === 'string' ? req.query.countryCode : undefined;
    const queryPostalCode = typeof req.query.postalCode === 'string' ? req.query.postalCode : undefined;
    const queryCity = typeof req.query.city === 'string' ? req.query.city : undefined;
    const bodySelection = (req.body && typeof req.body.shippingSelection === 'object'
        ? req.body.shippingSelection
        : {}) || {};
    const bodyMode = normalizeShippingMode(bodySelection.mode ?? req.body?.mode);
    const bodyOfferId = typeof bodySelection.offerId === 'string'
        ? bodySelection.offerId
        : (typeof req.body?.offerId === 'string' ? req.body.offerId : undefined);
    const bodyOfferCode = typeof bodySelection.offerCode === 'string'
        ? bodySelection.offerCode
        : (typeof req.body?.offerCode === 'string' ? req.body.offerCode : undefined);
    const bodyCountryCode = typeof bodySelection.countryCode === 'string'
        ? bodySelection.countryCode
        : (typeof req.body?.countryCode === 'string' ? req.body.countryCode : undefined);
    const bodyPostalCode = typeof bodySelection.postalCode === 'string'
        ? bodySelection.postalCode
        : (typeof req.body?.postalCode === 'string' ? req.body.postalCode : undefined);
    const bodyCity = typeof bodySelection.city === 'string'
        ? bodySelection.city
        : (typeof req.body?.city === 'string' ? req.body.city : undefined);
    return {
        mode: queryMode ?? bodyMode,
        offerId: queryOfferId ?? bodyOfferId ?? null,
        offerCode: queryOfferCode ?? bodyOfferCode ?? null,
        countryCode: queryCountryCode ?? bodyCountryCode ?? null,
        postalCode: queryPostalCode ?? bodyPostalCode ?? null,
        city: queryCity ?? bodyCity ?? null,
    };
};
const getStoreSettings = async () => {
    let settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
    if (!settings) {
        settings = await prisma.storeSettings.create({ data: { id: 'default' } });
    }
    return settings;
};
const resolveShippingQuote = async (selection) => {
    const settings = await getStoreSettings();
    const shippingCents = resolveShippingCents({
        mode: selection.mode,
        offerCode: selection.offerCode || null,
        defaultCents: settings.defaultShippingCents,
    });
    return {
        shippingCents,
        defaultShippingCents: settings.defaultShippingCents,
    };
};
const resolveBoxtalQuoteSelection = async (params) => {
    const mode = normalizeShippingMode(params?.mode);
    if (!mode)
        return null;
    const countryCode = String(params?.countryCode || '').trim().toUpperCase();
    const postalCode = String(params?.postalCode || '').trim();
    const city = String(params?.city || '').trim();
    if (!countryCode || !postalCode || !city)
        return null;
    try {
        const quote = await quoteShippingOffer({
            mode,
            countryCode,
            postalCode,
            city,
            addressLine1: toNonEmptyStringOrNull(params?.addressLine1) || null,
            requestedOfferCode: normalizeShippingOfferCode(params?.requestedOfferCode),
            declaredValueEur: Number.isFinite(params?.declaredValueEur) ? Number(params.declaredValueEur) : undefined,
        });
        if (!quote?.offerCode && !quote?.offerId) {
            return null;
        }
        return {
            mode,
            offerId: normalizeShippingOfferId(quote.offerId),
            offerCode: normalizeShippingOfferCode(quote.offerCode),
            offerLabel: toNonEmptyStringOrNull(quote.offerLabel) || getShippingOfferLabelByMode(mode),
            quoteMeta: {
                source: 'boxtal_v1_cotation',
                offersCount: Number.isFinite(quote.offersCount) ? quote.offersCount : null,
                priceTaxInclusive: Number.isFinite(quote.priceTaxInclusive) ? quote.priceTaxInclusive : null,
            },
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[shipping] Boxtal quote failed (${mode}): ${message}`);
        return null;
    }
};
const isDomTomPostalCode = (postalCode) => {
    const normalized = String(postalCode || '').replace(/\s+/g, '');
    return /^97|^98/.test(normalized);
};
const resolveCheckoutShippingZone = (countryCode, postalCode) => {
    const normalizedCountry = String(countryCode || 'FR').trim().toUpperCase();
    if (normalizedCountry === 'FR' && !isDomTomPostalCode(postalCode)) {
        return 'FR_METRO';
    }
    if (normalizedCountry === 'BE') {
        return 'EUROPE_DOM_TOM';
    }
    if (normalizedCountry === 'FR') {
        return isDomTomPostalCode(postalCode) ? 'EUROPE_DOM_TOM' : 'FR_METRO';
    }
    return 'INTERNATIONAL';
};
const resolveCheckoutShippingQuote = (params) => {
    const zone = resolveCheckoutShippingZone(params.countryCode, params.postalCode);
    const supportsRelay = zone === 'FR_METRO';
    const mode = params.mode === 'RELAY' && supportsRelay ? 'RELAY' : 'HOME';
    if (zone === 'FR_METRO') {
        const thresholdCents = 4500;
        const shippingCents = params.subtotalCents >= thresholdCents ? 0 : mode === 'RELAY' ? 460 : 550;
        return { zone, mode, supportsRelay, shippingCents, thresholdCents };
    }
    if (zone === 'EUROPE_DOM_TOM') {
        return { zone, mode: 'HOME', supportsRelay, shippingCents: 750, thresholdCents: null };
    }
    return { zone, mode: 'HOME', supportsRelay, shippingCents: 1590, thresholdCents: null };
};
const normalizeCheckoutAddressInput = (value, fieldName) => {
    if (!value || typeof value !== 'object') {
        throw new Error(`${fieldName} is required`);
    }
    const data = value;
    const firstName = String(data.firstName || '').trim();
    const lastName = String(data.lastName || '').trim();
    const countryCode = String(data.countryCode || '').trim().toUpperCase();
    const postalCode = String(data.postalCode || '').trim();
    const city = String(data.city || '').trim();
    const address1 = String(data.address1 || '').trim();
    const address2 = String(data.address2 || '').trim();
    const phoneE164 = String(data.phoneE164 || '').trim();
    const salutationRaw = String(data.salutation || '').trim().toUpperCase();
    const salutation = salutationRaw === 'MME' || salutationRaw === 'MR' ? salutationRaw : null;
    if (!firstName)
        throw new Error(`${fieldName}.firstName is required`);
    if (!lastName)
        throw new Error(`${fieldName}.lastName is required`);
    if (!countryCode)
        throw new Error(`${fieldName}.countryCode is required`);
    if (!postalCode)
        throw new Error(`${fieldName}.postalCode is required`);
    if (!city)
        throw new Error(`${fieldName}.city is required`);
    if (!address1)
        throw new Error(`${fieldName}.address1 is required`);
    if (!phoneE164 || !/^\+[1-9]\d{1,14}$/.test(phoneE164)) {
        throw new Error(`${fieldName}.phoneE164 is invalid`);
    }
    return {
        salutation,
        firstName,
        lastName,
        countryCode,
        postalCode,
        city,
        address1,
        address2: address2 || null,
        phoneE164,
    };
};
const checkoutAddressToString = (address) => {
    return [
        `${address.firstName} ${address.lastName}`.trim(),
        address.address1,
        address.address2 || '',
        `${address.postalCode} ${address.city}`.trim(),
        address.countryCode,
    ]
        .map((entry) => entry.trim())
        .filter(Boolean)
        .join(', ');
};
const slugify = (value) => value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
const uploadStorage = multer.diskStorage({
    destination: (req, _file, cb) => {
        const rawFolder = typeof req.body.folder === 'string' ? req.body.folder : '';
        const safeFolder = sanitizeFolder(rawFolder) || 'misc';
        const targetDir = path.join(MEDIA_DIR, safeFolder);
        fs.mkdirSync(targetDir, { recursive: true });
        req.uploadFolder = safeFolder;
        cb(null, targetDir);
    },
    filename: (_req, file, cb) => {
        const base = slugify(path.parse(file.originalname).name) || 'image';
        const suffix = crypto.randomBytes(6).toString('hex');
        const ext = extensionFromMime(file.mimetype);
        cb(null, `${base}-${Date.now()}-${suffix}${ext}`);
    },
});
const upload = multer({
    storage: uploadStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            cb(new Error('Invalid file type'));
            return;
        }
        cb(null, true);
    },
});
const DAY_MOMENTS = ['Matin', 'Après-midi', 'Soir', 'Toute la journée'];
const isBaseCategory = (category) => String(category || '').toLowerCase() === 'base';
const toPriceCents = (price) => {
    const numericPrice = typeof price === 'number' && Number.isFinite(price) ? price : 0;
    return Math.max(0, Math.round(numericPrice * 100));
};
const NO_BASE_MIN_BLEND_CENTS = 990;
const NO_BASE_MAX_BLEND_CENTS = 1690;
const NO_BASE_FIXED_CENTS = 390;
const NO_BASE_MULTIPLIER = 2.4;
const normalizeIngredientLookupKey = (value) => value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
const resolveBlendIngredientsForPricing = (params) => {
    const ids = Array.isArray(params.ingredientIds) ? params.ingredientIds : [];
    const names = Array.isArray(params.ingredientNames) ? params.ingredientNames : [];
    const resolvedIngredients = [];
    let matched = 0;
    if (ids.length === 0 && names.length > 0) {
        names.forEach((name) => {
            const normalized = normalizeIngredientLookupKey(name || '');
            const ingredient = params.ingredientByName.get(normalized);
            if (ingredient) {
                resolvedIngredients.push(ingredient);
                matched += 1;
            }
        });
    }
    ids.forEach((id, index) => {
        const byId = params.ingredientById.get(id);
        if (byId) {
            resolvedIngredients.push(byId);
            matched += 1;
            return;
        }
        const name = names[index];
        const normalized = name ? normalizeIngredientLookupKey(name) : '';
        const byName = normalized ? params.ingredientByName.get(normalized) : undefined;
        if (byName) {
            resolvedIngredients.push(byName);
            matched += 1;
        }
    });
    if ((ids.length > 0 && matched !== ids.length) || (ids.length === 0 && names.length > 0 && matched !== names.length)) {
        throw new Error('INGREDIENT_NOT_FOUND');
    }
    return resolvedIngredients;
};
const computeBlendUnitPriceCents = (ingredients) => {
    const totals = ingredients.reduce((acc, ingredient) => {
        const unitPriceCents = toPriceCents(ingredient.price);
        if (isBaseCategory(ingredient.category)) {
            acc.baseCount += 1;
            acc.baseTotal += unitPriceCents;
        }
        else {
            acc.nonBaseTotal += unitPriceCents;
        }
        return acc;
    }, { baseCount: 0, baseTotal: 0, nonBaseTotal: 0 });
    if (totals.baseCount > 0) {
        const averagedBaseTotal = totals.baseTotal / totals.baseCount;
        return Math.max(0, Math.round(totals.nonBaseTotal + averagedBaseTotal));
    }
    const computedNoBaseCents = NO_BASE_FIXED_CENTS + NO_BASE_MULTIPLIER * totals.nonBaseTotal;
    const clampedNoBaseCents = Math.min(NO_BASE_MAX_BLEND_CENTS, Math.max(NO_BASE_MIN_BLEND_CENTS, computedNoBaseCents));
    return Math.round(clampedNoBaseCents);
};
const normalizeStringField = (value, fieldName) => {
    if (value === undefined || value === null)
        return null;
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a string`);
    }
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error(`${fieldName} cannot be empty`);
    }
    return trimmed;
};
const normalizeDayMoments = (value) => {
    if (value === undefined || value === null)
        return null;
    if (!Array.isArray(value)) {
        throw new Error('dayMoments must be an array');
    }
    const cleaned = value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
    if (cleaned.some((item) => !DAY_MOMENTS.includes(item))) {
        throw new Error('Invalid dayMoments value');
    }
    return cleaned.length ? cleaned : null;
};
const normalizeTasteMetric = (value) => {
    if (value === undefined || value === null || value === '')
        return 3;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed))
        return 3;
    const rounded = Math.round(parsed);
    if (rounded < 1 || rounded > 5)
        return 3;
    return rounded;
};
const normalizeBaseFields = (payload, category) => {
    if (!isBaseCategory(category)) {
        return {
            dayMoments: null,
            infusionTime: null,
            dosage: null,
            temperature: null,
            preparation: null,
            origin: null,
        };
    }
    return {
        dayMoments: normalizeDayMoments(payload.dayMoments),
        infusionTime: normalizeStringField(payload.infusionTime, 'infusionTime'),
        dosage: normalizeStringField(payload.dosage, 'dosage'),
        temperature: normalizeStringField(payload.temperature, 'temperature'),
        preparation: normalizeStringField(payload.preparation, 'preparation'),
        origin: normalizeStringField(payload.origin, 'origin'),
    };
};
const ensureUniqueBlendListingSlug = async (base) => {
    let slug = slugify(base) || `creation-${Date.now()}`;
    let suffix = 1;
    while (await prisma.blendListing.findUnique({ where: { slug } })) {
        suffix += 1;
        slug = `${slugify(base)}-${suffix}`;
    }
    return slug;
};
const normalizeIngredientIds = (value) => {
    if (!Array.isArray(value))
        return [];
    return Array.from(new Set(value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)));
};
const parseBlendListingRanking = (value, defaultValue) => {
    if (value === undefined || value === null || value === '')
        return defaultValue;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed))
        return null;
    const normalized = Math.round(parsed);
    if (normalized < 0)
        return null;
    return normalized;
};
const distributeDiscountBySubtotal = (lines, totalDiscountCents) => {
    const allocations = {};
    if (lines.length === 0 || totalDiscountCents <= 0)
        return allocations;
    const subtotal = lines.reduce((sum, line) => sum + line.lineSubtotalCents, 0);
    if (subtotal <= 0)
        return allocations;
    let remaining = totalDiscountCents;
    lines.forEach((line, index) => {
        if (index === lines.length - 1) {
            allocations[line.id] = Math.max(0, remaining);
            return;
        }
        const share = Math.floor((line.lineSubtotalCents / subtotal) * totalDiscountCents);
        allocations[line.id] = Math.max(0, share);
        remaining -= share;
    });
    return allocations;
};
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
        name: 'Réconciliation paiements',
        description: 'Vérifie les commandes PENDING Stripe et confirme automatiquement les paiements validés.',
        intervalMs: 5 * 60 * 1000,
    },
    sync_shipping_tracking: {
        name: 'Sync tracking transport',
        description: 'Synchronise le tracking Boxtal et met à jour les statuts SHIPPED/DELIVERED.',
        intervalMs: 10 * 60 * 1000,
    },
    auto_cancel_pending: {
        name: 'Auto-annulation PENDING',
        description: 'Annule automatiquement les commandes PENDING expirées sans paiement.',
        intervalMs: 60 * 60 * 1000,
    },
    sla_watchdog: {
        name: 'Surveillance SLA',
        description: 'Signale les commandes bloquées trop longtemps en CONFIRMED ou PROCESSING.',
        intervalMs: 30 * 60 * 1000,
    },
    process_email_outbox: {
        name: 'Email outbox',
        description: 'Envoie les emails transactionnels/marketing en attente avec retry.',
        intervalMs: 2 * 60 * 1000,
    },
    email_welcome_lifecycle: {
        name: 'Email welcome',
        description: 'Declenche les sequences welcome J0/J3.',
        intervalMs: 30 * 60 * 1000,
    },
    email_abandoned_cart: {
        name: 'Email paniers abandonnes',
        description: 'Relances panier a H+1 et H+24 si aucune commande.',
        intervalMs: 30 * 60 * 1000,
    },
    email_post_purchase: {
        name: 'Email post-achat',
        description: 'Cross-sell J+3 et demande d avis J+7 apres livraison.',
        intervalMs: 60 * 60 * 1000,
    },
    email_reorder_reminders: {
        name: 'Email reachat',
        description: 'Relances de reachat J+21/J+35.',
        intervalMs: 12 * 60 * 60 * 1000,
    },
    email_winback: {
        name: 'Email winback',
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
const toStatusOrNull = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'PENDING' ||
        normalized === 'CONFIRMED' ||
        normalized === 'PROCESSING' ||
        normalized === 'SHIPPED' ||
        normalized === 'DELIVERED' ||
        normalized === 'CANCELLED' ||
        normalized === 'REFUNDED') {
        return normalized;
    }
    return null;
};
const toJsonObjectRecord = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return value;
};
const toNonEmptyStringOrNull = (value) => {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
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
const EMAIL_UNSUBSCRIBE_SECRET = toNonEmptyStringOrNull(process.env.EMAIL_UNSUBSCRIBE_SECRET) || 'mot-dev-unsubscribe-secret';
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
const toBase64Url = (value) => Buffer.from(String(value || ''), 'utf8').toString('base64url');
const fromBase64Url = (value) => {
    try {
        return Buffer.from(String(value || ''), 'base64url').toString('utf8');
    }
    catch {
        return null;
    }
};
const buildUnsubscribeToken = (customerId, email) => {
    const payload = `${String(customerId || '')}:${String(email || '').toLowerCase()}`;
    const signature = crypto
        .createHmac('sha256', EMAIL_UNSUBSCRIBE_SECRET)
        .update(payload)
        .digest('hex')
        .slice(0, 40);
    return `${customerId}.${toBase64Url(email).trim()}.${signature}`;
};
const verifyUnsubscribeToken = (token) => {
    const raw = toNonEmptyStringOrNull(token);
    if (!raw)
        return null;
    const [customerId, encodedEmail, signature] = raw.split('.');
    if (!customerId || !encodedEmail || !signature)
        return null;
    const email = fromBase64Url(encodedEmail);
    if (!email)
        return null;
    const expected = buildUnsubscribeToken(customerId, email).split('.')[2];
    if (expected !== signature)
        return null;
    return { customerId, email: String(email || '').toLowerCase() };
};
const buildUnsubscribeUrl = (customerId, email) => {
    if (!customerId || !email)
        return null;
    const base = `${API_BASE_URL}/api/email/unsubscribe`;
    const token = buildUnsubscribeToken(customerId, email);
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}unsubscribe=${encodeURIComponent(token)}`;
};
const resolveResetPasswordUrl = (token) => {
    const separator = RESET_PASSWORD_URL_BASE.includes('?') ? '&' : '?';
    return `${RESET_PASSWORD_URL_BASE}${separator}token=${encodeURIComponent(token)}`;
};
const hashPasswordResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const buildCustomerEmailTemplate = (params) => {
    const title = toNonEmptyStringOrNull(params.title) || 'My Own Tea';
    const greeting = toNonEmptyStringOrNull(params.greeting) || 'Bonjour,';
    const previewText = toNonEmptyStringOrNull(params.previewText) || '';
    const ctaLabel = toNonEmptyStringOrNull(params.ctaLabel);
    const ctaUrl = toNonEmptyStringOrNull(params.ctaUrl);
    const secondaryCtaLabel = toNonEmptyStringOrNull(params.secondaryCtaLabel);
    const secondaryCtaUrl = toNonEmptyStringOrNull(params.secondaryCtaUrl);
    const unsubscribeUrl = toNonEmptyStringOrNull(params.unsubscribeUrl);
    const footnote = toNonEmptyStringOrNull(params.footnote);
    const accentColor = toNonEmptyStringOrNull(params.accentColor) || '#C9A962';
    const supportEmail = toNonEmptyStringOrNull(process.env.CONTACT_EMAIL) || 'contact@myowntea.fr';
    const logoUrl = toNonEmptyStringOrNull(process.env.EMAIL_LOGO_URL) || `${WEB_BASE_URL}/myowntea_logo.png`;
    const paragraphs = (Array.isArray(params.paragraphs) ? params.paragraphs : [])
        .map((line) => toNonEmptyStringOrNull(line))
        .filter(Boolean);
    const infoRows = (Array.isArray(params.infoRows) ? params.infoRows : [])
        .map((row) => ({
        label: toNonEmptyStringOrNull(row?.label),
        value: toNonEmptyStringOrNull(row?.value),
    }))
        .filter((row) => Boolean(row.label && row.value));
    const detailsTextLines = (Array.isArray(params.detailsTextLines) ? params.detailsTextLines : [])
        .map((line) => toNonEmptyStringOrNull(line))
        .filter(Boolean);
    const detailsHtml = toNonEmptyStringOrNull(params.detailsHtml);
    const preHeaderHtml = previewText
        ? `<div style="display:none!important;visibility:hidden;opacity:0;overflow:hidden;height:0;width:0;line-height:1px;">
      ${escapeHtml(previewText)}
    </div>`
        : '';
    const infoRowsHtml = infoRows.length > 0
        ? `
      <table role="presentation" width="100%" style="border-collapse:collapse;margin:18px 0;border:1px solid #E5E0D5;border-radius:10px;overflow:hidden;">
        ${infoRows
            .map((row) => `
            <tr>
              <td style="padding:10px 12px;background:#F9F7F2;color:#6B7280;font-size:12px;font-weight:600;width:38%;">${escapeHtml(row.label)}</td>
              <td style="padding:10px 12px;color:#1F2937;font-size:13px;">${escapeHtml(row.value)}</td>
            </tr>
          `)
            .join('')}
      </table>
    `
        : '';
    const ctaHtml = ctaLabel && ctaUrl
        ? `
      <div style="margin:22px 0 10px 0;">
        <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#414C16;color:#FAF8F3;padding:12px 18px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;">
          ${escapeHtml(ctaLabel)}
        </a>
      </div>
    `
        : '';
    const secondaryCtaHtml = secondaryCtaLabel && secondaryCtaUrl
        ? `<p style="margin:0 0 10px 0;"><a href="${escapeHtml(secondaryCtaUrl)}" style="color:#8B6B2E;text-decoration:underline;font-size:13px;">${escapeHtml(secondaryCtaLabel)}</a></p>`
        : '';
    const unsubscribeHtml = unsubscribeUrl
        ? `<p style="margin:8px 0 0 0;font-size:11px;color:#9CA3AF;">Email marketing: <a href="${escapeHtml(unsubscribeUrl)}" style="color:#9CA3AF;">Se désinscrire</a></p>`
        : '';
    const html = `
    <html lang="fr">
      <body style="margin:0;padding:0;background:#F5F1E8;">
        ${preHeaderHtml}
        <table role="presentation" width="100%" style="border-collapse:collapse;background:#F5F1E8;padding:20px 0;">
          <tr>
            <td align="center" style="padding:12px;">
              <table role="presentation" width="100%" style="max-width:640px;border-collapse:collapse;">
                <tr>
                  <td style="background:#C9A962;color:#414C16;padding:16px 20px;border-radius:14px 14px 0 0;">
                    <table role="presentation" style="border-collapse:collapse;">
                      <tr>
                        <td style="vertical-align:top;padding-right:12px;">
                          <img src="${escapeHtml(logoUrl)}" alt="My Own Tea" width="52" height="52" style="display:block;width:52px;height:52px;border-radius:10px;object-fit:contain;background:#FFFFFF;" />
                        </td>
                        <td style="vertical-align:middle;">
                          <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.9;">My Own Tea</p>
                          <h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.3;font-weight:700;">${escapeHtml(title)}</h1>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="background:#FFFFFF;border:1px solid #E5E0D5;border-top:none;border-radius:0 0 14px 14px;padding:20px;">
                    <p style="margin:0 0 14px 0;color:#111827;font-size:15px;font-weight:600;">${escapeHtml(greeting)}</p>
                    ${paragraphs
        .map((line) => `<p style="margin:0 0 12px 0;color:#374151;font-size:14px;line-height:1.6;">${escapeHtml(line)}</p>`)
        .join('')}
                    ${infoRowsHtml}
                    ${detailsHtml || ''}
                    ${ctaHtml}
                    ${secondaryCtaHtml}
                    ${footnote
        ? `<p style="margin:14px 0 0 0;font-size:12px;color:#6B7280;line-height:1.5;">${escapeHtml(footnote)}</p>`
        : ''}
                    <hr style="border:none;border-top:1px solid #E5E0D5;margin:18px 0;" />
                    <p style="margin:0;font-size:12px;color:#6B7280;">Besoin d'aide ? Répondez à cet email ou contactez-nous: <a href="mailto:${escapeHtml(supportEmail)}" style="color:#8B6B2E;">${escapeHtml(supportEmail)}</a></p>
                    ${unsubscribeHtml}
                    <p style="margin:10px 0 0 0;font-size:11px;color:#9CA3AF;">© ${new Date().getFullYear()} My Own Tea</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
    const textLines = [
        title,
        '',
        greeting,
        '',
        ...paragraphs,
        ...(infoRows.length > 0
            ? [
                '',
                ...infoRows.map((row) => `${row.label}: ${row.value}`),
            ]
            : []),
        ...(detailsTextLines.length > 0 ? ['', ...detailsTextLines] : []),
        ...(ctaLabel && ctaUrl ? ['', `${ctaLabel}:`, ctaUrl] : []),
        ...(secondaryCtaLabel && secondaryCtaUrl ? ['', `${secondaryCtaLabel}:`, secondaryCtaUrl] : []),
        ...(footnote ? ['', footnote] : []),
        '',
        `Besoin d'aide: ${supportEmail}`,
        ...(unsubscribeUrl ? [`Se désinscrire (emails marketing): ${unsubscribeUrl}`] : []),
    ];
    return { html, text: textLines.join('\n') };
};
const buildPasswordResetEmail = (params) => {
    const safeName = toNonEmptyStringOrNull(params.firstName) || 'Bonjour';
    const content = buildCustomerEmailTemplate({
        title: 'Réinitialisation de votre mot de passe',
        previewText: `Lien valable ${PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes`,
        greeting: `${safeName},`,
        paragraphs: [
            "Nous avons reçu une demande de réinitialisation du mot de passe de votre compte My Own Tea.",
            `Pour votre sécurité, ce lien est valable ${PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes.`,
            "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.",
        ],
        ctaLabel: 'Réinitialiser mon mot de passe',
        ctaUrl: params.resetUrl,
        footnote: "Par mesure de sécurité, ne transférez jamais ce lien à un tiers.",
    });
    return { text: content.text, html: content.html };
};
let smtpTransporterPromise = null;
const getSmtpTransporter = async () => {
    if (smtpTransporterPromise)
        return smtpTransporterPromise;
    const host = toNonEmptyStringOrNull(process.env.SMTP_HOST);
    const user = toNonEmptyStringOrNull(process.env.SMTP_USER);
    const pass = toNonEmptyStringOrNull(process.env.SMTP_PASS);
    const portRaw = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true';
    if (!host || !user || !pass) {
        smtpTransporterPromise = Promise.resolve(null);
        return smtpTransporterPromise;
    }
    const transporter = nodemailer.createTransport({
        host,
        port: Number.isFinite(portRaw) ? Math.round(portRaw) : 587,
        secure,
        auth: {
            user,
            pass,
        },
    });
    smtpTransporterPromise = Promise.resolve(transporter);
    return smtpTransporterPromise;
};
const dispatchEmailNow = async (params) => {
    const transporter = await getSmtpTransporter();
    if (!transporter) {
        console.log(`[mail][fallback] to=${params.to} subject=${params.subject}`);
        return {
            provider: 'FALLBACK',
            messageId: null,
            response: 'fallback-log-only',
        };
    }
    const unsubscribeUrl = toNonEmptyStringOrNull(params.unsubscribeUrl);
    const mailOptions = {
        from: PASSWORD_RESET_MAIL_FROM,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
        ...(toNonEmptyStringOrNull(params.replyTo || EMAIL_REPLY_TO)
            ? { replyTo: toNonEmptyStringOrNull(params.replyTo || EMAIL_REPLY_TO) }
            : {}),
        ...(unsubscribeUrl
            ? {
                headers: {
                    'List-Unsubscribe': `<${unsubscribeUrl}>`,
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                },
            }
            : {}),
    };
    const info = await transporter.sendMail(mailOptions);
    return {
        provider: EMAIL_PROVIDER_NAME,
        messageId: toNonEmptyStringOrNull(info.messageId),
        response: toNonEmptyStringOrNull(info.response),
    };
};
const sendPasswordResetEmail = async (params) => {
    const emailContent = buildPasswordResetEmail({
        firstName: params.firstName,
        resetUrl: params.resetUrl,
    });
    const deliveryId = await queueEmailDelivery({
        customerId: params.customerId || null,
        orderId: null,
        campaignKey: null,
        type: 'PASSWORD_RESET',
        to: params.to,
        recipient: params.to,
        subject: 'Réinitialisation de votre mot de passe My Own Tea',
        text: emailContent.text,
        html: emailContent.html,
        replyTo: EMAIL_REPLY_TO,
        metadata: {
            source: 'forgot_password',
            resetUrl: params.resetUrl,
        },
    });
    const sendResult = await retryEmailDeliveryNow(deliveryId);
    const delivery = sendResult.row;
    if (process.env.NODE_ENV !== 'production') {
        console.log(`[mail][password-reset][sent] to=${params.to} status=${delivery?.status || 'unknown'} sent=${sendResult.metrics.sent}`);
    }
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
let passwordResetTableEnsurePromise = null;
let passwordResetTableEnsured = false;
const ensurePasswordResetTable = async () => {
    if (passwordResetTableEnsured)
        return;
    if (passwordResetTableEnsurePromise) {
        await passwordResetTableEnsurePromise;
        return;
    }
    passwordResetTableEnsurePromise = (async () => {
        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "customerId" TEXT NOT NULL,
        "tokenHash" TEXT NOT NULL UNIQUE,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "usedAt" TIMESTAMP(3),
        "requestedFromIp" TEXT,
        "userAgent" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
        await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "PasswordResetToken_customerId_createdAt_idx"
      ON "PasswordResetToken"("customerId", "createdAt");
    `);
        await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx"
      ON "PasswordResetToken"("expiresAt");
    `);
        await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'PasswordResetToken_customerId_fkey'
        ) THEN
          ALTER TABLE "PasswordResetToken"
          ADD CONSTRAINT "PasswordResetToken_customerId_fkey"
          FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);
        passwordResetTableEnsured = true;
    })();
    try {
        await passwordResetTableEnsurePromise;
    }
    catch (error) {
        passwordResetTableEnsurePromise = null;
        passwordResetTableEnsured = false;
        throw error;
    }
};
const normalizeShippingOfferCode = (value) => {
    const raw = toNonEmptyStringOrNull(value);
    if (!raw)
        return null;
    if (raw === '""' || raw === "''")
        return null;
    const unquoted = raw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();
    return unquoted.length > 0 ? unquoted : null;
};
const getConfiguredShippingOfferCode = (mode) => {
    if (mode === 'RELAY') {
        return normalizeShippingOfferCode(process.env.BOXTAL_RELAY_OFFER_CODE);
    }
    if (mode === 'HOME') {
        return normalizeShippingOfferCode(process.env.BOXTAL_HOME_OFFER_CODE);
    }
    return null;
};
const getShippingOfferLabelByMode = (mode) => {
    if (mode === 'RELAY')
        return 'Point relais (Mondial Relay)';
    if (mode === 'HOME')
        return 'Livraison a domicile';
    return null;
};
const resolveOrderShippingSelection = (selection) => {
    const mode = normalizeShippingMode(selection?.mode) || null;
    const offerId = normalizeShippingOfferId(selection?.offerId);
    const offerCode = normalizeShippingOfferCode(selection?.offerCode) || getConfiguredShippingOfferCode(mode);
    const offerLabel = toNonEmptyStringOrNull(selection?.offerLabel) || getShippingOfferLabelByMode(mode);
    const countryCode = toNonEmptyStringOrNull(selection?.countryCode);
    const postalCode = toNonEmptyStringOrNull(selection?.postalCode);
    const city = toNonEmptyStringOrNull(selection?.city);
    const relayPoint = selection && typeof selection.relayPoint === 'object'
        ? selection.relayPoint
        : null;
    return {
        mode,
        offerId: offerId || null,
        offerCode: offerCode || null,
        offerLabel: offerLabel || null,
        countryCode: countryCode || null,
        postalCode: postalCode || null,
        city: city || null,
        relayPoint,
    };
};
const parseStripeShippingSelectionMetadata = (value) => {
    const raw = toNonEmptyStringOrNull(value);
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    }
    catch {
        return null;
    }
};
let workflowTablesEnsurePromise = null;
let workflowTablesEnsured = false;
const ensureOrderWorkflowTables = async () => {
    if (workflowTablesEnsured)
        return;
    if (workflowTablesEnsurePromise) {
        await workflowTablesEnsurePromise;
        return;
    }
    workflowTablesEnsurePromise = (async () => {
        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "OrderStatusHistory" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orderId" TEXT NOT NULL,
        "fromStatus" TEXT NOT NULL,
        "toStatus" TEXT NOT NULL,
        "reason" TEXT,
        "actorType" TEXT NOT NULL,
        "actorId" TEXT,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
        await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "OrderStatusHistory_orderId_createdAt_idx"
      ON "OrderStatusHistory"("orderId", "createdAt" DESC);
    `);
        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "OrderNotificationLog" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orderId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "channel" TEXT NOT NULL,
        "recipient" TEXT,
        "status" TEXT NOT NULL DEFAULT 'SENT',
        "payload" JSONB,
        "error" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "sentAt" TIMESTAMP(3)
      );
    `);
        await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "OrderNotificationLog_orderId_type_createdAt_idx"
      ON "OrderNotificationLog"("orderId", "type", "createdAt" DESC);
    `);
        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AutomationJobConfig" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "intervalMs" INTEGER NOT NULL,
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "lastRunAt" TIMESTAMP(3),
        "nextRunAt" TIMESTAMP(3),
        "lastStatus" TEXT,
        "lastError" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EmailPreference" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "customerId" TEXT NOT NULL UNIQUE,
        "transactionalOptIn" BOOLEAN NOT NULL DEFAULT true,
        "marketingOptIn" BOOLEAN NOT NULL DEFAULT true,
        "abandonedCartOptIn" BOOLEAN NOT NULL DEFAULT true,
        "postPurchaseOptIn" BOOLEAN NOT NULL DEFAULT true,
        "reorderOptIn" BOOLEAN NOT NULL DEFAULT true,
        "winbackOptIn" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EmailDelivery" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "customerId" TEXT,
        "orderId" TEXT,
        "campaignKey" TEXT,
        "type" TEXT NOT NULL,
        "channel" TEXT NOT NULL DEFAULT 'EMAIL',
        "recipient" TEXT NOT NULL,
        "subject" TEXT NOT NULL,
        "payload" JSONB,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "provider" TEXT NOT NULL DEFAULT 'SMTP',
        "providerMessageId" TEXT,
        "error" TEXT,
        "attemptCount" INTEGER NOT NULL DEFAULT 0,
        "nextAttemptAt" TIMESTAMP(3),
        "sentAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EmailCampaignLog" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "customerId" TEXT NOT NULL,
        "orderId" TEXT,
        "cartId" TEXT,
        "campaignKey" TEXT NOT NULL,
        "emailDeliveryId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
        await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "EmailDelivery_status_nextAttemptAt_idx"
      ON "EmailDelivery"("status", "nextAttemptAt");
    `);
        await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "EmailDelivery_createdAt_idx"
      ON "EmailDelivery"("createdAt");
    `);
        await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "EmailDelivery_customerId_idx"
      ON "EmailDelivery"("customerId");
    `);
        await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "EmailDelivery_orderId_idx"
      ON "EmailDelivery"("orderId");
    `);
        await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "EmailCampaignLog_customerId_campaignKey_key"
      ON "EmailCampaignLog"("customerId", "campaignKey");
    `);
        await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "EmailCampaignLog_campaignKey_idx"
      ON "EmailCampaignLog"("campaignKey");
    `);
        await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "EmailCampaignLog_orderId_idx"
      ON "EmailCampaignLog"("orderId");
    `);
        await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "EmailCampaignLog_cartId_idx"
      ON "EmailCampaignLog"("cartId");
    `);
        await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'EmailPreference_customerId_fkey'
        ) THEN
          ALTER TABLE "EmailPreference"
          ADD CONSTRAINT "EmailPreference_customerId_fkey"
          FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);
        await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'EmailDelivery_customerId_fkey'
        ) THEN
          ALTER TABLE "EmailDelivery"
          ADD CONSTRAINT "EmailDelivery_customerId_fkey"
          FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);
        await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'EmailDelivery_orderId_fkey'
        ) THEN
          ALTER TABLE "EmailDelivery"
          ADD CONSTRAINT "EmailDelivery_orderId_fkey"
          FOREIGN KEY ("orderId") REFERENCES "Order"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);
        await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'EmailCampaignLog_customerId_fkey'
        ) THEN
          ALTER TABLE "EmailCampaignLog"
          ADD CONSTRAINT "EmailCampaignLog_customerId_fkey"
          FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);
        await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'EmailCampaignLog_orderId_fkey'
        ) THEN
          ALTER TABLE "EmailCampaignLog"
          ADD CONSTRAINT "EmailCampaignLog_orderId_fkey"
          FOREIGN KEY ("orderId") REFERENCES "Order"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);
        await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'EmailCampaignLog_cartId_fkey'
        ) THEN
          ALTER TABLE "EmailCampaignLog"
          ADD CONSTRAINT "EmailCampaignLog_cartId_fkey"
          FOREIGN KEY ("cartId") REFERENCES "Cart"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);
        await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'EmailCampaignLog_emailDeliveryId_fkey'
        ) THEN
          ALTER TABLE "EmailCampaignLog"
          ADD CONSTRAINT "EmailCampaignLog_emailDeliveryId_fkey"
          FOREIGN KEY ("emailDeliveryId") REFERENCES "EmailDelivery"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);
        const defaultEntries = Object.entries(AUTOMATION_JOB_DEFAULTS);
        for (const [id, config] of defaultEntries) {
            await prisma.$executeRaw `
        INSERT INTO "AutomationJobConfig" ("id", "name", "description", "intervalMs", "enabled", "createdAt", "updatedAt")
        VALUES (${id}, ${config.name}, ${config.description}, ${config.intervalMs}, true, NOW(), NOW())
        ON CONFLICT ("id") DO UPDATE SET
          "name" = EXCLUDED."name",
          "description" = EXCLUDED."description"
      `;
        }
        workflowTablesEnsured = true;
    })();
    try {
        await workflowTablesEnsurePromise;
    }
    catch (error) {
        workflowTablesEnsurePromise = null;
        workflowTablesEnsured = false;
        throw error;
    }
};
const getOrderForWorkflow = (orderId) => prisma.order.findUnique({
    where: { id: orderId },
    include: {
        items: true,
        customer: {
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
            },
        },
        shipment: true,
    },
});
const ORDER_STATUS_LABELS_FR = {
    PENDING: 'En attente de paiement',
    CONFIRMED: 'Confirmée',
    PROCESSING: 'En préparation',
    SHIPPED: 'Expédiée',
    DELIVERED: 'Livrée',
    CANCELLED: 'Annulée',
    REFUNDED: 'Remboursée',
};
const formatEuroFromCents = (valueCents) => {
    const numeric = Number(valueCents || 0);
    const amount = Number.isFinite(numeric) ? numeric / 100 : 0;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
};
const buildOrderItemsSummary = (order) => {
    const items = Array.isArray(order?.items) ? order.items : [];
    if (items.length === 0)
        return [];
    return items.slice(0, 6).map((item) => {
        const snapshot = toJsonObjectRecord(item.snapshot);
        const title = toNonEmptyStringOrNull(snapshot.title) ||
            toNonEmptyStringOrNull(item.ingredientName) ||
            'Article';
        const qty = Math.max(1, Number(item.qty || item.quantity || 1));
        const lineTotal = Number.isFinite(Number(item.lineTotalCents))
            ? Number(item.lineTotalCents)
            : Math.max(0, Math.round(Number(item.price || 0) * 100 * qty));
        return `${title} x${qty} (${formatEuroFromCents(lineTotal)})`;
    });
};
const buildOrderNotificationEmailContent = (params) => {
    const safeFirstName = toNonEmptyStringOrNull(params.order?.customer?.firstName) || 'Bonjour';
    const orderNumber = toNonEmptyStringOrNull(params.order?.orderNumber) || 'Votre commande';
    const status = toStatusOrNull(params.order?.status);
    const statusLabel = ORDER_STATUS_LABELS_FR[status || 'PENDING'] || 'Mise à jour';
    const totalCents = Number.isFinite(Number(params.order?.totalCents))
        ? Number(params.order.totalCents)
        : Math.max(0, Math.round(Number(params.order?.total || 0) * 100));
    const trackingUrl = toNonEmptyStringOrNull(params.order?.trackingUrl) ||
        toNonEmptyStringOrNull(params.order?.shipment?.trackingUrl) ||
        null;
    const orderUrl = params.order?.id
        ? `${WEB_BASE_URL}/account/order/${params.order.id}`
        : `${WEB_BASE_URL}/account/orders`;
    const itemsSummary = buildOrderItemsSummary(params.order);
    const subjectByType = {
        ORDER_CONFIRMED: `Commande ${orderNumber} confirmée`,
        ORDER_PROCESSING: `Commande ${orderNumber} en préparation`,
        ORDER_SHIPPED: `Commande ${orderNumber} expédiée`,
        ORDER_DELIVERED: `Commande ${orderNumber} livrée`,
        ORDER_CANCELLED: `Commande ${orderNumber} annulée`,
        ORDER_REFUNDED: `Commande ${orderNumber} remboursée`,
    };
    const statusDetailByType = {
        ORDER_CONFIRMED: 'Votre paiement est validé. Nous préparons votre commande avec soin.',
        ORDER_PROCESSING: 'Votre commande est actuellement en préparation dans notre atelier.',
        ORDER_SHIPPED: 'Votre colis a été remis au transporteur. Vous pouvez suivre son acheminement.',
        ORDER_DELIVERED: 'Votre commande est marquée comme livrée. Bonne dégustation !',
        ORDER_CANCELLED: "Votre commande a été annulée. Si besoin, notre équipe peut vous accompagner.",
        ORDER_REFUNDED: 'Le remboursement de votre commande a été enregistré.',
    };
    const titleByType = {
        ORDER_CONFIRMED: 'Commande confirmée',
        ORDER_PROCESSING: 'Commande en préparation',
        ORDER_SHIPPED: 'Commande expédiée',
        ORDER_DELIVERED: 'Commande livrée',
        ORDER_CANCELLED: 'Commande annulée',
        ORDER_REFUNDED: 'Commande remboursée',
    };
    const accentByType = {
        ORDER_CONFIRMED: '#C9A962',
        ORDER_PROCESSING: '#8B6B2E',
        ORDER_SHIPPED: '#0D9488',
        ORDER_DELIVERED: '#15803D',
        ORDER_CANCELLED: '#B91C1C',
        ORDER_REFUNDED: '#C2410C',
    };
    const subject = subjectByType[params.type] || `Mise à jour commande ${orderNumber}`;
    const detailsHtml = itemsSummary.length > 0
        ? `
        <div style="margin:14px 0 0 0;padding:12px;border:1px solid #E5E0D5;border-radius:10px;background:#FCFBF8;">
          <p style="margin:0 0 8px 0;color:#6B7280;font-size:12px;font-weight:600;">Articles de votre commande</p>
          <ul style="margin:0;padding-left:18px;color:#374151;font-size:13px;line-height:1.6;">
            ${itemsSummary.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
          </ul>
        </div>
      `
        : '';
    const primaryCtaUrl = params.type === 'ORDER_SHIPPED' && trackingUrl ? trackingUrl : orderUrl;
    const primaryCtaLabel = params.type === 'ORDER_SHIPPED' && trackingUrl
        ? 'Suivre mon colis'
        : 'Voir ma commande';
    const content = buildCustomerEmailTemplate({
        title: titleByType[params.type] || 'Mise à jour de commande',
        previewText: `${orderNumber} - ${statusLabel}`,
        greeting: `${safeFirstName},`,
        paragraphs: [
            statusDetailByType[params.type] || `Le statut de votre commande est maintenant: ${statusLabel}.`,
            'Vous pouvez consulter le détail de votre commande depuis votre espace client.',
        ],
        infoRows: [
            { label: 'Commande', value: orderNumber },
            { label: 'Statut', value: statusLabel },
            { label: 'Montant total', value: formatEuroFromCents(totalCents) },
        ],
        detailsHtml,
        detailsTextLines: itemsSummary.length > 0 ? ['Articles:', ...itemsSummary] : [],
        ctaLabel: primaryCtaLabel,
        ctaUrl: primaryCtaUrl,
        secondaryCtaLabel: trackingUrl && primaryCtaUrl !== trackingUrl ? 'Lien de suivi transporteur' : null,
        secondaryCtaUrl: trackingUrl && primaryCtaUrl !== trackingUrl ? trackingUrl : null,
        footnote: params.type === 'ORDER_CANCELLED' || params.type === 'ORDER_REFUNDED'
            ? "Si vous avez une question, notre équipe support reste disponible pour vous aider."
            : null,
        accentColor: accentByType[params.type] || '#C9A962',
    });
    return {
        subject,
        text: content.text,
        html: content.html,
    };
};
const buildSecurityEmailContent = (params) => {
    const firstName = toNonEmptyStringOrNull(params.firstName) || 'Bonjour';
    const accountUrl = `${WEB_BASE_URL}/account/edit`;
    if (params.type === 'ACCOUNT_EMAIL_CHANGED') {
        const newEmail = toNonEmptyStringOrNull(params.newEmail) || 'votre adresse email';
        const oldEmail = toNonEmptyStringOrNull(params.oldEmail) || 'adresse précédente';
        const content = buildCustomerEmailTemplate({
            title: 'Alerte sécurité du compte',
            previewText: 'Votre adresse email de connexion a été modifiée',
            greeting: `${firstName},`,
            paragraphs: [
                "Nous confirmons qu'une modification de l'adresse email a été effectuée sur votre compte My Own Tea.",
                "Si vous n'êtes pas à l'origine de ce changement, sécurisez immédiatement votre compte.",
            ],
            infoRows: [
                { label: 'Ancien email', value: oldEmail },
                { label: 'Nouvel email', value: newEmail },
            ],
            ctaLabel: 'Vérifier mon compte',
            ctaUrl: accountUrl,
            footnote: "Conseil sécurité: mettez à jour votre mot de passe si cette action vous semble inhabituelle.",
            accentColor: '#C2410C',
        });
        return {
            subject: 'Votre email de compte a été modifié',
            text: content.text,
            html: content.html,
        };
    }
    const content = buildCustomerEmailTemplate({
        title: 'Alerte sécurité du compte',
        previewText: 'Votre mot de passe a été modifié',
        greeting: `${firstName},`,
        paragraphs: [
            "Le mot de passe de votre compte My Own Tea vient d'être modifié.",
            "Si vous n'êtes pas à l'origine de cette action, lancez immédiatement une réinitialisation.",
        ],
        ctaLabel: 'Vérifier mon compte',
        ctaUrl: accountUrl,
        footnote: "Si vous suspectez un accès non autorisé, contactez rapidement notre support.",
        accentColor: '#C2410C',
    });
    return {
        subject: 'Votre mot de passe a été modifié',
        text: content.text,
        html: content.html,
    };
};
const ensureEmailPreference = async (customerId) => {
    if (!customerId)
        return null;
    await ensureOrderWorkflowTables();
    await prisma.$executeRaw `
    INSERT INTO "EmailPreference" ("id", "customerId", "createdAt", "updatedAt")
    VALUES (${crypto.randomUUID()}, ${customerId}, NOW(), NOW())
    ON CONFLICT ("customerId") DO NOTHING
  `;
    const rows = await prisma.$queryRaw `
    SELECT
      "id",
      "customerId",
      "transactionalOptIn",
      "marketingOptIn",
      "abandonedCartOptIn",
      "postPurchaseOptIn",
      "reorderOptIn",
      "winbackOptIn",
      "createdAt",
      "updatedAt"
    FROM "EmailPreference"
    WHERE "customerId" = ${customerId}
    LIMIT 1
  `;
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
};
const updateEmailPreference = async (customerId, updates) => {
    const existing = await ensureEmailPreference(customerId);
    if (!existing)
        return null;
    const data = {
        transactionalOptIn: updates.transactionalOptIn !== undefined ? Boolean(updates.transactionalOptIn) : Boolean(existing.transactionalOptIn),
        marketingOptIn: updates.marketingOptIn !== undefined ? Boolean(updates.marketingOptIn) : Boolean(existing.marketingOptIn),
        abandonedCartOptIn: updates.abandonedCartOptIn !== undefined ? Boolean(updates.abandonedCartOptIn) : Boolean(existing.abandonedCartOptIn),
        postPurchaseOptIn: updates.postPurchaseOptIn !== undefined ? Boolean(updates.postPurchaseOptIn) : Boolean(existing.postPurchaseOptIn),
        reorderOptIn: updates.reorderOptIn !== undefined ? Boolean(updates.reorderOptIn) : Boolean(existing.reorderOptIn),
        winbackOptIn: updates.winbackOptIn !== undefined ? Boolean(updates.winbackOptIn) : Boolean(existing.winbackOptIn),
    };
    await prisma.$executeRaw `
    UPDATE "EmailPreference"
    SET
      "transactionalOptIn" = ${data.transactionalOptIn},
      "marketingOptIn" = ${data.marketingOptIn},
      "abandonedCartOptIn" = ${data.abandonedCartOptIn},
      "postPurchaseOptIn" = ${data.postPurchaseOptIn},
      "reorderOptIn" = ${data.reorderOptIn},
      "winbackOptIn" = ${data.winbackOptIn},
      "updatedAt" = NOW()
    WHERE "customerId" = ${customerId}
  `;
    return ensureEmailPreference(customerId);
};
const queueEmailDelivery = async (params) => {
    await ensureOrderWorkflowTables();
    const id = crypto.randomUUID();
    const payload = {
        text: params.text || '',
        html: params.html || '',
        replyTo: toNonEmptyStringOrNull(params.replyTo || EMAIL_REPLY_TO),
        unsubscribeUrl: toNonEmptyStringOrNull(params.unsubscribeUrl),
        metadata: toJsonObjectRecord(params.metadata),
    };
    await prisma.$executeRaw `
    INSERT INTO "EmailDelivery" (
      "id",
      "customerId",
      "orderId",
      "campaignKey",
      "type",
      "channel",
      "recipient",
      "subject",
      "payload",
      "status",
      "provider",
      "attemptCount",
      "nextAttemptAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id},
      ${params.customerId || null},
      ${params.orderId || null},
      ${params.campaignKey || null},
      ${params.type},
      ${'EMAIL'},
      ${params.recipient},
      ${params.subject},
      CAST(${JSON.stringify(payload)} AS jsonb),
      ${'PENDING'},
      ${EMAIL_PROVIDER_NAME},
      0,
      NOW(),
      NOW(),
      NOW()
    )
  `;
    return id;
};
const computeRetryDelayMinutes = (attemptCount) => {
    const safeAttempt = Math.max(1, Number(attemptCount || 1));
    const multiplier = Math.min(64, Math.pow(2, safeAttempt - 1));
    return EMAIL_OUTBOX_RETRY_BASE_MINUTES * multiplier;
};
const processEmailOutboxBatch = async (limit = EMAIL_OUTBOX_BATCH_SIZE) => {
    await ensureOrderWorkflowTables();
    const effectiveLimit = Math.max(1, Math.min(200, Math.round(Number(limit) || EMAIL_OUTBOX_BATCH_SIZE)));
    const rows = await prisma.$queryRaw `
    SELECT
      "id",
      "recipient",
      "subject",
      "payload",
      "attemptCount",
      "status",
      "campaignKey"
    FROM "EmailDelivery"
    WHERE "status" IN ('PENDING', 'RETRY')
      AND COALESCE("nextAttemptAt", NOW()) <= NOW()
      AND "attemptCount" < ${EMAIL_OUTBOX_MAX_ATTEMPTS}
    ORDER BY "createdAt" ASC
    LIMIT ${effectiveLimit}
  `;
    const metrics = {
        scanned: Array.isArray(rows) ? rows.length : 0,
        sent: 0,
        retried: 0,
        failed: 0,
        skippedLocked: 0,
    };
    for (const row of Array.isArray(rows) ? rows : []) {
        const lockCount = await prisma.$executeRaw `
      UPDATE "EmailDelivery"
      SET "status" = ${'PROCESSING'}, "updatedAt" = NOW()
      WHERE "id" = ${row.id}
        AND "status" IN ('PENDING', 'RETRY')
    `;
        if (!lockCount) {
            metrics.skippedLocked += 1;
            continue;
        }
        const payload = toJsonObjectRecord(row.payload);
        try {
            const result = await dispatchEmailNow({
                to: row.recipient,
                subject: row.subject,
                text: toNonEmptyStringOrNull(payload.text) || '',
                html: toNonEmptyStringOrNull(payload.html) || '',
                replyTo: toNonEmptyStringOrNull(payload.replyTo) || EMAIL_REPLY_TO,
                unsubscribeUrl: toNonEmptyStringOrNull(payload.unsubscribeUrl),
            });
            await prisma.$executeRaw `
        UPDATE "EmailDelivery"
        SET
          "status" = ${'SENT'},
          "provider" = ${result.provider || EMAIL_PROVIDER_NAME},
          "providerMessageId" = ${result.messageId || null},
          "error" = NULL,
          "attemptCount" = COALESCE("attemptCount", 0) + 1,
          "sentAt" = NOW(),
          "updatedAt" = NOW()
        WHERE "id" = ${row.id}
      `;
            metrics.sent += 1;
        }
        catch (error) {
            const attemptCount = Math.max(0, Number(row.attemptCount || 0)) + 1;
            const reachedMax = attemptCount >= EMAIL_OUTBOX_MAX_ATTEMPTS;
            const delayMinutes = computeRetryDelayMinutes(attemptCount);
            const nextAttemptAt = new Date(Date.now() + delayMinutes * 60 * 1000);
            const message = error instanceof Error ? error.message : String(error);
            await prisma.$executeRaw `
        UPDATE "EmailDelivery"
        SET
          "status" = ${reachedMax ? 'FAILED' : 'RETRY'},
          "error" = ${message},
          "attemptCount" = ${attemptCount},
          "nextAttemptAt" = ${reachedMax ? null : nextAttemptAt},
          "updatedAt" = NOW()
        WHERE "id" = ${row.id}
      `;
            if (reachedMax) {
                metrics.failed += 1;
            }
            else {
                metrics.retried += 1;
            }
        }
    }
    return metrics;
};
const listEmailDeliveries = async (params = {}) => {
    await ensureOrderWorkflowTables();
    const safePage = Math.max(1, Number(params.page || 1));
    const safePageSize = Math.min(200, Math.max(1, Number(params.pageSize || 50)));
    const offset = (safePage - 1) * safePageSize;
    const statusFilter = toNonEmptyStringOrNull(params.status);
    const typeFilter = toNonEmptyStringOrNull(params.type);
    const recipientFilter = toNonEmptyStringOrNull(params.recipient);
    const rows = await prisma.$queryRawUnsafe(`
    SELECT
      d."id",
      d."customerId",
      d."orderId",
      d."campaignKey",
      d."type",
      d."channel",
      d."recipient",
      d."subject",
      d."status",
      d."provider",
      d."providerMessageId",
      d."error",
      d."attemptCount",
      d."nextAttemptAt",
      d."sentAt",
      d."createdAt",
      d."updatedAt",
      c."firstName" AS "customerFirstName",
      c."lastName" AS "customerLastName",
      c."email" AS "customerEmail",
      o."orderNumber" AS "orderNumber"
    FROM "EmailDelivery" d
    LEFT JOIN "Customer" c ON c."id" = d."customerId"
    LEFT JOIN "Order" o ON o."id" = d."orderId"
    WHERE ($1::text IS NULL OR d."status" = $1::text)
      AND ($2::text IS NULL OR d."type" = $2::text)
      AND ($3::text IS NULL OR d."recipient" ILIKE ('%' || $3::text || '%'))
    ORDER BY d."createdAt" DESC
    LIMIT $4 OFFSET $5
  `, statusFilter, typeFilter, recipientFilter, safePageSize, offset);
    const totalRows = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS "count"
    FROM "EmailDelivery" d
    WHERE ($1::text IS NULL OR d."status" = $1::text)
      AND ($2::text IS NULL OR d."type" = $2::text)
      AND ($3::text IS NULL OR d."recipient" ILIKE ('%' || $3::text || '%'))
  `, statusFilter, typeFilter, recipientFilter);
    const totalCount = Array.isArray(totalRows) && totalRows.length > 0 ? Number(totalRows[0].count || 0) : 0;
    return {
        page: safePage,
        pageSize: safePageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / safePageSize)),
        items: Array.isArray(rows) ? rows : [],
    };
};
const getEmailDeliveryById = async (id) => {
    await ensureOrderWorkflowTables();
    const rows = await prisma.$queryRaw `
    SELECT
      "id",
      "customerId",
      "orderId",
      "campaignKey",
      "type",
      "channel",
      "recipient",
      "subject",
      "payload",
      "status",
      "provider",
      "providerMessageId",
      "error",
      "attemptCount",
      "nextAttemptAt",
      "sentAt",
      "createdAt",
      "updatedAt"
    FROM "EmailDelivery"
    WHERE "id" = ${id}
    LIMIT 1
  `;
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
};
const retryEmailDeliveryNow = async (id) => {
    await ensureOrderWorkflowTables();
    const row = await getEmailDeliveryById(id);
    if (!row) {
        throw new Error('EMAIL_NOT_FOUND');
    }
    await prisma.$executeRaw `
    UPDATE "EmailDelivery"
    SET
      "status" = ${'PROCESSING'},
      "error" = NULL,
      "nextAttemptAt" = NOW(),
      "updatedAt" = NOW()
    WHERE "id" = ${id}
  `;
    const payload = toJsonObjectRecord(row.payload);
    const metrics = {
        scanned: 1,
        sent: 0,
        retried: 0,
        failed: 0,
        skippedLocked: 0,
    };
    try {
        const result = await dispatchEmailNow({
            to: row.recipient,
            subject: row.subject,
            text: toNonEmptyStringOrNull(payload.text) || '',
            html: toNonEmptyStringOrNull(payload.html) || '',
            replyTo: toNonEmptyStringOrNull(payload.replyTo) || EMAIL_REPLY_TO,
            unsubscribeUrl: toNonEmptyStringOrNull(payload.unsubscribeUrl),
        });
        await prisma.$executeRaw `
      UPDATE "EmailDelivery"
      SET
        "status" = ${'SENT'},
        "provider" = ${result.provider || EMAIL_PROVIDER_NAME},
        "providerMessageId" = ${result.messageId || null},
        "error" = NULL,
        "attemptCount" = COALESCE("attemptCount", 0) + 1,
        "sentAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "id" = ${id}
    `;
        metrics.sent = 1;
    }
    catch (error) {
        const attemptCount = Math.max(0, Number(row.attemptCount || 0)) + 1;
        const reachedMax = attemptCount >= EMAIL_OUTBOX_MAX_ATTEMPTS;
        const delayMinutes = computeRetryDelayMinutes(attemptCount);
        const nextAttemptAt = new Date(Date.now() + delayMinutes * 60 * 1000);
        const message = error instanceof Error ? error.message : String(error);
        await prisma.$executeRaw `
      UPDATE "EmailDelivery"
      SET
        "status" = ${reachedMax ? 'FAILED' : 'RETRY'},
        "error" = ${message},
        "attemptCount" = ${attemptCount},
        "nextAttemptAt" = ${reachedMax ? null : nextAttemptAt},
        "updatedAt" = NOW()
      WHERE "id" = ${id}
    `;
        if (reachedMax) {
            metrics.failed = 1;
        }
        else {
            metrics.retried = 1;
        }
    }
    return { row: await getEmailDeliveryById(id), metrics };
};
const getMarketingPreferenceFieldByCampaignType = (campaignType) => {
    const normalized = String(campaignType || '').trim().toUpperCase();
    if (normalized.startsWith('ABANDONED_CART_'))
        return 'abandonedCartOptIn';
    if (normalized.startsWith('POST_PURCHASE_'))
        return 'postPurchaseOptIn';
    if (normalized.startsWith('REORDER_'))
        return 'reorderOptIn';
    if (normalized.startsWith('WINBACK_'))
        return 'winbackOptIn';
    return null;
};
const canSendMarketingEmail = async (customerId, campaignType) => {
    const preferences = await ensureEmailPreference(customerId);
    if (!preferences)
        return true;
    if (!preferences.marketingOptIn)
        return false;
    const field = getMarketingPreferenceFieldByCampaignType(campaignType);
    if (!field)
        return Boolean(preferences.marketingOptIn);
    return Boolean(preferences[field]);
};
const reserveCampaignLog = async (params) => {
    await ensureOrderWorkflowTables();
    const rows = await prisma.$queryRaw `
    INSERT INTO "EmailCampaignLog" (
      "id",
      "customerId",
      "orderId",
      "cartId",
      "campaignKey",
      "emailDeliveryId",
      "createdAt"
    )
    VALUES (
      ${crypto.randomUUID()},
      ${params.customerId},
      ${params.orderId || null},
      ${params.cartId || null},
      ${params.campaignKey},
      NULL,
      NOW()
    )
    ON CONFLICT ("customerId", "campaignKey") DO NOTHING
    RETURNING "id"
  `;
    if (!Array.isArray(rows) || rows.length === 0)
        return null;
    return rows[0].id || null;
};
const buildMarketingEmailContent = (params) => {
    const firstName = toNonEmptyStringOrNull(params.firstName) || 'Bonjour';
    const shopUrl = `${WEB_BASE_URL}/creations`;
    const cartUrl = `${WEB_BASE_URL}/cart`;
    const accountOrdersUrl = `${WEB_BASE_URL}/account/orders`;
    const orderId = toNonEmptyStringOrNull(params.payload?.orderId) || toNonEmptyStringOrNull(params.orderId);
    const orderUrl = orderId ? `${WEB_BASE_URL}/account/order/${orderId}` : accountOrdersUrl;
    const type = String(params.type || '').toUpperCase();
    const templates = {
        WELCOME_J0: {
            subject: 'Bienvenue chez My Own Tea',
            title: 'Bienvenue dans votre atelier infusion',
            previewText: 'Créez votre première infusion personnalisée',
            paragraphs: [
                "Merci d'avoir rejoint My Own Tea.",
                "Composez votre première infusion personnalisée en quelques clics.",
            ],
            ctaLabel: 'Commencer ma création',
            ctaUrl: shopUrl,
        },
        WELCOME_J3: {
            subject: 'Besoin d’idées pour votre infusion ?',
            title: 'Des inspirations pour bien commencer',
            previewText: '6 idées simples pour créer un mélange équilibré',
            paragraphs: [
                'Vous pouvez partir sur une base douce et ajouter 2 à 3 ingrédients complémentaires.',
                'Notre atelier vous guide pour trouver le bon équilibre de saveurs.',
            ],
            ctaLabel: 'Voir les inspirations',
            ctaUrl: shopUrl,
        },
        ABANDONED_CART_H1: {
            subject: 'Votre panier vous attend',
            title: 'Votre sélection est toujours disponible',
            previewText: 'Reprenez votre commande en un clic',
            paragraphs: [
                "Vous avez laissé des articles dans votre panier.",
                'Ils sont encore disponibles: vous pouvez finaliser votre commande quand vous voulez.',
            ],
            ctaLabel: 'Reprendre mon panier',
            ctaUrl: cartUrl,
        },
        ABANDONED_CART_H24: {
            subject: 'Dernier rappel: finalisez votre panier',
            title: 'Votre panier est prêt',
            previewText: 'Finalisez votre commande avant rupture',
            paragraphs: [
                'Votre panier est toujours en attente.',
                'Finalisez votre commande pour recevoir votre infusion sans attendre.',
            ],
            ctaLabel: 'Finaliser ma commande',
            ctaUrl: cartUrl,
        },
        POST_PURCHASE_CROSSSELL_J3: {
            subject: 'Nouvelles idées pour accompagner votre commande',
            title: 'Prolongez votre expérience',
            previewText: 'Découvrez des suggestions adaptées à vos goûts',
            paragraphs: [
                'Merci pour votre dernière commande.',
                "Découvrez des idées complémentaires pour varier vos dégustations à la maison.",
            ],
            ctaLabel: 'Voir les suggestions',
            ctaUrl: shopUrl,
        },
        POST_PURCHASE_REVIEW_J7: {
            subject: 'Votre avis compte pour nous',
            title: 'Comment s’est passée votre dégustation ?',
            previewText: 'Votre retour nous aide à améliorer nos créations',
            paragraphs: [
                'Votre feedback est précieux pour faire évoluer My Own Tea.',
                'Partagez votre retour sur votre commande en quelques instants.',
            ],
            ctaLabel: 'Donner mon avis',
            ctaUrl: orderUrl,
        },
        REORDER_J21: {
            subject: 'Il est peut-être temps de refaire le plein',
            title: 'Réassort en quelques clics',
            previewText: 'Retrouvez vos saveurs préférées rapidement',
            paragraphs: [
                'Vos infusions préférées sont peut-être bientôt terminées.',
                'Relancez facilement une nouvelle commande depuis votre espace client.',
            ],
            ctaLabel: 'Recommander',
            ctaUrl: shopUrl,
        },
        REORDER_J35: {
            subject: 'Réassort infusion: votre rappel',
            title: 'Votre prochain réassort est prêt',
            previewText: 'Restez toujours approvisionné',
            paragraphs: [
                'Nous vous rappelons que vous pouvez renouveler votre sélection.',
                'Conservez votre routine infusion sans interruption.',
            ],
            ctaLabel: 'Commander maintenant',
            ctaUrl: shopUrl,
        },
        WINBACK_45: {
            subject: 'Nous aimerions vous revoir',
            title: 'Des nouveautés vous attendent',
            previewText: 'Revenez découvrir les dernières créations',
            paragraphs: [
                'Cela fait un moment que nous ne vous avons pas vu.',
                'Revenez explorer nos nouveautés et inspirations du moment.',
            ],
            ctaLabel: 'Revenir sur la boutique',
            ctaUrl: shopUrl,
        },
        WINBACK_90: {
            subject: 'Toujours intéressé(e) par My Own Tea ?',
            title: 'On serait ravis de vous retrouver',
            previewText: 'Retrouvez vos rituels infusion',
            paragraphs: [
                'Nous serions heureux de vous revoir chez My Own Tea.',
                'Retrouvez vos favoris ou composez une nouvelle création.',
            ],
            ctaLabel: 'Revenir sur la boutique',
            ctaUrl: shopUrl,
        },
        DEFAULT: {
            subject: 'Nouvelles de My Own Tea',
            title: 'Nouvelles inspirations infusion',
            previewText: 'Découvrez les dernières nouveautés',
            paragraphs: [
                'Retrouvez nos dernières nouveautés et idées de dégustation.',
            ],
            ctaLabel: 'Voir la boutique',
            ctaUrl: shopUrl,
        },
    };
    const selected = templates[type] || templates.DEFAULT;
    const content = buildCustomerEmailTemplate({
        title: selected.title,
        previewText: selected.previewText,
        greeting: `${firstName},`,
        paragraphs: selected.paragraphs,
        ctaLabel: selected.ctaLabel,
        ctaUrl: selected.ctaUrl,
        footnote: 'Vous recevez cet email car vous êtes inscrit(e) à nos communications.',
        unsubscribeUrl: params.unsubscribeUrl || null,
    });
    return {
        subject: selected.subject,
        text: content.text,
        html: content.html,
    };
};
const queueCampaignEmail = async (params) => {
    const customerId = toNonEmptyStringOrNull(params.customerId);
    const recipient = toNonEmptyStringOrNull(params.recipient);
    const campaignType = toNonEmptyStringOrNull(params.type);
    const campaignKey = toNonEmptyStringOrNull(params.campaignKey);
    if (!customerId || !recipient || !campaignType || !campaignKey) {
        return { queued: false, reason: 'INVALID_INPUT' };
    }
    const allowed = await canSendMarketingEmail(customerId, campaignType);
    if (!allowed) {
        return { queued: false, reason: 'PREFERENCE_BLOCKED' };
    }
    const logId = await reserveCampaignLog({
        customerId,
        orderId: params.orderId || null,
        cartId: params.cartId || null,
        campaignKey,
    });
    if (!logId) {
        return { queued: false, reason: 'ALREADY_SENT' };
    }
    const unsubscribeUrl = buildUnsubscribeUrl(customerId, recipient);
    const content = buildMarketingEmailContent({
        type: campaignType,
        firstName: params.firstName,
        orderId: params.orderId || null,
        payload: params.payload || {},
        unsubscribeUrl,
    });
    const deliveryId = await queueEmailDelivery({
        customerId,
        orderId: params.orderId || null,
        campaignKey,
        type: campaignType,
        recipient,
        subject: content.subject,
        text: content.text,
        html: content.html,
        unsubscribeUrl,
        metadata: {
            source: 'campaign',
            campaignKey,
            campaignType,
            logId,
        },
    });
    await prisma.$executeRaw `
    UPDATE "EmailCampaignLog"
    SET "emailDeliveryId" = ${deliveryId}
    WHERE "id" = ${logId}
  `;
    return { queued: true, deliveryId, logId };
};
const listOrderStatusHistory = async (orderId) => {
    await ensureOrderWorkflowTables();
    return prisma.$queryRaw `
    SELECT
      "id",
      "orderId",
      "fromStatus",
      "toStatus",
      "reason",
      "actorType",
      "actorId",
      "metadata",
      "createdAt"
    FROM "OrderStatusHistory"
    WHERE "orderId" = ${orderId}
    ORDER BY "createdAt" DESC
  `;
};
const recordOrderStatusHistory = async (params) => {
    await ensureOrderWorkflowTables();
    const id = crypto.randomUUID();
    await prisma.$executeRaw `
    INSERT INTO "OrderStatusHistory" (
      "id",
      "orderId",
      "fromStatus",
      "toStatus",
      "reason",
      "actorType",
      "actorId",
      "metadata",
      "createdAt"
    )
    VALUES (
      ${id},
      ${params.orderId},
      ${params.fromStatus},
      ${params.toStatus},
      ${params.reason || null},
      ${params.actorType},
      ${params.actorId || null},
      CAST(${JSON.stringify(params.metadata || {})} AS jsonb),
      NOW()
    )
  `;
};
const hasRecentNotification = async (orderId, type, lookbackMinutes) => {
    await ensureOrderWorkflowTables();
    const cutoff = new Date(Date.now() - lookbackMinutes * 60 * 1000);
    const rows = await prisma.$queryRaw `
    SELECT "id"
    FROM "OrderNotificationLog"
    WHERE "orderId" = ${orderId}
      AND "type" = ${type}
      AND "createdAt" >= ${cutoff}
    LIMIT 1
  `;
    return rows.length > 0;
};
const logOrderNotification = async (params) => {
    await ensureOrderWorkflowTables();
    const recipient = params.order.customer.email || null;
    const channel = params.channel || (recipient ? 'email' : 'internal');
    if (await hasRecentNotification(params.order.id, params.type, 5)) {
        return;
    }
    const id = crypto.randomUUID();
    await prisma.$executeRaw `
    INSERT INTO "OrderNotificationLog" (
      "id",
      "orderId",
      "type",
      "channel",
      "recipient",
      "status",
      "payload",
      "createdAt",
      "sentAt"
    )
    VALUES (
      ${id},
      ${params.order.id},
      ${params.type},
      ${channel},
      ${recipient},
      ${'SENT'},
      CAST(${JSON.stringify(params.payload || {})} AS jsonb),
      NOW(),
      NOW()
    )
  `;
    if (channel === 'email' && recipient) {
        const customerId = toNonEmptyStringOrNull(params.order.customer?.id);
        const preferences = customerId ? await ensureEmailPreference(customerId) : null;
        const canSendTransactional = preferences ? Boolean(preferences.transactionalOptIn) : true;
        if (canSendTransactional) {
            const content = params.emailContent || buildOrderNotificationEmailContent({
                type: params.type,
                order: params.order,
                payload: params.payload || {},
            });
            await queueEmailDelivery({
                customerId: customerId || null,
                orderId: params.order.id,
                type: params.type,
                recipient,
                subject: content.subject,
                text: content.text,
                html: content.html,
                metadata: {
                    source: 'order_notification',
                    notificationLogId: id,
                    type: params.type,
                    orderNumber: params.order.orderNumber,
                },
            });
        }
    }
    console.log(`[notification] ${params.type} -> ${params.order.orderNumber} (${recipient || 'internal'})`);
};
const computeAvailableOrderTransitions = (order) => {
    const currentStatus = toStatusOrNull(order.status);
    if (!currentStatus)
        return [];
    const candidates = ORDER_STATUS_TRANSITIONS[currentStatus];
    const effectiveTracking = toNonEmptyStringOrNull(order.trackingNumber) || toNonEmptyStringOrNull(order.shipment?.trackingNumber);
    const effectiveProvider = toNonEmptyStringOrNull(order.shippingProvider) || toNonEmptyStringOrNull(order.shipment?.provider);
    return candidates.filter((target) => {
        if (target === 'CONFIRMED') {
            return order.paymentStatus === 'completed';
        }
        if (target === 'SHIPPED') {
            return Boolean(effectiveTracking && effectiveProvider);
        }
        return true;
    });
};
const adjustInventoryForOrderItems = async (items, direction) => {
    for (const item of items) {
        const type = String(item.itemType || '');
        if (type !== 'VARIANT' && type !== 'PACK')
            continue;
        const quantity = Math.max(1, Number(item.qty || 1));
        const snapshot = toJsonObjectRecord(item.snapshot);
        const variantId = toNonEmptyStringOrNull(snapshot.variantId);
        const productId = toNonEmptyStringOrNull(snapshot.productId);
        if (variantId) {
            const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
            if (!variant || variant.stockQty === null)
                continue;
            if (direction === 'reserve' && variant.stockQty < quantity) {
                throw new OrderWorkflowError('STOCK_UNAVAILABLE', 'Stock insuffisant pour une variante', {
                    variantId,
                    available: variant.stockQty,
                    required: quantity,
                });
            }
            const nextQty = direction === 'reserve'
                ? Math.max(0, variant.stockQty - quantity)
                : variant.stockQty + quantity;
            await prisma.productVariant.update({
                where: { id: variantId },
                data: { stockQty: nextQty },
            });
            continue;
        }
        if (!productId)
            continue;
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product || product.stockQty === null)
            continue;
        if (direction === 'reserve' && product.stockQty < quantity) {
            throw new OrderWorkflowError('STOCK_UNAVAILABLE', 'Stock insuffisant pour un produit', {
                productId,
                available: product.stockQty,
                required: quantity,
            });
        }
        const nextQty = direction === 'reserve'
            ? Math.max(0, product.stockQty - quantity)
            : product.stockQty + quantity;
        await prisma.product.update({
            where: { id: productId },
            data: { stockQty: nextQty },
        });
    }
};
const transitionOrderStatus = async (params) => {
    await ensureOrderWorkflowTables();
    const order = await getOrderForWorkflow(params.orderId);
    if (!order) {
        throw new OrderWorkflowError('ORDER_NOT_FOUND', 'Commande introuvable');
    }
    const fromStatus = toStatusOrNull(order.status);
    if (!fromStatus) {
        throw new OrderWorkflowError('INVALID_CURRENT_STATUS', 'Statut actuel invalide');
    }
    const toStatus = params.toStatus;
    const updateData = {};
    if (params.trackingNumber !== undefined) {
        updateData.trackingNumber = toNonEmptyStringOrNull(params.trackingNumber);
    }
    if (params.trackingUrl !== undefined) {
        updateData.trackingUrl = toNonEmptyStringOrNull(params.trackingUrl);
    }
    if (params.shippingProvider !== undefined) {
        updateData.shippingProvider = toNonEmptyStringOrNull(params.shippingProvider);
    }
    const validationOrder = {
        ...order,
        trackingNumber: updateData.trackingNumber ?? order.trackingNumber,
        shippingProvider: updateData.shippingProvider ?? order.shippingProvider,
    };
    if (fromStatus !== toStatus) {
        const available = computeAvailableOrderTransitions(validationOrder);
        if (!available.includes(toStatus)) {
            throw new OrderWorkflowError('TRANSITION_NOT_ALLOWED', 'Transition de statut non autorisée', {
                fromStatus,
                toStatus,
                availableTransitions: available,
            });
        }
    }
    if (toStatus === 'CONFIRMED' && order.paymentStatus !== 'completed') {
        throw new OrderWorkflowError('PAYMENT_NOT_COMPLETED', 'Le paiement doit être complété avant confirmation');
    }
    if (toStatus === 'SHIPPED' &&
        !(toNonEmptyStringOrNull(validationOrder.trackingNumber) &&
            (toNonEmptyStringOrNull(validationOrder.shippingProvider) ||
                toNonEmptyStringOrNull(order.shipment?.provider)))) {
        throw new OrderWorkflowError('TRACKING_REQUIRED', 'Tracking et transporteur requis pour passer en SHIPPED');
    }
    if (fromStatus !== toStatus) {
        if (toStatus === 'CONFIRMED' && fromStatus === 'PENDING') {
            await adjustInventoryForOrderItems(order.items, 'reserve');
        }
        if (toStatus === 'CANCELLED' && (fromStatus === 'CONFIRMED' || fromStatus === 'PROCESSING')) {
            await adjustInventoryForOrderItems(order.items, 'release');
        }
    }
    if (fromStatus !== toStatus) {
        updateData.status = toStatus;
    }
    if (toStatus === 'REFUNDED') {
        updateData.paymentStatus = 'refunded';
    }
    let updatedOrder = order;
    if (Object.keys(updateData).length > 0) {
        updatedOrder = (await prisma.order.update({
            where: { id: order.id },
            data: updateData,
            include: {
                items: true,
                customer: { select: { id: true, email: true, firstName: true, lastName: true } },
                shipment: true,
            },
        }));
    }
    if (fromStatus !== toStatus) {
        if (toStatus === 'CONFIRMED' && order.cartId) {
            await prisma.cart.update({
                where: { id: order.cartId },
                data: { status: 'ORDERED' },
            });
            const activeCart = await prisma.cart.findFirst({
                where: { customerId: order.customerId, status: 'ACTIVE' },
                select: { id: true },
            });
            if (!activeCart) {
                await prisma.cart.create({
                    data: { customerId: order.customerId, status: 'ACTIVE', currency: 'EUR' },
                });
            }
        }
        await recordOrderStatusHistory({
            orderId: order.id,
            fromStatus,
            toStatus,
            reason: params.reason || null,
            actorType: params.actorType || 'admin',
            actorId: params.actorId || null,
            metadata: {
                trackingNumber: toNonEmptyStringOrNull(params.trackingNumber) ||
                    toNonEmptyStringOrNull(updatedOrder.trackingNumber),
            },
        });
        const notificationType = ORDER_NOTIFICATION_BY_STATUS[toStatus];
        if (notificationType) {
            await logOrderNotification({
                order: updatedOrder,
                type: notificationType,
                payload: {
                    fromStatus,
                    toStatus,
                    orderNumber: updatedOrder.orderNumber,
                    reason: params.reason || null,
                },
            });
        }
    }
    return {
        ...updatedOrder,
        availableTransitions: computeAvailableOrderTransitions(updatedOrder),
    };
};
const ensureBoxtalShipmentForOrder = async (orderId, source = 'system', options = {}) => {
    const throwOnError = Boolean(options.throwOnError);
    if (!orderId)
        return null;
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            customer: true,
            shipment: true,
        },
    });
    if (!order)
        return null;
    if (order.shipment)
        return order.shipment;
    const status = toStatusOrNull(order.status);
    if (!status || (status !== 'CONFIRMED' && status !== 'PROCESSING' && status !== 'SHIPPED')) {
        return null;
    }
    if (order.paymentStatus !== 'completed')
        return null;
    const offerId = toNonEmptyStringOrNull(order.shippingOfferId);
    const offerCode = toNonEmptyStringOrNull(order.shippingOfferCode);
    if (!offerId && !offerCode)
        return null;
    if (normalizeShippingMode(order.shippingMode) === 'RELAY' && !toNonEmptyStringOrNull(order.relayPointId)) {
        console.warn(`[shipping] relay point missing for order ${order.orderNumber}`);
        return null;
    }
    const shippingSnapshot = toJsonObjectRecord(order.shippingAddressSnapshot);
    const recipientFirstName = toNonEmptyStringOrNull(shippingSnapshot.firstName) || toNonEmptyStringOrNull(order.customer?.firstName) || 'Client';
    const recipientLastName = toNonEmptyStringOrNull(shippingSnapshot.lastName) || toNonEmptyStringOrNull(order.customer?.lastName) || '';
    const recipientName = `${recipientFirstName} ${recipientLastName}`.trim() || 'Client';
    const recipientEmail = toNonEmptyStringOrNull(order.customer?.email);
    const recipientPhone = toNonEmptyStringOrNull(shippingSnapshot.phoneE164) ||
        toNonEmptyStringOrNull(order.customer?.phoneE164) ||
        toNonEmptyStringOrNull(order.customer?.phone) ||
        null;
    const recipientAddressLine1 = toNonEmptyStringOrNull(shippingSnapshot.address1) ||
        toNonEmptyStringOrNull(order.customer?.address) ||
        toNonEmptyStringOrNull(order.shippingAddress) ||
        'Adresse indisponible';
    const recipientAddressLine2 = toNonEmptyStringOrNull(shippingSnapshot.address2) || '';
    const recipientPostalCode = toNonEmptyStringOrNull(shippingSnapshot.postalCode) ||
        toNonEmptyStringOrNull(order.customer?.postalCode) ||
        '00000';
    const recipientCity = toNonEmptyStringOrNull(shippingSnapshot.city) ||
        toNonEmptyStringOrNull(order.customer?.city) ||
        'Ville';
    const recipientCountryCode = toNonEmptyStringOrNull(shippingSnapshot.countryCode) ||
        toNonEmptyStringOrNull(order.customer?.country) ||
        'FR';
    const shipperContactEmail = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_EMAIL) || 'contact@myowntea.com';
    const shipperContactPhone = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_PHONE) || '+33000000000';
    const shipperCompany = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_COMPANY) || 'My Own Tea';
    const shipperAddressLine1 = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_ADDRESS1) || '31 rue Lacordaire';
    const shipperAddressLine2 = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_ADDRESS2) || '';
    const shipperPostalCode = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_POSTAL_CODE) || '59150';
    const shipperCity = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_CITY) || 'Wattrelos';
    const shipperCountryCode = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_COUNTRY) || 'FR';
    const guessDialCode = (countryCode) => {
        const normalized = String(countryCode || 'FR').toUpperCase();
        if (normalized === 'FR')
            return '33';
        if (normalized === 'BE')
            return '32';
        if (normalized === 'LU')
            return '352';
        if (normalized === 'CH')
            return '41';
        return '33';
    };
    const toBoxtalPhone = (value, countryCode) => {
        const normalizedInput = String(value || '').trim();
        if (/^\+[1-9]\d{6,14}$/.test(normalizedInput)) {
            return normalizedInput;
        }
        const digits = String(value || '').replace(/\D+/g, '');
        if (!digits)
            return null;
        const dial = guessDialCode(countryCode);
        let number = digits;
        if (number.startsWith(dial)) {
            number = number.slice(dial.length);
        }
        if (number.startsWith('0')) {
            number = number.slice(1);
        }
        if (!number)
            return null;
        return `+${dial}${number}`;
    };
    const relayPointId = toNonEmptyStringOrNull(order.relayPointId);
    const orderTotalValue = Math.max(0.01, Number((Math.max(0, order.totalCents || 0) / 100).toFixed(2)));
    const shipperPhone = toBoxtalPhone(shipperContactPhone, shipperCountryCode);
    const recipientPhonePayload = toBoxtalPhone(recipientPhone, recipientCountryCode);
    const shipperFirstName = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_CONTACT_FIRST_NAME) || 'My';
    const shipperLastName = toNonEmptyStringOrNull(process.env.BOXTAL_SHIPPER_CONTACT_LAST_NAME) || 'Own Tea';
    const parcelWeightKg = Math.max(0.01, Number(process.env.BOXTAL_PARCEL_WEIGHT_KG || 0.5));
    const parcelLengthCm = Math.max(1, Number(process.env.BOXTAL_PARCEL_LENGTH_CM || 20));
    const parcelWidthCm = Math.max(1, Number(process.env.BOXTAL_PARCEL_WIDTH_CM || 20));
    const parcelHeightCm = Math.max(1, Number(process.env.BOXTAL_PARCEL_HEIGHT_CM || 10));
    const parcelDescription = process.env.BOXTAL_PARCEL_CONTENT_LABEL || `Commande ${order.orderNumber}`;
    const parcelValueCurrency = String(process.env.BOXTAL_PARCEL_VALUE_CURRENCY || 'EUR').toUpperCase();
    const buildBoxtalLocation = (params) => ({
        street: params.street,
        city: params.city,
        // v3 schema uses postalCode; some contracts still accept postCode.
        postalCode: params.postalCode,
        postCode: params.postalCode,
        countryIsoCode: String(params.countryCode || 'FR').toUpperCase(),
    });
    const shipmentFromAddress = {
        type: 'BUSINESS',
        contact: {
            firstName: shipperFirstName,
            lastName: shipperLastName,
            company: shipperCompany,
            email: shipperContactEmail,
            ...(shipperPhone ? { phone: shipperPhone } : {}),
        },
        location: buildBoxtalLocation({
            street: [shipperAddressLine1, shipperAddressLine2].filter(Boolean).join(', '),
            postalCode: shipperPostalCode,
            city: shipperCity,
            countryCode: shipperCountryCode,
        }),
    };
    const shipmentToAddress = {
        type: 'RESIDENTIAL',
        contact: {
            firstName: recipientFirstName,
            lastName: recipientLastName || 'Client',
            ...(recipientEmail ? { email: recipientEmail } : {}),
            ...(recipientPhonePayload ? { phone: recipientPhonePayload } : {}),
        },
        location: buildBoxtalLocation({
            street: [recipientAddressLine1, recipientAddressLine2].filter(Boolean).join(', '),
            postalCode: recipientPostalCode,
            city: recipientCity,
            countryCode: recipientCountryCode,
        }),
    };
    const shipmentPackages = [
        {
            type: 'PARCEL',
            value: {
                value: orderTotalValue,
                currencyIsoCode: parcelValueCurrency,
            },
            weight: parcelWeightKg,
            length: parcelLengthCm,
            width: parcelWidthCm,
            height: parcelHeightCm,
            description: parcelDescription,
        },
    ];
    const shippingPayload = {
        ...(offerId ? { shippingOfferId: offerId } : {}),
        ...(!offerId && offerCode ? { shippingOfferCode: offerCode } : {}),
        shipment: {
            externalId: order.orderNumber,
            fromAddress: shipmentFromAddress,
            toAddress: shipmentToAddress,
            returnAddress: shipmentFromAddress,
            packages: shipmentPackages,
            ...(relayPointId ? { pickupPointCode: relayPointId } : {}),
        },
    };
    try {
        const response = await createShippingOrder(shippingPayload);
        const responseContent = response && typeof response.content === 'object'
            ? response.content
            : null;
        const boxtalOrderId = toNonEmptyStringOrNull(responseContent?.id) ||
            toNonEmptyStringOrNull(response.shippingOrder?.id) ||
            toNonEmptyStringOrNull(response.shipment?.id) ||
            toNonEmptyStringOrNull(response.id) ||
            toNonEmptyStringOrNull(response.reference) ||
            toNonEmptyStringOrNull(response.orderId) ||
            null;
        const trackingNumber = toNonEmptyStringOrNull(responseContent?.trackingNumber) ||
            toNonEmptyStringOrNull(response.shippingOrder?.trackingNumber) ||
            toNonEmptyStringOrNull(response.shipment?.trackingNumber) ||
            toNonEmptyStringOrNull(response.trackingNumber) ||
            null;
        const providerStatus = toNonEmptyStringOrNull(responseContent?.status) ||
            toNonEmptyStringOrNull(response.shippingOrder?.status) ||
            toNonEmptyStringOrNull(response.shipment?.status) ||
            toNonEmptyStringOrNull(response.status) ||
            null;
        const shipment = await prisma.shipment.create({
            data: {
                orderId: order.id,
                provider: 'BOXTAL',
                providerOrderId: boxtalOrderId,
                offerId,
                offerCode,
                offerLabel: toNonEmptyStringOrNull(order.shippingOfferLabel),
                status: providerStatus,
                statusInternal: mapBoxtalStatus(providerStatus),
                trackingNumber,
                relayPointId: toNonEmptyStringOrNull(order.relayPointId),
                relayNetwork: toNonEmptyStringOrNull(order.relayNetwork),
                payload: shippingPayload,
                response: response,
            },
        });
        await prisma.order.update({
            where: { id: order.id },
            data: {
                shippingProvider: 'BOXTAL',
                trackingNumber: trackingNumber || undefined,
            },
        });
        return shipment;
    }
    catch (error) {
        if (error?.code === 'P2002') {
            return prisma.shipment.findUnique({ where: { orderId: order.id } });
        }
        console.error(`[shipping] failed to create Boxtal shipment for ${order.orderNumber} (${source}):`, error);
        if (throwOnError) {
            throw error;
        }
        return null;
    }
};
const finalizePaidOrder = async (orderId, source = 'payment_webhook') => {
    if (!orderId)
        return null;
    const order = await getOrderForWorkflow(orderId);
    if (!order)
        return null;
    if (order.paymentStatus !== 'completed') {
        await prisma.order.update({
            where: { id: order.id },
            data: { paymentStatus: 'completed' },
        });
    }
    const refreshed = await getOrderForWorkflow(order.id);
    if (!refreshed)
        return null;
    const status = toStatusOrNull(refreshed.status);
    if (status === 'PENDING') {
        await transitionOrderStatus({
            orderId: refreshed.id,
            toStatus: 'CONFIRMED',
            reason: 'Paiement validé automatiquement',
            actorType: 'system',
            actorId: source,
        });
    }
    await ensureBoxtalShipmentForOrder(refreshed.id, source);
    const finalized = await getOrderForWorkflow(refreshed.id);
    if (!finalized)
        return null;
    return {
        ...finalized,
        availableTransitions: computeAvailableOrderTransitions(finalized),
    };
};
const AUTOMATION_JOB_IDS = Object.keys(AUTOMATION_JOB_DEFAULTS);
const MIN_AUTOMATION_INTERVAL_MS = 60 * 1000;
const MAX_AUTOMATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const automationRuntime = AUTOMATION_JOB_IDS.reduce((acc, jobId) => {
    acc[jobId] = { timer: null, running: false };
    return acc;
}, {});
let automationSchedulerStarted = false;
const isAutomationJobId = (value) => {
    if (typeof value !== 'string')
        return false;
    return AUTOMATION_JOB_IDS.includes(value);
};
const clampAutomationIntervalMs = (value) => {
    if (!Number.isFinite(value))
        return MIN_AUTOMATION_INTERVAL_MS;
    const rounded = Math.round(value);
    return Math.min(MAX_AUTOMATION_INTERVAL_MS, Math.max(MIN_AUTOMATION_INTERVAL_MS, rounded));
};
const parsePositiveIntEnv = (name, fallback) => {
    const parsed = Number(process.env[name] || '');
    if (!Number.isFinite(parsed) || parsed <= 0)
        return fallback;
    return Math.round(parsed);
};
const listAutomationJobConfigs = async () => {
    await ensureOrderWorkflowTables();
    const rows = await prisma.$queryRaw `
    SELECT
      "id",
      "name",
      "description",
      "intervalMs",
      "enabled",
      "lastRunAt",
      "nextRunAt",
      "lastStatus",
      "lastError",
      "updatedAt"
    FROM "AutomationJobConfig"
    ORDER BY "name" ASC
  `;
    const filtered = rows.filter((row) => isAutomationJobId(row.id));
    filtered.sort((a, b) => AUTOMATION_JOB_IDS.indexOf(a.id) - AUTOMATION_JOB_IDS.indexOf(b.id));
    return filtered;
};
const getAutomationJobConfig = async (jobId) => {
    await ensureOrderWorkflowTables();
    const rows = await prisma.$queryRaw `
    SELECT
      "id",
      "name",
      "description",
      "intervalMs",
      "enabled",
      "lastRunAt",
      "nextRunAt",
      "lastStatus",
      "lastError",
      "updatedAt"
    FROM "AutomationJobConfig"
    WHERE "id" = ${jobId}
    LIMIT 1
  `;
    const row = rows[0] || null;
    if (!row || !isAutomationJobId(row.id))
        return null;
    return {
        ...row,
        id: row.id,
    };
};
const updateAutomationJobConfig = async (params) => {
    await ensureOrderWorkflowTables();
    const intervalMs = params.intervalMs === undefined ? null : clampAutomationIntervalMs(params.intervalMs);
    const enabled = params.enabled === undefined ? null : params.enabled;
    await prisma.$executeRaw `
    UPDATE "AutomationJobConfig"
    SET
      "enabled" = COALESCE(${enabled}, "enabled"),
      "intervalMs" = COALESCE(${intervalMs}, "intervalMs"),
      "updatedAt" = NOW()
    WHERE "id" = ${params.jobId}
  `;
};
const updateAutomationJobRunState = async (params) => {
    await ensureOrderWorkflowTables();
    await prisma.$executeRaw `
    UPDATE "AutomationJobConfig"
    SET
      "lastRunAt" = ${params.lastRunAt},
      "nextRunAt" = ${params.nextRunAt},
      "lastStatus" = ${params.lastStatus},
      "lastError" = ${params.lastError},
      "updatedAt" = NOW()
    WHERE "id" = ${params.jobId}
  `;
};
const setAutomationJobNextRunAt = async (jobId, nextRunAt) => {
    await ensureOrderWorkflowTables();
    await prisma.$executeRaw `
    UPDATE "AutomationJobConfig"
    SET
      "nextRunAt" = ${nextRunAt},
      "updatedAt" = NOW()
    WHERE "id" = ${jobId}
  `;
};
const serializeAutomationJobConfig = (config) => ({
    ...config,
    intervalMinutes: Math.max(1, Math.round(config.intervalMs / 60000)),
    running: automationRuntime[config.id]?.running ?? false,
});
const clearAutomationJobTimer = (jobId) => {
    const timer = automationRuntime[jobId].timer;
    if (timer) {
        clearInterval(timer);
        automationRuntime[jobId].timer = null;
    }
};
const stopAutomationScheduler = async () => {
    for (const jobId of AUTOMATION_JOB_IDS) {
        clearAutomationJobTimer(jobId);
        await setAutomationJobNextRunAt(jobId, null);
    }
    automationSchedulerStarted = false;
};
const applyShipmentProgressToOrder = async (params) => {
    let order = await getOrderForWorkflow(params.orderId);
    if (!order) {
        return { transitionedTo: [] };
    }
    const normalizedTrackingNumber = toNonEmptyStringOrNull(params.trackingNumber);
    const normalizedTrackingUrl = params.trackingUrl === undefined ? undefined : toNonEmptyStringOrNull(params.trackingUrl);
    const normalizedProvider = toNonEmptyStringOrNull(params.shippingProvider);
    const shippingPatch = {};
    if (normalizedTrackingNumber && normalizedTrackingNumber !== order.trackingNumber) {
        shippingPatch.trackingNumber = normalizedTrackingNumber;
    }
    if (normalizedTrackingUrl !== undefined && normalizedTrackingUrl !== order.trackingUrl) {
        shippingPatch.trackingUrl = normalizedTrackingUrl;
    }
    if (normalizedProvider && normalizedProvider !== order.shippingProvider) {
        shippingPatch.shippingProvider = normalizedProvider;
    }
    if (Object.keys(shippingPatch).length > 0) {
        await prisma.order.update({
            where: { id: order.id },
            data: shippingPatch,
        });
        const refreshedOrder = await getOrderForWorkflow(order.id);
        if (!refreshedOrder) {
            return { transitionedTo: [] };
        }
        order = refreshedOrder;
    }
    const actorType = params.actorType || 'system';
    const actorId = params.actorId || null;
    const mappedStatus = String(params.mappedStatus || 'UNKNOWN').toUpperCase();
    const transitionedTo = [];
    const effectiveTrackingNumber = normalizedTrackingNumber ||
        toNonEmptyStringOrNull(order.trackingNumber) ||
        toNonEmptyStringOrNull(order.shipment?.trackingNumber);
    const effectiveTrackingUrl = normalizedTrackingUrl === undefined
        ? toNonEmptyStringOrNull(order.trackingUrl)
        : normalizedTrackingUrl;
    const effectiveProvider = normalizedProvider ||
        toNonEmptyStringOrNull(order.shippingProvider) ||
        toNonEmptyStringOrNull(order.shipment?.provider);
    const tryTransition = async (target, reason) => {
        if (!order)
            return false;
        const availableTransitions = computeAvailableOrderTransitions(order);
        if (!availableTransitions.includes(target))
            return false;
        await transitionOrderStatus({
            orderId: order.id,
            toStatus: target,
            reason,
            actorType,
            actorId,
            ...(effectiveTrackingNumber ? { trackingNumber: effectiveTrackingNumber } : {}),
            ...(effectiveTrackingUrl ? { trackingUrl: effectiveTrackingUrl } : {}),
            ...(effectiveProvider ? { shippingProvider: effectiveProvider } : {}),
        });
        const refreshedOrder = await getOrderForWorkflow(order.id);
        if (refreshedOrder) {
            order = refreshedOrder;
        }
        transitionedTo.push(target);
        return true;
    };
    if (mappedStatus === 'IN_TRANSIT' || mappedStatus === 'DELIVERED') {
        if (toStatusOrNull(order.status) === 'CONFIRMED') {
            await tryTransition('PROCESSING', params.reason || 'Passage automatique en preparation suite au tracking transporteur');
        }
        if (toStatusOrNull(order.status) === 'PROCESSING') {
            await tryTransition('SHIPPED', params.reason || 'Passage automatique en expedition suite au tracking transporteur');
        }
    }
    if (mappedStatus === 'DELIVERED' && toStatusOrNull(order.status) === 'SHIPPED') {
        await tryTransition('DELIVERED', params.reason || 'Passage automatique en livre suite au tracking transporteur');
    }
    if (mappedStatus === 'CANCELLED' &&
        (toStatusOrNull(order.status) === 'PENDING' ||
            toStatusOrNull(order.status) === 'CONFIRMED' ||
            toStatusOrNull(order.status) === 'PROCESSING')) {
        await tryTransition('CANCELLED', params.reason || 'Commande annulee automatiquement suite au statut transporteur');
    }
    return { transitionedTo };
};
const syncShipmentTrackingFromPayload = async (params) => {
    const shipment = await prisma.shipment.findUnique({ where: { id: params.shipmentId } });
    if (!shipment) {
        throw new OrderWorkflowError('SHIPMENT_NOT_FOUND', 'Expédition introuvable');
    }
    const normalizedProviderStatus = toNonEmptyStringOrNull(params.providerStatus);
    const normalizedTrackingNumber = toNonEmptyStringOrNull(params.trackingNumber);
    const normalizedLabelUrl = toNonEmptyStringOrNull(params.labelUrl);
    const mappedStatus = mapBoxtalStatus(normalizedProviderStatus || shipment.status);
    const shipmentData = {
        status: normalizedProviderStatus || shipment.status,
        statusInternal: mappedStatus,
        trackingNumber: normalizedTrackingNumber || shipment.trackingNumber,
        labelUrl: normalizedLabelUrl || shipment.labelUrl,
    };
    if (params.response !== undefined) {
        shipmentData.response = params.response;
    }
    const updatedShipment = await prisma.shipment.update({
        where: { id: shipment.id },
        data: shipmentData,
    });
    const orderSync = await applyShipmentProgressToOrder({
        orderId: shipment.orderId,
        mappedStatus,
        trackingNumber: normalizedTrackingNumber || updatedShipment.trackingNumber || null,
        trackingUrl: params.trackingUrl || null,
        shippingProvider: shipment.provider || 'BOXTAL',
        actorType: params.actorType || 'system',
        actorId: params.actorId || null,
        reason: params.reason || null,
    });
    return { shipment: updatedShipment, mappedStatus, orderSync };
};
const isStripeReferencePaid = async (reference) => {
    if (!stripe)
        return false;
    try {
        const session = await stripe.checkout.sessions.retrieve(reference);
        if (session.payment_status === 'paid')
            return true;
    }
    catch {
        // Ignore and fallback to payment intent retrieval
    }
    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(reference);
        if (paymentIntent.status === 'succeeded')
            return true;
    }
    catch {
        // Ignore invalid payment intent ids
    }
    return false;
};
const runReconcilePendingPaymentsJob = async () => {
    const metrics = {
        scanned: 0,
        finalized: 0,
        skippedNoReference: 0,
        failedChecks: 0,
    };
    if (!stripe) {
        return {
            jobId: 'reconcile_pending_payments',
            status: 'SKIPPED',
            message: 'Stripe non configuré, réconciliation ignorée',
            metrics,
        };
    }
    const pendingOrders = await prisma.order.findMany({
        where: {
            status: 'PENDING',
            paymentStatus: { not: 'completed' },
            stripeSessionId: { not: null },
        },
        select: {
            id: true,
            stripeSessionId: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
    });
    for (const order of pendingOrders) {
        const reference = toNonEmptyStringOrNull(order.stripeSessionId);
        if (!reference) {
            metrics.skippedNoReference += 1;
            continue;
        }
        metrics.scanned += 1;
        try {
            const paid = await isStripeReferencePaid(reference);
            if (!paid)
                continue;
            await finalizePaidOrder(order.id, 'job:reconcile_pending_payments');
            metrics.finalized += 1;
        }
        catch (error) {
            metrics.failedChecks += 1;
            console.error(`[automation][reconcile_pending_payments] order ${order.id}:`, error);
        }
    }
    return {
        jobId: 'reconcile_pending_payments',
        status: 'OK',
        message: `${metrics.finalized} commande(s) finalisée(s)`,
        metrics,
    };
};
const runSyncShippingTrackingJob = async () => {
    const metrics = {
        scanned: 0,
        synced: 0,
        transitioned: 0,
        failed: 0,
    };
    const boxtalConfigured = Boolean(process.env.BOXTAL_ACCESS_KEY && process.env.BOXTAL_SECRET_KEY);
    if (!boxtalConfigured) {
        return {
            jobId: 'sync_shipping_tracking',
            status: 'SKIPPED',
            message: 'Boxtal non configuré, synchronisation ignorée',
            metrics,
        };
    }
    const shipments = await prisma.shipment.findMany({
        where: {
            provider: 'BOXTAL',
            providerOrderId: { not: null },
            statusInternal: { notIn: ['DELIVERED', 'CANCELLED'] },
        },
        select: {
            id: true,
            providerOrderId: true,
        },
        orderBy: { updatedAt: 'asc' },
        take: 120,
    });
    for (const shipment of shipments) {
        const providerOrderId = toNonEmptyStringOrNull(shipment.providerOrderId);
        if (!providerOrderId)
            continue;
        metrics.scanned += 1;
        try {
            const tracking = await getShippingTracking(providerOrderId);
            const parsedTracking = parseBoxtalTrackingPayload(tracking);
            const synced = await syncShipmentTrackingFromPayload({
                shipmentId: shipment.id,
                providerStatus: parsedTracking.providerStatus,
                trackingNumber: parsedTracking.trackingNumber,
                trackingUrl: parsedTracking.trackingUrl,
                response: tracking,
                actorType: 'job',
                actorId: 'sync_shipping_tracking',
                reason: 'Synchronisation automatique du tracking transporteur',
            });
            metrics.synced += 1;
            metrics.transitioned += synced.orderSync.transitionedTo.length;
        }
        catch (error) {
            metrics.failed += 1;
            console.error(`[automation][sync_shipping_tracking] shipment ${shipment.id}:`, error);
        }
    }
    return {
        jobId: 'sync_shipping_tracking',
        status: 'OK',
        message: `${metrics.synced} expédition(s) synchronisée(s)`,
        metrics,
    };
};
const runAutoCancelPendingJob = async () => {
    const metrics = {
        scanned: 0,
        cancelled: 0,
        failed: 0,
    };
    const pendingExpiryHours = parsePositiveIntEnv('ORDER_PENDING_EXPIRY_HOURS', 24);
    const cutoff = new Date(Date.now() - pendingExpiryHours * 60 * 60 * 1000);
    const staleOrders = await prisma.order.findMany({
        where: {
            status: 'PENDING',
            paymentStatus: { not: 'completed' },
            createdAt: { lte: cutoff },
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: 200,
    });
    for (const staleOrder of staleOrders) {
        metrics.scanned += 1;
        try {
            await transitionOrderStatus({
                orderId: staleOrder.id,
                toStatus: 'CANCELLED',
                reason: `Annulation automatique après ${pendingExpiryHours}h sans paiement`,
                actorType: 'job',
                actorId: 'auto_cancel_pending',
            });
            metrics.cancelled += 1;
        }
        catch (error) {
            metrics.failed += 1;
            console.error(`[automation][auto_cancel_pending] order ${staleOrder.id}:`, error);
        }
    }
    return {
        jobId: 'auto_cancel_pending',
        status: 'OK',
        message: `${metrics.cancelled} commande(s) annulée(s)`,
        metrics,
    };
};
const runSlaWatchdogJob = async () => {
    const metrics = {
        scanned: 0,
        alerted: 0,
        skippedRecentNotification: 0,
        failed: 0,
    };
    const confirmedSlaHours = parsePositiveIntEnv('ORDER_SLA_CONFIRMED_HOURS', 24);
    const processingSlaHours = parsePositiveIntEnv('ORDER_SLA_PROCESSING_HOURS', 72);
    const confirmedCutoff = new Date(Date.now() - confirmedSlaHours * 60 * 60 * 1000);
    const processingCutoff = new Date(Date.now() - processingSlaHours * 60 * 60 * 1000);
    const staleOrders = await prisma.order.findMany({
        where: {
            OR: [
                { status: 'CONFIRMED', createdAt: { lte: confirmedCutoff } },
                { status: 'PROCESSING', createdAt: { lte: processingCutoff } },
            ],
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: 200,
    });
    for (const staleOrder of staleOrders) {
        metrics.scanned += 1;
        try {
            const order = await getOrderForWorkflow(staleOrder.id);
            if (!order)
                continue;
            const status = toStatusOrNull(order.status);
            if (status !== 'CONFIRMED' && status !== 'PROCESSING')
                continue;
            const notificationType = status === 'CONFIRMED' ? 'ORDER_SLA_CONFIRMED' : 'ORDER_SLA_PROCESSING';
            if (await hasRecentNotification(order.id, notificationType, 12 * 60)) {
                metrics.skippedRecentNotification += 1;
                continue;
            }
            const elapsedHours = Math.floor((Date.now() - order.createdAt.getTime()) / (60 * 60 * 1000));
            await logOrderNotification({
                order,
                type: notificationType,
                channel: 'internal',
                payload: {
                    orderNumber: order.orderNumber,
                    status,
                    elapsedHours,
                    thresholdHours: status === 'CONFIRMED' ? confirmedSlaHours : processingSlaHours,
                },
            });
            metrics.alerted += 1;
        }
        catch (error) {
            metrics.failed += 1;
            console.error(`[automation][sla_watchdog] order ${staleOrder.id}:`, error);
        }
    }
    return {
        jobId: 'sla_watchdog',
        status: 'OK',
        message: `${metrics.alerted} alerte(s) SLA enregistrée(s)`,
        metrics,
    };
};
const runProcessEmailOutboxJob = async () => {
    const metrics = await processEmailOutboxBatch(EMAIL_OUTBOX_BATCH_SIZE);
    return {
        jobId: 'process_email_outbox',
        status: 'OK',
        message: `${metrics.sent} email(s) envoye(s), ${metrics.retried} en retry`,
        metrics,
    };
};
const runEmailWelcomeLifecycleJob = async () => {
    const metrics = {
        scanned: 0,
        queued: 0,
        skipped: 0,
        failed: 0,
    };
    const customers = await prisma.$queryRaw `
    SELECT
      c."id",
      c."email",
      c."firstName",
      c."createdAt"
    FROM "Customer" c
    WHERE c."email" IS NOT NULL
    ORDER BY c."createdAt" DESC
    LIMIT 400
  `;
    const now = Date.now();
    for (const customer of Array.isArray(customers) ? customers : []) {
        metrics.scanned += 1;
        try {
            const email = toNonEmptyStringOrNull(customer.email);
            if (!email) {
                metrics.skipped += 1;
                continue;
            }
            const createdAt = new Date(customer.createdAt);
            if (Number.isNaN(createdAt.getTime())) {
                metrics.skipped += 1;
                continue;
            }
            const ageHours = (now - createdAt.getTime()) / (60 * 60 * 1000);
            if (ageHours >= 0 && ageHours <= 48) {
                const queued = await queueCampaignEmail({
                    customerId: customer.id,
                    recipient: email,
                    firstName: customer.firstName,
                    type: 'WELCOME_J0',
                    campaignKey: `WELCOME_J0:${customer.id}`,
                });
                if (queued.queued)
                    metrics.queued += 1;
                else
                    metrics.skipped += 1;
            }
            if (ageHours >= 72) {
                const queued = await queueCampaignEmail({
                    customerId: customer.id,
                    recipient: email,
                    firstName: customer.firstName,
                    type: 'WELCOME_J3',
                    campaignKey: `WELCOME_J3:${customer.id}`,
                });
                if (queued.queued)
                    metrics.queued += 1;
                else
                    metrics.skipped += 1;
            }
        }
        catch (error) {
            metrics.failed += 1;
            console.error(`[automation][email_welcome_lifecycle] customer ${customer.id}:`, error);
        }
    }
    return {
        jobId: 'email_welcome_lifecycle',
        status: 'OK',
        message: `${metrics.queued} campagne(s) welcome queued`,
        metrics,
    };
};
const runEmailAbandonedCartJob = async () => {
    const metrics = {
        scanned: 0,
        queued: 0,
        skipped: 0,
        failed: 0,
    };
    const carts = await prisma.$queryRaw `
    SELECT
      c."id",
      c."customerId",
      c."updatedAt",
      cu."email",
      cu."firstName"
    FROM "Cart" c
    JOIN "Customer" cu ON cu."id" = c."customerId"
    WHERE c."status" = 'ACTIVE'::"CartStatus"
      AND cu."email" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "CartItem" ci WHERE ci."cartId" = c."id"
      )
    ORDER BY c."updatedAt" ASC
    LIMIT 300
  `;
    const now = Date.now();
    for (const cart of Array.isArray(carts) ? carts : []) {
        metrics.scanned += 1;
        try {
            const email = toNonEmptyStringOrNull(cart.email);
            if (!email) {
                metrics.skipped += 1;
                continue;
            }
            const updatedAt = new Date(cart.updatedAt);
            if (Number.isNaN(updatedAt.getTime())) {
                metrics.skipped += 1;
                continue;
            }
            const elapsedHours = (now - updatedAt.getTime()) / (60 * 60 * 1000);
            if (elapsedHours < 1) {
                metrics.skipped += 1;
                continue;
            }
            const orderAfterCart = await prisma.$queryRaw `
        SELECT "id"
        FROM "Order"
        WHERE "customerId" = ${cart.customerId}
          AND "createdAt" > ${updatedAt}
          AND (
            "paymentStatus" = ${'completed'}
            OR "status" IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
          )
        LIMIT 1
      `;
            if (Array.isArray(orderAfterCart) && orderAfterCart.length > 0) {
                metrics.skipped += 1;
                continue;
            }
            if (elapsedHours >= 1 && elapsedHours < 24) {
                const queued = await queueCampaignEmail({
                    customerId: cart.customerId,
                    recipient: email,
                    firstName: cart.firstName,
                    cartId: cart.id,
                    type: 'ABANDONED_CART_H1',
                    campaignKey: `ABANDONED_CART_H1:${cart.id}`,
                });
                if (queued.queued)
                    metrics.queued += 1;
                else
                    metrics.skipped += 1;
            }
            if (elapsedHours >= 24) {
                const queued = await queueCampaignEmail({
                    customerId: cart.customerId,
                    recipient: email,
                    firstName: cart.firstName,
                    cartId: cart.id,
                    type: 'ABANDONED_CART_H24',
                    campaignKey: `ABANDONED_CART_H24:${cart.id}`,
                });
                if (queued.queued)
                    metrics.queued += 1;
                else
                    metrics.skipped += 1;
            }
        }
        catch (error) {
            metrics.failed += 1;
            console.error(`[automation][email_abandoned_cart] cart ${cart.id}:`, error);
        }
    }
    return {
        jobId: 'email_abandoned_cart',
        status: 'OK',
        message: `${metrics.queued} relance(s) panier queued`,
        metrics,
    };
};
const runEmailPostPurchaseJob = async () => {
    const metrics = {
        scanned: 0,
        queued: 0,
        skipped: 0,
        failed: 0,
    };
    const deliveredOrders = await prisma.$queryRaw `
    SELECT
      o."id" AS "orderId",
      o."orderNumber",
      o."customerId",
      c."email",
      c."firstName",
      MAX(h."createdAt") AS "deliveredAt"
    FROM "Order" o
    JOIN "Customer" c ON c."id" = o."customerId"
    JOIN "OrderStatusHistory" h ON h."orderId" = o."id" AND h."toStatus" = 'DELIVERED'
    WHERE c."email" IS NOT NULL
    GROUP BY o."id", o."orderNumber", o."customerId", c."email", c."firstName"
    ORDER BY MAX(h."createdAt") DESC
    LIMIT 400
  `;
    const now = Date.now();
    for (const row of Array.isArray(deliveredOrders) ? deliveredOrders : []) {
        metrics.scanned += 1;
        try {
            const email = toNonEmptyStringOrNull(row.email);
            if (!email) {
                metrics.skipped += 1;
                continue;
            }
            const deliveredAt = new Date(row.deliveredAt);
            if (Number.isNaN(deliveredAt.getTime())) {
                metrics.skipped += 1;
                continue;
            }
            const elapsedDays = (now - deliveredAt.getTime()) / (24 * 60 * 60 * 1000);
            if (elapsedDays >= 3) {
                const queued = await queueCampaignEmail({
                    customerId: row.customerId,
                    recipient: email,
                    firstName: row.firstName,
                    orderId: row.orderId,
                    type: 'POST_PURCHASE_CROSSSELL_J3',
                    campaignKey: `POST_PURCHASE_CROSSSELL_J3:${row.orderId}`,
                });
                if (queued.queued)
                    metrics.queued += 1;
                else
                    metrics.skipped += 1;
            }
            if (elapsedDays >= 7) {
                const queued = await queueCampaignEmail({
                    customerId: row.customerId,
                    recipient: email,
                    firstName: row.firstName,
                    orderId: row.orderId,
                    type: 'POST_PURCHASE_REVIEW_J7',
                    campaignKey: `POST_PURCHASE_REVIEW_J7:${row.orderId}`,
                });
                if (queued.queued)
                    metrics.queued += 1;
                else
                    metrics.skipped += 1;
            }
        }
        catch (error) {
            metrics.failed += 1;
            console.error(`[automation][email_post_purchase] order ${row.orderId}:`, error);
        }
    }
    return {
        jobId: 'email_post_purchase',
        status: 'OK',
        message: `${metrics.queued} email(s) post-achat queued`,
        metrics,
    };
};
const runEmailReorderRemindersJob = async () => {
    const metrics = {
        scanned: 0,
        queued: 0,
        skipped: 0,
        failed: 0,
    };
    const customers = await prisma.$queryRaw `
    SELECT
      c."id",
      c."email",
      c."firstName",
      MAX(h."createdAt") AS "lastDeliveredAt"
    FROM "Customer" c
    JOIN "Order" o ON o."customerId" = c."id"
    JOIN "OrderStatusHistory" h ON h."orderId" = o."id" AND h."toStatus" = 'DELIVERED'
    WHERE c."email" IS NOT NULL
    GROUP BY c."id", c."email", c."firstName"
    ORDER BY MAX(h."createdAt") DESC
    LIMIT 400
  `;
    const now = Date.now();
    for (const customer of Array.isArray(customers) ? customers : []) {
        metrics.scanned += 1;
        try {
            const email = toNonEmptyStringOrNull(customer.email);
            if (!email) {
                metrics.skipped += 1;
                continue;
            }
            const lastDeliveredAt = new Date(customer.lastDeliveredAt);
            if (Number.isNaN(lastDeliveredAt.getTime())) {
                metrics.skipped += 1;
                continue;
            }
            const hasRecentOrder = await prisma.$queryRaw `
        SELECT "id"
        FROM "Order"
        WHERE "customerId" = ${customer.id}
          AND "createdAt" > ${lastDeliveredAt}
          AND (
            "paymentStatus" = ${'completed'}
            OR "status" IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
          )
        LIMIT 1
      `;
            if (Array.isArray(hasRecentOrder) && hasRecentOrder.length > 0) {
                metrics.skipped += 1;
                continue;
            }
            const elapsedDays = (now - lastDeliveredAt.getTime()) / (24 * 60 * 60 * 1000);
            if (elapsedDays >= 21) {
                const queued = await queueCampaignEmail({
                    customerId: customer.id,
                    recipient: email,
                    firstName: customer.firstName,
                    type: 'REORDER_J21',
                    campaignKey: `REORDER_J21:${customer.id}`,
                });
                if (queued.queued)
                    metrics.queued += 1;
                else
                    metrics.skipped += 1;
            }
            if (elapsedDays >= 35) {
                const queued = await queueCampaignEmail({
                    customerId: customer.id,
                    recipient: email,
                    firstName: customer.firstName,
                    type: 'REORDER_J35',
                    campaignKey: `REORDER_J35:${customer.id}`,
                });
                if (queued.queued)
                    metrics.queued += 1;
                else
                    metrics.skipped += 1;
            }
        }
        catch (error) {
            metrics.failed += 1;
            console.error(`[automation][email_reorder_reminders] customer ${customer.id}:`, error);
        }
    }
    return {
        jobId: 'email_reorder_reminders',
        status: 'OK',
        message: `${metrics.queued} relance(s) reachat queued`,
        metrics,
    };
};
const runEmailWinbackJob = async () => {
    const metrics = {
        scanned: 0,
        queued: 0,
        skipped: 0,
        failed: 0,
    };
    const customers = await prisma.$queryRaw `
    SELECT
      c."id",
      c."email",
      c."firstName",
      MAX(o."createdAt") AS "lastOrderAt"
    FROM "Customer" c
    JOIN "Order" o ON o."customerId" = c."id"
    WHERE c."email" IS NOT NULL
      AND (
        o."paymentStatus" = ${'completed'}
        OR o."status" IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
      )
    GROUP BY c."id", c."email", c."firstName"
    ORDER BY MAX(o."createdAt") DESC
    LIMIT 400
  `;
    const now = Date.now();
    for (const customer of Array.isArray(customers) ? customers : []) {
        metrics.scanned += 1;
        try {
            const email = toNonEmptyStringOrNull(customer.email);
            if (!email) {
                metrics.skipped += 1;
                continue;
            }
            const lastOrderAt = new Date(customer.lastOrderAt);
            if (Number.isNaN(lastOrderAt.getTime())) {
                metrics.skipped += 1;
                continue;
            }
            const elapsedDays = (now - lastOrderAt.getTime()) / (24 * 60 * 60 * 1000);
            if (elapsedDays >= 45) {
                const queued = await queueCampaignEmail({
                    customerId: customer.id,
                    recipient: email,
                    firstName: customer.firstName,
                    type: 'WINBACK_45',
                    campaignKey: `WINBACK_45:${customer.id}`,
                });
                if (queued.queued)
                    metrics.queued += 1;
                else
                    metrics.skipped += 1;
            }
            if (elapsedDays >= 90) {
                const queued = await queueCampaignEmail({
                    customerId: customer.id,
                    recipient: email,
                    firstName: customer.firstName,
                    type: 'WINBACK_90',
                    campaignKey: `WINBACK_90:${customer.id}`,
                });
                if (queued.queued)
                    metrics.queued += 1;
                else
                    metrics.skipped += 1;
            }
        }
        catch (error) {
            metrics.failed += 1;
            console.error(`[automation][email_winback] customer ${customer.id}:`, error);
        }
    }
    return {
        jobId: 'email_winback',
        status: 'OK',
        message: `${metrics.queued} campagne(s) winback queued`,
        metrics,
    };
};
const AUTOMATION_JOB_HANDLERS = {
    reconcile_pending_payments: runReconcilePendingPaymentsJob,
    sync_shipping_tracking: runSyncShippingTrackingJob,
    auto_cancel_pending: runAutoCancelPendingJob,
    sla_watchdog: runSlaWatchdogJob,
    process_email_outbox: runProcessEmailOutboxJob,
    email_welcome_lifecycle: runEmailWelcomeLifecycleJob,
    email_abandoned_cart: runEmailAbandonedCartJob,
    email_post_purchase: runEmailPostPurchaseJob,
    email_reorder_reminders: runEmailReorderRemindersJob,
    email_winback: runEmailWinbackJob,
};
const executeAutomationJob = async (jobId, trigger) => {
    await ensureOrderWorkflowTables();
    const config = await getAutomationJobConfig(jobId);
    if (!config) {
        return {
            jobId,
            status: 'ERROR',
            message: 'Configuration de job introuvable',
            metrics: {},
        };
    }
    if (trigger === 'scheduler' && !config.enabled) {
        return {
            jobId,
            status: 'SKIPPED',
            message: 'Job désactivé',
            metrics: {},
        };
    }
    if (automationRuntime[jobId].running) {
        return {
            jobId,
            status: 'SKIPPED',
            message: 'Exécution déjà en cours',
            metrics: {},
        };
    }
    automationRuntime[jobId].running = true;
    await updateAutomationJobRunState({
        jobId,
        lastRunAt: config.lastRunAt,
        nextRunAt: config.nextRunAt,
        lastStatus: 'RUNNING',
        lastError: null,
    });
    try {
        const handler = AUTOMATION_JOB_HANDLERS[jobId];
        const result = await handler();
        const latestConfig = await getAutomationJobConfig(jobId);
        const intervalMs = clampAutomationIntervalMs(latestConfig.intervalMs || config.intervalMs);
        const nextRunAt = latestConfig.enabled ? new Date(Date.now() + intervalMs) : null;
        await updateAutomationJobRunState({
            jobId,
            lastRunAt: new Date(),
            nextRunAt,
            lastStatus: result.status,
            lastError: result.status === 'ERROR' ? result.message : null,
        });
        return result;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Erreur inconnue';
        console.error(`[automation][${jobId}]`, error);
        const latestConfig = await getAutomationJobConfig(jobId);
        const intervalMs = clampAutomationIntervalMs(latestConfig.intervalMs || config.intervalMs);
        const nextRunAt = latestConfig.enabled ? new Date(Date.now() + intervalMs) : null;
        await updateAutomationJobRunState({
            jobId,
            lastRunAt: new Date(),
            nextRunAt,
            lastStatus: 'ERROR',
            lastError: message,
        });
        return {
            jobId,
            status: 'ERROR',
            message,
            metrics: {},
        };
    }
    finally {
        automationRuntime[jobId].running = false;
    }
};
const scheduleAutomationJobs = async () => {
    await ensureOrderWorkflowTables();
    const configs = await listAutomationJobConfigs();
    const configById = new Map(configs.map((config) => [config.id, config]));
    for (const jobId of AUTOMATION_JOB_IDS) {
        clearAutomationJobTimer(jobId);
        const config = configById.get(jobId);
        if (!config || !config.enabled) {
            await setAutomationJobNextRunAt(jobId, null);
            continue;
        }
        const intervalMs = clampAutomationIntervalMs(config.intervalMs);
        if (intervalMs !== config.intervalMs) {
            await updateAutomationJobConfig({ jobId, intervalMs });
        }
        const nextRunAt = new Date(Date.now() + intervalMs);
        await setAutomationJobNextRunAt(jobId, nextRunAt);
        automationRuntime[jobId].timer = setInterval(() => {
            void executeAutomationJob(jobId, 'scheduler');
        }, intervalMs);
    }
};
const startAutomationScheduler = async () => {
    if (automationSchedulerStarted)
        return;
    automationSchedulerStarted = true;
    try {
        await scheduleAutomationJobs();
    }
    catch (error) {
        automationSchedulerStarted = false;
        throw error;
    }
};
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
const SESSION_TTL_DAYS = 30;
const parseCookies = (cookieHeader) => {
    const list = {};
    if (!cookieHeader)
        return list;
    cookieHeader.split(';').forEach((cookie) => {
        const parts = cookie.split('=');
        const key = parts.shift().trim();
        if (!key)
            return;
        const value = decodeURIComponent(parts.join('='));
        list[key] = value;
    });
    return list;
};
const setSessionCookie = (res, sessionId) => {
    const secure = process.env.NODE_ENV === 'production';
    const sameSite = secure ? 'none' : 'lax';
    res.cookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite,
        secure,
        maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
        path: '/',
    });
};
const clearSessionCookie = (res) => {
    const secure = process.env.NODE_ENV === 'production';
    const sameSite = secure ? 'none' : 'lax';
    res.cookie(SESSION_COOKIE, '', {
        httpOnly: true,
        sameSite,
        secure,
        maxAge: 0,
        path: '/',
    });
};
const setOAuthCookie = (res, name, value) => {
    const secure = process.env.NODE_ENV === 'production';
    const sameSite = secure ? 'none' : 'lax';
    res.cookie(name, value, {
        httpOnly: true,
        sameSite,
        secure,
        maxAge: GOOGLE_OAUTH_TTL_MS,
        path: '/',
    });
};
const clearOAuthCookie = (res, name) => {
    const secure = process.env.NODE_ENV === 'production';
    const sameSite = secure ? 'none' : 'lax';
    res.cookie(name, '', {
        httpOnly: true,
        sameSite,
        secure,
        maxAge: 0,
        path: '/',
    });
};
const base64UrlEncode = (buffer) => buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
const createCodeVerifier = () => base64UrlEncode(crypto.randomBytes(32));
const createCodeChallenge = (verifier) => base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
const redirectWithError = (res, message) => {
    const encoded = encodeURIComponent(message);
    res.redirect(`${WEB_BASE_URL}/loginerror=${encoded}`);
};
const getSessionCustomer = async (req) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[SESSION_COOKIE];
    if (!sessionId)
        return null;
    const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { customer: true },
    });
    if (!session)
        return null;
    if (session.expiresAt < new Date()) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
        return null;
    }
    return session;
};
const requireCustomer = async (req, res, next) => {
    try {
        const session = await getSessionCustomer(req);
        if (!session)
            return res.status(401).json({ error: 'Not authenticated' });
        req.customer = session.customer;
        req.session = session;
        next();
    }
    catch (error) {
        res.status(401).json({ error: 'Not authenticated' });
    }
};
const requireAccountCustomer = async (req, res, next) => {
    try {
        const session = await getSessionCustomer(req);
        if (!session || !session.customer.email) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        req.customer = session.customer;
        req.session = session;
        next();
    }
    catch (error) {
        res.status(401).json({ error: 'Not authenticated' });
    }
};
// Middleware
app.use(cors({
    origin: [WEB_BASE_URL, ADMIN_BASE_URL, API_BASE_URL],
    credentials: true,
}));
app.use(express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/media', express.static(MEDIA_DIR));
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
app.get('/api/email/unsubscribe', async (req, res) => {
    try {
        const rawToken = typeof req.query.unsubscribe === 'string'
            ? req.query.unsubscribe
            : (typeof req.query.token === 'string' ? req.query.token : null);
        const decoded = verifyUnsubscribeToken(rawToken);
        if (!decoded) {
            return res.status(400).send('<h1>Lien de desinscription invalide.</h1>');
        }
        const customer = await prisma.customer.findUnique({
            where: { id: decoded.customerId },
            select: { id: true, email: true },
        });
        const customerEmail = normalizeEmail(customer?.email);
        if (!customer || !customerEmail || customerEmail !== normalizeEmail(decoded.email)) {
            return res.status(404).send('<h1>Compte introuvable.</h1>');
        }
        await updateEmailPreference(customer.id, {
            marketingOptIn: false,
            abandonedCartOptIn: false,
            postPurchaseOptIn: false,
            reorderOptIn: false,
            winbackOptIn: false,
        });
        return res.send('<h1>Vous etes desinscrit(e) des emails marketing.</h1><p>Les emails transactionnels resteront actifs.</p>');
    }
    catch (error) {
        console.error('Unsubscribe error:', error);
        return res.status(500).send('<h1>Erreur de desinscription.</h1>');
    }
});
// Google OAuth (customer only)
app.get('/auth/google/start', (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URL) {
        return res.status(500).send('Google OAuth not configured');
    }
    const state = base64UrlEncode(crypto.randomBytes(16));
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    setOAuthCookie(res, GOOGLE_OAUTH_COOKIE_STATE, state);
    setOAuthCookie(res, GOOGLE_OAUTH_COOKIE_VERIFIER, codeVerifier);
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URL,
        response_type: 'code',
        scope: GOOGLE_OAUTH_SCOPE,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth${params.toString()}`);
});
app.get('/auth/google/callback', async (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URL) {
        return redirectWithError(res, 'google_oauth_not_configured');
    }
    if (req.query.error) {
        return redirectWithError(res, String(req.query.error));
    }
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    const cookies = parseCookies(req.headers.cookie);
    const storedState = cookies[GOOGLE_OAUTH_COOKIE_STATE];
    const codeVerifier = cookies[GOOGLE_OAUTH_COOKIE_VERIFIER];
    clearOAuthCookie(res, GOOGLE_OAUTH_COOKIE_STATE);
    clearOAuthCookie(res, GOOGLE_OAUTH_COOKIE_VERIFIER);
    if (!code || !state || !storedState || state !== storedState || !codeVerifier) {
        return redirectWithError(res, 'invalid_oauth_state');
    }
    try {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                code,
                redirect_uri: GOOGLE_REDIRECT_URL,
                grant_type: 'authorization_code',
                code_verifier: codeVerifier,
            }),
        });
        if (!tokenResponse.ok) {
            return redirectWithError(res, 'oauth_token_failed');
        }
        const tokenData = (await tokenResponse.json());
        if (!tokenData.access_token) {
            return redirectWithError(res, 'missing_access_token');
        }
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (!userResponse.ok) {
            return redirectWithError(res, 'oauth_userinfo_failed');
        }
        const profile = (await userResponse.json());
        if (!profile.email || !profile.email_verified || !profile.sub) {
            return redirectWithError(res, 'email_not_verified');
        }
        const email = profile.email.toLowerCase();
        const googleId = profile.sub;
        let customer = await prisma.customer.findFirst({
            where: {
                OR: [{ googleId }, { email }],
            },
        });
        if (customer) {
            if (!customer.googleId) {
                customer = await prisma.customer.update({
                    where: { id: customer.id },
                    data: { googleId, authProvider: 'GOOGLE' },
                });
            }
            else if (customer.googleId !== googleId) {
                return redirectWithError(res, 'google_account_conflict');
            }
            else if (customer.authProvider !== 'GOOGLE') {
                customer = await prisma.customer.update({
                    where: { id: customer.id },
                    data: { authProvider: 'GOOGLE' },
                });
            }
        }
        else {
            customer = await prisma.customer.create({
                data: {
                    email,
                    googleId,
                    authProvider: 'GOOGLE',
                    passwordHash: null,
                    firstName: profile.given_name || null,
                    lastName: profile.family_name || null,
                    address: '',
                    city: '',
                    postalCode: '',
                    country: 'FR',
                },
            });
        }
        const session = await prisma.session.create({
            data: {
                customerId: customer.id,
                expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
            },
        });
        setSessionCookie(res, session.id);
        res.redirect(`${WEB_BASE_URL}/`);
    }
    catch (error) {
        redirectWithError(res, 'oauth_failed');
    }
});
// Login page at root
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin Login - My Own Tea</title>
      <style>
        @import url('https://fonts.googleapis.com/css2family=Playfair+Display:ital,wght@0,400;0,600;1,500&family=Inter:wght@300;400;500;600&display=swap');
        :root {
          --sage-deep: #414C16;
          --gold-antique: #C9A962;
          --cream-apothecary: #F5F1E8;
          --white-warm: #FAF8F3;
          --border: #E5E0D5;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Inter', sans-serif;
          background: var(--cream-apothecary);
          color: var(--sage-deep);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }
        .container {
          background: var(--white-warm);
          padding: 2.5rem;
          border-radius: 1.5rem;
          border: 1px solid var(--border);
          box-shadow: 0 12px 40px rgba(45, 62, 54, 0.12);
          width: 100%;
          max-width: 420px;
        }
        .brand {
          font-family: 'Playfair Display', serif;
          font-size: 2rem;
          color: var(--sage-deep);
          margin-bottom: 0.25rem;
        }
        .subtitle {
          color: #6B7A70;
          margin-bottom: 2rem;
        }
        .form-group { margin-bottom: 1.25rem; }
        label { display: block; color: var(--sage-deep); margin-bottom: 0.5rem; font-weight: 600; font-size: 0.9rem; }
        input {
          width: 100%;
          padding: 0.8rem 0.9rem;
          border: 1px solid var(--border);
          border-radius: 0.75rem;
          background: #fff;
          font-size: 0.95rem;
          outline: none;
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }
        input:focus {
          border-color: var(--gold-antique);
          box-shadow: 0 0 0 3px rgba(201, 169, 98, 0.2);
        }
        button {
          width: 100%;
          padding: 0.9rem;
          background: var(--gold-antique);
          color: var(--sage-deep);
          border: none;
          border-radius: 0.75rem;
          cursor: pointer;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-size: 0.8rem;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        button:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 25px rgba(201, 169, 98, 0.25);
        }
        .error {
          background: #FBE9E7;
          color: #A85C4B;
          padding: 0.75rem;
          border-radius: 0.75rem;
          margin-bottom: 1rem;
          display: none;
          font-size: 0.9rem;
        }
        .success {
          background: #E8F3EC;
          color: #2D6A4F;
          padding: 0.75rem;
          border-radius: 0.75rem;
          margin-bottom: 1rem;
          display: none;
          font-size: 0.9rem;
        }
        .credentials {
          background: #F6F2EA;
          padding: 1rem;
          border-radius: 0.75rem;
          margin-top: 1.5rem;
          font-size: 0.85rem;
          color: #6B7A70;
          border: 1px dashed var(--border);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1 class="brand">My Own Tea</h1>
        <p class="subtitle">Accès administrateur</p>
        
        <div id="error" class="error"></div>
        <div id="success" class="success"></div>
        
        <form id="loginForm">
          <div class="form-group">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" required placeholder="admin@myowntea.com">
          </div>
          
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required placeholder="mot de passe">
          </div>
          
          <button type="submit">Se connecter</button>
        </form>
        
        <div class="credentials">
          <strong>Test Credentials:</strong><br>
          Email: admin@myowntea.com<br>
          Password: admin123
        </div>
      </div>
      
      <script>
        const form = document.getElementById('loginForm');
        const errorDiv = document.getElementById('error');
        const successDiv = document.getElementById('success');
        
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          errorDiv.style.display = 'none';
          successDiv.style.display = 'none';
          
          const email = document.getElementById('email').value;
          const password = document.getElementById('password').value;
          
          try {
            const response = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
              localStorage.setItem('adminToken', data.token);
              localStorage.setItem('user', JSON.stringify(data.user));
              successDiv.textContent = 'Login successful! Redirecting to admin panel...';
              successDiv.style.display = 'block';
              const token = encodeURIComponent(data.token);
              setTimeout(() => {
                window.location.href = 'http://localhost:3001/token=' + token;
              }, 1000);
            } else {
              errorDiv.textContent = data.error || 'Login failed';
              errorDiv.style.display = 'block';
            }
          } catch (error) {
            errorDiv.textContent = 'Network error. Please try again.';
            errorDiv.style.display = 'block';
          }
        });
      </script>
    </body>
    </html>
  `);
});
// API Auth (admin + customer)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        if (normalizedEmail === 'admin@myowntea.com' && password === 'admin123') {
            return res.json({
                user: { id: 'admin-1', email: normalizedEmail, role: 'ADMIN' },
                token: 'jwt-token-' + Date.now() + '-' + Math.random().toString(36).substring(7),
            });
        }
        const customer = await prisma.customer.findUnique({ where: { email: normalizedEmail } });
        if (!customer || !customer.passwordHash) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const isValid = await bcrypt.compare(password, customer.passwordHash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const session = await prisma.session.create({
            data: {
                customerId: customer.id,
                expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
            },
        });
        setSessionCookie(res, session.id);
        res.json({
            customer: {
                id: customer.id,
                email: customer.email,
                firstName: customer.firstName,
                lastName: customer.lastName,
                authProvider: customer.authProvider,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, salutation, firstName, lastName, birthDate, phoneE164 } = req.body;
        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail || !password || !firstName || !lastName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password too short' });
        }
        if (salutation && salutation !== 'MME' && salutation !== 'MR') {
            return res.status(400).json({ error: 'Invalid salutation' });
        }
        let parsedBirthDate = null;
        if (birthDate) {
            parsedBirthDate = new Date(birthDate);
            if (Number.isNaN(parsedBirthDate.getTime())) {
                return res.status(400).json({ error: 'Invalid birth date' });
            }
        }
        let normalizedPhone = null;
        if (phoneE164) {
            const trimmedPhone = String(phoneE164).trim();
            if (!/^\+[1-9]\d{1,14}$/.test(trimmedPhone)) {
                return res.status(400).json({ error: 'Invalid phone format' });
            }
            normalizedPhone = trimmedPhone;
        }
        const existing = await prisma.customer.findUnique({ where: { email: normalizedEmail } });
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const customer = await prisma.customer.create({
            data: {
                email: normalizedEmail,
                passwordHash,
                authProvider: 'PASSWORD',
                salutation: salutation || null,
                firstName,
                lastName,
                birthDate: parsedBirthDate,
                phoneE164: normalizedPhone,
                address: '',
                city: '',
                postalCode: '',
                country: 'FR',
            },
        });
        const session = await prisma.session.create({
            data: {
                customerId: customer.id,
                expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
            },
        });
        setSessionCookie(res, session.id);
        res.status(201).json({
            customer: {
                id: customer.id,
                email: customer.email,
                firstName: customer.firstName,
                lastName: customer.lastName,
                authProvider: customer.authProvider,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});
app.post('/api/auth/forgot-password', async (req, res) => {
    const genericResponse = {
        ok: true,
        message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.',
    };
    try {
        await ensurePasswordResetTable();
        const email = normalizeEmail(req.body?.email);
        if (!email) {
            return res.json(genericResponse);
        }
        const customer = await prisma.customer.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                firstName: true,
            },
        });
        if (!customer || !customer.email) {
            return res.json(genericResponse);
        }
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashPasswordResetToken(rawToken);
        const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);
        const requestIp = resolveRequestIp(req);
        const userAgent = toNonEmptyStringOrNull(req.header('user-agent'));
        await prisma.$transaction(async (tx) => {
            await tx.$executeRaw `
        UPDATE "PasswordResetToken"
        SET "usedAt" = NOW()
        WHERE "customerId" = ${customer.id}
          AND "usedAt" IS NULL
      `;
            await tx.$executeRaw `
        INSERT INTO "PasswordResetToken" (
          "id",
          "customerId",
          "tokenHash",
          "expiresAt",
          "usedAt",
          "requestedFromIp",
          "userAgent",
          "createdAt"
        )
        VALUES (
          ${crypto.randomUUID()},
          ${customer.id},
          ${tokenHash},
          ${expiresAt},
          NULL,
          ${requestIp},
          ${userAgent},
          NOW()
        )
      `;
        });
        const resetUrl = resolveResetPasswordUrl(rawToken);
        try {
            await sendPasswordResetEmail({
                to: customer.email,
                customerId: customer.id,
                firstName: customer.firstName,
                resetUrl,
            });
        }
        catch (mailError) {
            console.error('Password reset email error:', mailError);
            // Keep generic response to avoid account enumeration.
        }
        return res.json(genericResponse);
    }
    catch (error) {
        console.error('Forgot password error:', error);
        return res.status(500).json({ error: 'Failed to process forgot password request' });
    }
});
app.get('/api/auth/reset-password/validate', async (req, res) => {
    try {
        await ensurePasswordResetTable();
        const token = toNonEmptyStringOrNull(req.query?.token);
        if (!token) {
            return res.status(400).json({ valid: false, error: 'Token is required' });
        }
        const tokenHash = hashPasswordResetToken(token);
        const rows = await prisma.$queryRaw `
      SELECT
        "id",
        "customerId",
        "expiresAt",
        "usedAt"
      FROM "PasswordResetToken"
      WHERE "tokenHash" = ${tokenHash}
      LIMIT 1
    `;
        const tokenRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        if (!tokenRow) {
            return res.json({ valid: false });
        }
        if (tokenRow.usedAt) {
            return res.json({ valid: false });
        }
        const expiresAt = new Date(tokenRow.expiresAt);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
            return res.json({ valid: false });
        }
        return res.json({ valid: true, expiresAt: expiresAt.toISOString() });
    }
    catch (error) {
        console.error('Reset token validation error:', error);
        return res.status(500).json({ valid: false, error: 'Failed to validate reset token' });
    }
});
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        await ensurePasswordResetTable();
        const token = toNonEmptyStringOrNull(req.body?.token);
        const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'token and newPassword are required' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must contain at least 8 characters' });
        }
        const tokenHash = hashPasswordResetToken(token);
        const rows = await prisma.$queryRaw `
      SELECT
        "id",
        "customerId",
        "expiresAt",
        "usedAt"
      FROM "PasswordResetToken"
      WHERE "tokenHash" = ${tokenHash}
      LIMIT 1
    `;
        const tokenRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        if (!tokenRow || tokenRow.usedAt) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }
        const expiresAt = new Date(tokenRow.expiresAt);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }
        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.$transaction(async (tx) => {
            await tx.customer.update({
                where: { id: tokenRow.customerId },
                data: {
                    passwordHash,
                    authProvider: 'PASSWORD',
                },
            });
            await tx.session.deleteMany({
                where: { customerId: tokenRow.customerId },
            });
            await tx.$executeRaw `
        UPDATE "PasswordResetToken"
        SET "usedAt" = NOW()
        WHERE "customerId" = ${tokenRow.customerId}
          AND "usedAt" IS NULL
      `;
        });
        return res.json({ ok: true, message: 'Password reset successful' });
    }
    catch (error) {
        console.error('Reset password error:', error);
        return res.status(500).json({ error: 'Failed to reset password' });
    }
});
app.post('/api/auth/guest', async (req, res) => {
    try {
        const { guestCustomerId } = req.body;
        const session = await getSessionCustomer(req);
        if (session) {
            return res.json({
                customer: {
                    id: session.customer.id,
                    email: session.customer.email,
                    firstName: session.customer.firstName,
                    lastName: session.customer.lastName,
                },
                guestCustomerId: session.customer.email ? null : session.customer.id,
            });
        }
        if (guestCustomerId) {
            const existingGuest = await prisma.customer.findFirst({
                where: { id: guestCustomerId, email: null },
            });
            if (existingGuest) {
                const guestSession = await prisma.session.create({
                    data: {
                        customerId: existingGuest.id,
                        expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
                    },
                });
                setSessionCookie(res, guestSession.id);
                return res.json({
                    customer: {
                        id: existingGuest.id,
                        email: existingGuest.email,
                        firstName: existingGuest.firstName,
                        lastName: existingGuest.lastName,
                    },
                    guestCustomerId: existingGuest.id,
                });
            }
        }
        const guest = await prisma.customer.create({
            data: {
                email: null,
                passwordHash: null,
                authProvider: 'PASSWORD',
                firstName: 'Invité',
                lastName: null,
                address: '',
                city: '',
                postalCode: '',
                country: 'FR',
            },
        });
        const guestSession = await prisma.session.create({
            data: {
                customerId: guest.id,
                expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
            },
        });
        setSessionCookie(res, guestSession.id);
        res.status(201).json({
            customer: {
                id: guest.id,
                email: guest.email,
                firstName: guest.firstName,
                lastName: guest.lastName,
            },
            guestCustomerId: guest.id,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Guest session failed' });
    }
});
app.post('/api/auth/logout', async (req, res) => {
    try {
        const cookies = parseCookies(req.headers.cookie);
        const sessionId = cookies[SESSION_COOKIE];
        if (sessionId) {
            await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
        }
        clearSessionCookie(res);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Logout failed' });
    }
});
app.get('/api/me', async (req, res) => {
    try {
        const session = await getSessionCustomer(req);
        if (!session)
            return res.status(401).json({ error: 'Not authenticated' });
        const customer = session.customer;
        res.json({
            customer: {
                id: customer.id,
                email: customer.email,
                authProvider: customer.authProvider,
                salutation: customer.salutation,
                firstName: customer.firstName,
                lastName: customer.lastName,
                birthDate: customer.birthDate,
                phoneE164: customer.phoneE164,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});
const parsePage = (value, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1)
        return fallback;
    return Math.floor(parsed);
};
const parsePageSize = (value, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1)
        return fallback;
    return Math.min(Math.floor(parsed), 50);
};
const normalizePhoneE164 = (value) => {
    if (!value)
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    if (!/^\+[1-9]\d{1,14}$/.test(trimmed)) {
        throw new Error('Invalid phone format');
    }
    return trimmed;
};
// Account: Orders list (paginated)
app.get('/api/account/orders', requireAccountCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const page = parsePage(req.query.page, 1);
        const pageSize = parsePageSize(req.query.pageSize, 10);
        const skip = (page - 1) * pageSize;
        const [totalCount, orders] = await Promise.all([
            prisma.order.count({ where: { customerId: customer.id } }),
            prisma.order.findMany({
                where: { customerId: customer.id },
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
                select: {
                    id: true,
                    orderNumber: true,
                    status: true,
                    totalCents: true,
                    createdAt: true,
                },
            }),
        ]);
        res.json({
            page,
            pageSize,
            totalCount,
            totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
            orders,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});
// Account: Order detail
app.get('/api/account/orders/:orderId', requireAccountCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const order = await prisma.order.findFirst({
            where: { id: req.params.orderId, customerId: customer.id },
            include: { items: true, shipment: true },
        });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        const fallbackAddress = order.shippingAddress
            ? {
                address1: order.shippingAddress,
                address2: null,
                postalCode: null,
                city: null,
                countryCode: null,
                phoneE164: null,
                firstName: null,
                lastName: null,
                salutation: null,
            }
            : null;
        res.json({
            id: order.id,
            reference: order.orderNumber,
            status: order.status,
            createdAt: order.createdAt,
            totals: {
                subtotalCents: order.subtotalCents,
                shippingCents: order.shippingCents,
                discountTotalCents: order.discountTotalCents,
                totalCents: order.totalCents,
            },
            payment: {
                method: order.paymentMethod,
                status: order.paymentStatus,
                stripeSessionId: order.stripeSessionId,
            },
            shipping: {
                carrier: order.shippingProvider,
                trackingNumber: order.trackingNumber || order.shipment?.trackingNumber || null,
                trackingUrl: order.trackingUrl || null,
                offerLabel: order.shippingOfferLabel || null,
                mode: order.shippingMode || null,
            },
            items: order.items.map((item) => ({
                id: item.id,
                qty: item.qty ?? item.quantity,
                unitPriceCents: item.unitPriceCents,
                lineTotalCents: item.lineTotalCents,
                lineSubtotalCents: item.lineSubtotalCents,
                lineDiscountCents: item.lineDiscountCents,
                snapshot: item.snapshot,
            })),
            billingAddress: order.billingAddressSnapshot || fallbackAddress,
            shippingAddress: order.shippingAddressSnapshot || fallbackAddress,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});
// Account: Address book
app.get('/api/account/addresses', requireAccountCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const addresses = await prisma.address.findMany({
            where: { customerId: customer.id },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ addresses });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch addresses' });
    }
});
app.post('/api/account/addresses', requireAccountCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const { salutation, firstName, lastName, countryCode, postalCode, city, hamlet, address1, address2, phoneE164, isDefaultBilling, isDefaultShipping, } = req.body;
        if (!firstName || !lastName || !countryCode || !postalCode || !city || !address1 || !phoneE164) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const normalizedPhone = normalizePhoneE164(phoneE164);
        if (!normalizedPhone) {
            return res.status(400).json({ error: 'Invalid phone format' });
        }
        const created = await prisma.$transaction(async (tx) => {
            if (isDefaultBilling) {
                await tx.address.updateMany({
                    where: { customerId: customer.id, isDefaultBilling: true },
                    data: { isDefaultBilling: false },
                });
            }
            if (isDefaultShipping) {
                await tx.address.updateMany({
                    where: { customerId: customer.id, isDefaultShipping: true },
                    data: { isDefaultShipping: false },
                });
            }
            return tx.address.create({
                data: {
                    customerId: customer.id,
                    salutation: salutation || null,
                    firstName,
                    lastName,
                    countryCode,
                    postalCode,
                    city,
                    hamlet: hamlet || null,
                    address1,
                    address2: address2 || null,
                    phoneE164: normalizedPhone,
                    isDefaultBilling: Boolean(isDefaultBilling),
                    isDefaultShipping: Boolean(isDefaultShipping),
                },
            });
        });
        res.status(201).json({ address: created });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create address';
        if (message === 'Invalid phone format') {
            return res.status(400).json({ error: message });
        }
        res.status(500).json({ error: message });
    }
});
app.patch('/api/account/addresses/:id', requireAccountCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const { salutation, firstName, lastName, countryCode, postalCode, city, hamlet, address1, address2, phoneE164, isDefaultBilling, isDefaultShipping, } = req.body;
        const normalizedPhone = phoneE164 ? normalizePhoneE164(phoneE164) : undefined;
        const updated = await prisma.$transaction(async (tx) => {
            if (isDefaultBilling) {
                await tx.address.updateMany({
                    where: { customerId: customer.id, isDefaultBilling: true },
                    data: { isDefaultBilling: false },
                });
            }
            if (isDefaultShipping) {
                await tx.address.updateMany({
                    where: { customerId: customer.id, isDefaultShipping: true },
                    data: { isDefaultShipping: false },
                });
            }
            const existing = await tx.address.findFirst({
                where: { id: req.params.id, customerId: customer.id },
            });
            if (!existing) {
                throw new Error('ADDRESS_NOT_FOUND');
            }
            return tx.address.update({
                where: { id: existing.id },
                data: {
                    salutation: salutation !== undefined ? salutation : undefined,
                    firstName: firstName !== undefined ? firstName : undefined,
                    lastName: lastName !== undefined ? lastName : undefined,
                    countryCode: countryCode !== undefined ? countryCode : undefined,
                    postalCode: postalCode !== undefined ? postalCode : undefined,
                    city: city !== undefined ? city : undefined,
                    hamlet: hamlet !== undefined ? hamlet : undefined,
                    address1: address1 !== undefined ? address1 : undefined,
                    address2: address2 !== undefined ? address2 : undefined,
                    phoneE164: typeof normalizedPhone === 'string' ? normalizedPhone : undefined,
                    isDefaultBilling: typeof isDefaultBilling === 'boolean' ? isDefaultBilling : undefined,
                    isDefaultShipping: typeof isDefaultShipping === 'boolean' ? isDefaultShipping : undefined,
                },
            });
        });
        res.json({ address: updated });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update address';
        if (message === 'ADDRESS_NOT_FOUND') {
            return res.status(404).json({ error: 'Address not found' });
        }
        if (message === 'Invalid phone format') {
            return res.status(400).json({ error: message });
        }
        res.status(500).json({ error: message });
    }
});
app.delete('/api/account/addresses/:id', requireAccountCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const result = await prisma.address.deleteMany({
            where: { id: req.params.id, customerId: customer.id },
        });
        if (result.count === 0) {
            return res.status(404).json({ error: 'Address not found' });
        }
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete address' });
    }
});
app.patch('/api/account/addresses/defaults', requireAccountCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const { defaultBillingId, defaultShippingId } = req.body;
        await prisma.$transaction(async (tx) => {
            if (defaultBillingId) {
                const billingAddress = await tx.address.findFirst({
                    where: { id: defaultBillingId, customerId: customer.id },
                });
                if (!billingAddress) {
                    throw new Error('ADDRESS_NOT_FOUND');
                }
                await tx.address.updateMany({
                    where: { customerId: customer.id, isDefaultBilling: true },
                    data: { isDefaultBilling: false },
                });
                await tx.address.update({
                    where: { id: billingAddress.id },
                    data: { isDefaultBilling: true },
                });
            }
            if (defaultShippingId) {
                const shippingAddress = await tx.address.findFirst({
                    where: { id: defaultShippingId, customerId: customer.id },
                });
                if (!shippingAddress) {
                    throw new Error('ADDRESS_NOT_FOUND');
                }
                await tx.address.updateMany({
                    where: { customerId: customer.id, isDefaultShipping: true },
                    data: { isDefaultShipping: false },
                });
                await tx.address.update({
                    where: { id: shippingAddress.id },
                    data: { isDefaultShipping: true },
                });
            }
        });
        res.json({ success: true });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update defaults';
        if (message === 'ADDRESS_NOT_FOUND') {
            return res.status(404).json({ error: 'Address not found' });
        }
        res.status(500).json({ error: 'Failed to update defaults' });
    }
});
app.get('/api/account/email-preferences', requireAccountCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const preferences = await ensureEmailPreference(customer.id);
        if (!preferences) {
            return res.status(404).json({ error: 'Preferences not found' });
        }
        res.json({
            preferences: {
                transactionalOptIn: Boolean(preferences.transactionalOptIn),
                marketingOptIn: Boolean(preferences.marketingOptIn),
                abandonedCartOptIn: Boolean(preferences.abandonedCartOptIn),
                postPurchaseOptIn: Boolean(preferences.postPurchaseOptIn),
                reorderOptIn: Boolean(preferences.reorderOptIn),
                winbackOptIn: Boolean(preferences.winbackOptIn),
                updatedAt: preferences.updatedAt,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch email preferences' });
    }
});
app.patch('/api/account/email-preferences', requireAccountCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const payload = req.body || {};
        const updated = await updateEmailPreference(customer.id, {
            transactionalOptIn: payload.transactionalOptIn,
            marketingOptIn: payload.marketingOptIn,
            abandonedCartOptIn: payload.abandonedCartOptIn,
            postPurchaseOptIn: payload.postPurchaseOptIn,
            reorderOptIn: payload.reorderOptIn,
            winbackOptIn: payload.winbackOptIn,
        });
        if (!updated) {
            return res.status(404).json({ error: 'Preferences not found' });
        }
        res.json({
            preferences: {
                transactionalOptIn: Boolean(updated.transactionalOptIn),
                marketingOptIn: Boolean(updated.marketingOptIn),
                abandonedCartOptIn: Boolean(updated.abandonedCartOptIn),
                postPurchaseOptIn: Boolean(updated.postPurchaseOptIn),
                reorderOptIn: Boolean(updated.reorderOptIn),
                winbackOptIn: Boolean(updated.winbackOptIn),
                updatedAt: updated.updatedAt,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update email preferences' });
    }
});
// Account: Profile updates
app.patch('/api/account/profile', requireAccountCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const { salutation, firstName, lastName, birthDate, phoneE164 } = req.body;
        if (!firstName || !lastName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const parsedBirthDate = birthDate ? new Date(birthDate) : null;
        if (birthDate && Number.isNaN(parsedBirthDate.getTime())) {
            return res.status(400).json({ error: 'Invalid birth date' });
        }
        const normalizedPhone = normalizePhoneE164(phoneE164);
        const updated = await prisma.customer.update({
            where: { id: customer.id },
            data: {
                salutation: salutation || null,
                firstName,
                lastName,
                birthDate: parsedBirthDate,
                phoneE164: normalizedPhone,
            },
        });
        res.json({
            customer: {
                id: updated.id,
                email: updated.email,
                authProvider: updated.authProvider,
                salutation: updated.salutation,
                firstName: updated.firstName,
                lastName: updated.lastName,
                birthDate: updated.birthDate,
                phoneE164: updated.phoneE164,
            },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update profile';
        if (message === 'Invalid phone format') {
            return res.status(400).json({ error: message });
        }
        res.status(500).json({ error: message });
    }
});
app.patch('/api/account/email', requireAccountCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const { email, currentPassword } = req.body;
        if (!email)
            return res.status(400).json({ error: 'Email is required' });
        const existing = await prisma.customer.findUnique({ where: { id: customer.id } });
        if (!existing)
            return res.status(404).json({ error: 'Customer not found' });
        if (existing.passwordHash) {
            if (!currentPassword) {
                return res.status(400).json({ error: 'Current password required' });
            }
            const isValid = await bcrypt.compare(currentPassword, existing.passwordHash);
            if (!isValid) {
                return res.status(401).json({ error: 'Invalid password' });
            }
        }
        const normalizedEmail = email.toLowerCase();
        const conflict = await prisma.customer.findFirst({
            where: { email: normalizedEmail, id: { not: existing.id } },
        });
        if (conflict) {
            return res.status(409).json({ error: 'Email already in use' });
        }
        const previousEmail = toNonEmptyStringOrNull(existing.email);
        const updated = await prisma.customer.update({
            where: { id: customer.id },
            data: { email: normalizedEmail },
        });
        const securityContent = buildSecurityEmailContent({
            type: 'ACCOUNT_EMAIL_CHANGED',
            firstName: updated.firstName,
            oldEmail: previousEmail,
            newEmail: updated.email,
        });
        if (updated.email) {
            await queueEmailDelivery({
                customerId: updated.id,
                type: 'ACCOUNT_EMAIL_CHANGED',
                recipient: updated.email,
                subject: securityContent.subject,
                text: securityContent.text,
                html: securityContent.html,
                metadata: {
                    source: 'account_email_change',
                    target: 'new_email',
                    oldEmail: previousEmail,
                    newEmail: updated.email,
                },
            });
        }
        if (previousEmail && previousEmail !== updated.email) {
            await queueEmailDelivery({
                customerId: updated.id,
                type: 'ACCOUNT_EMAIL_CHANGED',
                recipient: previousEmail,
                subject: securityContent.subject,
                text: securityContent.text,
                html: securityContent.html,
                metadata: {
                    source: 'account_email_change',
                    target: 'old_email',
                    oldEmail: previousEmail,
                    newEmail: updated.email,
                },
            });
        }
        res.json({
            customer: {
                id: updated.id,
                email: updated.email,
                authProvider: updated.authProvider,
                salutation: updated.salutation,
                firstName: updated.firstName,
                lastName: updated.lastName,
                birthDate: updated.birthDate,
                phoneE164: updated.phoneE164,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update email' });
    }
});
app.patch('/api/account/password', requireAccountCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'Password too short' });
        }
        const existing = await prisma.customer.findUnique({ where: { id: customer.id } });
        if (!existing.passwordHash) {
            return res.status(400).json({ error: 'Password update not available' });
        }
        const isValid = await bcrypt.compare(currentPassword, existing.passwordHash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.customer.update({
            where: { id: customer.id },
            data: { passwordHash },
        });
        const securityContent = buildSecurityEmailContent({
            type: 'ACCOUNT_PASSWORD_CHANGED',
            firstName: existing.firstName,
        });
        if (existing.email) {
            await queueEmailDelivery({
                customerId: existing.id,
                type: 'ACCOUNT_PASSWORD_CHANGED',
                recipient: existing.email,
                subject: securityContent.subject,
                text: securityContent.text,
                html: securityContent.html,
                metadata: {
                    source: 'account_password_change',
                },
            });
        }
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update password' });
    }
});
// Get all ingredients
app.get('/api/ingredients', async (req, res) => {
    try {
        const ingredients = await prisma.ingredient.findMany({
            select: {
                id: true,
                name: true,
                description: true,
                longDescription: true,
                category: true,
                flavor: true,
                flavors: true,
                image: true,
                color: true,
                intensity: true,
                umami: true,
                sweetness: true,
                thickness: true,
                finish: true,
                benefits: true,
                dayMoments: true,
                infusionTime: true,
                dosage: true,
                temperature: true,
                preparation: true,
                origin: true,
                pairing: true,
                price: true,
                stock: true,
                isActive: true,
            },
        });
        // Map to match frontend expectation of basePrice
        const mapped = ingredients.map(ing => ({ ...ing, basePrice: ing.price }));
        res.json(mapped);
    }
    catch (error) {
        console.error('Error fetching ingredients:', error);
        res.status(500).json({ error: 'Failed to fetch ingredients' });
    }
});
// Get single ingredient
app.get('/api/ingredients/:id', async (req, res) => {
    try {
        const ingredient = await prisma.ingredient.findUnique({
            where: { id: req.params.id },
        });
        if (!ingredient) {
            return res.status(404).json({ error: 'Ingredient not found' });
        }
        res.json(ingredient);
    }
    catch (error) {
        console.error('Error fetching ingredient:', error);
        res.status(500).json({ error: 'Failed to fetch ingredient' });
    }
});
const mapProductVariant = (variant) => ({
    id: variant.id,
    productId: variant.productId,
    sku: variant.sku,
    priceCents: variant.priceCents,
    stockQty: variant.stockQty,
    imageUrl: variant.imageUrl,
    isActive: variant.isActive,
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
    optionValues: (variant.optionValues || []).map((value) => ({
        id: value.optionValue.id,
        value: value.optionValue.value,
        optionId: value.optionValue.optionId,
        position: value.optionValue.position,
        optionName: value.optionValue.option.name,
    })),
});
const mapProductForApi = (product) => {
    const variants = (product.variants || []).map(mapProductVariant);
    return {
        ...product,
        variants,
        defaultVariant: variants[0] || null,
    };
};
const mapAdminProductForApi = (product) => {
    const variants = (product.variants || []).map(mapProductVariant);
    return {
        ...product,
        variants,
    };
};
// Products (public)
app.get('/api/products', async (req, res) => {
    try {
        const type = typeof req.query.type === 'string' ? req.query.type : undefined;
        const products = await prisma.product.findMany({
            where: {
                isActive: true,
                ...(type ? { type } : {}),
            },
            orderBy: { createdAt: 'desc' },
            include: {
                options: {
                    orderBy: { position: 'asc' },
                    include: { values: { orderBy: { position: 'asc' } } },
                },
                variants: {
                    where: { isActive: true },
                    orderBy: { createdAt: 'asc' },
                    include: {
                        optionValues: {
                            include: {
                                optionValue: { include: { option: true } },
                            },
                        },
                    },
                },
            },
        });
        res.json(products.map(mapProductForApi));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});
// Uploads (admin)
app.post('/api/admin/uploads', (req, res) => {
    upload.single('file')(req, res, (error) => {
        if (error) {
            const message = error instanceof multer.MulterError ? error.message : error.message || 'Upload failed';
            res.status(400).json({ error: message });
            return;
        }
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        const folder = req.uploadFolder || 'misc';
        const publicPath = `/media/${folder}/${req.file.filename}`;
        res.json({ url: `${PUBLIC_BASE_URL}${publicPath}`, path: publicPath });
    });
});
app.post('/api/admin/media/cleanup', async (req, res) => {
    try {
        const dryRun = String(req.query.dryRun || '').toLowerCase() === 'true';
        const [ingredients, products, listings] = await Promise.all([
            prisma.ingredient.findMany({ select: { image: true } }),
            prisma.product.findMany({
                select: {
                    images: true,
                    variants: { select: { imageUrl: true } },
                },
            }),
            prisma.blendListing.findMany({ select: { coverImageUrl: true } }),
        ]);
        const used = new Set();
        ingredients.forEach((item) => {
            const pathValue = extractMediaPath(item.image);
            if (pathValue)
                used.add(pathValue);
        });
        listings.forEach((item) => {
            const pathValue = extractMediaPath(item.coverImageUrl || null);
            if (pathValue)
                used.add(pathValue);
        });
        products.forEach((product) => {
            (product.images || []).forEach((image) => {
                const pathValue = extractMediaPath(image);
                if (pathValue)
                    used.add(pathValue);
            });
            (product.variants || []).forEach((variant) => {
                const pathValue = extractMediaPath(variant.imageUrl || null);
                if (pathValue)
                    used.add(pathValue);
            });
        });
        const files = listMediaFiles(MEDIA_DIR);
        const orphans = files.filter((file) => !used.has(`/media/${file.relative}`));
        if (!dryRun) {
            orphans.forEach((file) => {
                fs.unlinkSync(file.absolute);
            });
        }
        res.json({
            dryRun,
            totalFiles: files.length,
            usedCount: used.size,
            orphanCount: orphans.length,
            removed: dryRun ? [] : orphans.map((file) => `/media/${file.relative}`),
            orphans: orphans.map((file) => `/media/${file.relative}`),
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Cleanup failed' });
    }
});
app.get('/api/products/:slug', async (req, res) => {
    try {
        const product = await prisma.product.findUnique({
            where: { slug: req.params.slug },
            include: {
                options: {
                    orderBy: { position: 'asc' },
                    include: { values: { orderBy: { position: 'asc' } } },
                },
                variants: {
                    where: { isActive: true },
                    orderBy: { createdAt: 'asc' },
                    include: {
                        optionValues: {
                            include: {
                                optionValue: { include: { option: true } },
                            },
                        },
                    },
                },
            },
        });
        if (!product || !product.isActive) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(mapProductForApi(product));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch product' });
    }
});
// Products (admin)
app.get('/api/admin/products', async (_req, res) => {
    try {
        const products = await prisma.product.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                options: {
                    orderBy: { position: 'asc' },
                    include: { values: { orderBy: { position: 'asc' } } },
                },
                variants: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        optionValues: {
                            include: {
                                optionValue: { include: { option: true } },
                            },
                        },
                    },
                },
            },
        });
        res.json(products.map(mapAdminProductForApi));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});
app.get('/api/admin/products/:id', async (req, res) => {
    try {
        const product = await prisma.product.findUnique({
            where: { id: req.params.id },
            include: {
                options: {
                    orderBy: { position: 'asc' },
                    include: { values: { orderBy: { position: 'asc' } } },
                },
                variants: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        optionValues: {
                            include: {
                                optionValue: { include: { option: true } },
                            },
                        },
                    },
                },
            },
        });
        if (!product)
            return res.status(404).json({ error: 'Product not found' });
        res.json(mapAdminProductForApi(product));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch product' });
    }
});
app.post('/api/admin/products', async (req, res) => {
    try {
        const { title, slug, type, description, isActive, images, priceCents, stockQty } = req.body;
        if (!title || !slug) {
            return res.status(400).json({ error: 'title and slug are required' });
        }
        const product = await prisma.product.create({
            data: {
                title,
                slug,
                type: type || 'ACCESSORY',
                description: description || null,
                isActive: typeof isActive === 'boolean' ? isActive : true,
                images: Array.isArray(images) ? images : [],
                priceCents: typeof priceCents === 'number' ? priceCents : 0,
                stockQty: typeof stockQty === 'number' ? stockQty : null,
            },
        });
        res.status(201).json(product);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create product' });
    }
});
app.patch('/api/admin/products/:id', async (req, res) => {
    try {
        const { title, slug, type, description, isActive, images, priceCents, stockQty } = req.body;
        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: {
                ...(title !== undefined ? { title } : {}),
                ...(slug !== undefined ? { slug } : {}),
                ...(type !== undefined ? { type } : {}),
                ...(description !== undefined ? { description } : {}),
                ...(isActive !== undefined ? { isActive } : {}),
                ...(images !== undefined ? { images: Array.isArray(images) ? images : [] } : {}),
                ...(priceCents !== undefined ? { priceCents: typeof priceCents === 'number' ? priceCents : 0 } : {}),
                ...(stockQty !== undefined ? { stockQty: typeof stockQty === 'number' ? stockQty : null } : {}),
            },
        });
        res.json(product);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update product' });
    }
});
app.delete('/api/admin/products/:id', async (req, res) => {
    try {
        await prisma.product.delete({ where: { id: req.params.id } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete product' });
    }
});
// Product options (admin)
app.get('/api/admin/products/:id/options', async (req, res) => {
    try {
        const options = await prisma.productOption.findMany({
            where: { productId: req.params.id },
            orderBy: { position: 'asc' },
            include: { values: { orderBy: { position: 'asc' } } },
        });
        res.json(options);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch options' });
    }
});
app.post('/api/admin/products/:id/options', async (req, res) => {
    try {
        const { name, position } = req.body;
        if (!name)
            return res.status(400).json({ error: 'name is required' });
        const option = await prisma.productOption.create({
            data: {
                productId: req.params.id,
                name,
                position: typeof position === 'number' ? position : 0,
            },
        });
        res.status(201).json(option);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create option' });
    }
});
app.patch('/api/admin/options/:id', async (req, res) => {
    try {
        const { name, position } = req.body;
        const option = await prisma.productOption.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined ? { name } : {}),
                ...(position !== undefined ? { position } : {}),
            },
        });
        res.json(option);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update option' });
    }
});
app.delete('/api/admin/options/:id', async (req, res) => {
    try {
        await prisma.productOption.delete({ where: { id: req.params.id } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete option' });
    }
});
app.post('/api/admin/options/:id/values', async (req, res) => {
    try {
        const { value, position } = req.body;
        if (!value)
            return res.status(400).json({ error: 'value is required' });
        const optionValue = await prisma.productOptionValue.create({
            data: {
                optionId: req.params.id,
                value,
                position: typeof position === 'number' ? position : 0,
            },
        });
        res.status(201).json(optionValue);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create option value' });
    }
});
app.patch('/api/admin/option-values/:id', async (req, res) => {
    try {
        const { value, position } = req.body;
        const optionValue = await prisma.productOptionValue.update({
            where: { id: req.params.id },
            data: {
                ...(value !== undefined ? { value } : {}),
                ...(position !== undefined ? { position } : {}),
            },
        });
        res.json(optionValue);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update option value' });
    }
});
app.delete('/api/admin/option-values/:id', async (req, res) => {
    try {
        await prisma.productOptionValue.delete({ where: { id: req.params.id } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete option value' });
    }
});
// Product variants (admin)
app.get('/api/admin/products/:id/variants', async (req, res) => {
    try {
        const variants = await prisma.productVariant.findMany({
            where: { productId: req.params.id },
            orderBy: { createdAt: 'asc' },
            include: {
                optionValues: {
                    include: {
                        optionValue: { include: { option: true } },
                    },
                },
            },
        });
        res.json(variants.map(mapProductVariant));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch variants' });
    }
});
app.post('/api/admin/products/:id/variants', async (req, res) => {
    try {
        const { sku, priceCents, stockQty, imageUrl, isActive, optionValueIds } = req.body;
        if (priceCents === undefined || priceCents === null) {
            return res.status(400).json({ error: 'priceCents is required' });
        }
        const variant = await prisma.productVariant.create({
            data: {
                productId: req.params.id,
                sku: sku || null,
                priceCents,
                stockQty: typeof stockQty === 'number' ? stockQty : null,
                imageUrl: imageUrl || null,
                isActive: typeof isActive === 'boolean' ? isActive : true,
            },
        });
        if (Array.isArray(optionValueIds) && optionValueIds.length > 0) {
            await prisma.variantOptionValue.createMany({
                data: optionValueIds.map((optionValueId) => ({
                    variantId: variant.id,
                    optionValueId,
                })),
                skipDuplicates: true,
            });
        }
        const updated = await prisma.productVariant.findUnique({
            where: { id: variant.id },
            include: { optionValues: { include: { optionValue: { include: { option: true } } } } },
        });
        res.status(201).json(mapProductVariant(updated));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create variant' });
    }
});
app.patch('/api/admin/variants/:id', async (req, res) => {
    try {
        const { sku, priceCents, stockQty, imageUrl, isActive, optionValueIds } = req.body;
        const variant = await prisma.productVariant.update({
            where: { id: req.params.id },
            data: {
                ...(sku !== undefined ? { sku } : {}),
                ...(priceCents !== undefined ? { priceCents } : {}),
                ...(stockQty !== undefined ? { stockQty } : {}),
                ...(imageUrl !== undefined ? { imageUrl } : {}),
                ...(isActive !== undefined ? { isActive } : {}),
            },
        });
        if (Array.isArray(optionValueIds)) {
            await prisma.variantOptionValue.deleteMany({ where: { variantId: variant.id } });
            if (optionValueIds.length > 0) {
                await prisma.variantOptionValue.createMany({
                    data: optionValueIds.map((optionValueId) => ({
                        variantId: variant.id,
                        optionValueId,
                    })),
                    skipDuplicates: true,
                });
            }
        }
        const updated = await prisma.productVariant.findUnique({
            where: { id: variant.id },
            include: { optionValues: { include: { optionValue: { include: { option: true } } } } },
        });
        res.json(mapProductVariant(updated));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update variant' });
    }
});
app.delete('/api/admin/variants/:id', async (req, res) => {
    try {
        await prisma.productVariant.delete({ where: { id: req.params.id } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete variant' });
    }
});
// Packs (admin)
app.get('/api/admin/packs', async (_req, res) => {
    try {
        const packs = await prisma.product.findMany({
            where: { type: 'PACK' },
            include: {
                variants: true,
                packItems: { include: { componentVariant: { include: { product: true } } } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(packs);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch packs' });
    }
});
app.get('/api/admin/packs/:id/items', async (req, res) => {
    try {
        const items = await prisma.packItem.findMany({
            where: { packProductId: req.params.id },
            include: { componentVariant: { include: { product: true } } },
            orderBy: { id: 'asc' },
        });
        res.json(items);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch pack items' });
    }
});
app.post('/api/admin/packs/:id/items', async (req, res) => {
    try {
        const { componentVariantId, qty } = req.body;
        if (!componentVariantId) {
            return res.status(400).json({ error: 'componentVariantId is required' });
        }
        const packProduct = await prisma.product.findUnique({ where: { id: req.params.id } });
        if (!packProduct || packProduct.type !== 'PACK') {
            return res.status(404).json({ error: 'Pack product not found' });
        }
        const componentVariant = await prisma.productVariant.findUnique({ where: { id: componentVariantId } });
        if (!componentVariant) {
            return res.status(404).json({ error: 'Component variant not found' });
        }
        const created = await prisma.packItem.upsert({
            where: { packProductId_componentVariantId: { packProductId: req.params.id, componentVariantId } },
            update: { qty: Math.max(1, qty || 1) },
            create: { packProductId: req.params.id, componentVariantId, qty: Math.max(1, qty || 1) },
        });
        res.status(201).json(created);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create pack item' });
    }
});
app.patch('/api/admin/pack-items/:id', async (req, res) => {
    try {
        const { qty } = req.body;
        const updated = await prisma.packItem.update({
            where: { id: req.params.id },
            data: { qty: Math.max(1, qty || 1) },
        });
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update pack item' });
    }
});
app.delete('/api/admin/pack-items/:id', async (req, res) => {
    try {
        await prisma.packItem.delete({ where: { id: req.params.id } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete pack item' });
    }
});
// Subscription plans
app.get('/api/admin/subscription-plans', async (_req, res) => {
    try {
        const plans = await prisma.subscriptionPlan.findMany({
            include: { product: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(plans);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch subscription plans' });
    }
});
app.post('/api/admin/subscription-plans', async (req, res) => {
    try {
        const { productId, interval, intervalCount, stripePriceId, isActive } = req.body;
        if (!productId || !stripePriceId) {
            return res.status(400).json({ error: 'productId and stripePriceId are required' });
        }
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product || product.type !== 'SUBSCRIPTION') {
            return res.status(404).json({ error: 'Subscription product not found' });
        }
        const plan = await prisma.subscriptionPlan.create({
            data: {
                productId,
                interval: interval || 'month',
                intervalCount: intervalCount || 1,
                stripePriceId,
                isActive: typeof isActive === 'boolean' ? isActive : true,
            },
        });
        res.status(201).json(plan);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create subscription plan' });
    }
});
app.patch('/api/admin/subscription-plans/:id', async (req, res) => {
    try {
        const { interval, intervalCount, stripePriceId, isActive } = req.body;
        const plan = await prisma.subscriptionPlan.update({
            where: { id: req.params.id },
            data: {
                ...(interval !== undefined ? { interval } : {}),
                ...(intervalCount !== undefined ? { intervalCount } : {}),
                ...(stripePriceId !== undefined ? { stripePriceId } : {}),
                ...(isActive !== undefined ? { isActive } : {}),
            },
        });
        res.json(plan);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update subscription plan' });
    }
});
app.delete('/api/admin/subscription-plans/:id', async (req, res) => {
    try {
        await prisma.subscriptionPlan.delete({ where: { id: req.params.id } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete subscription plan' });
    }
});
app.get('/api/subscription-plans', async (_req, res) => {
    try {
        const plans = await prisma.subscriptionPlan.findMany({
            where: { isActive: true, product: { isActive: true } },
            include: { product: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(plans);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch subscription plans' });
    }
});
// Blend listings
app.get('/api/blend-listings', async (_req, res) => {
    try {
        const listings = await prisma.blendListing.findMany({
            where: { isActive: true },
            include: {
                blend: { include: { ingredients: { include: { ingredient: true } } } },
                createdFromOrder: {
                    select: {
                        id: true,
                        orderNumber: true,
                        customer: {
                            select: {
                                firstName: true,
                                lastName: true,
                            },
                        },
                    },
                },
            },
            orderBy: [{ ranking: 'asc' }, { createdAt: 'desc' }],
        });
        res.json(listings);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch blend listings' });
    }
});
app.get('/api/blend-listings/:slug', async (req, res) => {
    try {
        const listing = await prisma.blendListing.findUnique({
            where: { slug: req.params.slug },
            include: {
                blend: { include: { ingredients: { include: { ingredient: true } } } },
                createdFromOrder: {
                    select: {
                        id: true,
                        orderNumber: true,
                        customer: {
                            select: {
                                firstName: true,
                                lastName: true,
                            },
                        },
                    },
                },
            },
        });
        if (!listing || !listing.isActive) {
            return res.status(404).json({ error: 'Blend listing not found' });
        }
        res.json(listing);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch blend listing' });
    }
});
app.get('/api/admin/blend-listings', async (_req, res) => {
    try {
        const listings = await prisma.blendListing.findMany({
            include: {
                blend: {
                    include: {
                        ingredients: {
                            include: {
                                ingredient: {
                                    select: { id: true, name: true, category: true, color: true },
                                },
                            },
                        },
                    },
                },
                createdFromOrder: { select: { id: true, orderNumber: true } },
            },
            orderBy: [{ ranking: 'asc' }, { createdAt: 'desc' }],
        });
        res.json(listings);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch blend listings' });
    }
});
app.get('/api/admin/blend-listings/:id', async (req, res) => {
    try {
        const listing = await prisma.blendListing.findUnique({
            where: { id: req.params.id },
            include: {
                blend: {
                    include: {
                        ingredients: {
                            include: {
                                ingredient: {
                                    select: { id: true, name: true, category: true, color: true },
                                },
                            },
                        },
                    },
                },
                createdFromOrder: { select: { id: true, orderNumber: true } },
            },
        });
        if (!listing)
            return res.status(404).json({ error: 'Blend listing not found' });
        res.json(listing);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch blend listing' });
    }
});
app.post('/api/admin/blend-listings', async (req, res) => {
    try {
        const { blendId, blend, title, slug, description, coverImageUrl, isActive, createdFromOrderId, createdBy, ranking } = req.body;
        if (!title) {
            return res.status(400).json({ error: 'title is required' });
        }
        const resolvedRanking = parseBlendListingRanking(ranking, 0);
        if (resolvedRanking === null) {
            return res.status(400).json({ error: 'ranking must be a non-negative integer' });
        }
        const normalizedCreatedFromOrderId = typeof createdFromOrderId === 'string' ? createdFromOrderId.trim() : '';
        let resolvedCreatedFromOrderId = null;
        if (normalizedCreatedFromOrderId) {
            const sourceOrder = await prisma.order.findFirst({
                where: {
                    OR: [{ id: normalizedCreatedFromOrderId }, { orderNumber: normalizedCreatedFromOrderId }],
                },
                select: { id: true },
            });
            if (!sourceOrder) {
                return res.status(400).json({ error: 'createdFromOrderId is invalid' });
            }
            resolvedCreatedFromOrderId = sourceOrder.id;
        }
        const normalizedCreatedBy = typeof createdBy === 'string' ? createdBy.trim() : '';
        const resolvedCreatedBy = normalizedCreatedBy || null;
        let resolvedBlendId = blendId || null;
        if (resolvedBlendId) {
            const existingBlend = await prisma.blend.findUnique({ where: { id: resolvedBlendId }, select: { id: true } });
            if (!existingBlend) {
                return res.status(400).json({ error: 'blendId is invalid' });
            }
        }
        else {
            const blendName = typeof blend.name === 'string' ? blend.name.trim() : '';
            if (!blendName) {
                return res.status(400).json({ error: 'blend.name is required when blendId is not provided' });
            }
            const ingredientIds = normalizeIngredientIds(blend.ingredientIds);
            if (ingredientIds.length === 0) {
                return res.status(400).json({ error: 'blend.ingredientIds must contain at least one ingredientId' });
            }
            const ingredients = await prisma.ingredient.findMany({
                where: { id: { in: ingredientIds } },
                select: { id: true },
            });
            if (ingredients.length !== ingredientIds.length) {
                return res.status(400).json({ error: 'One or more blend.ingredientIds are invalid' });
            }
            const blendDescription = typeof blend.description === 'string' ? blend.description.trim() : null;
            const blendCoverImageUrl = typeof blend.coverImageUrl === 'string' ? blend.coverImageUrl.trim() : null;
            const createdBlend = await prisma.blend.create({
                data: {
                    name: blendName,
                    description: blendDescription && blendDescription.length > 0 ? blendDescription : null,
                    color: typeof blend.color === 'string' && blend.color.trim() ? blend.color.trim() : '#C4A77D',
                    coverImageUrl: blendCoverImageUrl && blendCoverImageUrl.length > 0 ? blendCoverImageUrl : null,
                    ingredients: {
                        create: ingredientIds.map((ingredientId) => ({ ingredientId, quantity: 1 })),
                    },
                },
                select: { id: true },
            });
            resolvedBlendId = createdBlend.id;
        }
        const uniqueSlug = await ensureUniqueBlendListingSlug(slug || title);
        const listing = await prisma.blendListing.create({
            data: {
                blendId: resolvedBlendId,
                createdFromOrderId: resolvedCreatedFromOrderId,
                createdBy: resolvedCreatedBy,
                title,
                slug: uniqueSlug,
                description: description || null,
                coverImageUrl: coverImageUrl || null,
                isActive: typeof isActive === 'boolean' ? isActive : false,
                ranking: resolvedRanking,
            },
        });
        res.status(201).json(listing);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create blend listing' });
    }
});
app.patch('/api/admin/blend-listings/:id', async (req, res) => {
    try {
        const { title, slug, description, coverImageUrl, isActive, createdFromOrderId, createdBy, blendId, blend, ranking } = req.body;
        const existing = await prisma.blendListing.findUnique({
            where: { id: req.params.id },
            include: { blend: { include: { ingredients: true } } },
        });
        if (!existing)
            return res.status(404).json({ error: 'Blend listing not found' });

        let resolvedRanking = undefined;
        if (ranking !== undefined) {
            const parsedRanking = parseBlendListingRanking(ranking, existing.ranking);
            if (parsedRanking === null) {
                return res.status(400).json({ error: 'ranking must be a non-negative integer' });
            }
            resolvedRanking = parsedRanking;
        }

        let resolvedCreatedFromOrderId = undefined;
        if (createdFromOrderId !== undefined) {
            const normalizedCreatedFromOrderId = typeof createdFromOrderId === 'string' ? createdFromOrderId.trim() : '';
            if (!normalizedCreatedFromOrderId) {
                resolvedCreatedFromOrderId = null;
            }
            else {
                const sourceOrder = await prisma.order.findFirst({
                    where: {
                        OR: [{ id: normalizedCreatedFromOrderId }, { orderNumber: normalizedCreatedFromOrderId }],
                    },
                    select: { id: true },
                });
                if (!sourceOrder) {
                    return res.status(400).json({ error: 'createdFromOrderId is invalid' });
                }
                resolvedCreatedFromOrderId = sourceOrder.id;
            }
        }

        let resolvedCreatedBy = undefined;
        if (createdBy !== undefined) {
            const normalizedCreatedBy = typeof createdBy === 'string' ? createdBy.trim() : '';
            resolvedCreatedBy = normalizedCreatedBy || null;
        }

        let nextBlendId = existing.blendId;
        if (blendId && blendId !== existing.blendId) {
            const targetBlend = await prisma.blend.findUnique({ where: { id: blendId }, select: { id: true } });
            if (!targetBlend) {
                return res.status(400).json({ error: 'blendId is invalid' });
            }
            nextBlendId = blendId;
        }

        if (blend) {
            const ingredientIds = normalizeIngredientIds(blend.ingredientIds);
            if (blend.ingredientIds !== undefined) {
                if (ingredientIds.length === 0) {
                    return res.status(400).json({ error: 'blend.ingredientIds must contain at least one ingredientId' });
                }
                const ingredients = await prisma.ingredient.findMany({
                    where: { id: { in: ingredientIds } },
                    select: { id: true },
                });
                if (ingredients.length !== ingredientIds.length) {
                    return res.status(400).json({ error: 'One or more blend.ingredientIds are invalid' });
                }
            }

            const blendData = {};
            if (typeof blend.name === 'string') {
                blendData.name = blend.name.trim() || existing.blend.name;
            }
            if (blend.description !== undefined) {
                blendData.description =
                    typeof blend.description === 'string' && blend.description.trim().length > 0
                        ? blend.description.trim()
                        : null;
            }
            if (typeof blend.color === 'string') {
                blendData.color = blend.color.trim() || existing.blend.color;
            }
            if (blend.coverImageUrl !== undefined) {
                blendData.coverImageUrl =
                    typeof blend.coverImageUrl === 'string' && blend.coverImageUrl.trim().length > 0
                        ? blend.coverImageUrl.trim()
                        : null;
            }
            if (Object.keys(blendData).length > 0) {
                await prisma.blend.update({
                    where: { id: nextBlendId },
                    data: blendData,
                });
            }
            if (blend.ingredientIds !== undefined) {
                await prisma.$transaction([
                    prisma.blendIngredient.deleteMany({ where: { blendId: nextBlendId } }),
                    prisma.blendIngredient.createMany({
                        data: ingredientIds.map((ingredientId) => ({
                            blendId: nextBlendId,
                            ingredientId,
                            quantity: 1,
                        })),
                    }),
                ]);
            }
        }

        let nextSlug = existing.slug;
        if (slug || title) {
            const base = slug || title || existing.title;
            const normalized = slugify(base);
            if (normalized && normalized !== existing.slug) {
                nextSlug = await ensureUniqueBlendListingSlug(base);
            }
        }

        const listing = await prisma.blendListing.update({
            where: { id: req.params.id },
            data: {
                ...(nextBlendId !== existing.blendId ? { blendId: nextBlendId } : {}),
                ...(createdFromOrderId !== undefined ? { createdFromOrderId: resolvedCreatedFromOrderId } : {}),
                ...(createdBy !== undefined ? { createdBy: resolvedCreatedBy } : {}),
                ...(title !== undefined ? { title } : {}),
                ...(slug !== undefined || title !== undefined ? { slug: nextSlug } : {}),
                ...(description !== undefined ? { description } : {}),
                ...(coverImageUrl !== undefined ? { coverImageUrl } : {}),
                ...(isActive !== undefined ? { isActive } : {}),
                ...(resolvedRanking !== undefined ? { ranking: resolvedRanking } : {}),
            },
        });
        res.json(listing);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update blend listing' });
    }
});
app.delete('/api/admin/blend-listings/:id', async (req, res) => {
    try {
        const existing = await prisma.blendListing.findUnique({
            where: { id: req.params.id },
            select: { id: true },
        });
        if (!existing)
            return res.status(404).json({ error: 'Blend listing not found' });
        await prisma.blendListing.delete({ where: { id: req.params.id } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete blend listing' });
    }
});
// Customers (admin)
app.get('/api/admin/customers', async (_req, res) => {
    try {
        const customers = await prisma.customer.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                email: true,
                authProvider: true,
                salutation: true,
                firstName: true,
                lastName: true,
                birthDate: true,
                phoneE164: true,
                createdAt: true,
                carts: { select: { id: true, status: true } },
                orders: { select: { id: true, status: true } },
                addresses: {
                    select: {
                        id: true,
                        address1: true,
                        address2: true,
                        postalCode: true,
                        city: true,
                        countryCode: true,
                        phoneE164: true,
                        isDefaultBilling: true,
                        isDefaultShipping: true,
                    },
                },
            },
        });
        res.json(customers);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});
app.get('/api/admin/customers/:id', async (req, res) => {
    try {
        const customer = await prisma.customer.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                email: true,
                authProvider: true,
                salutation: true,
                firstName: true,
                lastName: true,
                birthDate: true,
                phoneE164: true,
                createdAt: true,
                carts: { select: { id: true, status: true } },
                orders: { select: { id: true, status: true } },
                addresses: {
                    select: {
                        id: true,
                        address1: true,
                        address2: true,
                        postalCode: true,
                        city: true,
                        countryCode: true,
                        phoneE164: true,
                        isDefaultBilling: true,
                        isDefaultShipping: true,
                    },
                },
            },
        });
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        const wishlistsCount = (await listWishlistRows(customer.id)).length;
        res.json({ ...customer, wishlistsCount });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch customer' });
    }
});
app.get('/api/admin/customers/:id/wishlists', async (req, res) => {
    try {
        const customer = await prisma.customer.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
            },
        });
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        const wishlists = (await listWishlistRows(customer.id)).map(serializeWishlistCreation);
        res.json({ customer, wishlists });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch customer wishlists' });
    }
});
app.delete('/api/admin/customers/:id', async (req, res) => {
    try {
        const customer = await prisma.customer.findUnique({
            where: { id: req.params.id },
            select: { id: true },
        });
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        const wishlists = await listWishlistRows(customer.id);
        for (const wishlist of wishlists) {
            await deleteWishlistRow(customer.id, wishlist.id);
        }
        await prisma.$transaction(async (tx) => {
            await tx.order.deleteMany({ where: { customerId: customer.id } });
            await tx.cart.deleteMany({ where: { customerId: customer.id } });
            await tx.subscription.deleteMany({ where: { customerId: customer.id } });
            await tx.address.deleteMany({ where: { customerId: customer.id } });
            await tx.session.deleteMany({ where: { customerId: customer.id } });
            await tx.passwordResetToken.deleteMany({ where: { customerId: customer.id } });
            await tx.emailPreference.deleteMany({ where: { customerId: customer.id } });
            await tx.emailCampaignLog.deleteMany({ where: { customerId: customer.id } });
            await tx.emailDelivery.deleteMany({ where: { customerId: customer.id } });
            await tx.customer.delete({ where: { id: customer.id } });
        });
        res.status(204).send();
    }
    catch (error) {
        console.error('Error deleting customer:', error);
        res.status(500).json({ error: 'Failed to delete customer' });
    }
});
// Carts (admin)
app.get('/api/admin/carts', async (_req, res) => {
    try {
        const carts = await prisma.cart.findMany({
            where: { status: 'ACTIVE' },
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                customer: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        authProvider: true,
                    },
                },
                items: {
                    select: {
                        id: true,
                        itemType: true,
                        qty: true,
                        unitPriceCents: true,
                        snapshot: true,
                        subscriptionPlanId: true,
                    },
                },
            },
        });
        res.json(carts);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch carts' });
    }
});
// Store settings (admin)
app.get('/api/admin/store-settings', async (_req, res) => {
    try {
        const settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
        if (!settings) {
            const created = await prisma.storeSettings.create({
                data: { id: 'default', freeShippingThresholdCents: 4500, defaultShippingCents: 550, currency: 'EUR' },
            });
            return res.json(created);
        }
        res.json(settings);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch store settings' });
    }
});
app.patch('/api/admin/store-settings', async (req, res) => {
    try {
        const { freeShippingThresholdCents, defaultShippingCents, currency } = req.body;
        const settings = await prisma.storeSettings.upsert({
            where: { id: 'default' },
            update: {
                ...(freeShippingThresholdCents !== undefined ? { freeShippingThresholdCents } : {}),
                ...(defaultShippingCents !== undefined ? { defaultShippingCents } : {}),
                ...(currency !== undefined ? { currency } : {}),
            },
            create: {
                id: 'default',
                freeShippingThresholdCents: freeShippingThresholdCents ?? 4500,
                defaultShippingCents: defaultShippingCents ?? 550,
                currency: typeof currency === 'string' && currency.trim().length > 0 ? currency.trim() : 'EUR',
            },
        });
        res.json(settings);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update store settings' });
    }
});
// Automation jobs (admin)
app.get('/api/admin/automation/jobs', async (_req, res) => {
    try {
        const configs = await listAutomationJobConfigs();
        res.json(configs.map(serializeAutomationJobConfig));
    }
    catch (error) {
        console.error('Error fetching automation jobs:', error);
        res.status(500).json({ error: 'Failed to fetch automation jobs' });
    }
});
app.patch('/api/admin/automation/jobs/:id', async (req, res) => {
    try {
        const jobIdRaw = req.params.id;
        if (!isAutomationJobId(jobIdRaw)) {
            return res.status(404).json({ error: 'Automation job not found' });
        }
        const hasEnabled = req.body.enabled !== undefined;
        if (hasEnabled && typeof req.body.enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled must be a boolean' });
        }
        const enabled = hasEnabled ? req.body.enabled : undefined;
        const hasIntervalMs = req.body.intervalMs !== undefined;
        const hasIntervalMinutes = req.body.intervalMinutes !== undefined;
        const hasInterval = hasIntervalMs || hasIntervalMinutes;
        const intervalMsInput = hasIntervalMs
            ? Number(req.body.intervalMs)
            : (hasIntervalMinutes ? Number(req.body.intervalMinutes) * 60 * 1000 : undefined);
        if (!hasEnabled && !hasInterval) {
            return res.status(400).json({ error: 'enabled or intervalMs/intervalMinutes is required' });
        }
        let intervalMs;
        if (hasInterval) {
            if (!Number.isFinite(intervalMsInput) || intervalMsInput <= 0) {
                return res.status(400).json({ error: 'intervalMs must be a positive number' });
            }
            intervalMs = clampAutomationIntervalMs(intervalMsInput);
        }
        await updateAutomationJobConfig({
            jobId: jobIdRaw,
            ...(hasEnabled ? { enabled } : {}),
            ...(intervalMs !== undefined ? { intervalMs } : {}),
        });
        await scheduleAutomationJobs();
        const updated = await getAutomationJobConfig(jobIdRaw);
        if (!updated) {
            return res.status(404).json({ error: 'Automation job not found' });
        }
        res.json(serializeAutomationJobConfig(updated));
    }
    catch (error) {
        console.error('Error updating automation job:', error);
        res.status(500).json({ error: 'Failed to update automation job' });
    }
});
app.post('/api/admin/automation/jobs/:id/run', async (req, res) => {
    try {
        const jobIdRaw = req.params.id;
        if (!isAutomationJobId(jobIdRaw)) {
            return res.status(404).json({ error: 'Automation job not found' });
        }
        const result = await executeAutomationJob(jobIdRaw, 'manual');
        const updated = await getAutomationJobConfig(jobIdRaw);
        const payload = updated ? serializeAutomationJobConfig(updated) : null;
        if (result.status === 'ERROR') {
            return res.status(500).json({
                error: result.message,
                result,
                job: payload,
            });
        }
        res.json({
            result,
            job: payload,
        });
    }
    catch (error) {
        console.error('Error running automation job:', error);
        res.status(500).json({ error: 'Failed to run automation job' });
    }
});
// Emails (admin)
app.get('/api/admin/emails', async (req, res) => {
    try {
        const page = Number(req.query.page || 1);
        const pageSize = Number(req.query.pageSize || 50);
        const status = typeof req.query.status === 'string' ? req.query.status : null;
        const type = typeof req.query.type === 'string' ? req.query.type : null;
        const recipient = typeof req.query.recipient === 'string' ? req.query.recipient : null;
        const data = await listEmailDeliveries({
            page,
            pageSize,
            status,
            type,
            recipient,
        });
        res.json(data);
    }
    catch (error) {
        console.error('Error fetching email deliveries:', error);
        res.status(500).json({ error: 'Failed to fetch email deliveries' });
    }
});
app.get('/api/admin/emails/metrics', async (req, res) => {
    try {
        await ensureOrderWorkflowTables();
        const days = Math.max(1, Math.min(365, Number(req.query.days || 30)));
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const aggregates = await prisma.$queryRaw `
      SELECT
        COUNT(*)::int AS "total",
        COUNT(*) FILTER (WHERE "status" = 'SENT')::int AS "sent",
        COUNT(*) FILTER (WHERE "status" = 'FAILED')::int AS "failed",
        COUNT(*) FILTER (WHERE "status" = 'RETRY')::int AS "retry",
        COUNT(*) FILTER (WHERE "status" = 'PENDING')::int AS "pending"
      FROM "EmailDelivery"
      WHERE "createdAt" >= ${cutoff}
    `;
        const campaignBreakdown = await prisma.$queryRaw `
      SELECT
        "type",
        COUNT(*)::int AS "total",
        COUNT(*) FILTER (WHERE "status" = 'SENT')::int AS "sent",
        COUNT(*) FILTER (WHERE "status" = 'FAILED')::int AS "failed"
      FROM "EmailDelivery"
      WHERE "createdAt" >= ${cutoff}
        AND "campaignKey" IS NOT NULL
      GROUP BY "type"
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `;
        const conversionRows = await prisma.$queryRaw `
      SELECT
        COUNT(DISTINCT l."id")::int AS "touches",
        COUNT(DISTINCT o."id")::int AS "conversions",
        COALESCE(SUM(o."totalCents"), 0)::bigint AS "revenueCents"
      FROM "EmailCampaignLog" l
      LEFT JOIN "Order" o
        ON o."customerId" = l."customerId"
       AND o."createdAt" > l."createdAt"
       AND o."createdAt" <= (l."createdAt" + INTERVAL '7 days')
       AND (
         o."paymentStatus" = 'completed'
         OR o."status" IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
       )
      WHERE l."createdAt" >= ${cutoff}
    `;
        const summary = Array.isArray(aggregates) && aggregates.length > 0 ? aggregates[0] : {
            total: 0,
            sent: 0,
            failed: 0,
            retry: 0,
            pending: 0,
        };
        const conversion = Array.isArray(conversionRows) && conversionRows.length > 0 ? conversionRows[0] : {
            touches: 0,
            conversions: 0,
            revenueCents: 0,
        };
        res.json({
            days,
            summary: {
                total: Number(summary.total || 0),
                sent: Number(summary.sent || 0),
                failed: Number(summary.failed || 0),
                retry: Number(summary.retry || 0),
                pending: Number(summary.pending || 0),
            },
            conversion: {
                touches: Number(conversion.touches || 0),
                conversions: Number(conversion.conversions || 0),
                conversionRate: Number(conversion.touches || 0) > 0
                    ? Number(conversion.conversions || 0) / Number(conversion.touches || 1)
                    : 0,
                revenueCents: Number(conversion.revenueCents || 0),
            },
            campaigns: Array.isArray(campaignBreakdown) ? campaignBreakdown : [],
        });
    }
    catch (error) {
        console.error('Error fetching email metrics:', error);
        res.status(500).json({ error: 'Failed to fetch email metrics' });
    }
});
app.post('/api/admin/emails/test', async (req, res) => {
    try {
        const to = normalizeEmail(req.body?.to);
        if (!to) {
            return res.status(400).json({ error: 'Valid "to" email is required' });
        }
        const firstName = toNonEmptyStringOrNull(req.body?.firstName) || 'Bonjour';
        const requestedTemplateType = String(toNonEmptyStringOrNull(req.body?.templateType) || '').trim().toUpperCase();
        const requestedSubject = toNonEmptyStringOrNull(req.body?.subject);
        const marketingTypes = new Set([
            'WELCOME_J0',
            'WELCOME_J3',
            'ABANDONED_CART_H1',
            'ABANDONED_CART_H24',
            'POST_PURCHASE_CROSSSELL_J3',
            'POST_PURCHASE_REVIEW_J7',
            'REORDER_J21',
            'REORDER_J35',
            'WINBACK_45',
            'WINBACK_90',
        ]);
        let content = null;
        let subject = requestedSubject || 'Email test My Own Tea';
        if (requestedTemplateType === 'PASSWORD_RESET') {
            const resetUrl = toNonEmptyStringOrNull(req.body?.resetUrl) || resolveResetPasswordUrl(crypto.randomBytes(24).toString('hex'));
            content = buildPasswordResetEmail({
                firstName,
                resetUrl,
            });
            subject = requestedSubject || 'Réinitialisation de votre mot de passe My Own Tea';
        }
        else if (requestedTemplateType === 'ACCOUNT_PASSWORD_CHANGED' || requestedTemplateType === 'ACCOUNT_EMAIL_CHANGED') {
            content = buildSecurityEmailContent({
                type: requestedTemplateType,
                firstName,
                oldEmail: req.body?.oldEmail || 'ancien@example.com',
                newEmail: req.body?.newEmail || to,
            });
            subject = requestedSubject || content.subject;
        }
        else if (requestedTemplateType.startsWith('ORDER_')) {
            const fakeOrder = {
                id: 'test-order-id',
                orderNumber: 'ORD-TEST-EMAIL',
                status: requestedTemplateType.replace(/^ORDER_/, ''),
                totalCents: Number.isFinite(Number(req.body?.totalCents)) ? Number(req.body.totalCents) : 3290,
                trackingUrl: toNonEmptyStringOrNull(req.body?.trackingUrl) || null,
                customer: { firstName },
                items: [
                    {
                        snapshot: { title: 'Infusion Signature' },
                        qty: 1,
                        lineTotalCents: 3290,
                    },
                ],
            };
            content = buildOrderNotificationEmailContent({
                type: requestedTemplateType,
                order: fakeOrder,
            });
            subject = requestedSubject || content.subject;
        }
        else if (marketingTypes.has(requestedTemplateType)) {
            content = buildMarketingEmailContent({
                type: requestedTemplateType,
                firstName,
                payload: {},
                unsubscribeUrl: null,
            });
            subject = requestedSubject || content.subject;
        }
        else {
            const genericContent = buildCustomerEmailTemplate({
                title: 'Email test du nouveau template',
                previewText: 'Vérification du rendu email My Own Tea',
                greeting: `${firstName},`,
                paragraphs: [
                    "Ceci est un email de test généré depuis l'administration.",
                    'Il utilise le nouveau template harmonisé pour les emails clients.',
                ],
                ctaLabel: 'Voir la boutique',
                ctaUrl: `${WEB_BASE_URL}/creations`,
                footnote: 'Ce message est envoyé à des fins de vérification.',
            });
            content = { subject: requestedSubject || 'Email test My Own Tea', text: genericContent.text, html: genericContent.html };
            subject = requestedSubject || 'Email test My Own Tea';
        }
        const deliveryId = await queueEmailDelivery({
            customerId: null,
            orderId: null,
            campaignKey: null,
            type: 'ADMIN_TEST_EMAIL',
            recipient: to,
            subject,
            text: content.text,
            html: content.html,
            metadata: {
                source: 'admin_test',
                templateType: requestedTemplateType || 'GENERIC',
            },
        });
        const result = await retryEmailDeliveryNow(deliveryId);
        res.json({
            delivery: result.row,
            metrics: result.metrics,
            templateType: requestedTemplateType || 'GENERIC',
        });
    }
    catch (error) {
        console.error('Error sending admin test email:', error);
        res.status(500).json({ error: 'Failed to send test email' });
    }
});
app.post('/api/admin/emails/:id/resend', async (req, res) => {
    try {
        const id = req.params.id;
        const payload = await retryEmailDeliveryNow(id);
        res.json(payload);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'EMAIL_NOT_FOUND') {
            return res.status(404).json({ error: 'Email delivery not found' });
        }
        console.error('Error retrying email delivery:', error);
        res.status(500).json({ error: 'Failed to resend email' });
    }
});
const normalizeWishlistCreationName = (value) => {
    if (typeof value !== 'string')
        return 'Ma création';
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : 'Ma création';
};
const DEFAULT_BLEND_FORMAT = 'POUCH_100G';
const BLEND_FORMAT_LABELS = {
    POUCH_100G: 'Pochette vrac 100g',
    MUSLIN_20: 'Sachets mousselines x20',
};
const normalizeBlendFormat = (value) => {
    const normalized = String(value || '')
        .trim()
        .toUpperCase();
    if (normalized === 'MUSLIN_20' ||
        normalized === 'SACHETS_MOUSSELINES_X20' ||
        normalized === 'SACHETS_MOUSSELINE_X20') {
        return 'MUSLIN_20';
    }
    return 'POUCH_100G';
};
const buildWishlistCreationSnapshot = async (params) => {
    const ingredientIds = Array.from(new Set((params.ingredientIds || [])
        .filter((id) => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean)));
    if (ingredientIds.length === 0) {
        throw new Error('ingredientIds are required');
    }
    const ingredients = await prisma.ingredient.findMany({
        where: { id: { in: ingredientIds } },
        select: {
            id: true,
            name: true,
            color: true,
            category: true,
            price: true,
        },
    });
    if (ingredients.length !== ingredientIds.length) {
        throw new Error('One or more ingredients not found');
    }
    const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
    const orderedIngredients = ingredientIds.map((id) => ingredientById.get(id));
    const baseColors = orderedIngredients
        .filter((ingredient) => isBaseCategory(ingredient.category))
        .map((ingredient) => ingredient.color || '#C4A77D');
    const blendColor = baseColors[0] || orderedIngredients[0].color || '#C4A77D';
    const priceCents = computeBlendUnitPriceCents(orderedIngredients);
    const blendFormat = normalizeBlendFormat(params.blendFormat || DEFAULT_BLEND_FORMAT);
    return {
        title: normalizeWishlistCreationName(params.name),
        blendFormat,
        blendFormatLabel: BLEND_FORMAT_LABELS[blendFormat],
        ingredientIds,
        ingredients: orderedIngredients.map((ingredient) => ({
            id: ingredient.id,
            name: ingredient.name,
            color: ingredient.color || '#6B7280',
            category: ingredient.category,
        })),
        base: {
            colors: baseColors.map((hex) => ({ hex })),
        },
        blendColor,
        priceCents,
    };
};
const serializeWishlistCreation = (entry) => {
    const snapshot = (entry.snapshot || {});
    const ingredients = Array.isArray(snapshot.ingredients)
        ? snapshot.ingredients.map((ingredient) => ({
            id: typeof ingredient.id === 'string' ? ingredient.id : '',
            name: typeof ingredient.name === 'string' ? ingredient.name : 'Ingredient',
            color: typeof ingredient.color === 'string' ? ingredient.color : '#6B7280',
            category: typeof ingredient.category === 'string' ? ingredient.category : '',
        }))
        : [];
    const ingredientIds = Array.isArray(snapshot.ingredientIds)
        ? snapshot.ingredientIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
        : [];
    const baseSnapshot = snapshot.base && typeof snapshot.base === 'object' ? snapshot.base : {};
    const baseColorsFromSnapshot = Array.isArray(baseSnapshot.colors)
        ? baseSnapshot.colors
            .map((colorEntry) => (typeof colorEntry?.hex === 'string' ? colorEntry.hex : null))
            .filter(Boolean)
        : [];
    const fallbackBaseColors = ingredients
        .filter((ingredient) => isBaseCategory(ingredient.category))
        .map((ingredient) => ingredient.color || '#C4A77D');
    const resolvedBaseColors = (baseColorsFromSnapshot.length > 0 ? baseColorsFromSnapshot : fallbackBaseColors).map((hex) => ({ hex }));
    const priceCentsRaw = snapshot.priceCents;
    const priceCents = typeof priceCentsRaw === 'number' && Number.isFinite(priceCentsRaw)
        ? Math.max(0, Math.round(priceCentsRaw))
        : 0;
    const blendColor = typeof snapshot.blendColor === 'string' && snapshot.blendColor.trim().length > 0
        ? snapshot.blendColor
        : (resolvedBaseColors[0]?.hex || '#C4A77D');
    return {
        id: entry.id,
        createdAt: entry.createdAt,
        name: normalizeWishlistCreationName(snapshot.title),
        blendFormat: normalizeBlendFormat(snapshot.blendFormat || DEFAULT_BLEND_FORMAT),
        ingredientIds,
        ingredients,
        base: {
            colors: resolvedBaseColors,
        },
        blendColor,
        priceCents,
    };
};
const getWishlistDelegate = () => prismaAny.wishlistCreation;
const ensureWishlistTable = async () => {
    await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WishlistCreation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "customerId" TEXT NOT NULL,
      "snapshot" JSONB NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
    await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WishlistCreation_customerId_createdAt_idx"
    ON "WishlistCreation"("customerId", "createdAt");
  `);
};
const listWishlistRows = async (customerId) => {
    const delegate = getWishlistDelegate();
    if (delegate) {
        return delegate.findMany({
            where: { customerId },
            orderBy: { createdAt: 'desc' },
        });
    }
    await ensureWishlistTable();
    const rows = await prisma.$queryRaw `
    SELECT "id", "createdAt", "snapshot"
    FROM "WishlistCreation"
    WHERE "customerId" = ${customerId}
    ORDER BY "createdAt" DESC
  `;
    return rows;
};
const createWishlistRow = async (customerId, snapshot) => {
    const delegate = getWishlistDelegate();
    if (delegate) {
        return delegate.create({
            data: {
                customerId,
                snapshot,
            },
        });
    }
    await ensureWishlistTable();
    const id = crypto.randomUUID();
    const rows = await prisma.$queryRaw `
    INSERT INTO "WishlistCreation" ("id", "customerId", "snapshot", "createdAt", "updatedAt")
    VALUES (${id}, ${customerId}, CAST(${JSON.stringify(snapshot)} AS jsonb), NOW(), NOW())
    RETURNING "id", "createdAt", "snapshot"
  `;
    return rows[0];
};
const deleteWishlistRow = async (customerId, wishlistId) => {
    const delegate = getWishlistDelegate();
    if (delegate) {
        const existing = await delegate.findFirst({
            where: {
                id: wishlistId,
                customerId,
            },
            select: { id: true },
        });
        if (!existing) {
            return false;
        }
        await delegate.delete({ where: { id: existing.id } });
        return true;
    }
    await ensureWishlistTable();
    const existing = await prisma.$queryRaw `
    SELECT "id"
    FROM "WishlistCreation"
    WHERE "id" = ${wishlistId} AND "customerId" = ${customerId}
    LIMIT 1
  `;
    if (!existing.length) {
        return false;
    }
    await prisma.$executeRaw `
    DELETE FROM "WishlistCreation"
    WHERE "id" = ${wishlistId} AND "customerId" = ${customerId}
  `;
    return true;
};
const getActiveCart = async (customerId) => {
    const carts = await prisma.cart.findMany({
        where: { customerId, status: 'ACTIVE' },
        include: { items: true },
        orderBy: { updatedAt: 'desc' },
    });
    let cart = carts.find((entry) => entry.items.length > 0) || carts[0] || null;
    if (!cart) {
        cart = await prisma.cart.create({
            data: { customerId, status: 'ACTIVE', currency: 'EUR' },
            include: { items: true },
        });
    }
    return cart;
};
const touchCartUpdatedAt = async (cartId) => {
    await prisma.$executeRaw `
    UPDATE "Cart"
    SET "updatedAt" = NOW()
    WHERE "id" = ${cartId}
  `;
};
const asPlainObject = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return value;
};
const toSafeInt = (value, fallback = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.max(0, Math.round(parsed));
};
const toSafePositiveInt = (value, fallback = 0) => {
    const parsed = toSafeInt(value, fallback);
    return parsed > 0 ? parsed : fallback;
};
const toStringIdSet = (value) => {
    if (!Array.isArray(value))
        return new Set();
    return new Set(value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean));
};
const isGiftCartItem = (item) => {
    const snapshot = asPlainObject(item?.snapshot);
    return Boolean(snapshot.isGift);
};
const mapCartItemToDiscountInput = (item) => ({
    itemType: item.itemType,
    quantity: Math.max(1, item.qty || 1),
    unitPriceCents: Math.max(0, item.unitPriceCents || 0),
    lineSubtotalCents: Math.max(0, item.unitPriceCents || 0) * Math.max(1, item.qty || 1),
    productId: typeof item.snapshot?.productId === 'string' ? item.snapshot.productId : null,
    variantId: typeof item.snapshot?.variantId === 'string' ? item.snapshot.variantId : item.variantId || null,
    subscriptionPlanId: item.subscriptionPlanId || (typeof item.snapshot?.planId === 'string' ? item.snapshot.planId : null),
    isGift: isGiftCartItem(item),
});
const resolveGiftDiscountRule = (discount, cartItemsForDiscount, subtotalCents) => {
    const config = asPlainObject(discount.config);
    const giftVariantId = typeof config.giftVariantId === 'string' ? config.giftVariantId.trim() : '';
    const giftProductId = typeof config.giftProductId === 'string' ? config.giftProductId.trim() : '';
    if (!giftVariantId && !giftProductId) {
        return null;
    }
    const triggerProductIds = toStringIdSet(config.triggerProductIds);
    const triggerVariantIds = toStringIdSet(config.triggerVariantIds);
    const triggerQty = Math.max(1, toSafePositiveInt(config.triggerQty, 1));
    const hasProductTrigger = triggerProductIds.size > 0 || triggerVariantIds.size > 0;
    const triggerCount = hasProductTrigger
        ? cartItemsForDiscount.reduce((sum, item) => {
            const matchesProduct = item.productId ? triggerProductIds.has(item.productId) : false;
            const matchesVariant = item.variantId ? triggerVariantIds.has(item.variantId) : false;
            if (matchesProduct || matchesVariant)
                return sum + Math.max(1, item.quantity || 1);
            return sum;
        }, 0)
        : 0;
    const productTriggerMatched = hasProductTrigger && triggerCount >= triggerQty;
    const minimumSubtotalFromConfig = toSafeInt(config.triggerMinimumSubtotalCents, 0);
    const minimumSubtotalFromDiscount = toSafeInt(discount.minimumSubtotalCents, 0);
    const thresholdCents = Math.max(minimumSubtotalFromConfig, minimumSubtotalFromDiscount);
    const thresholdMatched = thresholdCents > 0 ? subtotalCents >= thresholdCents : false;
    if (!thresholdMatched && !productTriggerMatched) {
        return null;
    }
    let giftQty = 1;
    const forcedGiftQty = toSafePositiveInt(config.giftQty, 0);
    if (forcedGiftQty > 0) {
        giftQty = forcedGiftQty;
    }
    else if (productTriggerMatched && Boolean(config.repeatPerTrigger)) {
        giftQty = Math.max(1, Math.floor(triggerCount / triggerQty));
    }
    const maxGiftQty = Math.max(1, toSafePositiveInt(config.maxGiftQty, 1));
    giftQty = Math.min(giftQty, maxGiftQty);
    if (!Number.isFinite(giftQty) || giftQty <= 0) {
        return null;
    }
    return {
        discountId: discount.id,
        discountTitle: discount.title,
        giftVariantId: giftVariantId || null,
        giftProductId: giftProductId || null,
        qty: Math.max(1, Math.round(giftQty)),
    };
};
const buildGiftIdentityKey = (itemType, variantId, productId) => {
    if (variantId)
        return `${itemType}:variant:${variantId}`;
    if (productId)
        return `${itemType}:product:${productId}`;
    return `${itemType}:unknown`;
};
const syncAutomaticGiftCartItems = async ({ customer, cartId }) => {
    let cart = await prisma.cart.findUnique({
        where: { id: cartId },
        include: { items: true },
    });
    if (!cart) {
        return null;
    }
    const existingGiftItems = cart.items.filter((item) => isGiftCartItem(item));
    const baseItems = cart.items.filter((item) => !isGiftCartItem(item));
    const desiredGiftRules = [];
    if (baseItems.length > 0 && !baseItems.some((item) => item.itemType === 'SUBSCRIPTION')) {
        const cartItemsForDiscount = baseItems.map((item) => mapCartItemToDiscountInput(item));
        const subtotalCents = cartItemsForDiscount.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
        const customerEmail = normalizeEmail(customer?.email);
        const giftDiscounts = await prisma.discount.findMany({
            where: {
                status: 'ACTIVE',
                method: 'AUTOMATIC',
                type: 'GIFT',
            },
            orderBy: { createdAt: 'asc' },
        });
        if (giftDiscounts.length > 0) {
            const giftDiscountIds = giftDiscounts.map((discount) => discount.id);
            const totalRedemptions = await prisma.discountRedemption.groupBy({
                by: ['discountId'],
                where: { discountId: { in: giftDiscountIds } },
                _count: { _all: true },
            });
            const customerRedemptions = customerEmail
                ? await prisma.discountRedemption.groupBy({
                    by: ['discountId'],
                    where: {
                        discountId: { in: giftDiscountIds },
                        customerEmail,
                    },
                    _count: { _all: true },
                })
                : [];
            const usageById = {};
            totalRedemptions.forEach((entry) => {
                usageById[entry.discountId] = {
                    totalRedemptions: entry._count._all,
                    customerRedemptions: 0,
                };
            });
            customerRedemptions.forEach((entry) => {
                if (!usageById[entry.discountId]) {
                    usageById[entry.discountId] = { totalRedemptions: 0, customerRedemptions: 0 };
                }
                usageById[entry.discountId].customerRedemptions = entry._count._all;
            });
            const isFirstOrderEligible = !(await hasPaidOrConfirmedOrder({
                customerId: customer.id,
                customerEmail: customerEmail || null,
            }));
            const now = new Date();
            giftDiscounts.forEach((discount) => {
                if (discount.startAt && now < discount.startAt)
                    return;
                if (discount.endAt && now > discount.endAt)
                    return;
                if (Boolean(discount.firstOrderOnly) && !isFirstOrderEligible)
                    return;
                const usage = usageById[discount.id] || { totalRedemptions: 0, customerRedemptions: 0 };
                if (discount.usageLimitTotal !== null &&
                    discount.usageLimitTotal !== undefined &&
                    usage.totalRedemptions >= discount.usageLimitTotal) {
                    return;
                }
                if (discount.usageLimitPerCustomer !== null && discount.usageLimitPerCustomer !== undefined) {
                    if (!customerEmail)
                        return;
                    if (usage.customerRedemptions >= discount.usageLimitPerCustomer)
                        return;
                }
                const rule = resolveGiftDiscountRule(discount, cartItemsForDiscount, subtotalCents);
                if (rule) {
                    desiredGiftRules.push(rule);
                }
            });
        }
    }
    const desiredByKey = new Map();
    desiredGiftRules.forEach((rule) => {
        const key = rule.giftVariantId ? `variant:${rule.giftVariantId}` : `product:${rule.giftProductId}`;
        if (!key)
            return;
        const existing = desiredByKey.get(key);
        if (existing) {
            existing.qty += rule.qty;
            existing.discountIds.add(rule.discountId);
            existing.discountTitles.add(rule.discountTitle);
            return;
        }
        desiredByKey.set(key, {
            ...rule,
            qty: Math.max(1, rule.qty),
            discountIds: new Set([rule.discountId]),
            discountTitles: new Set([rule.discountTitle]),
        });
    });
    const desiredRules = Array.from(desiredByKey.values());
    const desiredVariantIds = Array.from(new Set(desiredRules
        .map((entry) => entry.giftVariantId)
        .filter((id) => typeof id === 'string' && id.length > 0)));
    const desiredProductIds = Array.from(new Set(desiredRules
        .map((entry) => entry.giftProductId)
        .filter((id) => typeof id === 'string' && id.length > 0)));
    const giftVariants = desiredVariantIds.length > 0
        ? await prisma.productVariant.findMany({
            where: { id: { in: desiredVariantIds }, isActive: true },
            include: {
                product: true,
                optionValues: { include: { optionValue: { include: { option: true } } } },
            },
        })
        : [];
    const giftProducts = desiredProductIds.length > 0
        ? await prisma.product.findMany({
            where: { id: { in: desiredProductIds }, isActive: true },
        })
        : [];
    const packProductIds = Array.from(new Set(giftVariants
        .filter((variant) => variant.product?.type === 'PACK' && variant.product?.isActive)
        .map((variant) => variant.product.id)));
    const packItems = packProductIds.length > 0
        ? await prisma.packItem.findMany({
            where: { packProductId: { in: packProductIds } },
            include: { componentVariant: { include: { product: true } } },
        })
        : [];
    const packItemsByProductId = new Map();
    packItems.forEach((packItem) => {
        const list = packItemsByProductId.get(packItem.packProductId) || [];
        list.push({
            variantId: packItem.componentVariantId,
            qty: packItem.qty,
            title: packItem.componentVariant.product.title,
            imageUrl: packItem.componentVariant.imageUrl || null,
        });
        packItemsByProductId.set(packItem.packProductId, list);
    });
    const variantById = new Map(giftVariants.map((variant) => [variant.id, variant]));
    const productById = new Map(giftProducts.map((product) => [product.id, product]));
    const desiredGiftItems = [];
    desiredRules.forEach((entry) => {
        const qty = Math.max(1, Math.round(entry.qty));
        if (entry.giftVariantId) {
            const variant = variantById.get(entry.giftVariantId);
            if (!variant || !variant.product?.isActive)
                return;
            if (variant.stockQty !== null && variant.stockQty !== undefined && variant.stockQty <= 0)
                return;
            if (variant.product.type === 'SUBSCRIPTION')
                return;
            const itemType = variant.product.type === 'PACK' ? 'PACK' : 'VARIANT';
            const selectedOptions = (variant.optionValues || []).map((value) => ({
                name: value.optionValue.option.name || 'Option',
                value: value.optionValue.value,
            }));
            const snapshot = {
                title: variant.product.title,
                imageUrl: variant.imageUrl || variant.product.images?.[0] || null,
                priceCents: 0,
                originalPriceCents: variant.priceCents || variant.product.priceCents || 0,
                productId: variant.product.id,
                variantId: variant.id,
                selectedOptions,
                ...(itemType === 'PACK' ? { packItems: packItemsByProductId.get(variant.product.id) || [] } : {}),
                isGift: true,
                giftKey: buildGiftIdentityKey(itemType, variant.id, variant.product.id),
                giftDiscountIds: Array.from(entry.discountIds),
                giftDiscountTitles: Array.from(entry.discountTitles),
            };
            desiredGiftItems.push({
                itemType,
                qty,
                unitPriceCents: 0,
                variantId: variant.id,
                snapshot,
            });
            return;
        }
        if (!entry.giftProductId)
            return;
        const product = productById.get(entry.giftProductId);
        if (!product)
            return;
        if (product.type === 'PACK' || product.type === 'SUBSCRIPTION')
            return;
        if (product.stockQty !== null && product.stockQty !== undefined && product.stockQty <= 0)
            return;
        const itemType = 'VARIANT';
        const snapshot = {
            title: product.title,
            imageUrl: product.images?.[0] || null,
            priceCents: 0,
            originalPriceCents: product.priceCents || 0,
            productId: product.id,
            variantId: null,
            selectedOptions: [],
            isGift: true,
            giftKey: buildGiftIdentityKey(itemType, null, product.id),
            giftDiscountIds: Array.from(entry.discountIds),
            giftDiscountTitles: Array.from(entry.discountTitles),
        };
        desiredGiftItems.push({
            itemType,
            qty,
            unitPriceCents: 0,
            variantId: null,
            snapshot,
        });
    });
    const existingSignature = existingGiftItems
        .map((item) => {
        const snapshot = asPlainObject(item.snapshot);
        const variantId = typeof item.variantId === 'string' && item.variantId.trim().length > 0
            ? item.variantId.trim()
            : typeof snapshot.variantId === 'string' && snapshot.variantId.trim().length > 0
                ? snapshot.variantId.trim()
                : null;
        const productId = typeof snapshot.productId === 'string' && snapshot.productId.trim().length > 0
            ? snapshot.productId.trim()
            : null;
        const key = buildGiftIdentityKey(item.itemType, variantId, productId);
        return `${key}:${Math.max(1, item.qty)}:${Math.max(0, item.unitPriceCents)}`;
    })
        .sort()
        .join('|');
    const desiredSignature = desiredGiftItems
        .map((item) => {
        const snapshot = asPlainObject(item.snapshot);
        const variantId = typeof item.variantId === 'string' && item.variantId.trim().length > 0 ? item.variantId.trim() : null;
        const productId = typeof snapshot.productId === 'string' && snapshot.productId.trim().length > 0
            ? snapshot.productId.trim()
            : null;
        const key = buildGiftIdentityKey(item.itemType, variantId, productId);
        return `${key}:${Math.max(1, item.qty)}:${Math.max(0, item.unitPriceCents)}`;
    })
        .sort()
        .join('|');
    if (existingSignature === desiredSignature) {
        return cart;
    }
    await prisma.$transaction(async (tx) => {
        if (existingGiftItems.length > 0) {
            await tx.cartItem.deleteMany({
                where: { id: { in: existingGiftItems.map((item) => item.id) } },
            });
        }
        for (const giftItem of desiredGiftItems) {
            await tx.cartItem.create({
                data: {
                    cartId: cart.id,
                    itemType: giftItem.itemType,
                    qty: giftItem.qty,
                    unitPriceCents: giftItem.unitPriceCents,
                    snapshot: giftItem.snapshot,
                    variantId: giftItem.variantId || null,
                },
            });
        }
    });
    await touchCartUpdatedAt(cart.id);
    cart = await prisma.cart.findUnique({
        where: { id: cart.id },
        include: { items: true },
    });
    return cart;
};
const serializeCart = (cart, shipping) => {
    const items = cart.items.map((item) => {
        const lineSubtotalCents = item.unitPriceCents * item.qty;
        const lineTotalCents = lineSubtotalCents;
        return {
            id: item.id,
            itemType: item.itemType,
            qty: item.qty,
            unitPriceCents: item.unitPriceCents,
            snapshot: item.snapshot,
            isGift: isGiftCartItem(item),
            subscriptionPlanId: item.subscriptionPlanId || null,
            lineSubtotalCents,
            lineDiscountCents: 0,
            lineTotalCents,
        };
    });
    const subtotalCents = items.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
    const shippingCents = shipping.shippingCents;
    const totalCents = subtotalCents + shippingCents;
    return {
        id: cart.id,
        status: cart.status,
        currency: cart.currency,
        items,
        totals: {
            subtotalCents,
            shippingCents,
            discountTotalCents: 0,
            totalCents,
        },
    };
};
// Cart API (customer)
app.get('/api/cart', requireCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const cart = await getActiveCart(customer.id);
        const syncedCart = await syncAutomaticGiftCartItems({ customer, cartId: cart.id });
        const shippingSelection = extractShippingSelection(req);
        const shippingQuote = await resolveShippingQuote(shippingSelection);
        res.json(serializeCart(syncedCart || cart, shippingQuote));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch cart' });
    }
});
app.post('/api/cart/items', requireCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const payload = req.body;
        let cart = await getActiveCart(customer.id);
        cart = (await syncAutomaticGiftCartItems({ customer, cartId: cart.id })) || cart;
        const entries = Array.isArray(payload.items) ? payload.items : [payload];
        for (const entry of entries) {
            if (!entry.itemType) {
                return res.status(400).json({ error: 'itemType is required' });
            }
            const qty = Math.max(1, entry.qty || 1);
            const hasSubscription = cart.items.some((item) => item.itemType === 'SUBSCRIPTION');
            const hasOneTime = cart.items.some((item) => item.itemType !== 'SUBSCRIPTION');
            if (entry.itemType === 'SUBSCRIPTION' && hasOneTime) {
                return res.status(409).json({ error: 'Impossible de mélanger un abonnement avec des articles classiques.' });
            }
            if (entry.itemType !== 'SUBSCRIPTION' && hasSubscription) {
                return res.status(409).json({ error: 'Impossible d\'ajouter un article classique avec un abonnement.' });
            }
            if (entry.itemType === 'BLEND') {
                const ingredientIds = (entry.ingredientIds || []).filter(Boolean);
                if (ingredientIds.length === 0) {
                    return res.status(400).json({ error: 'ingredientIds are required for blend items' });
                }
                const ingredients = await prisma.ingredient.findMany({
                    where: { id: { in: ingredientIds } },
                    select: { id: true, name: true, color: true, category: true, price: true },
                });
                if (ingredients.length !== ingredientIds.length) {
                    return res.status(404).json({ error: 'One or more ingredients not found' });
                }
                const unitPriceCents = computeBlendUnitPriceCents(ingredients);
                const blendFormat = normalizeBlendFormat(entry.blendFormat || DEFAULT_BLEND_FORMAT);
                const snapshot = {
                    blendFormat,
                    blendFormatLabel: BLEND_FORMAT_LABELS[blendFormat],
                    title: entry.name || 'Mon mélange',
                    ingredientIds,
                    ingredients: ingredients.map((ing) => ({
                        name: ing.name,
                        ingredientColor: ing.color || '#6B7280',
                        category: ing.category,
                    })),
                };
                const existing = cart.items.find((item) => item.itemType === 'BLEND' &&
                    Array.isArray(item.snapshot.ingredientIds) &&
                    item.snapshot.title === snapshot.title &&
                    normalizeBlendFormat(item.snapshot.blendFormat || DEFAULT_BLEND_FORMAT) === blendFormat &&
                    item.snapshot.ingredientIds.sort().join(',') === ingredientIds.slice().sort().join(','));
                if (existing) {
                    await prisma.cartItem.update({
                        where: { id: existing.id },
                        data: { qty: existing.qty + qty, unitPriceCents, snapshot },
                    });
                }
                else {
                    await prisma.cartItem.create({
                        data: {
                            cartId: cart.id,
                            itemType: 'BLEND',
                            qty,
                            unitPriceCents,
                            snapshot,
                        },
                    });
                }
            }
            if (entry.itemType === 'VARIANT') {
                if (!entry.variantId) {
                    if (!entry.productId) {
                        return res.status(400).json({ error: 'variantId is required' });
                    }
                    const product = await prisma.product.findUnique({
                        where: { id: entry.productId },
                        include: { variants: true },
                    });
                    if (!product || !product.isActive) {
                        return res.status(404).json({ error: 'Product not found' });
                    }
                    if (product.type !== 'ACCESSORY') {
                        return res.status(409).json({ error: 'Ce produit n\'est pas un accessoire.' });
                    }
                    if (product.variants.length > 0) {
                        return res.status(409).json({ error: 'Veuillez choisir une variante pour ce produit.' });
                    }
                    if (product.stockQty !== null && product.stockQty <= 0) {
                        return res.status(409).json({ error: 'Produit en rupture de stock' });
                    }
                    const imageUrl = product.images[0] || null;
                    const snapshot = {
                        title: product.title,
                        imageUrl,
                        priceCents: product.priceCents,
                        productId: product.id,
                        variantId: null,
                        selectedOptions: [],
                    };
                    const existing = cart.items.find((item) => item.itemType === 'VARIANT' && !item.variantId && item.snapshot.productId === product.id);
                    if (existing) {
                        await prisma.cartItem.update({
                            where: { id: existing.id },
                            data: { qty: existing.qty + qty, unitPriceCents: product.priceCents, snapshot },
                        });
                    }
                    else {
                        await prisma.cartItem.create({
                            data: {
                                cartId: cart.id,
                                itemType: 'VARIANT',
                                qty,
                                unitPriceCents: product.priceCents,
                                snapshot,
                                variantId: null,
                            },
                        });
                    }
                    continue;
                }
                const variant = await prisma.productVariant.findUnique({
                    where: { id: entry.variantId },
                    include: {
                        product: true,
                        optionValues: { include: { optionValue: { include: { option: true } } } },
                    },
                });
                if (!variant || !variant.isActive || !variant.product.isActive) {
                    return res.status(404).json({ error: 'Variant not found' });
                }
                if (variant.product.type === 'PACK') {
                    return res.status(409).json({ error: 'Utilisez le type PACK pour ajouter ce pack.' });
                }
                if (variant.product.type === 'SUBSCRIPTION') {
                    return res.status(409).json({ error: 'Utilisez le type SUBSCRIPTION pour ajouter cet abonnement.' });
                }
                if (variant.stockQty !== null && variant.stockQty <= 0) {
                    return res.status(409).json({ error: 'Variant out of stock' });
                }
                const selectedOptions = (variant.optionValues || []).map((value) => ({
                    name: value.optionValue.option.name || 'Option',
                    value: value.optionValue.value,
                }));
                const snapshot = {
                    title: variant.product.title,
                    imageUrl: variant.imageUrl,
                    priceCents: variant.priceCents,
                    productId: variant.product.id,
                    variantId: variant.id,
                    selectedOptions,
                };
                const existing = cart.items.find((item) => item.itemType === 'VARIANT' && item.variantId === variant.id);
                if (existing) {
                    await prisma.cartItem.update({
                        where: { id: existing.id },
                        data: { qty: existing.qty + qty, unitPriceCents: variant.priceCents, snapshot },
                    });
                }
                else {
                    await prisma.cartItem.create({
                        data: {
                            cartId: cart.id,
                            itemType: 'VARIANT',
                            qty,
                            unitPriceCents: variant.priceCents,
                            snapshot,
                            variantId: variant.id,
                        },
                    });
                }
            }
            if (entry.itemType === 'PACK') {
                if (!entry.variantId) {
                    return res.status(400).json({ error: 'variantId is required for packs' });
                }
                const variant = await prisma.productVariant.findUnique({
                    where: { id: entry.variantId },
                    include: {
                        product: true,
                        optionValues: { include: { optionValue: { include: { option: true } } } },
                    },
                });
                if (!variant || !variant.isActive || !variant.product.isActive) {
                    return res.status(404).json({ error: 'Pack variant not found' });
                }
                if (variant.product.type !== 'PACK') {
                    return res.status(409).json({ error: 'Ce produit n\'est pas un pack.' });
                }
                if (variant.stockQty !== null && variant.stockQty <= 0) {
                    return res.status(409).json({ error: 'Pack out of stock' });
                }
                const selectedOptions = (variant.optionValues || []).map((value) => ({
                    name: value.optionValue.option.name || 'Option',
                    value: value.optionValue.value,
                }));
                const packItems = await prisma.packItem.findMany({
                    where: { packProductId: variant.product.id },
                    include: { componentVariant: { include: { product: true } } },
                });
                const snapshot = {
                    title: variant.product.title,
                    imageUrl: variant.imageUrl,
                    priceCents: variant.priceCents,
                    productId: variant.product.id,
                    variantId: variant.id,
                    selectedOptions,
                    packItems: packItems.map((pack) => ({
                        variantId: pack.componentVariantId,
                        qty: pack.qty,
                        title: pack.componentVariant.product.title,
                        imageUrl: pack.componentVariant.imageUrl || null,
                    })),
                };
                const existing = cart.items.find((item) => item.itemType === 'PACK' && item.variantId === variant.id);
                if (existing) {
                    await prisma.cartItem.update({
                        where: { id: existing.id },
                        data: { qty: existing.qty + qty, unitPriceCents: variant.priceCents, snapshot },
                    });
                }
                else {
                    await prisma.cartItem.create({
                        data: {
                            cartId: cart.id,
                            itemType: 'PACK',
                            qty,
                            unitPriceCents: variant.priceCents,
                            snapshot,
                            variantId: variant.id,
                        },
                    });
                }
            }
            if (entry.itemType === 'SUBSCRIPTION') {
                if (!entry.subscriptionPlanId) {
                    return res.status(400).json({ error: 'subscriptionPlanId is required' });
                }
                const plan = await prisma.subscriptionPlan.findUnique({
                    where: { id: entry.subscriptionPlanId },
                    include: { product: true },
                });
                if (!plan || !plan.isActive || !plan.product.isActive) {
                    return res.status(404).json({ error: 'Subscription plan not found' });
                }
                if (plan.product.type !== 'SUBSCRIPTION') {
                    return res.status(409).json({ error: 'Ce produit n\'est pas un abonnement.' });
                }
                const snapshot = {
                    title: plan.product.title,
                    productId: plan.product.id,
                    planId: plan.id,
                    stripePriceId: plan.stripePriceId,
                    interval: plan.interval,
                    intervalCount: plan.intervalCount,
                    priceCents: plan.product.priceCents,
                };
                const existing = cart.items.find((item) => item.itemType === 'SUBSCRIPTION' && item.subscriptionPlanId === plan.id);
                if (existing) {
                    await prisma.cartItem.update({
                        where: { id: existing.id },
                        data: { qty: 1, unitPriceCents: plan.product.priceCents, snapshot },
                    });
                }
                else {
                    await prisma.cartItem.create({
                        data: {
                            cartId: cart.id,
                            itemType: 'SUBSCRIPTION',
                            qty: 1,
                            unitPriceCents: plan.product.priceCents,
                            snapshot,
                            subscriptionPlanId: plan.id,
                        },
                    });
                }
            }
        }
        await touchCartUpdatedAt(cart.id);
        const updated = (await syncAutomaticGiftCartItems({ customer, cartId: cart.id })) ||
            (await prisma.cart.findUnique({ where: { id: cart.id }, include: { items: true } }));
        const shippingSelection = extractShippingSelection(req);
        const shippingQuote = await resolveShippingQuote(shippingSelection);
        res.status(201).json(serializeCart(updated, shippingQuote));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to add cart item' });
    }
});
app.patch('/api/cart/items/:id', requireCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const { qty } = req.body;
        const item = await prisma.cartItem.findUnique({ where: { id: req.params.id }, include: { cart: true } });
        if (!item || item.cart.customerId !== customer.id) {
            return res.status(404).json({ error: 'Cart item not found' });
        }
        const nextQty = Math.max(1, qty || 1);
        await prisma.cartItem.update({ where: { id: item.id }, data: { qty: nextQty } });
        await touchCartUpdatedAt(item.cartId);
        const cart = (await syncAutomaticGiftCartItems({ customer, cartId: item.cartId })) ||
            (await prisma.cart.findUnique({ where: { id: item.cartId }, include: { items: true } }));
        const shippingSelection = extractShippingSelection(req);
        const shippingQuote = await resolveShippingQuote(shippingSelection);
        res.json(serializeCart(cart, shippingQuote));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update cart item' });
    }
});
app.delete('/api/cart/items/:id', requireCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const item = await prisma.cartItem.findUnique({ where: { id: req.params.id }, include: { cart: true } });
        if (!item || item.cart.customerId !== customer.id) {
            return res.status(404).json({ error: 'Cart item not found' });
        }
        await prisma.cartItem.delete({ where: { id: item.id } });
        await touchCartUpdatedAt(item.cartId);
        const cart = (await syncAutomaticGiftCartItems({ customer, cartId: item.cartId })) ||
            (await prisma.cart.findUnique({ where: { id: item.cartId }, include: { items: true } }));
        const shippingSelection = extractShippingSelection(req);
        const shippingQuote = await resolveShippingQuote(shippingSelection);
        res.json(serializeCart(cart, shippingQuote));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to remove cart item' });
    }
});
// Wishlist API (connected customer only)
app.get('/api/wishlist', requireAccountCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const entries = await listWishlistRows(customer.id);
        res.json(entries.map(serializeWishlistCreation));
    }
    catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).json({ error: 'Failed to fetch wishlist' });
    }
});
app.post('/api/wishlist', requireAccountCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const payload = req.body;
        const ingredientIds = Array.isArray(payload.ingredientIds) ? payload.ingredientIds : [];
        if (ingredientIds.length === 0) {
            return res.status(400).json({ error: 'ingredientIds are required' });
        }
        let snapshot;
        try {
            snapshot = await buildWishlistCreationSnapshot({
                name: payload.name,
                ingredientIds,
                blendFormat: normalizeBlendFormat(payload.blendFormat || DEFAULT_BLEND_FORMAT),
            });
        }
        catch (snapshotError) {
            const message = snapshotError instanceof Error ? snapshotError.message : 'Invalid wishlist payload';
            if (message === 'ingredientIds are required') {
                return res.status(400).json({ error: message });
            }
            if (message === 'One or more ingredients not found') {
                return res.status(404).json({ error: message });
            }
            return res.status(400).json({ error: 'Invalid wishlist payload' });
        }
        const created = await createWishlistRow(customer.id, snapshot);
        res.status(201).json(serializeWishlistCreation(created));
    }
    catch (error) {
        console.error('Error adding wishlist item:', error);
        res.status(500).json({ error: 'Failed to add wishlist item' });
    }
});
app.delete('/api/wishlist/:id', requireAccountCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const deleted = await deleteWishlistRow(customer.id, req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Wishlist item not found' });
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error removing wishlist item:', error);
        res.status(500).json({ error: 'Failed to remove wishlist item' });
    }
});
// Create ingredient
app.post('/api/ingredients', async (req, res) => {
    try {
        const { name, category, basePrice, stock, description, longDescription, image, color, intensity, umami, sweetness, thickness, finish, benefits, flavor, flavord, pairing, flavors, isActive, } = req.body;
        const normalizedFlavors = Array.isArray(flavors);
        flavors.filter((flavor) => typeof flavor === 'string' && flavor.trim().length > 0);
        [];
        const normalizedFlavorText = typeof flavor === 'string' && flavor.trim().length > 0;
        flavor.trim();
        typeof flavord === 'string' && flavord.trim().length > 0;
        flavord.trim();
        null;
        const normalizedPairing = typeof pairing === 'string' && pairing.trim().length > 0;
        pairing.trim();
        null;
        const baseFields = normalizeBaseFields(req.body, category);
        const ingredient = await prisma.ingredient.create({
            data: {
                name,
                category,
                price: parseFloat(basePrice || 0),
                stock: parseInt(stock || 0),
                description: description || '',
                longDescription: typeof longDescription === 'string' && longDescription.trim() ? longDescription.trim() : null,
                flavor: normalizedFlavorText || normalizedFlavors[0] || null,
                flavors: normalizedFlavors,
                pairing: normalizedPairing,
                image: image || '',
                color: color || '#667eea',
                intensity: normalizeTasteMetric(intensity),
                umami: normalizeTasteMetric(umami),
                sweetness: normalizeTasteMetric(sweetness),
                thickness: normalizeTasteMetric(thickness),
                finish: normalizeTasteMetric(finish),
                benefits: benefits || [],
                ...baseFields,
                isActive: typeof isActive === 'boolean' ? isActive : true,
            },
        });
        res.status(201).json({ ...ingredient, basePrice: ingredient.price });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create ingredient';
        if (error instanceof Error && /dayMoments|infusionTime|dosage|temperature|preparation|origin/.test(message)) {
            return res.status(400).json({ error: message });
        }
        console.error('Error creating ingredient:', error);
        res.status(500).json({ error: 'Failed to create ingredient' });
    }
});
// Update ingredient
app.put('/api/ingredients/:id', async (req, res) => {
    try {
        const { name, category, basePrice, stock, description, longDescription, image, color, intensity, umami, sweetness, thickness, finish, benefits, flavor, flavord, pairing, flavors, isActive, } = req.body;
        const normalizedFlavors = Array.isArray(flavors);
        flavors.filter((flavor) => typeof flavor === 'string' && flavor.trim().length > 0);
        [];
        const normalizedFlavorText = typeof flavor === 'string' && flavor.trim().length > 0;
        flavor.trim();
        typeof flavord === 'string' && flavord.trim().length > 0;
        flavord.trim();
        null;
        const normalizedPairing = typeof pairing === 'string' && pairing.trim().length > 0;
        pairing.trim();
        null;
        const baseFields = normalizeBaseFields(req.body, category);
        const ingredient = await prisma.ingredient.update({
            where: { id: req.params.id },
            data: {
                name,
                category,
                price: parseFloat(basePrice || 0),
                stock: parseInt(stock || 0),
                description: description || '',
                longDescription: typeof longDescription === 'string' && longDescription.trim() ? longDescription.trim() : null,
                flavor: normalizedFlavorText || normalizedFlavors[0] || null,
                flavors: normalizedFlavors,
                pairing: normalizedPairing,
                image: image || '',
                color: color || '#667eea',
                intensity: normalizeTasteMetric(intensity),
                umami: normalizeTasteMetric(umami),
                sweetness: normalizeTasteMetric(sweetness),
                thickness: normalizeTasteMetric(thickness),
                finish: normalizeTasteMetric(finish),
                benefits: benefits || [],
                ...baseFields,
                isActive: typeof isActive === 'boolean' ? isActive : true,
            },
        });
        res.json({ ...ingredient, basePrice: ingredient.price });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update ingredient';
        if (error instanceof Error && /dayMoments|infusionTime|dosage|temperature|preparation|origin/.test(message)) {
            return res.status(400).json({ error: message });
        }
        console.error('Error updating ingredient:', error);
        res.status(500).json({ error: 'Failed to update ingredient' });
    }
});
// Delete ingredient
app.delete('/api/ingredients/:id', async (req, res) => {
    try {
        const ingredientId = req.params.id;
        await prisma.blendIngredient.deleteMany({
            where: { ingredientId },
        });
        const ingredient = await prisma.ingredient.delete({
            where: { id: ingredientId },
        });
        res.json({ ...ingredient, basePrice: ingredient.price });
    }
    catch (error) {
        console.error('Error deleting ingredient:', error);
        res.status(500).json({ error: 'Failed to delete ingredient' });
    }
});
// Store settings
app.get('/api/store-settings', async (req, res) => {
    try {
        let settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
        if (!settings) {
            settings = await prisma.storeSettings.create({ data: { id: 'default' } });
        }
        res.json(settings);
    }
    catch (error) {
        console.error('Error fetching store settings:', error);
        res.status(500).json({ error: 'Failed to fetch store settings' });
    }
});
app.put('/api/store-settings', async (req, res) => {
    try {
        const { freeShippingThresholdCents, defaultShippingCents, currency } = req.body;
        const settings = await prisma.storeSettings.upsert({
            where: { id: 'default' },
            update: {
                freeShippingThresholdCents: typeof freeShippingThresholdCents === 'number' ? freeShippingThresholdCents : undefined,
                defaultShippingCents: typeof defaultShippingCents === 'number' ? defaultShippingCents : undefined,
                currency: typeof currency === 'string' ? currency : undefined,
            },
            create: {
                id: 'default',
                freeShippingThresholdCents: typeof freeShippingThresholdCents === 'number' ? freeShippingThresholdCents : 4500,
                defaultShippingCents: typeof defaultShippingCents === 'number' ? defaultShippingCents : 550,
                currency: typeof currency === 'string' ? currency : 'EUR',
            },
        });
        res.json(settings);
    }
    catch (error) {
        console.error('Error updating store settings:', error);
        res.status(500).json({ error: 'Failed to update store settings' });
    }
});
// Shipping offers (Boxtal)
app.get('/api/shipping/offers', async (_req, res) => {
    const homeOfferCode = normalizeShippingOfferCode(process.env.BOXTAL_HOME_OFFER_CODE);
    const relayOfferCode = normalizeShippingOfferCode(process.env.BOXTAL_RELAY_OFFER_CODE);
    const homeOfferId = normalizeShippingOfferId(process.env.BOXTAL_HOME_OFFER_ID);
    const relayOfferId = normalizeShippingOfferId(process.env.BOXTAL_RELAY_OFFER_ID);
    const offers = [
        homeOfferCode
            ? {
                id: homeOfferId,
                code: homeOfferCode,
                label: 'Livraison a domicile',
                mode: 'HOME',
            }
            : null,
        relayOfferCode
            ? {
                id: relayOfferId,
                code: relayOfferCode,
                label: 'Point relais (Mondial Relay)',
                mode: 'RELAY',
            }
            : null,
    ].filter(Boolean);
    res.json(offers);
});
app.get('/api/shipping/allowed-countries', async (_req, res) => {
    res.json({ allowedCountries: getAllowedShippingCountries() });
});
app.get('/api/shipping/quote', async (req, res) => {
    try {
        const shippingSelection = extractShippingSelection(req);
        if (shippingSelection.countryCode && !isShippingCountryAllowed(shippingSelection.countryCode)) {
            const allowed = getAllowedShippingCountries();
            return res.status(400).json({
                error: `Delivery is not available for this country. Allowed countries: ${allowed.join(', ')}`,
            });
        }
        const quotedOffer = await resolveBoxtalQuoteSelection({
            mode: shippingSelection.mode,
            requestedOfferCode: shippingSelection.offerCode,
            countryCode: shippingSelection.countryCode,
            postalCode: shippingSelection.postalCode,
            city: shippingSelection.city,
        });
        const resolvedShippingSelection = resolveOrderShippingSelection({
            ...shippingSelection,
            ...(quotedOffer
                ? {
                    offerId: quotedOffer.offerId,
                    offerCode: quotedOffer.offerCode,
                    offerLabel: quotedOffer.offerLabel,
                }
                : {}),
        });
        const shippingQuote = await resolveShippingQuote(resolvedShippingSelection);
        res.json({
            shippingCents: shippingQuote.shippingCents,
            defaultShippingCents: shippingQuote.defaultShippingCents,
            mode: resolvedShippingSelection.mode || null,
            offerId: resolvedShippingSelection.offerId || null,
            offerCode: resolvedShippingSelection.offerCode || null,
            offerLabel: resolvedShippingSelection.offerLabel || null,
            source: quotedOffer?.quoteMeta?.source || null,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to compute shipping quote' });
    }
});
// Relay points (Boxtal)
app.get('/api/shipping/relay-points', async (req, res) => {
    try {
        const { postalCode, city, countryCode, shippingOfferCode, limit } = req.query;
        if (!postalCode || !countryCode) {
            return res.status(400).json({ error: 'postalCode and countryCode are required' });
        }
        if (!isShippingCountryAllowed(countryCode)) {
            const allowed = getAllowedShippingCountries();
            return res.status(400).json({
                error: `Relay delivery is not available for this country. Allowed countries: ${allowed.join(', ')}`,
            });
        }
        const offerCode = shippingOfferCode || process.env.BOXTAL_RELAY_OFFER_CODE || undefined;
        const points = await getParcelPoints({
            postalCode,
            city,
            countryCode,
            shippingOfferCode: offerCode,
            limit: limit ? Number(limit) : 10,
        });
        res.json(points);
    }
    catch (error) {
        console.error('Error fetching relay points:', error);
        const message = error instanceof Error ? error.message : 'Failed to fetch relay points';
        res.json({ items: [], error: message });
    }
});
// Boxtal webhooks
app.post('/api/shipping/webhook/boxtal', async (req, res) => {
    try {
        const signature = req.header('x-bxt-signature') || '';
        const secret = process.env.BOXTAL_WEBHOOK_SECRET || '';
        if (secret) {
            const rawBody = req.rawBody;
            const body = rawBody ? Buffer.from(rawBody) : Buffer.from('');
            const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
            if (!signature || signature !== expected) {
                return res.status(401).json({ error: 'Invalid webhook signature' });
            }
        }
        const payload = req.body;
        const shippingOrderId = payload.shippingOrder?.id ||
            payload.shippingOrderId ||
            payload.shippingOrder?.shippingOrderId ||
            null;
        const eventType = payload.eventType || payload.type || 'unknown';
        const status = payload.status || payload.shippingOrder?.status || null;
        const trackingNumber = payload.trackingNumber || payload.shippingOrder?.trackingNumber || null;
        const labelUrl = payload.labelUrl || payload.documentUrl || null;
        const occurredAt = payload.eventDate ? new Date(payload.eventDate) : null;
        let transitionedTo = [];
        if (shippingOrderId) {
            const shipment = await prisma.shipment.findFirst({ where: { providerOrderId: shippingOrderId } });
            if (shipment) {
                await prisma.shipmentEvent.create({
                    data: {
                        shipmentId: shipment.id,
                        eventType: String(eventType),
                        status: status ? String(status) : null,
                        occurredAt: occurredAt || undefined,
                        payload,
                    },
                });
                const synced = await syncShipmentTrackingFromPayload({
                    shipmentId: shipment.id,
                    providerStatus: status ? String(status) : null,
                    trackingNumber: trackingNumber || shipment.trackingNumber,
                    trackingUrl: payload.trackingUrl || payload.tracking?.url || payload.tracking?.trackingUrl || null,
                    labelUrl: labelUrl || shipment.labelUrl,
                    response: payload,
                    actorType: 'webhook',
                    actorId: 'boxtal',
                    reason: `Webhook Boxtal (${String(eventType)})`,
                });
                transitionedTo = synced.orderSync.transitionedTo;
            }
        }
        res.json({ ok: true, transitionedTo });
    }
    catch (error) {
        console.error('Error handling Boxtal webhook:', error);
        res.status(500).json({ error: 'Failed to process webhook' });
    }
});
// Stripe webhook
app.post('/api/stripe/webhook', async (req, res) => {
    try {
        if (!stripe) {
            return res.status(501).json({ error: 'Stripe is not configured' });
        }
        const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
        if (!secret) {
            return res.status(400).json({ error: 'Webhook secret not configured' });
        }
        const signature = req.header('stripe-signature') || '';
        let event;
        try {
            event = stripe.webhooks.constructEvent(req.rawBody, signature, secret);
        }
        catch (err) {
            return res.status(400).json({ error: 'Invalid signature' });
        }
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            if (session.mode === 'subscription' || session.subscription) {
                const planId = session.metadata.planId || null;
                const customerId = session.metadata.customerId || null;
                const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
                if (planId && stripeSubscriptionId) {
                    const plan = await prisma.subscriptionPlan.findUnique({
                        where: { id: planId },
                        include: { product: true },
                    });
                    if (plan) {
                        let customer = customerId;
                        await prisma.customer.findUnique({ where: { id: customerId } });
                        null;
                        if (!customer && session.customer_email) {
                            customer = await prisma.customer.findUnique({ where: { email: session.customer_email } });
                        }
                        if (customer) {
                            const existingOrder = await prisma.order.findFirst({ where: { stripeSessionId: session.id } });
                            if (!existingOrder) {
                                const order = await prisma.order.create({
                                    data: {
                                        customerId: customer.id,
                                        userId: null,
                                        orderNumber: `ORD-${Date.now()}`,
                                        status: 'CONFIRMED',
                                        subtotal: plan.product.priceCents / 100,
                                        shippingCost: 0,
                                        tax: 0,
                                        total: plan.product.priceCents / 100,
                                        subtotalCents: plan.product.priceCents,
                                        shippingCents: 0,
                                        discountTotalCents: 0,
                                        totalCents: plan.product.priceCents,
                                        paymentMethod: 'stripe',
                                        paymentStatus: 'completed',
                                        stripeSessionId: session.id,
                                        shippingAddress: customer.address || '',
                                        items: {
                                            create: [
                                                {
                                                    itemType: 'SUBSCRIPTION',
                                                    qty: 1,
                                                    unitPriceCents: plan.product.priceCents,
                                                    lineSubtotalCents: plan.product.priceCents,
                                                    lineDiscountCents: 0,
                                                    lineTotalCents: plan.product.priceCents,
                                                    subscriptionPlanId: plan.id,
                                                    snapshot: {
                                                        title: plan.product.title,
                                                        productId: plan.product.id,
                                                        planId: plan.id,
                                                        stripePriceId: plan.stripePriceId,
                                                        interval: plan.interval,
                                                        intervalCount: plan.intervalCount,
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                });
                                await prisma.subscription.create({
                                    data: {
                                        customerId: customer.id,
                                        planId: plan.id,
                                        status: 'active',
                                        stripeSubscriptionId,
                                    },
                                });
                                const cart = await prisma.cart.findFirst({ where: { customerId: customer.id, status: 'ACTIVE' } });
                                if (cart) {
                                    await prisma.cart.update({ where: { id: cart.id }, data: { status: 'ORDERED' } });
                                    await prisma.cart.create({ data: { customerId: customer.id, status: 'ACTIVE', currency: 'EUR' } });
                                }
                            }
                        }
                    }
                }
                return res.json({ received: true });
            }
            const orderId = session.metadata.orderId || null;
            const stripeSessionId = session.id;
            let order = orderId ? await prisma.order.findUnique({ where: { id: orderId } }) : null;
            if (!order) {
                order = await prisma.order.findFirst({ where: { stripeSessionId } });
            }
            if (order) {
                if (!order.stripeSessionId) {
                    await prisma.order.update({
                        where: { id: order.id },
                        data: { stripeSessionId },
                    });
                }
                await finalizePaidOrder(order.id, 'stripe_webhook:checkout.session.completed');
            }
        }
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            const orderIdFromMetadata = paymentIntent.metadata.orderId || null;
            let order = orderIdFromMetadata ? await prisma.order.findUnique({ where: { id: orderIdFromMetadata } }) : null;
            if (!order) {
                order = await prisma.order.findFirst({ where: { stripeSessionId: paymentIntent.id } });
            }
            if (order) {
                if (!order.stripeSessionId) {
                    await prisma.order.update({
                        where: { id: order.id },
                        data: { stripeSessionId: paymentIntent.id },
                    });
                }
                await finalizePaidOrder(order.id, 'stripe_webhook:payment_intent.succeeded');
            }
        }
        res.json({ received: true });
    }
    catch (error) {
        console.error('Stripe webhook error:', error);
        res.status(500).json({ error: 'Failed to process webhook' });
    }
});
const normalizeDiscountConfigInput = (value) => {
    if (value === undefined)
        return undefined;
    if (value === null || value === '')
        return null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
            throw new Error('Discount config must be a JSON object');
        }
        catch (error) {
            throw new Error('Discount config must be a valid JSON object');
        }
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }
    throw new Error('Discount config must be a JSON object');
};
const validateDiscountPayload = (params) => {
    const type = String(params.type || '');
    const config = params.config && typeof params.config === 'object' ? params.config : {};
    if (type === 'PERCENTAGE' && (!params.valuePercent || params.valuePercent <= 0 || params.valuePercent > 100)) {
        return 'Percentage value must be between 1 and 100';
    }
    if (type === 'FIXED' && (!params.valueCents || params.valueCents <= 0)) {
        return 'Fixed value must be greater than 0';
    }
    if (type === 'BOGO') {
        const buyQty = Number(config.buyQty || 1);
        const getQty = Number(config.getQty || 1);
        if (!Number.isFinite(buyQty) || buyQty <= 0 || !Number.isFinite(getQty) || getQty <= 0) {
            return 'BOGO config requires positive buyQty/getQty';
        }
    }
    if (type === 'TIERED') {
        const tiers = Array.isArray(config.tiers) ? config.tiers : [];
        const hasValidTier = tiers.some((tier) => {
            const percent = Number(tier?.percent || 0);
            const fixedCents = Number(tier?.fixedCents || 0);
            return (Number.isFinite(percent) && percent > 0) || (Number.isFinite(fixedCents) && fixedCents > 0);
        });
        if (!hasValidTier) {
            return 'TIERED config requires at least one tier with percent or fixedCents';
        }
    }
    if (type === 'BUNDLE') {
        const requiredQty = Number(config.requiredQty || 2);
        const bundlePriceCents = Number(config.bundlePriceCents || 0);
        const percentOff = Number(config.percentOff || 0);
        const fixedOffCents = Number(config.fixedOffCents || 0);
        const hasRule = bundlePriceCents > 0 || percentOff > 0 || fixedOffCents > 0;
        if (!Number.isFinite(requiredQty) || requiredQty < 2 || !hasRule) {
            return 'BUNDLE config requires requiredQty >= 2 and bundlePriceCents or percentOff or fixedOffCents';
        }
    }
    if (type === 'SALE_PRICE') {
        const saleUnitPriceCents = Number(config.saleUnitPriceCents || 0);
        const percentOff = Number(config.percentOff || 0);
        const fixedOffCents = Number(config.fixedOffCents || 0);
        if (!(saleUnitPriceCents > 0 || percentOff > 0 || fixedOffCents > 0)) {
            return 'SALE_PRICE config requires saleUnitPriceCents or percentOff or fixedOffCents';
        }
    }
    if (type === 'SUBSCRIPTION') {
        const percentOff = Number(config.percentOff || params.valuePercent || 0);
        const fixedOffCents = Number(config.fixedOffCents || params.valueCents || 0);
        if (!(percentOff > 0 || fixedOffCents > 0)) {
            return 'SUBSCRIPTION discount requires percentOff/valuePercent or fixedOffCents/valueCents';
        }
    }
    if (type === 'GIFT') {
        const giftValueCents = Number(config.giftValueCents || params.valueCents || 0);
        const triggerMinimumSubtotalCents = Number(config.triggerMinimumSubtotalCents || params.minimumSubtotalCents || 0);
        const triggerProductIds = Array.isArray(config.triggerProductIds) ? config.triggerProductIds.filter(Boolean) : [];
        const triggerVariantIds = Array.isArray(config.triggerVariantIds) ? config.triggerVariantIds.filter(Boolean) : [];
        const hasTrigger = triggerMinimumSubtotalCents > 0 || triggerProductIds.length > 0 || triggerVariantIds.length > 0;
        if (!hasTrigger || giftValueCents <= 0) {
            return 'GIFT config requires giftValueCents and a trigger (minimum subtotal or product/variant ids)';
        }
    }
    return null;
};
// Discounts CRUD (admin)
app.get('/api/discounts', async (req, res) => {
    try {
        const discounts = await prisma.discount.findMany({
            orderBy: { createdAt: 'desc' },
        });
        res.json(discounts);
    }
    catch (error) {
        console.error('Error fetching discounts:', error);
        res.status(500).json({ error: 'Failed to fetch discounts' });
    }
});
app.get('/api/discounts/:id', async (req, res) => {
    try {
        const discount = await prisma.discount.findUnique({ where: { id: req.params.id } });
        if (!discount)
            return res.status(404).json({ error: 'Discount not found' });
        res.json(discount);
    }
    catch (error) {
        console.error('Error fetching discount:', error);
        res.status(500).json({ error: 'Failed to fetch discount' });
    }
});
app.post('/api/discounts', async (req, res) => {
    try {
        const { title, method, code, type, scope, valuePercent, valueCents, minimumSubtotalCents, startAt, endAt, usageLimitTotal, usageLimitPerCustomer, stackable, firstOrderOnly, status, config, } = req.body;
        if (!title || !method || !type) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const normalizedCode = method === 'CODE' ? normalizeCode(code) : null;
        if (method === 'CODE' && !normalizedCode) {
            return res.status(400).json({ error: 'Code is required for code discounts' });
        }
        const parsedConfig = normalizeDiscountConfigInput(config);
        const validationError = validateDiscountPayload({
            type,
            valuePercent,
            valueCents,
            minimumSubtotalCents,
            config: parsedConfig,
        });
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }
        const normalizedValuePercent = typeof valuePercent === 'number' && Number.isFinite(valuePercent) ? valuePercent : null;
        const normalizedValueCents = typeof valueCents === 'number' && Number.isFinite(valueCents) ? valueCents : null;
        const discount = await prisma.discount.create({
            data: {
                title,
                method,
                code: normalizedCode,
                type,
                scope: scope || 'ORDER',
                config: parsedConfig === undefined ? null : parsedConfig,
                valuePercent: normalizedValuePercent,
                valueCents: normalizedValueCents,
                minimumSubtotalCents: typeof minimumSubtotalCents === 'number' ? minimumSubtotalCents : 0,
                startAt: startAt ? new Date(startAt) : null,
                endAt: endAt ? new Date(endAt) : null,
                usageLimitTotal: typeof usageLimitTotal === 'number' ? usageLimitTotal : null,
                usageLimitPerCustomer: typeof usageLimitPerCustomer === 'number' ? usageLimitPerCustomer : null,
                stackable: Boolean(stackable),
                firstOrderOnly: Boolean(firstOrderOnly),
                status: status || 'DRAFT',
            },
        });
        res.status(201).json(discount);
    }
    catch (error) {
        console.error('Error creating discount:', error);
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Discount code already exists' });
        }
        res.status(500).json({ error: 'Failed to create discount' });
    }
});
app.put('/api/discounts/:id', async (req, res) => {
    try {
        const { title, method, code, type, scope, valuePercent, valueCents, minimumSubtotalCents, startAt, endAt, usageLimitTotal, usageLimitPerCustomer, stackable, firstOrderOnly, status, config, } = req.body;
        const normalizedCode = method === 'CODE' ? normalizeCode(code) : null;
        if (method === 'CODE' && !normalizedCode) {
            return res.status(400).json({ error: 'Code is required for code discounts' });
        }
        const parsedConfig = normalizeDiscountConfigInput(config);
        const validationError = validateDiscountPayload({
            type,
            valuePercent,
            valueCents,
            minimumSubtotalCents,
            config: parsedConfig,
        });
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }
        const normalizedValuePercent = typeof valuePercent === 'number' && Number.isFinite(valuePercent) ? valuePercent : null;
        const normalizedValueCents = typeof valueCents === 'number' && Number.isFinite(valueCents) ? valueCents : null;
        const discount = await prisma.discount.update({
            where: { id: req.params.id },
            data: {
                title,
                method,
                code: normalizedCode,
                type,
                scope: scope || 'ORDER',
                config: parsedConfig,
                valuePercent: normalizedValuePercent,
                valueCents: normalizedValueCents,
                minimumSubtotalCents: typeof minimumSubtotalCents === 'number' ? minimumSubtotalCents : 0,
                startAt: startAt ? new Date(startAt) : null,
                endAt: endAt ? new Date(endAt) : null,
                usageLimitTotal: typeof usageLimitTotal === 'number' ? usageLimitTotal : null,
                usageLimitPerCustomer: typeof usageLimitPerCustomer === 'number' ? usageLimitPerCustomer : null,
                stackable: Boolean(stackable),
                firstOrderOnly: typeof firstOrderOnly === 'boolean' ? firstOrderOnly : undefined,
                status: (status || 'DRAFT'),
            },
        });
        res.json(discount);
    }
    catch (error) {
        console.error('Error updating discount:', error);
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Discount code already exists' });
        }
        res.status(500).json({ error: 'Failed to update discount' });
    }
});
app.patch('/api/discounts/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        if (!status)
            return res.status(400).json({ error: 'Status is required' });
        const discount = await prisma.discount.update({
            where: { id: req.params.id },
            data: { status: status },
        });
        res.json(discount);
    }
    catch (error) {
        console.error('Error updating discount status:', error);
        res.status(500).json({ error: 'Failed to update discount status' });
    }
});
// Cart summary with discounts
app.post('/api/cart/summary', async (req, res) => {
    try {
        const { items, appliedDiscountCode, customerEmail, shippingSelection } = req.body;
        const session = await getSessionCustomer(req);
        const bodyCustomerEmail = typeof customerEmail === 'string' && customerEmail.trim().length > 0
            ? customerEmail.trim().toLowerCase()
            : null;
        const sessionCustomerEmail = typeof session.customer.email === 'string' && session.customer.email.trim().length > 0
            ? session.customer.email.trim().toLowerCase()
            : null;
        const effectiveCustomerEmail = sessionCustomerEmail || bodyCustomerEmail;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Cart items are required' });
        }

        const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
        const itemsNeedingIngredientResolution = items.filter((item) => !isFiniteNumber(item.lineSubtotalCents) && !isFiniteNumber(item.unitPriceCents));
        const ingredientIds = Array.from(new Set(itemsNeedingIngredientResolution.flatMap((item) => (item.ingredientIds || []).filter(Boolean))));
        const ingredientNames = Array.from(new Set(itemsNeedingIngredientResolution.flatMap((item) => (item.ingredientNames || []).filter(Boolean))));

        if (itemsNeedingIngredientResolution.length > 0 && ingredientIds.length === 0 && ingredientNames.length === 0) {
            return res.status(400).json({ error: 'Ingredient identifiers are required' });
        }

        const ingredients = itemsNeedingIngredientResolution.length === 0
            ? []
            : ingredientNames.length > 0
                ? await prisma.ingredient.findMany({ select: { id: true, price: true, name: true, category: true } })
                : await prisma.ingredient.findMany({ where: { id: { in: ingredientIds } }, select: { id: true, price: true, name: true, category: true } });

        const ingredientById = new Map(ingredients.map((ing) => [ing.id, ing]));
        const ingredientByName = new Map(ingredients.map((ing) => [normalizeIngredientLookupKey(ing.name), ing]));

        const resolveLineSubtotalCents = (item) => {
            if (isFiniteNumber(item.lineSubtotalCents)) {
                return Math.max(0, Math.round(item.lineSubtotalCents));
            }
            if (isFiniteNumber(item.unitPriceCents)) {
                return Math.max(0, Math.round(item.unitPriceCents)) * Math.max(1, item.quantity || 1);
            }
            const resolvedIngredients = resolveBlendIngredientsForPricing({
                ingredientIds: item.ingredientIds,
                ingredientNames: item.ingredientNames,
                ingredientById,
                ingredientByName,
            });
            const unitCents = computeBlendUnitPriceCents(resolvedIngredients);
            return unitCents * Math.max(1, item.quantity || 1);
        };
        const normalizedSummaryItems = items.map((item) => {
            const quantity = Math.max(1, Math.round(Number(item.quantity || 1)));
            const lineSubtotalCents = resolveLineSubtotalCents(item);
            const unitPriceCents = quantity > 0 ? Math.max(0, Math.round(lineSubtotalCents / quantity)) : 0;
            return {
                itemType: typeof item.itemType === 'string' ? item.itemType : 'BLEND',
                quantity,
                unitPriceCents,
                lineSubtotalCents,
                productId: typeof item.productId === 'string' ? item.productId : null,
                variantId: typeof item.variantId === 'string' ? item.variantId : null,
                subscriptionPlanId: typeof item.subscriptionPlanId === 'string' ? item.subscriptionPlanId : null,
                isGift: Boolean(item.isGift),
            };
        });
        const subtotalCents = normalizedSummaryItems.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
        const productSubtotalCents = normalizedSummaryItems.reduce((sum, item) => {
            if (item.itemType === 'VARIANT' || item.itemType === 'PACK' || item.itemType === 'SUBSCRIPTION') {
                return sum + item.lineSubtotalCents;
            }
            return sum;
        }, 0);

        let settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
        if (!settings) {
            settings = await prisma.storeSettings.create({ data: { id: 'default' } });
        }

        const discounts = await prisma.discount.findMany();
        const totalRedemptions = await prisma.discountRedemption.groupBy({
            by: ['discountId'],
            _count: { _all: true },
        });
        const customerRedemptions = effectiveCustomerEmail
            ? await prisma.discountRedemption.groupBy({
                by: ['discountId'],
                where: { customerEmail: effectiveCustomerEmail },
                _count: { _all: true },
            })
            : [];

        const usageById = {};
        totalRedemptions.forEach((entry) => {
            usageById[entry.discountId] = {
                totalRedemptions: entry._count._all,
                customerRedemptions: 0,
            };
        });
        customerRedemptions.forEach((entry) => {
            if (!usageById[entry.discountId]) {
                usageById[entry.discountId] = { totalRedemptions: 0, customerRedemptions: 0 };
            }
            usageById[entry.discountId].customerRedemptions = entry._count._all;
        });

        const isFirstOrderEligible = !(await hasPaidOrConfirmedOrder({
            customerId: session.customer.id,
            customerEmail: effectiveCustomerEmail || null,
        }));

        const shippingCents = resolveShippingCents({
            mode: shippingSelection?.mode,
            offerCode: shippingSelection?.offerCode || null,
            defaultCents: settings.defaultShippingCents,
        });

        const summary = computeDiscounts({
            discounts,
            usageById,
            subtotalCents,
            productSubtotalCents,
            shippingCents,
            items: normalizedSummaryItems,
            appliedCode: appliedDiscountCode,
            customerEmail: effectiveCustomerEmail || null,
            isFirstOrderEligible,
            now: new Date(),
        });

        const activeFreeShipping = discounts
            .filter((discount) => discount.method === 'AUTOMATIC' && discount.type === 'FREE_SHIPPING' && discount.status === 'ACTIVE')
            .filter((discount) => {
                if (discount.startAt && new Date() < discount.startAt)
                    return false;
                if (discount.endAt && new Date() > discount.endAt)
                    return false;
                return true;
            })
            .sort((a, b) => (a.minimumSubtotalCents || 0) - (b.minimumSubtotalCents || 0));

        const freeShippingDiscount = activeFreeShipping[0] || null;
        const thresholdCents = freeShippingDiscount?.minimumSubtotalCents ?? settings.freeShippingThresholdCents;
        const remainingCents = Math.max(0, thresholdCents - subtotalCents);
        const progress = thresholdCents > 0 ? Math.min(1, subtotalCents / thresholdCents) : 0;

        res.json({
            subtotalCents,
            shippingCents: summary.shippingCents,
            originalShippingCents: shippingCents,
            discountTotalCents: summary.discountTotalCents,
            totalCents: summary.totalCents,
            discountLines: summary.discountLines,
            matchedDiscounts: summary.matchedDiscounts,
            messages: summary.messages,
            appliedCode: summary.appliedCode,
            freeShippingProgress: freeShippingDiscount
                ? {
                    thresholdCents,
                    remainingCents,
                    progress,
                    isUnlocked: remainingCents === 0,
                    discountId: freeShippingDiscount.id,
                }
                : null,
        });
    }
    catch (error) {
        if (error instanceof Error && error.message === 'INGREDIENT_NOT_FOUND') {
            return res.status(404).json({ error: 'One or more ingredients not found' });
        }
        console.error('Error computing cart summary:', error);
        res.status(500).json({ error: 'Failed to compute cart summary' });
    }
});
// Create Stripe Checkout session
app.post('/api/checkout/stripe-session', async (req, res) => {
    try {
        if (!stripe) {
            return res.status(501).json({ error: 'Stripe is not configured' });
        }
        const { items, appliedDiscountCode, customerEmail, successUrl, cancelUrl, shippingSelection } = req.body;
        const effectiveCustomerEmail = normalizeEmail(customerEmail);
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Cart items are required' });
        }
        const ingredientIds = Array.from(new Set(items.flatMap((item) => (item.ingredientIds || []).filter(Boolean))));
        const ingredientNames = Array.from(new Set(items.flatMap((item) => (item.ingredientNames || []).filter(Boolean))));
        if (ingredientIds.length === 0 && ingredientNames.length === 0) {
            return res.status(400).json({ error: 'Ingredient identifiers are required' });
        }
        const ingredients = ingredientNames.length > 0
            ? await prisma.ingredient.findMany({
                select: { id: true, price: true, name: true, category: true },
            })
            : await prisma.ingredient.findMany({
                where: { id: { in: ingredientIds } },
                select: { id: true, price: true, name: true, category: true },
            });
        const ingredientById = new Map(ingredients.map((ing) => [ing.id, ing]));
        const ingredientByName = new Map(ingredients.map((ing) => [normalizeIngredientLookupKey(ing.name), ing]));
        const normalizedStripeItems = items.map((item) => {
            const quantity = Math.max(1, item.quantity || 1);
            const resolvedIngredients = resolveBlendIngredientsForPricing({
                ingredientIds: item.ingredientIds,
                ingredientNames: item.ingredientNames,
                ingredientById,
                ingredientByName,
            });
            const unitCents = computeBlendUnitPriceCents(resolvedIngredients);
            const lineSubtotalCents = unitCents * quantity;
            return {
                itemType: item.itemType || 'BLEND',
                quantity,
                unitPriceCents: unitCents,
                lineSubtotalCents,
                productId: typeof item.productId === 'string' ? item.productId : null,
                variantId: typeof item.variantId === 'string' ? item.variantId : null,
                subscriptionPlanId: typeof item.subscriptionPlanId === 'string' ? item.subscriptionPlanId : null,
            };
        });
        const subtotalCents = normalizedStripeItems.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
        let settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
        if (!settings) {
            settings = await prisma.storeSettings.create({ data: { id: 'default' } });
        }
        const discounts = await prisma.discount.findMany();
        const totalRedemptions = await prisma.discountRedemption.groupBy({
            by: ['discountId'],
            _count: { _all: true },
        });
        const customerRedemptions = effectiveCustomerEmail
            ? await prisma.discountRedemption.groupBy({
                by: ['discountId'],
                where: { customerEmail: effectiveCustomerEmail },
                _count: { _all: true },
            })
            : [];
        const usageById = {};
        totalRedemptions.forEach((entry) => {
            usageById[entry.discountId] = {
                totalRedemptions: entry._count._all,
                customerRedemptions: 0,
            };
        });
        customerRedemptions.forEach((entry) => {
            if (!usageById[entry.discountId]) {
                usageById[entry.discountId] = { totalRedemptions: 0, customerRedemptions: 0 };
            }
            usageById[entry.discountId].customerRedemptions = entry._count._all;
        });
        const isFirstOrderEligible = !(await hasPaidOrConfirmedOrder({
            customerEmail: effectiveCustomerEmail,
        }));
        const shippingCents = resolveShippingCents({
            mode: shippingSelection?.mode,
            offerCode: shippingSelection?.offerCode || null,
            defaultCents: settings.defaultShippingCents,
        });
        const summary = computeDiscounts({
            discounts,
            usageById,
            subtotalCents,
            productSubtotalCents: 0,
            shippingCents,
            items: normalizedStripeItems,
            appliedCode: appliedDiscountCode,
            customerEmail: effectiveCustomerEmail,
            isFirstOrderEligible,
            now: new Date(),
        });
        const firstOrderOnlyError = resolveFirstOrderOnlyDiscountError(summary, appliedDiscountCode);
        if (firstOrderOnlyError) {
            return res.status(409).json({ error: firstOrderOnlyError });
        }
        const subtotalDiscountCents = summary.discountLines
            .filter((line) => line.type !== 'FREE_SHIPPING')
            .reduce((sum, line) => sum + line.amountCents, 0);
        const currency = (settings.currency || 'EUR').toLowerCase();
        const lineItems = items.map((item, index) => {
            const unitCents = normalizedStripeItems[index]?.unitPriceCents || 0;
            return {
                price_data: {
                    currency,
                    product_data: {
                        name: item.name || 'Blend personnalisé',
                    },
                    unit_amount: Math.max(0, unitCents),
                },
                quantity: Math.max(1, item.quantity || 1),
            };
        });
        if (summary.shippingCents > 0) {
            lineItems.push({
                price_data: {
                    currency,
                    product_data: { name: 'Livraison' },
                    unit_amount: summary.shippingCents,
                },
                quantity: 1,
            });
        }
        let discountsPayload;
        if (subtotalDiscountCents > 0) {
            const coupon = await stripe.coupons.create({
                amount_off: subtotalDiscountCents,
                currency,
                duration: 'once',
                name: 'Remise',
            });
            discountsPayload = [{ coupon: coupon.id }];
        }
        const success = successUrl || process.env.STRIPE_SUCCESS_URL || `${WEB_BASE_URL}/orderstripe=success&session_id={CHECKOUT_SESSION_ID}`;
        const cancel = cancelUrl || process.env.STRIPE_CANCEL_URL || `${WEB_BASE_URL}/cart`;
        const allowedCountries = (process.env.BOXTAL_ALLOWED_COUNTRIES || 'FR')
            .split(',')
            .map((c) => c.trim().toUpperCase())
            .filter(Boolean);
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: lineItems,
            discounts: discountsPayload,
            success_url: success,
            cancel_url: cancel,
            customer_email: effectiveCustomerEmail || undefined,
            shipping_address_collection: {
                allowed_countries: allowedCountries,
            },
            metadata: {
                appliedDiscountCode: summary.appliedCode || '',
                discountTotalCents: String(summary.discountTotalCents),
                discountLines: JSON.stringify(summary.discountLines || []),
                shippingSelection: resolvedShippingSelection ? JSON.stringify(resolvedShippingSelection) : '',
            },
        });
        res.json({ url: session.url, id: session.id });
    }
    catch (error) {
        if (error instanceof Error && error.message === 'INGREDIENT_NOT_FOUND') {
            return res.status(404).json({ error: 'One or more ingredients not found' });
        }
        console.error('Error creating Stripe session:', error);
        res.status(500).json({ error: 'Failed to create Stripe session' });
    }
});
// Checkout (subscription)
app.post('/api/checkout/subscription', requireCustomer, async (req, res) => {
    try {
        if (!stripe) {
            return res.status(501).json({ error: 'Stripe is not configured' });
        }
        const { planId, successUrl, cancelUrl } = req.body;
        if (!planId) {
            return res.status(400).json({ error: 'planId is required' });
        }
        const customer = req.customer;
        let cart = await getActiveCart(customer.id);
        cart = (await syncAutomaticGiftCartItems({ customer, cartId: cart.id })) || cart;
        if (cart.items.some((item) => item.itemType !== 'SUBSCRIPTION')) {
            return res.status(409).json({ error: 'Le paiement des abonnements doit être séparé des autres articles.' });
        }
        if (cart.items.length > 0 && !cart.items.some((item) => item.subscriptionPlanId === planId)) {
            return res.status(409).json({ error: 'Le panier contient un autre abonnement.' });
        }
        const plan = await prisma.subscriptionPlan.findUnique({
            where: { id: planId },
            include: { product: true },
        });
        if (!plan || !plan.isActive || !plan.product.isActive) {
            return res.status(404).json({ error: 'Subscription plan not found' });
        }
        const success = successUrl || process.env.STRIPE_SUCCESS_URL || `${WEB_BASE_URL}/orderstripe=success&session_id={CHECKOUT_SESSION_ID}`;
        const cancel = cancelUrl || process.env.STRIPE_CANCEL_URL || `${WEB_BASE_URL}/cart`;
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ price: plan.stripePriceId, quantity: 1 }],
            success_url: success,
            cancel_url: cancel,
            customer_email: customer.email || undefined,
            metadata: {
                planId: plan.id,
                customerId: customer.id,
            },
        });
        res.json({ url: session.url, id: session.id });
    }
    catch (error) {
        console.error('Error creating subscription checkout:', error);
        res.status(500).json({ error: 'Failed to create subscription checkout' });
    }
});
// Checkout (one-time) from DB cart
app.post('/api/checkout/payment-intent', requireCustomer, async (req, res) => {
    try {
        if (!stripe) {
            return res.status(501).json({ error: 'Stripe is not configured' });
        }

        const { shippingSelection, appliedDiscountCode, comment, shippingAddress: rawShippingAddress, billingAddress: rawBillingAddress } = req.body || {};
        const customer = req.customer;
        const resolvedShippingSelection = resolveOrderShippingSelection(shippingSelection);

        let shippingAddress = null;
        let billingAddress = null;
        try {
            if (rawShippingAddress !== undefined) {
                shippingAddress = normalizeCheckoutAddressInput(rawShippingAddress, 'shippingAddress');
            }
            if (rawBillingAddress !== undefined) {
                billingAddress = normalizeCheckoutAddressInput(rawBillingAddress, 'billingAddress');
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid checkout address payload';
            return res.status(400).json({ error: message });
        }

        let cart = await getActiveCart(customer.id);
        cart = (await syncAutomaticGiftCartItems({ customer, cartId: cart.id })) || cart;
        if (!cart.items || cart.items.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }
        if (cart.items.some((item) => item.itemType === 'SUBSCRIPTION')) {
            return res.status(409).json({ error: 'Le paiement des abonnements doit être séparé des autres articles.' });
        }

        const orderItems = cart.items.map((item) => {
            const lineSubtotalCents = item.unitPriceCents * item.qty;
            return {
                itemType: item.itemType,
                qty: item.qty,
                unitPriceCents: item.unitPriceCents,
                snapshot: item.snapshot,
                lineSubtotalCents,
                lineDiscountCents: 0,
                lineTotalCents: lineSubtotalCents,
                subscriptionPlanId: item.subscriptionPlanId || null,
            };
        });

        const subtotalCents = orderItems.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
        const normalizedCartDiscountItems = cart.items.map((item) => ({
            itemType: item.itemType,
            quantity: item.qty,
            unitPriceCents: item.unitPriceCents,
            lineSubtotalCents: item.unitPriceCents * item.qty,
            productId: typeof item.snapshot?.productId === 'string' ? item.snapshot.productId : null,
            variantId: typeof item.snapshot?.variantId === 'string' ? item.snapshot.variantId : item.variantId || null,
            subscriptionPlanId:
                item.subscriptionPlanId ||
                (typeof item.snapshot?.planId === 'string' ? item.snapshot.planId : null),
            isGift: isGiftCartItem(item),
        }));
        const productSubtotalCents = normalizedCartDiscountItems.reduce((sum, item) => {
            if (item.itemType === 'VARIANT' || item.itemType === 'PACK' || item.itemType === 'SUBSCRIPTION') {
                return sum + item.lineSubtotalCents;
            }
            return sum;
        }, 0);
        let settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
        if (!settings) {
            settings = await prisma.storeSettings.create({ data: { id: 'default' } });
        }
        const discounts = await prisma.discount.findMany();
        const totalRedemptions = await prisma.discountRedemption.groupBy({
            by: ['discountId'],
            _count: { _all: true },
        });
        const normalizedCustomerEmail = normalizeEmail(customer.email);
        const customerRedemptions = normalizedCustomerEmail
            ? await prisma.discountRedemption.groupBy({
                by: ['discountId'],
                where: { customerEmail: normalizedCustomerEmail },
                _count: { _all: true },
            })
            : [];
        const usageById = {};
        totalRedemptions.forEach((entry) => {
            usageById[entry.discountId] = {
                totalRedemptions: entry._count._all,
                customerRedemptions: 0,
            };
        });
        customerRedemptions.forEach((entry) => {
            if (!usageById[entry.discountId]) {
                usageById[entry.discountId] = { totalRedemptions: 0, customerRedemptions: 0 };
            }
            usageById[entry.discountId].customerRedemptions = entry._count._all;
        });
        const isFirstOrderEligible = !(await hasPaidOrConfirmedOrder({
            customerId: customer.id,
            customerEmail: normalizedCustomerEmail,
        }));
        const quotedOffer = await resolveBoxtalQuoteSelection({
            mode: resolvedShippingSelection.mode,
            requestedOfferCode: resolvedShippingSelection.offerCode,
            countryCode: shippingAddress?.countryCode || resolvedShippingSelection.countryCode,
            postalCode: shippingAddress?.postalCode || resolvedShippingSelection.postalCode,
            city: shippingAddress?.city || resolvedShippingSelection.city,
            addressLine1: shippingAddress?.address1 || null,
            declaredValueEur: subtotalCents / 100,
        });
        const effectiveShippingSelection = resolveOrderShippingSelection({
            ...resolvedShippingSelection,
            countryCode: shippingAddress?.countryCode || resolvedShippingSelection.countryCode,
            postalCode: shippingAddress?.postalCode || resolvedShippingSelection.postalCode,
            city: shippingAddress?.city || resolvedShippingSelection.city,
            ...(quotedOffer
                ? {
                    offerId: quotedOffer.offerId,
                    offerCode: quotedOffer.offerCode,
                    offerLabel: quotedOffer.offerLabel,
                }
                : {}),
        });
        if (effectiveShippingSelection.mode === 'RELAY' &&
            !effectiveShippingSelection.offerId &&
            !effectiveShippingSelection.offerCode) {
            return res.status(400).json({
                error: 'La livraison en point relais est indisponible pour cette adresse.',
            });
        }

        const originalShippingCents = resolveShippingCents({
            mode: effectiveShippingSelection.mode,
            offerCode: effectiveShippingSelection.offerCode || null,
            defaultCents: settings.defaultShippingCents,
        });
        const summary = computeDiscounts({
            discounts,
            usageById,
            subtotalCents,
            productSubtotalCents,
            shippingCents: originalShippingCents,
            items: normalizedCartDiscountItems,
            appliedCode: appliedDiscountCode,
            customerEmail: normalizedCustomerEmail,
            isFirstOrderEligible,
            now: new Date(),
        });
        const firstOrderOnlyError = resolveFirstOrderOnlyDiscountError(summary, appliedDiscountCode);
        if (firstOrderOnlyError) {
            return res.status(409).json({ error: firstOrderOnlyError });
        }
        const shippingCents = summary.shippingCents;
        const totalCents = summary.totalCents;
        const shippingAddressSnapshot = shippingAddress
            ? {
                salutation: shippingAddress.salutation || null,
                firstName: shippingAddress.firstName,
                lastName: shippingAddress.lastName,
                address1: shippingAddress.address1,
                address2: shippingAddress.address2 || null,
                postalCode: shippingAddress.postalCode,
                city: shippingAddress.city,
                countryCode: shippingAddress.countryCode,
                phoneE164: shippingAddress.phoneE164,
            }
            : null;
        const billingAddressSnapshot = billingAddress
            ? {
                salutation: billingAddress.salutation || null,
                firstName: billingAddress.firstName,
                lastName: billingAddress.lastName,
                address1: billingAddress.address1,
                address2: billingAddress.address2 || null,
                postalCode: billingAddress.postalCode,
                city: billingAddress.city,
                countryCode: billingAddress.countryCode,
                phoneE164: billingAddress.phoneE164,
            }
            : null;

        const pendingOrderData = {
            customerId: customer.id,
            userId: null,
            cartId: cart.id,
            status: 'PENDING',
            subtotal: subtotalCents / 100,
            shippingCost: shippingCents / 100,
            tax: 0,
            total: totalCents / 100,
            subtotalCents,
            shippingCents,
            discountTotalCents: summary.discountTotalCents,
            totalCents,
            appliedDiscounts: summary.discountLines,
            appliedDiscountCode: summary.appliedCode,
            paymentMethod: 'stripe',
            paymentStatus: 'pending',
            stripeSessionId: null,
            comment: typeof comment === 'string' && comment.trim() ? comment.trim() : null,
            shippingAddress: shippingAddress ? checkoutAddressToString(shippingAddress) : (customer.address || ''),
            billingAddressSnapshot,
            shippingAddressSnapshot,
            shippingProvider: effectiveShippingSelection.offerId || effectiveShippingSelection.offerCode ? 'BOXTAL' : null,
            shippingMode: effectiveShippingSelection.mode || null,
            shippingOfferId: effectiveShippingSelection.offerId || null,
            shippingOfferCode: effectiveShippingSelection.offerCode || null,
            shippingOfferLabel: effectiveShippingSelection.offerLabel || null,
            relayPointId: effectiveShippingSelection.relayPoint?.id || null,
            relayPointLabel: effectiveShippingSelection.relayPoint?.name || null,
            relayNetwork: effectiveShippingSelection.relayPoint?.network || null,
            shippingMeta: {
                ...effectiveShippingSelection,
                ...(quotedOffer ? { quoteMeta: quotedOffer.quoteMeta || null } : {}),
            },
        };

        const existingPendingOrder = await prisma.order.findFirst({
            where: {
                customerId: customer.id,
                cartId: cart.id,
                status: 'PENDING',
                paymentStatus: { not: 'completed' },
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        });

        const order = existingPendingOrder
            ? await prisma.$transaction(async (tx) => {
                await tx.orderItem.deleteMany({ where: { orderId: existingPendingOrder.id } });
                return tx.order.update({
                    where: { id: existingPendingOrder.id },
                    data: {
                        ...pendingOrderData,
                        items: {
                            create: orderItems,
                        },
                    },
                    include: { items: true },
                });
            })
            : await prisma.order.create({
                data: {
                    ...pendingOrderData,
                    orderNumber: `ORD-${Date.now()}`,
                    items: {
                        create: orderItems,
                    },
                },
                include: { items: true },
            });

        if (totalCents <= 0) {
            await finalizePaidOrder(order.id);
            return res.json({
                orderId: order.id,
                paymentIntentId: null,
                clientSecret: null,
                totals: {
                    subtotalCents,
                    shippingCents,
                    discountTotalCents: summary.discountTotalCents,
                    totalCents,
                },
            });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: totalCents,
            currency: (settings.currency || 'EUR').toLowerCase(),
            automatic_payment_methods: { enabled: true },
            receipt_email: customer.email || undefined,
            metadata: {
                orderId: order.id,
                cartId: cart.id,
                customerId: customer.id,
            },
        });

        await prisma.order.update({
            where: { id: order.id },
            data: { stripeSessionId: paymentIntent.id },
        });

        res.json({
            orderId: order.id,
            paymentIntentId: paymentIntent.id,
            clientSecret: paymentIntent.client_secret,
            totals: {
                subtotalCents,
                shippingCents,
                discountTotalCents: summary.discountTotalCents,
                totalCents,
            },
        });
    }
    catch (error) {
        console.error('Error creating payment intent checkout:', error);
        res.status(500).json({ error: 'Failed to create payment intent checkout' });
    }
});

app.post('/api/checkout/one-time', requireCustomer, async (req, res) => {
    try {
        if (!stripe) {
            return res.status(501).json({ error: 'Stripe is not configured' });
        }

        const { shippingSelection, appliedDiscountCode } = req.body || {};
        const customer = req.customer;
        const normalizedCustomerEmail = normalizeEmail(customer.email);
        const resolvedShippingSelection = resolveOrderShippingSelection(shippingSelection);
        let cart = await getActiveCart(customer.id);
        cart = (await syncAutomaticGiftCartItems({ customer, cartId: cart.id })) || cart;

        if (!cart.items || cart.items.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }
        if (cart.items.some((item) => item.itemType === 'SUBSCRIPTION')) {
            return res.status(409).json({ error: 'Le paiement des abonnements doit être séparé des autres articles.' });
        }

        let settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
        if (!settings) {
            settings = await prisma.storeSettings.create({ data: { id: 'default' } });
        }

        const orderItems = cart.items.map((item) => {
            const lineSubtotalCents = item.unitPriceCents * item.qty;
            return {
                itemType: item.itemType,
                qty: item.qty,
                unitPriceCents: item.unitPriceCents,
                snapshot: item.snapshot,
                lineSubtotalCents,
                lineDiscountCents: 0,
                lineTotalCents: lineSubtotalCents,
                subscriptionPlanId: item.subscriptionPlanId || null,
            };
        });

        const subtotalCents = orderItems.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
        const normalizedCartDiscountItems = cart.items.map((item) => ({
            itemType: item.itemType,
            quantity: item.qty,
            unitPriceCents: item.unitPriceCents,
            lineSubtotalCents: item.unitPriceCents * item.qty,
            productId: typeof item.snapshot?.productId === 'string' ? item.snapshot.productId : null,
            variantId: typeof item.snapshot?.variantId === 'string' ? item.snapshot.variantId : item.variantId || null,
            subscriptionPlanId:
                item.subscriptionPlanId ||
                (typeof item.snapshot?.planId === 'string' ? item.snapshot.planId : null),
            isGift: isGiftCartItem(item),
        }));
        const productSubtotalCents = normalizedCartDiscountItems.reduce((sum, item) => {
            if (item.itemType === 'VARIANT' || item.itemType === 'PACK' || item.itemType === 'SUBSCRIPTION') {
                return sum + item.lineSubtotalCents;
            }
            return sum;
        }, 0);
        const discounts = await prisma.discount.findMany();
        const totalRedemptions = await prisma.discountRedemption.groupBy({
            by: ['discountId'],
            _count: { _all: true },
        });
        const customerRedemptions = normalizedCustomerEmail
            ? await prisma.discountRedemption.groupBy({
                by: ['discountId'],
                where: { customerEmail: normalizedCustomerEmail },
                _count: { _all: true },
            })
            : [];
        const usageById = {};
        totalRedemptions.forEach((entry) => {
            usageById[entry.discountId] = {
                totalRedemptions: entry._count._all,
                customerRedemptions: 0,
            };
        });
        customerRedemptions.forEach((entry) => {
            if (!usageById[entry.discountId]) {
                usageById[entry.discountId] = { totalRedemptions: 0, customerRedemptions: 0 };
            }
            usageById[entry.discountId].customerRedemptions = entry._count._all;
        });
        const isFirstOrderEligible = !(await hasPaidOrConfirmedOrder({
            customerId: customer.id,
            customerEmail: normalizedCustomerEmail,
        }));
        const quotedOffer = await resolveBoxtalQuoteSelection({
            mode: resolvedShippingSelection.mode,
            requestedOfferCode: resolvedShippingSelection.offerCode,
            countryCode: customer.country || resolvedShippingSelection.countryCode,
            postalCode: customer.postalCode || resolvedShippingSelection.postalCode,
            city: customer.city || resolvedShippingSelection.city,
            addressLine1: customer.address || null,
            declaredValueEur: subtotalCents / 100,
        });
        const effectiveShippingSelection = resolveOrderShippingSelection({
            ...resolvedShippingSelection,
            countryCode: customer.country || resolvedShippingSelection.countryCode,
            postalCode: customer.postalCode || resolvedShippingSelection.postalCode,
            city: customer.city || resolvedShippingSelection.city,
            ...(quotedOffer
                ? {
                    offerId: quotedOffer.offerId,
                    offerCode: quotedOffer.offerCode,
                    offerLabel: quotedOffer.offerLabel,
                }
                : {}),
        });
        if (effectiveShippingSelection.mode === 'RELAY' &&
            !effectiveShippingSelection.offerId &&
            !effectiveShippingSelection.offerCode) {
            return res.status(400).json({
                error: 'La livraison en point relais est indisponible pour cette adresse.',
            });
        }
        const originalShippingCents = resolveShippingCents({
            mode: effectiveShippingSelection.mode,
            offerCode: effectiveShippingSelection.offerCode || null,
            defaultCents: settings.defaultShippingCents,
        });
        const summary = computeDiscounts({
            discounts,
            usageById,
            subtotalCents,
            productSubtotalCents,
            shippingCents: originalShippingCents,
            items: normalizedCartDiscountItems,
            appliedCode: appliedDiscountCode,
            customerEmail: normalizedCustomerEmail,
            isFirstOrderEligible,
            now: new Date(),
        });
        const firstOrderOnlyError = resolveFirstOrderOnlyDiscountError(summary, appliedDiscountCode);
        if (firstOrderOnlyError) {
            return res.status(409).json({ error: firstOrderOnlyError });
        }
        const shippingCents = summary.shippingCents;
        const totalCents = summary.totalCents;
        const subtotalDiscountCents = summary.discountLines
            .filter((line) => line.type !== 'FREE_SHIPPING')
            .reduce((sum, line) => sum + line.amountCents, 0);

        const pendingOrderData = {
            customerId: customer.id,
            userId: null,
            cartId: cart.id,
            status: 'PENDING',
            subtotal: subtotalCents / 100,
            shippingCost: shippingCents / 100,
            tax: 0,
            total: totalCents / 100,
            subtotalCents,
            shippingCents,
            discountTotalCents: summary.discountTotalCents,
            totalCents,
            appliedDiscounts: summary.discountLines,
            appliedDiscountCode: summary.appliedCode,
            paymentMethod: 'stripe',
            paymentStatus: 'pending',
            stripeSessionId: null,
            shippingAddress: customer.address || '',
            shippingProvider: effectiveShippingSelection.offerId || effectiveShippingSelection.offerCode ? 'BOXTAL' : null,
            shippingMode: effectiveShippingSelection.mode || null,
            shippingOfferId: effectiveShippingSelection.offerId || null,
            shippingOfferCode: effectiveShippingSelection.offerCode || null,
            shippingOfferLabel: effectiveShippingSelection.offerLabel || null,
            relayPointId: effectiveShippingSelection.relayPoint?.id || null,
            relayPointLabel: effectiveShippingSelection.relayPoint?.name || null,
            relayNetwork: effectiveShippingSelection.relayPoint?.network || null,
            shippingMeta: {
                ...effectiveShippingSelection,
                ...(quotedOffer ? { quoteMeta: quotedOffer.quoteMeta || null } : {}),
            },
        };

        const existingPendingOrder = await prisma.order.findFirst({
            where: {
                customerId: customer.id,
                cartId: cart.id,
                status: 'PENDING',
                paymentStatus: { not: 'completed' },
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        });

        const order = existingPendingOrder
            ? await prisma.$transaction(async (tx) => {
                await tx.orderItem.deleteMany({ where: { orderId: existingPendingOrder.id } });
                return tx.order.update({
                    where: { id: existingPendingOrder.id },
                    data: {
                        ...pendingOrderData,
                        items: {
                            create: orderItems,
                        },
                    },
                    include: { items: true },
                });
            })
            : await prisma.order.create({
                data: {
                    ...pendingOrderData,
                    orderNumber: `ORD-${Date.now()}`,
                    items: {
                        create: orderItems,
                    },
                },
                include: { items: true },
            });

        const lineItems = cart.items.map((item) => {
            const title = item.snapshot?.title || 'Article';
            return {
                price_data: {
                    currency: 'eur',
                    product_data: { name: title },
                    unit_amount: item.unitPriceCents,
                },
                quantity: item.qty,
            };
        });

        if (summary.shippingCents > 0) {
            lineItems.push({
                price_data: {
                    currency: 'eur',
                    product_data: { name: 'Livraison' },
                    unit_amount: summary.shippingCents,
                },
                quantity: 1,
            });
        }

        let discountsPayload;
        if (subtotalDiscountCents > 0) {
            const coupon = await stripe.coupons.create({
                amount_off: subtotalDiscountCents,
                currency: 'eur',
                duration: 'once',
                name: 'Remise',
            });
            discountsPayload = [{ coupon: coupon.id }];
        }

        const success = process.env.STRIPE_SUCCESS_URL || `${WEB_BASE_URL}/order?stripe=success&session_id={CHECKOUT_SESSION_ID}`;
        const cancel = process.env.STRIPE_CANCEL_URL || `${WEB_BASE_URL}/cart`;
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: lineItems,
            discounts: discountsPayload,
            success_url: success,
            cancel_url: cancel,
            customer_email: normalizedCustomerEmail || undefined,
            metadata: {
                orderId: order.id,
                cartId: cart.id,
                customerId: customer.id,
                appliedDiscountCode: summary.appliedCode || '',
                discountTotalCents: String(summary.discountTotalCents),
                discountLines: JSON.stringify(summary.discountLines || []),
                shippingSelection: effectiveShippingSelection ? JSON.stringify(effectiveShippingSelection) : '',
            },
        });

        await prisma.order.update({
            where: { id: order.id },
            data: { stripeSessionId: session.id },
        });

        res.json({ url: session.url, id: session.id });
    }
    catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});
// Create order after Stripe success
app.post('/api/orders/stripe-success', async (req, res) => {
    try {
        if (!stripe) {
            return res.status(501).json({ error: 'Stripe is not configured' });
        }
        const { sessionId, items, appliedDiscountCode, shippingSelection } = req.body;
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Cart items are required' });
        }
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['customer_details'],
        });
        if (session.payment_status !== 'paid') {
            return res.status(400).json({ error: 'Payment not completed' });
        }
        const ingredientIds = Array.from(new Set(items.flatMap((item) => (item.ingredientIds || []).filter(Boolean))));
        const ingredientNames = Array.from(new Set(items.flatMap((item) => (item.ingredientNames || []).filter(Boolean))));
        const ingredients = ingredientNames.length > 0
            ? await prisma.ingredient.findMany({
                select: { id: true, price: true, name: true, color: true, category: true },
            })
            : await prisma.ingredient.findMany({
                where: { id: { in: ingredientIds } },
                select: { id: true, price: true, name: true, color: true, category: true },
            });
        const ingredientById = new Map(ingredients.map((ing) => [ing.id, ing]));
        const ingredientByName = new Map(ingredients.map((ing) => [normalizeIngredientLookupKey(ing.name), ing]));
        const orderItems = [];
        const normalizedStripeSuccessItems = [];
        let subtotalCents = 0;
        items.forEach((item) => {
            const quantity = Math.max(1, item.quantity || 1);
            const resolvedIngredients = resolveBlendIngredientsForPricing({
                ingredientIds: item.ingredientIds,
                ingredientNames: item.ingredientNames,
                ingredientById,
                ingredientByName,
            });
            const unitPriceCents = computeBlendUnitPriceCents(resolvedIngredients);
            resolvedIngredients.forEach((ingredient) => {
                orderItems.push({
                    quantity,
                    price: ingredient.price,
                    ingredientName: ingredient.name || 'Ingrédient',
                    ingredientColor: ingredient.color || '#6B7280',
                });
            });
            normalizedStripeSuccessItems.push({
                itemType: item.itemType || 'BLEND',
                quantity,
                unitPriceCents,
                lineSubtotalCents: unitPriceCents * quantity,
                productId: typeof item.productId === 'string' ? item.productId : null,
                variantId: typeof item.variantId === 'string' ? item.variantId : null,
                subscriptionPlanId: typeof item.subscriptionPlanId === 'string' ? item.subscriptionPlanId : null,
            });
            subtotalCents += unitPriceCents * quantity;
        });
        let settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
        if (!settings) {
            settings = await prisma.storeSettings.create({ data: { id: 'default' } });
        }
        const discounts = await prisma.discount.findMany();
        const totalRedemptions = await prisma.discountRedemption.groupBy({
            by: ['discountId'],
            _count: { _all: true },
        });
        const customerEmail = session.customer_details.email || session.customer_email || null;
        const normalizedCustomerEmail = normalizeEmail(customerEmail);
        const customerRedemptions = normalizedCustomerEmail
            ? await prisma.discountRedemption.groupBy({
                by: ['discountId'],
                where: { customerEmail: normalizedCustomerEmail },
                _count: { _all: true },
            })
            : [];
        const usageById = {};
        totalRedemptions.forEach((entry) => {
            usageById[entry.discountId] = {
                totalRedemptions: entry._count._all,
                customerRedemptions: 0,
            };
        });
        customerRedemptions.forEach((entry) => {
            if (!usageById[entry.discountId]) {
                usageById[entry.discountId] = { totalRedemptions: 0, customerRedemptions: 0 };
            }
            usageById[entry.discountId].customerRedemptions = entry._count._all;
        });
        const isFirstOrderEligible = !(await hasPaidOrConfirmedOrder({
            customerEmail: normalizedCustomerEmail,
        }));
        let summary = computeDiscounts({
            discounts,
            usageById,
            subtotalCents,
            productSubtotalCents: 0,
            shippingCents: settings.defaultShippingCents,
            items: normalizedStripeSuccessItems,
            appliedCode: appliedDiscountCode,
            customerEmail: normalizedCustomerEmail,
            isFirstOrderEligible,
            now: new Date(),
        });
        const email = normalizedCustomerEmail || `guest-${Date.now()}@myowntea.com`;
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            const passwordHash = await bcrypt.hash(`stripe-${Date.now()}`, 10);
            user = await prisma.user.create({
                data: {
                    email,
                    passwordHash,
                    role: 'CUSTOMER',
                },
            });
        }
        let customer = await prisma.customer.findUnique({ where: { userId: user.id } });
        if (!customer) {
            const fullName = session.customer_details.name || 'Client Stripe';
            const [firstName, ...rest] = fullName.split(' ');
            const lastName = rest.join(' ') || 'Stripe';
            const address = session.customer_details.address;
            customer = await prisma.customer.create({
                data: {
                    userId: user.id,
                    authProvider: 'PASSWORD',
                    firstName: firstName || 'Client',
                    lastName,
                    phone: session.customer_details.phone || null,
                    address: address.line1 || 'Adresse indisponible',
                    city: address.city || 'Ville',
                    postalCode: address.postal_code || '00000',
                    country: address.country || 'FR',
                },
            });
        }
        const metadataSelection = parseStripeShippingSelectionMetadata(session.metadata?.shippingSelection);
        const resolvedSelection = resolveOrderShippingSelection(shippingSelection || metadataSelection || null);
        const quotedSelection = await resolveBoxtalQuoteSelection({
            mode: resolvedSelection.mode,
            requestedOfferCode: resolvedSelection.offerCode,
            countryCode: customer.country || resolvedSelection.countryCode || session.customer_details.address?.country,
            postalCode: customer.postalCode || resolvedSelection.postalCode || session.customer_details.address?.postal_code,
            city: customer.city || resolvedSelection.city || session.customer_details.address?.city,
            addressLine1: customer.address || session.customer_details.address?.line1 || null,
            declaredValueEur: summary.subtotalCents / 100,
        });
        const effectiveResolvedSelection = resolveOrderShippingSelection({
            ...resolvedSelection,
            countryCode: customer.country || resolvedSelection.countryCode || session.customer_details.address?.country,
            postalCode: customer.postalCode || resolvedSelection.postalCode || session.customer_details.address?.postal_code,
            city: customer.city || resolvedSelection.city || session.customer_details.address?.city,
            ...(quotedSelection
                ? {
                    offerId: quotedSelection.offerId,
                    offerCode: quotedSelection.offerCode,
                    offerLabel: quotedSelection.offerLabel,
                }
                : {}),
        });
        const isFirstOrderEligibleAtCreation = !(await hasPaidOrConfirmedOrder({
            customerId: customer.id,
            userId: user.id,
            customerEmail: normalizedCustomerEmail,
        }));
        if (isFirstOrderEligibleAtCreation !== isFirstOrderEligible) {
            summary = computeDiscounts({
                discounts,
                usageById,
                subtotalCents,
                productSubtotalCents: 0,
                shippingCents: settings.defaultShippingCents,
                items: normalizedStripeSuccessItems,
                appliedCode: appliedDiscountCode,
                customerEmail: normalizedCustomerEmail,
                isFirstOrderEligible: isFirstOrderEligibleAtCreation,
                now: new Date(),
            });
        }
        const firstOrderOnlyError = resolveFirstOrderOnlyDiscountError(summary, appliedDiscountCode);
        if (firstOrderOnlyError) {
            return res.status(409).json({ error: firstOrderOnlyError });
        }
        const order = await prisma.order.create({
            data: {
                userId: user.id,
                customerId: customer.id,
                orderNumber: `ORD-${Date.now()}`,
                status: 'CONFIRMED',
                subtotal: summary.subtotalCents / 100,
                shippingCost: summary.shippingCents / 100,
                tax: 0,
                total: summary.totalCents / 100,
                subtotalCents: summary.subtotalCents,
                shippingCents: summary.shippingCents,
                discountTotalCents: summary.discountTotalCents,
                totalCents: summary.totalCents,
                appliedDiscounts: summary.discountLines,
                appliedDiscountCode: summary.appliedCode,
                paymentMethod: 'stripe',
                paymentStatus: 'completed',
                shippingAddress: customer.address,
                shippingProvider: effectiveResolvedSelection.offerId || effectiveResolvedSelection.offerCode ? 'BOXTAL' : null,
                shippingMode: effectiveResolvedSelection.mode || null,
                shippingOfferId: effectiveResolvedSelection.offerId || null,
                shippingOfferCode: effectiveResolvedSelection.offerCode || null,
                shippingOfferLabel: effectiveResolvedSelection.offerLabel || null,
                relayPointId: effectiveResolvedSelection.relayPoint?.id || null,
                relayPointLabel: effectiveResolvedSelection.relayPoint?.name || null,
                relayNetwork: effectiveResolvedSelection.relayPoint?.network || null,
                shippingMeta: {
                    ...effectiveResolvedSelection,
                    ...(quotedSelection ? { quoteMeta: quotedSelection.quoteMeta || null } : {}),
                },
                items: {
                    create: orderItems,
                },
            },
        });
        const workflowOrder = await getOrderForWorkflow(order.id);
        if (workflowOrder) {
            await logOrderNotification({
                order: workflowOrder,
                type: 'ORDER_CONFIRMED',
                payload: {
                    fromStatus: 'PENDING',
                    toStatus: 'CONFIRMED',
                    orderNumber: workflowOrder.orderNumber,
                    reason: 'Paiement valide (Stripe success)',
                },
            });
        }
        if (summary.discountLines.length > 0) {
            await prisma.$transaction(summary.discountLines.map((line) => prisma.orderDiscountApplication.create({
                data: {
                    orderId: order.id,
                    discountId: line.discountId,
                    label: line.label,
                    type: line.type,
                    scope: line.scope,
                    amountCents: line.amountCents,
                    snapshot: { scope: line.scope },
                },
            })));
        }
        await ensureBoxtalShipmentForOrder(order.id, 'orders_stripe_success');
        if (summary.matchedDiscounts.length > 0) {
            await prisma.$transaction([
                ...summary.matchedDiscounts.map((discount) => prisma.discountRedemption.create({
                    data: {
                        discountId: discount.id,
                        orderId: order.id,
                        customerEmail: normalizedCustomerEmail,
                    },
                })),
                ...summary.matchedDiscounts.map((discount) => prisma.discount.update({
                    where: { id: discount.id },
                    data: { redemptionCount: { increment: 1 } },
                })),
            ]);
        }
        res.json({
            id: order.id,
            orderNumber: order.orderNumber,
            subtotalCents: summary.subtotalCents,
            shippingCents: summary.shippingCents,
            discountTotalCents: summary.discountTotalCents,
            totalCents: summary.totalCents,
        });
    }
    catch (error) {
        if (error instanceof Error && error.message === 'INGREDIENT_NOT_FOUND') {
            return res.status(404).json({ error: 'One or more ingredients not found' });
        }
        console.error('Error creating order from Stripe:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
});
// Get order by Stripe session (customer)
app.get('/api/orders/by-session/:sessionId', requireCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const sessionId = req.params.sessionId;
        let order = await prisma.order.findFirst({
            where: { stripeSessionId: req.params.sessionId, customerId: customer.id },
            include: { items: true },
        });
        if (!order)
            return res.status(404).json({ error: 'Order not found' });
        const isOrderFinalized = order.status === 'CONFIRMED' && order.paymentStatus === 'completed';
        if (!isOrderFinalized && stripe) {
            try {
                const session = await stripe.checkout.sessions.retrieve(sessionId);
                if (session.payment_status === 'paid') {
                    await finalizePaidOrder(order.id);
                    order = await prisma.order.findFirst({
                        where: { id: order.id, customerId: customer.id },
                        include: { items: true },
                    });
                    if (!order)
                        return res.status(404).json({ error: 'Order not found' });
                }
            }
            catch {
                // keep original order payload when Stripe check fails
            }
        }
        if (order.paymentStatus === 'completed') {
            await ensureBoxtalShipmentForOrder(order.id, 'orders_by_session');
        }
        res.json(order);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});
app.get('/api/orders/by-payment-intent/:paymentIntentId', requireCustomer, async (req, res) => {
    try {
        const customer = req.customer;
        const paymentIntentId = req.params.paymentIntentId;
        let order = await prisma.order.findFirst({
            where: { stripeSessionId: req.params.paymentIntentId, customerId: customer.id },
            include: { items: true },
        });
        if (!order)
            return res.status(404).json({ error: 'Order not found' });
        const isOrderFinalized = order.status === 'CONFIRMED' && order.paymentStatus === 'completed';
        if (!isOrderFinalized && stripe) {
            try {
                const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                if (paymentIntent.status === 'succeeded') {
                    await finalizePaidOrder(order.id);
                    order = await prisma.order.findFirst({
                        where: { id: order.id, customerId: customer.id },
                        include: { items: true },
                    });
                    if (!order)
                        return res.status(404).json({ error: 'Order not found' });
                }
            }
            catch {
                // keep original order payload when Stripe check fails
            }
        }
        if (order.paymentStatus === 'completed') {
            await ensureBoxtalShipmentForOrder(order.id, 'orders_by_payment_intent');
        }
        res.json(order);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});
// Validate cart total against ingredient prices
app.post('/api/cart/validate', async (req, res) => {
    try {
        const { ingredientIds, total } = req.body;
        if (!Array.isArray(ingredientIds) || ingredientIds.length === 0 || typeof total !== 'number') {
            return res.status(400).json({ error: 'Invalid payload' });
        }
        const ingredients = await prisma.ingredient.findMany({
            where: { id: { in: ingredientIds } },
            select: { id: true, price: true, category: true },
        });
        if (ingredients.length !== ingredientIds.length) {
            return res.status(404).json({ error: 'One or more ingredients not found' });
        }
        const expectedTotal = computeBlendUnitPriceCents(ingredients) / 100;
        const roundedExpected = Math.round(expectedTotal * 100) / 100;
        const roundedProvided = Math.round(total * 100) / 100;
        const isValid = Math.abs(roundedExpected - roundedProvided) <= 0.01;
        if (!isValid) {
            return res.status(400).json({ valid: false, expectedTotal: roundedExpected });
        }
        return res.json({ valid: true, expectedTotal: roundedExpected });
    }
    catch (error) {
        console.error('Error validating cart total:', error);
        res.status(500).json({ error: 'Failed to validate total' });
    }
});
// Orders (admin)
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await prisma.order.findMany({
            include: { items: true, customer: true, shipment: true },
            orderBy: { createdAt: 'desc' },
        });
        const serialized = orders.map((order) => ({
            ...order,
            availableTransitions: computeAvailableOrderTransitions(order),
        }));
        res.json(serialized);
    }
    catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});
app.get('/api/orders/:id', async (req, res) => {
    try {
        const order = await prisma.order.findUnique({
            where: { id: req.params.id },
            include: { items: true, customer: true, paymentRecord: true, shipment: true },
        });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        const statusHistory = await listOrderStatusHistory(order.id);
        res.json({
            ...order,
            availableTransitions: computeAvailableOrderTransitions(order),
            statusHistory,
        });
    }
    catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});
app.post('/api/orders/:id/create-shipment', async (req, res) => {
    try {
        const order = await prisma.order.findUnique({
            where: { id: req.params.id },
            select: { id: true, orderNumber: true },
        });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        const shipment = await ensureBoxtalShipmentForOrder(order.id, 'admin_manual_retry', { throwOnError: true });
        if (!shipment) {
            return res.status(409).json({
                error: 'Shipment was not created. Verify payment status, shipping offer and Boxtal configuration.',
            });
        }
        const refreshed = await prisma.shipment.findUnique({
            where: { id: shipment.id },
            include: {
                order: {
                    select: { id: true, orderNumber: true },
                },
            },
        });
        return res.json({ shipment: refreshed });
    }
    catch (error) {
        console.error('Error creating shipment from order:', error);
        const message = error instanceof Error ? error.message : 'Failed to create shipment from order';
        return res.status(500).json({ error: message });
    }
});
app.patch('/api/orders/:id/status', async (req, res) => {
    try {
        const { status, reason, trackingNumber, trackingUrl, shippingProvider } = req.body;
        const toStatus = toStatusOrNull(status);
        if (!toStatus) {
            return res.status(400).json({ error: 'Valid status is required' });
        }
        const order = await transitionOrderStatus({
            orderId: req.params.id,
            toStatus,
            reason: toNonEmptyStringOrNull(reason) || null,
            actorType: 'admin',
            actorId: req.header('x-admin-id') || null,
            trackingNumber,
            trackingUrl,
            shippingProvider,
        });
        const statusHistory = await listOrderStatusHistory(order.id);
        res.json({
            ...order,
            statusHistory,
        });
    }
    catch (error) {
        if (error instanceof OrderWorkflowError) {
            if (error.code === 'ORDER_NOT_FOUND') {
                return res.status(404).json({ error: error.message, code: error.code });
            }
            if (error.code === 'TRANSITION_NOT_ALLOWED' ||
                error.code === 'PAYMENT_NOT_COMPLETED' ||
                error.code === 'TRACKING_REQUIRED' ||
                error.code === 'STOCK_UNAVAILABLE') {
                return res.status(409).json({ error: error.message, code: error.code, details: error.details || null });
            }
            return res.status(400).json({ error: error.message, code: error.code, details: error.details || null });
        }
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});
// Shipments (admin)
app.get('/api/shipments', async (_req, res) => {
    try {
        const shipments = await prisma.shipment.findMany({
            include: {
                order: {
                    select: {
                        id: true,
                        orderNumber: true,
                        createdAt: true,
                        customer: { select: { firstName: true, lastName: true, email: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(shipments);
    }
    catch (error) {
        console.error('Error fetching shipments:', error);
        res.status(500).json({ error: 'Failed to fetch shipments' });
    }
});
app.get('/api/shipments/:id', async (req, res) => {
    try {
        const shipment = await prisma.shipment.findUnique({
            where: { id: req.params.id },
            include: {
                order: {
                    select: {
                        id: true,
                        orderNumber: true,
                        createdAt: true,
                        customer: { select: { firstName: true, lastName: true, email: true } },
                    },
                },
                events: { orderBy: { createdAt: 'desc' } },
            },
        });
        if (!shipment)
            return res.status(404).json({ error: 'Shipment not found' });
        res.json(shipment);
    }
    catch (error) {
        console.error('Error fetching shipment:', error);
        res.status(500).json({ error: 'Failed to fetch shipment' });
    }
});
app.post('/api/shipments/:id/refresh-label', async (req, res) => {
    try {
        const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
        if (!shipment || !shipment.providerOrderId) {
            return res.status(404).json({ error: 'Shipment not found' });
        }
        const document = await getShippingDocument(shipment.providerOrderId);
        const labelUrl = parseBoxtalLabelUrl(document);
        const updated = await prisma.shipment.update({
            where: { id: shipment.id },
            data: { labelUrl, response: document },
        });
        res.json(updated);
    }
    catch (error) {
        console.error('Error refreshing label:', error);
        res.status(500).json({ error: 'Failed to refresh label' });
    }
});
app.post('/api/shipments/:id/refresh-tracking', async (req, res) => {
    try {
        const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
        if (!shipment || !shipment.providerOrderId) {
            return res.status(404).json({ error: 'Shipment not found' });
        }
        const tracking = await getShippingTracking(shipment.providerOrderId);
        const parsedTracking = parseBoxtalTrackingPayload(tracking, shipment.trackingNumber);
        const synced = await syncShipmentTrackingFromPayload({
            shipmentId: shipment.id,
            providerStatus: parsedTracking.providerStatus,
            trackingNumber: parsedTracking.trackingNumber,
            trackingUrl: parsedTracking.trackingUrl,
            response: tracking,
            actorType: 'admin',
            actorId: 'manual_tracking_refresh',
            reason: 'Rafraichissement manuel du tracking',
        });
        res.json({
            ...synced.shipment,
            transitionedTo: synced.orderSync.transitionedTo,
            mappedStatus: synced.mappedStatus,
        });
    }
    catch (error) {
        console.error('Error refreshing tracking:', error);
        res.status(500).json({ error: 'Failed to refresh tracking' });
    }
});
// Start server
const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Login page: http://localhost:${PORT}/`);
    console.log(`Process ID: ${process.pid}`);
    prisma.$queryRaw `SELECT 1`
        .then(async () => {
        console.log('Database connected');
        await ensureOrderWorkflowTables();
        await startAutomationScheduler();
        console.log('Automation jobs scheduler started');
    })
        .catch((err) => console.error('Database error:', err.message));
});
server.on('error', (err) => {
    console.error('Server error:', err.message);
    process.exit(1);
});
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await stopAutomationScheduler();
    await prisma.$disconnect();
    server.close(() => {
        process.exit(0);
    });
});
process.on('SIGTERM', async () => {
    await stopAutomationScheduler();
    await prisma.$disconnect();
    server.close(() => {
        process.exit(0);
    });
});
//# sourceMappingURL=index.js.map







