import type { DiscountMethod, DiscountScope, DiscountStatus, DiscountType } from '@prisma/client';

export type DiscountCartItem = {
  itemType?: string | null;
  quantity?: number;
  unitPriceCents?: number;
  lineSubtotalCents?: number;
  productId?: string | null;
  variantId?: string | null;
  subscriptionPlanId?: string | null;
  isGift?: boolean;
};

export type DiscountCandidate = {
  id: string;
  title: string;
  method: DiscountMethod;
  code: string | null;
  type: DiscountType;
  scope: DiscountScope;
  config?: unknown | null;
  valuePercent: number | null;
  valueCents: number | null;
  minimumSubtotalCents: number | null;
  startAt: Date | null;
  endAt: Date | null;
  usageLimitTotal: number | null;
  usageLimitPerCustomer: number | null;
  redemptionCount: number;
  stackable: boolean;
  firstOrderOnly?: boolean;
  status: DiscountStatus;
};

export type DiscountUsageCounts = {
  totalRedemptions: number;
  customerRedemptions: number;
};

export type DiscountLine = {
  label: string;
  amountCents: number;
  type: DiscountType;
  discountId: string;
  scope: DiscountScope;
};

export type DiscountMatch = {
  id: string;
  title: string;
  method: DiscountMethod;
  type: DiscountType;
  scope: DiscountScope;
  code?: string | null;
  amountCents: number;
  stackable: boolean;
};

export type DiscountComputationInput = {
  discounts: DiscountCandidate[];
  usageById: Record<string, DiscountUsageCounts>;
  subtotalCents: number;
  productSubtotalCents?: number;
  shippingCents: number;
  items?: DiscountCartItem[];
  appliedCode?: string | null;
  customerEmail?: string | null;
  isFirstOrderEligible?: boolean;
  now?: Date;
};

export type DiscountComputationResult = {
  matchedDiscounts: DiscountMatch[];
  discountLines: DiscountLine[];
  subtotalCents: number;
  shippingCents: number;
  discountTotalCents: number;
  totalCents: number;
  messages: string[];
  appliedCode: string | null;
};

type NormalizedItem = {
  itemType: string;
  quantity: number;
  unitPriceCents: number;
  lineSubtotalCents: number;
  productId: string | null;
  variantId: string | null;
  subscriptionPlanId: string | null;
  isGift: boolean;
};

type TargetConfig = {
  itemTypes: Set<string>;
  excludeItemTypes: Set<string>;
  productIds: Set<string>;
  variantIds: Set<string>;
  subscriptionPlanIds: Set<string>;
  includeGiftItems: boolean;
};

type TierRule = {
  minQty: number;
  minSubtotalCents: number;
  percent: number;
  fixedCents: number;
};

const normalizeCode = (code?: string | null) => (code || '').trim().toUpperCase();
const formatCentsAsEuro = (value: number) => (Math.max(0, value) / 100).toFixed(2);
export const FIRST_ORDER_ONLY_NOT_APPLIED_MESSAGE =
  'Code non appliqué: cette remise est réservée à la première commande (vous avez déjà une commande payée/confirmée avec ce code).';

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const toInt = (value: unknown, fallback = 0): number => {
  const parsed = toNumber(value);
  if (parsed === null) return fallback;
  return Math.max(0, Math.round(parsed));
};

const toPositiveInt = (value: unknown, fallback = 0): number => {
  const parsed = toInt(value, fallback);
  return parsed > 0 ? parsed : fallback;
};

const toPercent = (value: unknown): number => {
  const parsed = toNumber(value);
  if (parsed === null) return 0;
  return Math.max(0, Math.min(100, parsed));
};

const toObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const toStringSet = (value: unknown, normalize?: (entry: string) => string) => {
  if (!Array.isArray(value)) return new Set<string>();
  return new Set(
    value
      .map((entry) => {
        if (typeof entry !== 'string') return '';
        const trimmed = entry.trim();
        return normalize ? normalize(trimmed) : trimmed;
      })
      .filter(Boolean)
  );
};

const isWithinDateRange = (discount: DiscountCandidate, now: Date) => {
  if (discount.startAt && now < discount.startAt) return false;
  if (discount.endAt && now > discount.endAt) return false;
  return true;
};

const isEligibleBase = (discount: DiscountCandidate, subtotalCents: number, now: Date) => {
  if (discount.status !== 'ACTIVE') return false;
  if (!isWithinDateRange(discount, now)) return false;
  if ((discount.minimumSubtotalCents || 0) > subtotalCents) return false;
  return true;
};

const normalizeItems = (items: DiscountCartItem[] | undefined): NormalizedItem[] => {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items
    .map((item) => {
      const quantity = Math.max(1, toInt(item.quantity, 1));
      const rawLineSubtotal = toNumber(item.lineSubtotalCents);
      const rawUnitPrice = toNumber(item.unitPriceCents);
      const lineSubtotalCents = rawLineSubtotal !== null
        ? Math.max(0, Math.round(rawLineSubtotal))
        : rawUnitPrice !== null
        ? Math.max(0, Math.round(rawUnitPrice)) * quantity
        : 0;
      const unitPriceCents = quantity > 0 ? Math.max(0, Math.round(lineSubtotalCents / quantity)) : 0;

      return {
        itemType: String(item.itemType || 'BLEND').toUpperCase(),
        quantity,
        unitPriceCents,
        lineSubtotalCents,
        productId: typeof item.productId === 'string' && item.productId.trim().length > 0 ? item.productId.trim() : null,
        variantId: typeof item.variantId === 'string' && item.variantId.trim().length > 0 ? item.variantId.trim() : null,
        subscriptionPlanId:
          typeof item.subscriptionPlanId === 'string' && item.subscriptionPlanId.trim().length > 0
            ? item.subscriptionPlanId.trim()
            : null,
        isGift: Boolean(item.isGift),
      };
    })
    .filter((item) => item.quantity > 0 && item.lineSubtotalCents >= 0);
};

const parseTargetConfig = (raw: unknown): TargetConfig => {
  const cfg = toObject(raw);
  return {
    itemTypes: toStringSet(cfg.itemTypes, (entry) => entry.toUpperCase()),
    excludeItemTypes: toStringSet(cfg.excludeItemTypes, (entry) => entry.toUpperCase()),
    productIds: toStringSet(cfg.productIds),
    variantIds: toStringSet(cfg.variantIds),
    subscriptionPlanIds: toStringSet(cfg.subscriptionPlanIds),
    includeGiftItems: Boolean(cfg.includeGiftItems),
  };
};

const matchesTarget = (item: NormalizedItem, target: TargetConfig) => {
  if (!target.includeGiftItems && item.isGift) return false;
  if (target.itemTypes.size > 0 && !target.itemTypes.has(item.itemType)) return false;
  if (target.excludeItemTypes.size > 0 && target.excludeItemTypes.has(item.itemType)) return false;
  if (target.productIds.size > 0 && (!item.productId || !target.productIds.has(item.productId))) return false;
  if (target.variantIds.size > 0 && (!item.variantId || !target.variantIds.has(item.variantId))) return false;
  if (
    target.subscriptionPlanIds.size > 0 &&
    (!item.subscriptionPlanId || !target.subscriptionPlanIds.has(item.subscriptionPlanId))
  ) {
    return false;
  }
  return true;
};

const filterItemsByTarget = (items: NormalizedItem[], rawTarget: unknown) => {
  const target = parseTargetConfig(rawTarget);
  return items.filter((item) => matchesTarget(item, target));
};

const expandUnitPrices = (items: NormalizedItem[]) => {
  const prices: number[] = [];
  items.forEach((item) => {
    for (let i = 0; i < item.quantity; i += 1) {
      prices.push(item.unitPriceCents);
    }
  });
  return prices;
};

const sumLineSubtotal = (items: NormalizedItem[]) => items.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
const sumQty = (items: NormalizedItem[]) => items.reduce((sum, item) => sum + item.quantity, 0);

const resolveScopeBase = (
  discount: DiscountCandidate,
  subtotalCents: number,
  productSubtotalCents: number,
  shippingCents: number
) => {
  if (discount.type === 'FREE_SHIPPING' || discount.scope === 'SHIPPING') {
    return Math.max(0, shippingCents);
  }
  if (discount.scope === 'PRODUCTS' || discount.scope === 'CATEGORIES') {
    return Math.max(0, productSubtotalCents);
  }
  return Math.max(0, subtotalCents);
};

const computeStandardDiscountAmountCents = (
  discount: DiscountCandidate,
  subtotalCents: number,
  productSubtotalCents: number,
  shippingCents: number
) => {
  const baseCents = resolveScopeBase(discount, subtotalCents, productSubtotalCents, shippingCents);
  switch (discount.type) {
    case 'PERCENTAGE': {
      const percent = discount.valuePercent || 0;
      if (percent <= 0) return 0;
      return Math.max(0, Math.round((baseCents * percent) / 100));
    }
    case 'FIXED': {
      const value = discount.valueCents || 0;
      if (value <= 0) return 0;
      return Math.max(0, Math.min(value, baseCents));
    }
    case 'FREE_SHIPPING': {
      if (shippingCents <= 0) return 0;
      return shippingCents;
    }
    default:
      return 0;
  }
};

const computeBogoDiscountCents = (discount: DiscountCandidate, items: NormalizedItem[]) => {
  const config = toObject(discount.config);
  const buyQty = Math.max(1, toPositiveInt(config.buyQty, 1));
  const getQty = Math.max(1, toPositiveInt(config.getQty, 1));
  const cycleQty = buyQty + getQty;
  if (cycleQty <= 0) return 0;

  const eligible = filterItemsByTarget(items, config.target);
  const unitPrices = expandUnitPrices(eligible).sort((a, b) => a - b);
  if (unitPrices.length === 0) return 0;

  const freeUnits = Math.floor(unitPrices.length / cycleQty) * getQty;
  if (freeUnits <= 0) return 0;

  return unitPrices.slice(0, freeUnits).reduce((sum, price) => sum + price, 0);
};

const parseTierRules = (discount: DiscountCandidate): TierRule[] => {
  const config = toObject(discount.config);
  const rawTiers = Array.isArray(config.tiers) ? config.tiers : [];
  const tiers = rawTiers
    .map((raw) => {
      const tier = toObject(raw);
      return {
        minQty: toInt(tier.minQty, 0),
        minSubtotalCents: toInt(tier.minSubtotalCents, 0),
        percent: toPercent(tier.percent),
        fixedCents: toInt(tier.fixedCents, 0),
      };
    })
    .filter((tier) => tier.percent > 0 || tier.fixedCents > 0);

  if (tiers.length > 0) return tiers;

  const fallbackPercent = discount.valuePercent || 0;
  const fallbackFixed = discount.valueCents || 0;
  if (fallbackPercent <= 0 && fallbackFixed <= 0) return [];

  return [
    {
      minQty: Math.max(1, toInt(config.minQty, 1)),
      minSubtotalCents: toInt(config.minSubtotalCents, 0),
      percent: Math.max(0, fallbackPercent),
      fixedCents: Math.max(0, fallbackFixed),
    },
  ];
};

const computeTieredDiscountCents = (discount: DiscountCandidate, items: NormalizedItem[]) => {
  const config = toObject(discount.config);
  const eligible = filterItemsByTarget(items, config.target);
  if (eligible.length === 0) return 0;
  const eligibleQty = sumQty(eligible);
  const eligibleSubtotalCents = sumLineSubtotal(eligible);
  const tiers = parseTierRules(discount);
  if (tiers.length === 0) return 0;

  let bestAmount = 0;
  tiers.forEach((tier) => {
    if (eligibleQty < tier.minQty) return;
    if (eligibleSubtotalCents < tier.minSubtotalCents) return;
    const percentAmount = tier.percent > 0 ? Math.round((eligibleSubtotalCents * tier.percent) / 100) : 0;
    const fixedAmount = tier.fixedCents > 0 ? Math.min(eligibleSubtotalCents, tier.fixedCents) : 0;
    bestAmount = Math.max(bestAmount, percentAmount, fixedAmount);
  });

  return Math.max(0, Math.min(bestAmount, eligibleSubtotalCents));
};

const computeBundleDiscountCents = (discount: DiscountCandidate, items: NormalizedItem[]) => {
  const config = toObject(discount.config);
  const eligible = filterItemsByTarget(items, config.target);
  if (eligible.length === 0) return 0;

  const requiredQty = Math.max(2, toPositiveInt(config.requiredQty, 2));
  const unitPrices = expandUnitPrices(eligible).sort((a, b) => b - a);
  const groups = Math.floor(unitPrices.length / requiredQty);
  if (groups <= 0) return 0;

  const bundlePriceCents = toInt(config.bundlePriceCents, 0);
  const percentOff = toPercent(config.percentOff);
  const fixedOffCents = toInt(config.fixedOffCents, 0);

  let amount = 0;
  for (let groupIndex = 0; groupIndex < groups; groupIndex += 1) {
    const start = groupIndex * requiredQty;
    const end = start + requiredQty;
    const groupSubtotal = unitPrices.slice(start, end).reduce((sum, price) => sum + price, 0);
    if (bundlePriceCents > 0) {
      amount += Math.max(0, groupSubtotal - bundlePriceCents);
      continue;
    }
    if (percentOff > 0) {
      amount += Math.round((groupSubtotal * percentOff) / 100);
      continue;
    }
    if (fixedOffCents > 0) {
      amount += Math.min(groupSubtotal, fixedOffCents);
    }
  }

  const groupSubtotalCents = unitPrices.slice(0, groups * requiredQty).reduce((sum, price) => sum + price, 0);
  return Math.max(0, Math.min(amount, groupSubtotalCents));
};

const computeSalePriceDiscountCents = (discount: DiscountCandidate, items: NormalizedItem[]) => {
  const config = toObject(discount.config);
  const eligible = filterItemsByTarget(items, config.target);
  if (eligible.length === 0) return 0;

  const saleUnitPriceCents = toNumber(config.saleUnitPriceCents);
  const percentOff = toPercent(config.percentOff ?? discount.valuePercent ?? 0);
  const fixedOffCents = toInt(config.fixedOffCents ?? discount.valueCents ?? 0, 0);

  let amount = 0;
  eligible.forEach((item) => {
    let reductionPerUnit = 0;
    if (saleUnitPriceCents !== null && saleUnitPriceCents >= 0) {
      reductionPerUnit = Math.max(0, item.unitPriceCents - Math.round(saleUnitPriceCents));
    } else if (percentOff > 0) {
      reductionPerUnit = Math.round((item.unitPriceCents * percentOff) / 100);
    } else if (fixedOffCents > 0) {
      reductionPerUnit = Math.min(item.unitPriceCents, fixedOffCents);
    }
    amount += reductionPerUnit * item.quantity;
  });

  const eligibleSubtotalCents = sumLineSubtotal(eligible);
  return Math.max(0, Math.min(amount, eligibleSubtotalCents));
};

const computeSubscriptionDiscountCents = (discount: DiscountCandidate, items: NormalizedItem[]) => {
  const config = toObject(discount.config);
  const restrictedPlanIds = toStringSet(config.subscriptionPlanIds);
  const eligible = items.filter((item) => {
    const isSubscriptionItem = item.itemType === 'SUBSCRIPTION' || Boolean(item.subscriptionPlanId);
    if (!isSubscriptionItem) return false;
    if (restrictedPlanIds.size === 0) return true;
    return Boolean(item.subscriptionPlanId && restrictedPlanIds.has(item.subscriptionPlanId));
  });
  if (eligible.length === 0) return 0;

  const eligibleSubtotalCents = sumLineSubtotal(eligible);
  const percentOff = toPercent(config.percentOff ?? discount.valuePercent ?? 0);
  const fixedOffCents = toInt(config.fixedOffCents ?? discount.valueCents ?? 0, 0);

  if (percentOff > 0) {
    return Math.min(eligibleSubtotalCents, Math.round((eligibleSubtotalCents * percentOff) / 100));
  }

  if (fixedOffCents > 0) {
    const fixedAmount = eligible.reduce(
      (sum, item) => sum + Math.min(item.unitPriceCents, fixedOffCents) * item.quantity,
      0
    );
    return Math.min(eligibleSubtotalCents, fixedAmount);
  }

  return 0;
};

const computeGiftDiscountCents = (
  discount: DiscountCandidate,
  items: NormalizedItem[],
  subtotalCents: number
) => {
  const config = toObject(discount.config);
  const giftVariantId = typeof config.giftVariantId === 'string' ? config.giftVariantId.trim() : '';
  const giftProductId = typeof config.giftProductId === 'string' ? config.giftProductId.trim() : '';
  if (giftVariantId || giftProductId) {
    // Real gift items are auto-managed in cart/order flows.
    return 0;
  }
  const triggerProductIds = toStringSet(config.triggerProductIds);
  const triggerVariantIds = toStringSet(config.triggerVariantIds);
  const triggerQty = Math.max(1, toPositiveInt(config.triggerQty, 1));

  const threshold = Math.max(
    toInt(config.triggerMinimumSubtotalCents, 0),
    toInt(discount.minimumSubtotalCents, 0)
  );
  const thresholdMatched = threshold > 0 ? subtotalCents >= threshold : false;

  let triggerCount = 0;
  if (triggerProductIds.size > 0 || triggerVariantIds.size > 0) {
    items.forEach((item) => {
      const matchesProduct = item.productId ? triggerProductIds.has(item.productId) : false;
      const matchesVariant = item.variantId ? triggerVariantIds.has(item.variantId) : false;
      if (matchesProduct || matchesVariant) {
        triggerCount += item.quantity;
      }
    });
  }
  const productTriggerMatched = triggerCount >= triggerQty && (triggerProductIds.size > 0 || triggerVariantIds.size > 0);
  if (!thresholdMatched && !productTriggerMatched) return 0;

  const repeatPerTrigger = Boolean(config.repeatPerTrigger);
  const maxGiftQty = Math.max(1, toPositiveInt(config.maxGiftQty, 1));
  let giftQty = 1;
  if (productTriggerMatched && repeatPerTrigger) {
    giftQty = Math.max(1, Math.floor(triggerCount / triggerQty));
  }
  giftQty = Math.min(giftQty, maxGiftQty);

  let giftValueCents = toInt(config.giftValueCents, toInt(discount.valueCents, 0));
  if (giftValueCents <= 0) {
    const target = config.giftTarget ?? config.target ?? null;
    const eligibleForGiftValue = target ? filterItemsByTarget(items, target) : items.filter((item) => !item.isGift);
    const prices = expandUnitPrices(eligibleForGiftValue).sort((a, b) => a - b);
    giftValueCents = prices[0] || 0;
  }

  if (giftValueCents <= 0) return 0;
  return Math.min(subtotalCents, giftValueCents * giftQty);
};

const computeDiscountAmountCents = (
  discount: DiscountCandidate,
  subtotalCents: number,
  productSubtotalCents: number,
  shippingCents: number,
  items: NormalizedItem[]
) => {
  switch (discount.type) {
    case 'PERCENTAGE':
    case 'FIXED':
    case 'FREE_SHIPPING':
      return computeStandardDiscountAmountCents(discount, subtotalCents, productSubtotalCents, shippingCents);
    case 'BOGO':
      return computeBogoDiscountCents(discount, items);
    case 'TIERED':
      return computeTieredDiscountCents(discount, items);
    case 'BUNDLE':
      return computeBundleDiscountCents(discount, items);
    case 'SALE_PRICE':
      return computeSalePriceDiscountCents(discount, items);
    case 'SUBSCRIPTION':
      return computeSubscriptionDiscountCents(discount, items);
    case 'GIFT':
      return computeGiftDiscountCents(discount, items, subtotalCents);
    default:
      return 0;
  }
};

const buildCodeNotAppliedReason = (params: {
  discounts: DiscountCandidate[];
  usageById: Record<string, DiscountUsageCounts>;
  code: string;
  subtotalCents: number;
  customerEmail?: string | null;
  isFirstOrderEligible: boolean;
  now: Date;
}) => {
  const codeCandidates = params.discounts.filter(
    (discount) => discount.method === 'CODE' && normalizeCode(discount.code) === params.code
  );

  if (codeCandidates.length === 0) {
    return 'Code non appliqué: ce code est invalide.';
  }

  const activeCandidates = codeCandidates.filter((discount) => discount.status === 'ACTIVE');
  if (activeCandidates.length === 0) {
    return 'Code non appliqué: ce code est inactif.';
  }

  const dateEligibleCandidates = activeCandidates.filter((discount) => isWithinDateRange(discount, params.now));
  if (dateEligibleCandidates.length === 0) {
    return 'Code non appliqué: ce code est hors période de validité.';
  }

  const subtotalEligibleCandidates = dateEligibleCandidates.filter(
    (discount) => (discount.minimumSubtotalCents || 0) <= params.subtotalCents
  );
  if (subtotalEligibleCandidates.length === 0) {
    const requiredMinSubtotalCents = Math.min(
      ...dateEligibleCandidates.map((discount) => discount.minimumSubtotalCents || 0)
    );
    return `Code non appliqué: ce code est valable à partir de ${formatCentsAsEuro(requiredMinSubtotalCents)} EUR.`;
  }

  const firstOrderEligibleCandidates = subtotalEligibleCandidates.filter(
    (discount) => !Boolean(discount.firstOrderOnly) || params.isFirstOrderEligible
  );
  if (firstOrderEligibleCandidates.length === 0) {
    if (subtotalEligibleCandidates.some((discount) => Boolean(discount.firstOrderOnly))) {
      return FIRST_ORDER_ONLY_NOT_APPLIED_MESSAGE;
    }
    return "Code non appliqué: ce code n'est pas éligible actuellement.";
  }

  const totalUsageEligibleCandidates = firstOrderEligibleCandidates.filter((discount) => {
    if (discount.usageLimitTotal === null || discount.usageLimitTotal === undefined) return true;
    const usage = params.usageById[discount.id] || { totalRedemptions: 0, customerRedemptions: 0 };
    return usage.totalRedemptions < discount.usageLimitTotal;
  });

  if (totalUsageEligibleCandidates.length === 0) {
    return "Code non appliqué: ce code a atteint sa limite totale d'utilisations.";
  }

  const perCustomerEligibleCandidates = totalUsageEligibleCandidates.filter((discount) => {
    if (discount.usageLimitPerCustomer === null || discount.usageLimitPerCustomer === undefined) return true;
    if (!params.customerEmail) return false;
    const usage = params.usageById[discount.id] || { totalRedemptions: 0, customerRedemptions: 0 };
    return usage.customerRedemptions < discount.usageLimitPerCustomer;
  });

  if (perCustomerEligibleCandidates.length === 0) {
    if (
      !params.customerEmail &&
      totalUsageEligibleCandidates.some(
        (discount) =>
          discount.usageLimitPerCustomer !== null &&
          discount.usageLimitPerCustomer !== undefined
      )
    ) {
      return 'Code non appliqué: connectez-vous pour utiliser ce code.';
    }
    return 'Code non appliqué: ce code a atteint sa limite par client.';
  }

  return "Code non appliqué: ce code n'est pas éligible actuellement.";
};

export function computeDiscounts(input: DiscountComputationInput): DiscountComputationResult {
  const now = input.now ? new Date(input.now) : new Date();
  const normalizedAppliedCode = normalizeCode(input.appliedCode);
  const messages: string[] = [];
  const productSubtotalCents = input.productSubtotalCents ?? input.subtotalCents;
  const isFirstOrderEligible = input.isFirstOrderEligible ?? true;
  const normalizedItems = normalizeItems(input.items);

  const eligibleBase = input.discounts.filter((discount) => isEligibleBase(discount, input.subtotalCents, now));
  const eligibleWithFirstOrderConstraint = eligibleBase.filter(
    (discount) => !Boolean(discount.firstOrderOnly) || isFirstOrderEligible
  );

  const eligibleWithUsage = eligibleWithFirstOrderConstraint.filter((discount) => {
    const usage = input.usageById[discount.id] || { totalRedemptions: 0, customerRedemptions: 0 };

    if (discount.usageLimitTotal !== null && discount.usageLimitTotal !== undefined) {
      if (usage.totalRedemptions >= discount.usageLimitTotal) return false;
    }

    if (discount.usageLimitPerCustomer !== null && discount.usageLimitPerCustomer !== undefined) {
      if (!input.customerEmail) {
        return false;
      }
      if (usage.customerRedemptions >= discount.usageLimitPerCustomer) return false;
    }

    return true;
  });

  const automaticDiscounts = eligibleWithUsage.filter((discount) => discount.method === 'AUTOMATIC');

  let codeDiscounts: DiscountCandidate[] = [];
  if (normalizedAppliedCode) {
    const matching = eligibleWithUsage.filter(
      (discount) => discount.method === 'CODE' && normalizeCode(discount.code) === normalizedAppliedCode
    );

    if (matching.length === 0) {
      messages.push(
        buildCodeNotAppliedReason({
          discounts: input.discounts,
          usageById: input.usageById,
          code: normalizedAppliedCode,
          subtotalCents: input.subtotalCents,
          customerEmail: input.customerEmail,
          isFirstOrderEligible,
          now,
        })
      );
    } else {
      codeDiscounts = matching;
    }
  }

  const eligible = [...automaticDiscounts, ...codeDiscounts];

  const discountWithAmounts = eligible
    .map((discount) => ({
      discount,
      amountCents: computeDiscountAmountCents(
        discount,
        input.subtotalCents,
        productSubtotalCents,
        input.shippingCents,
        normalizedItems
      ),
    }))
    .filter((entry) => entry.amountCents > 0);

  let applied: { discount: DiscountCandidate; amountCents: number }[] = [];
  if (normalizedAppliedCode) {
    const codeEntries = discountWithAmounts.filter(
      (entry) =>
        entry.discount.method === 'CODE' &&
        normalizeCode(entry.discount.code) === normalizedAppliedCode
    );
    const bestCodeEntry = codeEntries.reduce<{ discount: DiscountCandidate; amountCents: number } | null>((best, current) => {
      if (!best || current.amountCents > best.amountCents) return current;
      return best;
    }, null);

    if (bestCodeEntry) {
      // Business rule: when a valid code is entered, keep it, and keep stackable automatic discounts too.
      applied = [bestCodeEntry];
      const stackableAutomatic = discountWithAmounts.filter(
        (entry) => entry.discount.method === 'AUTOMATIC' && entry.discount.stackable
      );
      stackableAutomatic.forEach((entry) => {
        if (!applied.some((appliedEntry) => appliedEntry.discount.id === entry.discount.id)) {
          applied.push(entry);
        }
      });
    }
  }

  if (applied.length === 0) {
    const stackable = discountWithAmounts.filter((entry) => entry.discount.stackable);
    const nonStackable = discountWithAmounts.filter((entry) => !entry.discount.stackable);

    const bestSingle = discountWithAmounts.reduce<{ discount: DiscountCandidate; amountCents: number } | null>((best, current) => {
      if (!best || current.amountCents > best.amountCents) return current;
      return best;
    }, null);

    const stackedTotal = stackable.reduce((sum, entry) => sum + entry.amountCents, 0);

    if (nonStackable.length > 0) {
      if (stackedTotal > (bestSingle?.amountCents ?? 0) && stackable.length > 0) {
        applied = stackable;
      } else if (bestSingle) {
        applied = [bestSingle];
      }
    } else {
      applied = stackable.length > 0 ? stackable : bestSingle ? [bestSingle] : [];
    }
  }

  const codeWasApplied = Boolean(
    normalizedAppliedCode &&
      applied.some(
        (entry) => entry.discount.method === 'CODE' && normalizeCode(entry.discount.code) === normalizedAppliedCode
      )
  );

  if (normalizedAppliedCode && codeDiscounts.length > 0 && !codeWasApplied) {
    messages.push("Code non appliqué: ce code est moins avantageux qu'une remise déjà active.");
  }

  const discountLines: DiscountLine[] = applied.map(({ discount, amountCents }) => ({
    discountId: discount.id,
    label: discount.title,
    amountCents,
    type: discount.type,
    scope: discount.scope,
  }));

  const matchedDiscounts: DiscountMatch[] = applied.map(({ discount, amountCents }) => ({
    id: discount.id,
    title: discount.title,
    method: discount.method,
    type: discount.type,
    scope: discount.scope,
    code: discount.code,
    amountCents,
    stackable: discount.stackable,
  }));

  const subtotalDiscountCents = discountLines
    .filter((line) => line.type !== 'FREE_SHIPPING')
    .reduce((sum, line) => sum + line.amountCents, 0);
  const shippingDiscountCents = discountLines
    .filter((line) => line.type === 'FREE_SHIPPING')
    .reduce((sum, line) => sum + line.amountCents, 0);

  const cappedSubtotalDiscount = Math.min(subtotalDiscountCents, input.subtotalCents);
  const cappedShippingDiscount = Math.min(shippingDiscountCents, input.shippingCents);

  const discountTotalCents = Math.min(
    cappedSubtotalDiscount + cappedShippingDiscount,
    input.subtotalCents + input.shippingCents
  );

  const totalCents = Math.max(0, input.subtotalCents + input.shippingCents - discountTotalCents);

  return {
    matchedDiscounts,
    discountLines,
    subtotalCents: input.subtotalCents,
    shippingCents: Math.max(0, input.shippingCents - cappedShippingDiscount),
    discountTotalCents,
    totalCents,
    messages,
    appliedCode: codeWasApplied ? normalizedAppliedCode : null,
  };
}
