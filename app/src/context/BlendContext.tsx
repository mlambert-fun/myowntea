import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { Ingredient } from '@/data/ingredients';
import { api, type CartSummary, type CartResponse, type ShippingSelection, type WishlistCreation } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { DEFAULT_BLEND_FORMAT, normalizeBlendFormat, type BlendFormatCode } from '@/lib/blend-format';
import { MAX_BLEND_AROMAS, MAX_BLEND_INGREDIENTS, computeBlendUnitPrice, normalizeBlendIngredientCategory, } from '@/lib/blend-pricing';
import { t } from "@/lib/i18n";
export interface CartItem {
    id: string;
    itemType: 'BLEND' | 'VARIANT' | 'PACK' | 'SUBSCRIPTION';
    purchaseMode?: 'ONE_TIME' | 'SUBSCRIPTION';
    sourceType?: 'LISTING' | 'CUSTOM';
    listingId?: string;
    subscriptionIntervalCount?: 1 | 2 | 3;
    subscriptionDiscountPercent?: number;
    basePriceCents?: number;
    isGift?: boolean;
    name: string;
    ingredients?: Array<{
        name: string;
        ingredientColor: string;
        category?: string;
    }>;
    ingredientIds?: string[];
    blendFormat?: BlendFormatCode;
    variantId?: string;
    productId?: string;
    subscriptionPlanId?: string;
    imageUrl?: string | null;
    selectedOptions?: Array<{
        name: string;
        value: string;
    }>;
    packItems?: Array<{
        variantId: string;
        title: string;
        qty: number;
        imageUrl?: string | null;
    }>;
    price: number;
    quantity: number;
    color?: string;
}
interface BlendContextType {
    selectedIngredients: Ingredient[];
    blendName: string;
    currentStep: number;
    addIngredient: (ingredient: Ingredient) => void;
    setBlendIngredients: (ingredients: Ingredient[]) => void;
    removeIngredient: (ingredientId: string) => void;
    setBlendName: (name: string) => void;
    setCurrentStep: (step: number) => void;
    clearBlend: () => void;
    isIngredientSelected: (ingredientId: string) => boolean;
    canAddMore: boolean;
    totalPrice: number;
    getBlendColor: () => string;
    /* Cart API */
    cartItems: CartItem[];
    addToCart: (item: Omit<CartItem, 'id' | 'quantity' | 'itemType'> & {
        quantity?: number;
    }) => void;
    addVariantToCart: (item: {
        variantId?: string;
        productId?: string;
        name: string;
        priceCents: number;
        imageUrl?: string | null;
        quantity?: number;
        selectedOptions?: Array<{
            name: string;
            value: string;
        }>;
    }) => void;
    removeFromCart: (cartItemId: string) => void;
    updateCartItemQuantity: (cartItemId: string, quantity: number) => void;
    clearCartItems: () => void;
    checkout: (comment?: string) => string | null;
    cartTotal: number;
    cartSubtotal: number;
    appliedDiscountCode: string | null;
    applyDiscountCode: (code: string) => void;
    removeDiscountCode: () => void;
    cartSummary: CartSummary | null;
    cartMessages: string[];
    isCartSummaryLoading: boolean;
    pendingItemIds: Set<string>;
    isCartDrawerOpen: boolean;
    lastAddedCartItem: CartItem | null;
    openCartDrawer: () => void;
    closeCartDrawer: () => void;
    /* Wishlist API */
    wishlistItems: WishlistCreation[];
    isWishlistDrawerOpen: boolean;
    wishlistDrawerMessage: string | null;
    isWishlistLoading: boolean;
    openWishlistDrawer: (message?: string | null) => void;
    closeWishlistDrawer: () => void;
    addBlendToWishlist: (options: {
        name?: string;
        ingredientIds: string[];
        blendFormat?: BlendFormatCode;
        openDrawerOnSuccess?: boolean;
    }) => Promise<boolean>;
    addCurrentBlendToWishlist: (options?: {
        name?: string;
        blendFormat?: BlendFormatCode;
        openDrawerOnSuccess?: boolean;
    }) => Promise<boolean>;
    addAccessoryToWishlist: (options: {
        name: string;
        productId?: string;
        variantId?: string;
        openDrawerOnSuccess?: boolean;
    }) => Promise<boolean>;
    removeWishlistItem: (wishlistItemId: string) => Promise<void>;
}
const MAX_INGREDIENTS = MAX_BLEND_INGREDIENTS;
const BlendContext = createContext<BlendContextType | undefined>(undefined);
const normalizeCartPurchaseMode = (value: unknown): 'ONE_TIME' | 'SUBSCRIPTION' => value === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'ONE_TIME';
const normalizeCartSourceType = (value: unknown): 'LISTING' | 'CUSTOM' | undefined => value === 'LISTING' || value === 'CUSTOM' ? value : undefined;
const normalizeSubscriptionIntervalCount = (value: unknown): 1 | 2 | 3 => value === 2 || value === 3 ? value : 1;
const extractBlendSubscriptionSetup = (snapshot: any): {
    sourceType: 'LISTING' | 'CUSTOM';
    listingId?: string;
    intervalCount: 1 | 2 | 3;
    discountPercent: number;
    basePriceCents: number;
} | null => {
    const setup = snapshot?.subscriptionSetup;
    if (!setup || typeof setup !== 'object' || setup.kind !== 'BLEND') {
        return null;
    }
    return {
        sourceType: setup.sourceType === 'LISTING' ? 'LISTING' : 'CUSTOM',
        listingId: typeof setup.listingId === 'string' && setup.listingId.trim().length > 0 ? setup.listingId.trim() : undefined,
        intervalCount: normalizeSubscriptionIntervalCount(Number(setup.intervalCount)),
        discountPercent: Math.max(0, Math.round(Number(setup.discountPercent) || 0)),
        basePriceCents: Math.max(0, Math.round(Number(setup.basePriceCents || snapshot?.basePriceCents || snapshot?.originalPriceCents || 0) || 0)),
    };
};
export function BlendProvider({ children }: {
    children: React.ReactNode;
}) {
    const { customer, ensureGuestSession } = useAuth();
    const [selectedIngredients, setSelectedIngredients] = useState<Ingredient[]>([]);
    const [blendName, setBlendName] = useState('');
    const [currentStep, setCurrentStep] = useState(0);
    const CART_STORAGE_VERSION = '2';
    const [cartItems, setCartItems] = useState<CartItem[]>(() => {
        try {
            const raw = localStorage.getItem('tea_cart');
            const metaRaw = localStorage.getItem('tea_cart_meta');
            const meta = metaRaw ? (JSON.parse(metaRaw) as {
                version?: string;
            }) : null;
            if (!meta || meta.version !== CART_STORAGE_VERSION) {
                localStorage.removeItem('tea_cart');
                localStorage.removeItem('tea_cart_meta');
                return [];
            }
            if (raw) {
                const parsed = JSON.parse(raw) as CartItem[];
                const normalized: CartItem[] = parsed.map((item) => ({
                    ...item,
                    itemType: item.itemType || 'BLEND',
                    purchaseMode: normalizeCartPurchaseMode(item.purchaseMode),
                    sourceType: normalizeCartSourceType(item.sourceType),
                    listingId: typeof item.listingId === 'string' && item.listingId.trim().length > 0 ? item.listingId.trim() : undefined,
                    subscriptionIntervalCount: normalizeSubscriptionIntervalCount(Number(item.subscriptionIntervalCount)),
                    subscriptionDiscountPercent: Math.max(0, Math.round(Number(item.subscriptionDiscountPercent) || 0)),
                    basePriceCents: Math.max(0, Math.round(Number(item.basePriceCents) || 0)),
                }));
                console.log('[BlendContext] initialized cartItems from localStorage', normalized);
                return normalized;
            }
        }
        catch (e) {
            // ignore parse errors
        }
        return [];
    });
    const [appliedDiscountCode, setAppliedDiscountCode] = useState<string | null>(() => {
        try {
            const raw = localStorage.getItem('tea_cart_meta');
            if (raw) {
                const parsed = JSON.parse(raw) as {
                    appliedDiscountCode?: string | null;
                    version?: string;
                };
                if (parsed.version !== CART_STORAGE_VERSION)
                    return null;
                return parsed.appliedDiscountCode || null;
            }
        }
        catch (e) {
            // ignore
        }
        return null;
    });
    const [cartSummary, setCartSummary] = useState<CartSummary | null>(null);
    const [cartMessages, setCartMessages] = useState<string[]>([]);
    const [discountCodeRevision, setDiscountCodeRevision] = useState(0);
    const [isCartSummaryLoading, setIsCartSummaryLoading] = useState(false);
    const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set());
    const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
    const [lastAddedCartItem, setLastAddedCartItem] = useState<CartItem | null>(null);
    const [wishlistItems, setWishlistItems] = useState<WishlistCreation[]>([]);
    const [isWishlistDrawerOpen, setIsWishlistDrawerOpen] = useState(false);
    const [wishlistDrawerMessage, setWishlistDrawerMessage] = useState<string | null>(null);
    const [isWishlistLoading, setIsWishlistLoading] = useState(false);
    const lastCartSignatureRef = useRef<string>('');
    const lastSummarySignatureRef = useRef<string>('');
    const cartOrderRef = useRef<string[]>([]);
    const summaryRequestSeqRef = useRef(0);
    const isLoggedIn = Boolean(customer?.id);
    const isAccountLoggedIn = Boolean(customer?.email);
    const getStoredShippingSelection = useCallback((): ShippingSelection | null => {
        try {
            const raw = localStorage.getItem('tea_shipping');
            if (!raw)
                return null;
            const parsed = JSON.parse(raw) as ShippingSelection;
            return {
                mode: parsed.mode,
                offerId: parsed.offerId,
                offerCode: parsed.offerCode,
                offerLabel: parsed.offerLabel,
                countryCode: parsed.countryCode,
                postalCode: parsed.postalCode,
                city: parsed.city,
                relayPoint: parsed.relayPoint,
            };
        }
        catch (e) {
            return null;
        }
    }, []);
    const mapCartResponse = useCallback((cart: CartResponse) => {
        const signature = `${cart.id}|${cart.totals.subtotalCents}|${cart.totals.shippingCents}|${cart.totals.discountTotalCents}|${cart.totals.totalCents}|${cart.items
            .map((item) => `${item.id}:${item.qty}:${item.unitPriceCents}`)
            .join('|')}`;
        if (signature === lastCartSignatureRef.current) {
            return;
        }
        lastCartSignatureRef.current = signature;
        const mappedItems: CartItem[] = cart.items.map((item) => {
            const blendSubscriptionSetup = extractBlendSubscriptionSetup(item.snapshot);
            if (item.itemType === 'VARIANT') {
                return {
                    id: item.id,
                    itemType: 'VARIANT',
                    isGift: Boolean(item.isGift || item.snapshot?.isGift),
                    name: item.snapshot?.title || t("app.context.blend_context.product"),
                    variantId: item.snapshot?.variantId,
                    productId: item.snapshot?.productId,
                    imageUrl: item.snapshot?.imageUrl || null,
                    selectedOptions: item.snapshot?.options || item.snapshot?.selectedOptions || [],
                    price: item.unitPriceCents / 100,
                    quantity: item.qty,
                };
            }
            if (item.itemType === 'PACK') {
                return {
                    id: item.id,
                    itemType: 'PACK',
                    isGift: Boolean(item.isGift || item.snapshot?.isGift),
                    name: item.snapshot?.title || 'Pack',
                    variantId: item.snapshot?.variantId,
                    imageUrl: item.snapshot?.imageUrl || null,
                    selectedOptions: item.snapshot?.options || item.snapshot?.selectedOptions || [],
                    packItems: item.snapshot?.packItems || [],
                    price: item.unitPriceCents / 100,
                    quantity: item.qty,
                };
            }
            if (item.itemType === 'SUBSCRIPTION') {
                return {
                    id: item.id,
                    itemType: 'SUBSCRIPTION',
                    isGift: Boolean(item.isGift || item.snapshot?.isGift),
                    name: item.snapshot?.title || 'Abonnement',
                    subscriptionPlanId: item.subscriptionPlanId || item.snapshot?.planId,
                    price: item.unitPriceCents / 100,
                    quantity: item.qty,
                };
            }
            return {
                id: item.id,
                itemType: 'BLEND',
                purchaseMode: blendSubscriptionSetup?.intervalCount ? 'SUBSCRIPTION' : normalizeCartPurchaseMode(item.snapshot?.purchaseMode),
                sourceType: blendSubscriptionSetup?.sourceType,
                listingId: blendSubscriptionSetup?.listingId,
                subscriptionIntervalCount: blendSubscriptionSetup?.intervalCount,
                subscriptionDiscountPercent: blendSubscriptionSetup?.discountPercent,
                basePriceCents: blendSubscriptionSetup?.basePriceCents,
                isGift: Boolean(item.isGift || item.snapshot?.isGift),
                name: item.snapshot?.title || t("app.context.blend_context.my_melange"),
                ingredients: item.snapshot?.ingredients || [],
                ingredientIds: item.snapshot?.ingredientIds || [],
                blendFormat: normalizeBlendFormat(item.snapshot?.blendFormat || DEFAULT_BLEND_FORMAT),
                price: item.unitPriceCents / 100,
                quantity: item.qty,
            };
        });
        const orderIndex = new Map(cartOrderRef.current.map((id, index) => [id, index]));
        const orderedItems = mappedItems
            .map((item, index) => ({ item, index }))
            .sort((a, b) => {
            const aIndex = orderIndex.get(a.item.id);
            const bIndex = orderIndex.get(b.item.id);
            if (aIndex === undefined && bIndex === undefined)
                return a.index - b.index;
            if (aIndex === undefined)
                return 1;
            if (bIndex === undefined)
                return -1;
            return aIndex - bIndex;
        })
            .map(({ item }) => item);
        setCartItems(orderedItems);
    }, []);
    useEffect(() => {
        cartOrderRef.current = cartItems.map((item) => item.id);
    }, [cartItems]);
    // Persist cart to localStorage whenever it changes (guest only)
    useEffect(() => {
        if (isLoggedIn)
            return;
        try {
            localStorage.setItem('tea_cart', JSON.stringify(cartItems));
        }
        catch (e) {
            // ignore write errors (e.g., quota)
        }
    }, [cartItems, isLoggedIn]);
    useEffect(() => {
        try {
            localStorage.setItem('tea_cart_meta', JSON.stringify({ appliedDiscountCode, version: CART_STORAGE_VERSION }));
        }
        catch (e) {
            // ignore write errors
        }
    }, [appliedDiscountCode]);
    const addIngredient = useCallback((ingredient: Ingredient) => {
        setSelectedIngredients(prev => {
            if (prev.length >= MAX_INGREDIENTS)
                return prev;
            if (prev.some(ing => ing.id === ingredient.id))
                return prev;
            if (normalizeBlendIngredientCategory(ingredient.category) === 'aroma') {
                const aromaCount = prev.reduce((count, entry) => count + (normalizeBlendIngredientCategory(entry.category) === 'aroma' ? 1 : 0), 0);
                if (aromaCount >= MAX_BLEND_AROMAS)
                    return prev;
            }
            return [...prev, ingredient];
        });
    }, []);
    const setBlendIngredients = useCallback((ingredients: Ingredient[]) => {
        const safeIngredients = Array.isArray(ingredients) ? ingredients : [];
        const nextIngredients: Ingredient[] = [];
        const seenIds = new Set<string>();
        let aromaCount = 0;
        for (const ingredient of safeIngredients) {
            if (!ingredient || typeof ingredient.id !== 'string')
                continue;
            const ingredientId = ingredient.id.trim();
            if (!ingredientId || seenIds.has(ingredientId))
                continue;
            if (nextIngredients.length >= MAX_INGREDIENTS)
                break;
            const normalizedCategory = normalizeBlendIngredientCategory(ingredient.category);
            if (normalizedCategory === 'aroma') {
                if (aromaCount >= MAX_BLEND_AROMAS)
                    continue;
                aromaCount += 1;
            }
            seenIds.add(ingredientId);
            nextIngredients.push(ingredient);
        }
        setSelectedIngredients(nextIngredients);
        setBlendName('');
        setCurrentStep(0);
    }, []);
    const removeIngredient = useCallback((ingredientId: string) => {
        setSelectedIngredients(prev => prev.filter(ing => ing.id !== ingredientId));
    }, []);
    const clearBlend = useCallback(() => {
        setSelectedIngredients([]);
        setBlendName('');
        setCurrentStep(0);
    }, []);
    const isIngredientSelected = useCallback((ingredientId: string) => {
        return selectedIngredients.some(ing => ing.id === ingredientId);
    }, [selectedIngredients]);
    const canAddMore = selectedIngredients.length < MAX_INGREDIENTS;
    const totalPrice = computeBlendUnitPrice(selectedIngredients, { blendFormat: DEFAULT_BLEND_FORMAT });
    const getBlendColor = useCallback(() => {
        if (selectedIngredients.length === 0)
            return '#C4A77D';
        const baseIngredient = selectedIngredients.find(ing => ing.category === 'base');
        if (baseIngredient)
            return baseIngredient.color;
        const colors = selectedIngredients.map(ing => ing.color);
        return colors[0];
    }, [selectedIngredients]);
    /* Cart handlers */
    const lastAddedRef = useRef<CartItem | null>(null);
    const mergeAttemptedRef = useRef(false);
    const refreshTimeoutRef = useRef<number | null>(null);
    const applyBlendOptimistic = useCallback((item: Omit<CartItem, 'id' | 'quantity' | 'itemType'> & {
        quantity?: number;
    }) => {
        setCartItems((prev) => {
            const matchIndex = prev.findIndex((ci) => {
                if (ci.itemType !== 'BLEND')
                    return false;
                if (normalizeCartPurchaseMode(ci.purchaseMode) !== normalizeCartPurchaseMode(item.purchaseMode))
                    return false;
                if (ci.name !== item.name)
                    return false;
                if (normalizeBlendFormat(ci.blendFormat || DEFAULT_BLEND_FORMAT) !==
                    normalizeBlendFormat(item.blendFormat || DEFAULT_BLEND_FORMAT)) {
                    return false;
                }
                if (normalizeCartPurchaseMode(item.purchaseMode) === 'SUBSCRIPTION') {
                    if (normalizeSubscriptionIntervalCount(ci.subscriptionIntervalCount) !==
                        normalizeSubscriptionIntervalCount(item.subscriptionIntervalCount)) {
                        return false;
                    }
                    if ((ci.listingId || null) !== (item.listingId || null)) {
                        return false;
                    }
                }
                if ((ci.ingredientIds || []).length !== (item.ingredientIds || []).length)
                    return false;
                const a = (ci.ingredientIds || []).slice().sort().join(',');
                const b = (item.ingredientIds || []).slice().sort().join(',');
                return a === b;
            });
            let updated: CartItem[];
            let createdOrUpdatedItem: CartItem;
            if (matchIndex !== -1) {
                updated = [...prev];
                updated[matchIndex] = {
                    ...updated[matchIndex],
                    quantity: normalizeCartPurchaseMode(item.purchaseMode) === 'SUBSCRIPTION'
                        ? 1
                        : updated[matchIndex].quantity + (item.quantity || 1),
                    subscriptionIntervalCount: normalizeCartPurchaseMode(item.purchaseMode) === 'SUBSCRIPTION'
                        ? normalizeSubscriptionIntervalCount(item.subscriptionIntervalCount)
                        : updated[matchIndex].subscriptionIntervalCount,
                    subscriptionDiscountPercent: item.subscriptionDiscountPercent || updated[matchIndex].subscriptionDiscountPercent,
                    basePriceCents: item.basePriceCents || updated[matchIndex].basePriceCents,
                };
                createdOrUpdatedItem = updated[matchIndex];
            }
            else {
                createdOrUpdatedItem = {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                    itemType: 'BLEND',
                    purchaseMode: normalizeCartPurchaseMode(item.purchaseMode),
                    sourceType: normalizeCartSourceType(item.sourceType),
                    listingId: item.listingId,
                    subscriptionIntervalCount: normalizeSubscriptionIntervalCount(item.subscriptionIntervalCount),
                    subscriptionDiscountPercent: item.subscriptionDiscountPercent || 0,
                    basePriceCents: item.basePriceCents || Math.max(0, Math.round(item.price * 100)),
                    name: item.name,
                    ingredients: item.ingredients?.map((ing: any) => ({
                        name: ing.name,
                        ingredientColor: ing.color || ing.ingredientColor || '#6B7280',
                        category: typeof ing.category === 'string' ? ing.category : undefined,
                    })),
                    ingredientIds: item.ingredientIds || (item.ingredients as any)?.map((ing: any) => ing.id) || [],
                    blendFormat: normalizeBlendFormat(item.blendFormat || DEFAULT_BLEND_FORMAT),
                    price: item.price,
                    quantity: normalizeCartPurchaseMode(item.purchaseMode) === 'SUBSCRIPTION' ? 1 : (item.quantity || 1),
                    color: item.color,
                };
                updated = [...prev, createdOrUpdatedItem];
            }
            lastAddedRef.current = createdOrUpdatedItem;
            return updated;
        });
    }, []);
    const applyVariantOptimistic = useCallback((item: {
        variantId?: string;
        productId?: string;
        name: string;
        priceCents: number;
        imageUrl?: string | null;
        quantity?: number;
        selectedOptions?: Array<{
            name: string;
            value: string;
        }>;
    }) => {
        setCartItems((prev) => {
            const matchIndex = prev.findIndex((ci) => ci.itemType === 'VARIANT' && ((item.variantId && ci.variantId === item.variantId) ||
                (!item.variantId && item.productId && ci.productId === item.productId)));
            const updated = [...prev];
            let createdOrUpdatedItem: CartItem;
            if (matchIndex !== -1) {
                updated[matchIndex] = {
                    ...updated[matchIndex],
                    quantity: updated[matchIndex].quantity + (item.quantity || 1),
                };
                createdOrUpdatedItem = updated[matchIndex];
            }
            else {
                createdOrUpdatedItem = {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                    itemType: 'VARIANT',
                    name: item.name,
                    variantId: item.variantId,
                    productId: item.productId,
                    imageUrl: item.imageUrl || null,
                    selectedOptions: item.selectedOptions || [],
                    price: item.priceCents / 100,
                    quantity: item.quantity || 1,
                };
                updated.push(createdOrUpdatedItem);
            }
            lastAddedRef.current = createdOrUpdatedItem;
            return updated;
        });
    }, []);
    const addToCart = useCallback((item: Omit<CartItem, 'id' | 'quantity' | 'itemType'> & {
        quantity?: number;
    }) => {
        console.log('[BlendContext] addToCart called', item);
        const ingredientIds = item.ingredientIds || item.ingredients?.map((ing: any) => ing.id).filter(Boolean) || [];
        const blendFormat = normalizeBlendFormat(item.blendFormat || DEFAULT_BLEND_FORMAT);
        if (ingredientIds.length === 0) {
            applyBlendOptimistic({ ...item, blendFormat });
            return;
        }
        applyBlendOptimistic({ ...item, blendFormat });
        if (isLoggedIn) {
            const shippingSelection = getStoredShippingSelection();
            void api.addCartItem({
                itemType: 'BLEND',
                qty: normalizeCartPurchaseMode(item.purchaseMode) === 'SUBSCRIPTION' ? 1 : (item.quantity || 1),
                name: item.name,
                ingredientIds,
                blendFormat,
                purchaseMode: normalizeCartPurchaseMode(item.purchaseMode),
                sourceType: item.sourceType,
                listingId: item.listingId,
                intervalCount: normalizeSubscriptionIntervalCount(item.subscriptionIntervalCount),
                basePriceCents: item.basePriceCents || Math.max(0, Math.round(item.price * 100)),
            }, shippingSelection).then((cart) => {
                mapCartResponse(cart);
            }).catch(async () => {
                try {
                    const cart = await api.getCart(shippingSelection);
                    mapCartResponse(cart);
                }
                catch {
                    // ignore
                }
            });
            return;
        }
        void ensureGuestSession()
            .then(() => {
            const shippingSelection = getStoredShippingSelection();
            return api.addCartItem({
                itemType: 'BLEND',
                qty: normalizeCartPurchaseMode(item.purchaseMode) === 'SUBSCRIPTION' ? 1 : (item.quantity || 1),
                name: item.name,
                ingredientIds,
                blendFormat,
                purchaseMode: normalizeCartPurchaseMode(item.purchaseMode),
                sourceType: item.sourceType,
                listingId: item.listingId,
                intervalCount: normalizeSubscriptionIntervalCount(item.subscriptionIntervalCount),
                basePriceCents: item.basePriceCents || Math.max(0, Math.round(item.price * 100)),
            }, shippingSelection);
        })
            .then((cart) => {
            if (!cart)
                return;
            mapCartResponse(cart);
        })
            .catch(() => {
            // keep optimistic state
        });
        return;
    }, [applyBlendOptimistic, ensureGuestSession, getStoredShippingSelection, isLoggedIn, mapCartResponse]);
    const addVariantToCart = useCallback((item: {
        variantId?: string;
        productId?: string;
        name: string;
        priceCents: number;
        imageUrl?: string | null;
        quantity?: number;
        selectedOptions?: Array<{
            name: string;
            value: string;
        }>;
    }) => {
        if (!item.variantId && !item.productId) {
            applyVariantOptimistic(item);
            return;
        }
        applyVariantOptimistic(item);
        if (isLoggedIn) {
            const shippingSelection = getStoredShippingSelection();
            void api.addCartItem({
                itemType: 'VARIANT',
                qty: item.quantity || 1,
                variantId: item.variantId,
                productId: item.productId,
            }, shippingSelection).then((cart) => {
                mapCartResponse(cart);
            }).catch(async () => {
                try {
                    const cart = await api.getCart(shippingSelection);
                    mapCartResponse(cart);
                }
                catch {
                    // ignore
                }
            });
            return;
        }
        void ensureGuestSession()
            .then(() => {
            const shippingSelection = getStoredShippingSelection();
            return api.addCartItem({
                itemType: 'VARIANT',
                qty: item.quantity || 1,
                variantId: item.variantId,
                productId: item.productId,
            }, shippingSelection);
        })
            .then((cart) => {
            if (!cart)
                return;
            mapCartResponse(cart);
        })
            .catch(() => {
            // keep optimistic state
        });
        return;
    }, [applyVariantOptimistic, ensureGuestSession, getStoredShippingSelection, isLoggedIn, mapCartResponse]);
    // Trigger pulse after cartItems changes (post-render)
    useEffect(() => {
        const item = lastAddedRef.current;
        if (item) {
            try {
                window.dispatchEvent(new Event('cart-pulse'));
            }
            catch (e) {
                // ignore
            }
            setLastAddedCartItem(item);
            setIsCartDrawerOpen(true);
            lastAddedRef.current = null;
        }
    }, [cartItems]);
    useEffect(() => {
        const handler = () => {
            setCartItems([]);
            setAppliedDiscountCode(null);
            setCartSummary(null);
            setCartMessages([]);
            setPendingItemIds(new Set());
            setIsCartDrawerOpen(false);
            setLastAddedCartItem(null);
            lastCartSignatureRef.current = '';
            lastSummarySignatureRef.current = '';
        };
        window.addEventListener('cart-cleared', handler);
        return () => window.removeEventListener('cart-cleared', handler);
    }, []);
    const removeFromCart = useCallback((cartItemId: string) => {
        if (pendingItemIds.has(cartItemId))
            return;
        const shippingSelection = getStoredShippingSelection();
        setPendingItemIds((prev) => new Set(prev).add(cartItemId));
        setCartItems((prev) => prev.filter((ci) => ci.id !== cartItemId));
        void (async () => {
            if (!isLoggedIn) {
                await ensureGuestSession();
            }
            return api.removeCartItem(cartItemId, shippingSelection);
        })()
            .then((cart) => mapCartResponse(cart))
            .catch(async () => {
            try {
                if (!isLoggedIn) {
                    await ensureGuestSession();
                }
                const cart = await api.getCart(shippingSelection);
                mapCartResponse(cart);
            }
            catch {
                // keep optimistic state
            }
        })
            .finally(() => {
            setPendingItemIds((prev) => {
                const next = new Set(prev);
                next.delete(cartItemId);
                return next;
            });
        });
    }, [ensureGuestSession, getStoredShippingSelection, isLoggedIn, mapCartResponse, pendingItemIds]);
    const updateCartItemQuantity = useCallback((cartItemId: string, quantity: number) => {
        if (pendingItemIds.has(cartItemId))
            return;
        const nextQty = Math.max(1, quantity);
        const shippingSelection = getStoredShippingSelection();
        setPendingItemIds((prev) => new Set(prev).add(cartItemId));
        setCartItems((prev) => prev.map((ci) => ci.id === cartItemId ? { ...ci, quantity: nextQty } : ci));
        void (async () => {
            if (!isLoggedIn) {
                await ensureGuestSession();
            }
            return api.updateCartItem(cartItemId, nextQty, shippingSelection);
        })()
            .then((cart) => mapCartResponse(cart))
            .catch(async () => {
            try {
                if (!isLoggedIn) {
                    await ensureGuestSession();
                }
                const cart = await api.getCart(shippingSelection);
                mapCartResponse(cart);
            }
            catch {
                // keep optimistic state
            }
        })
            .finally(() => {
            setPendingItemIds((prev) => {
                const next = new Set(prev);
                next.delete(cartItemId);
                return next;
            });
        });
    }, [ensureGuestSession, getStoredShippingSelection, isLoggedIn, mapCartResponse, pendingItemIds]);
    const clearCartItems = useCallback(() => {
        if (isLoggedIn) {
            setCartItems([]);
            return;
        }
        try {
            localStorage.removeItem('tea_cart');
        }
        catch (e) { }
        setCartItems([]);
    }, [isLoggedIn]);
    const refreshCartSummary = useCallback(async () => {
        const requestSeq = ++summaryRequestSeqRef.current;
        const isCurrentRequest = () => summaryRequestSeqRef.current === requestSeq;
        const shippingSelection = getStoredShippingSelection();
        const resolveErrorMessage = (error: unknown, fallback: string) => {
            if (error instanceof Error && typeof error.message === 'string' && error.message.trim().length > 0) {
                return error.message;
            }
            return fallback;
        };
        const mapCartResponseToSummaryItems = (cart: CartResponse): Parameters<typeof api.getCartSummary>[0]['items'] => cart.items.map((item) => {
            const blendSubscriptionSetup = extractBlendSubscriptionSetup(item.snapshot);
            return {
                ingredientIds: Array.isArray(item.snapshot?.ingredientIds) ? item.snapshot.ingredientIds : [],
                ingredientNames: Array.isArray(item.snapshot?.ingredients)
                    ? item.snapshot.ingredients
                        .map((ingredient: any) => String(ingredient?.name || '').trim())
                        .filter(Boolean)
                    : [],
                blendFormat: typeof item.snapshot?.blendFormat === 'string'
                    ? normalizeBlendFormat(item.snapshot.blendFormat)
                    : undefined,
                quantity: Math.max(1, item.qty || 1),
                unitPriceCents: item.unitPriceCents,
                itemType: item.itemType === 'BLEND' && blendSubscriptionSetup
                    ? 'SUBSCRIPTION'
                    : item.itemType,
                purchaseMode: item.itemType === 'BLEND' && blendSubscriptionSetup ? 'SUBSCRIPTION' : 'ONE_TIME',
                intervalCount: item.itemType === 'BLEND' && blendSubscriptionSetup
                    ? blendSubscriptionSetup.intervalCount
                    : undefined,
                basePriceCents: item.itemType === 'BLEND' && blendSubscriptionSetup
                    ? blendSubscriptionSetup.basePriceCents
                    : undefined,
                productId: typeof item.snapshot?.productId === 'string' ? item.snapshot.productId : null,
                variantId: typeof item.snapshot?.variantId === 'string'
                    ? item.snapshot.variantId
                    : item.itemType === 'VARIANT' || item.itemType === 'PACK'
                        ? item.snapshot?.variantId ?? null
                        : null,
                subscriptionPlanId: item.subscriptionPlanId ||
                    (typeof item.snapshot?.planId === 'string' ? item.snapshot.planId : null),
                isGift: Boolean(item.isGift || item.snapshot?.isGift),
            };
        });
        const mapLocalItemsToSummaryItems = (items: CartItem[]): Parameters<typeof api.getCartSummary>[0]['items'] => items.map((item) => ({
            ingredientIds: item.itemType === 'BLEND' ? item.ingredientIds || [] : [],
            ingredientNames: item.itemType === 'BLEND' ? (item.ingredients || []).map((ingredient) => ingredient.name) : [],
            blendFormat: item.itemType === 'BLEND' ? normalizeBlendFormat(item.blendFormat || DEFAULT_BLEND_FORMAT) : undefined,
            quantity: Math.max(1, item.quantity || 1),
            unitPriceCents: Math.max(0, Math.round(item.price * 100)),
            itemType: item.itemType === 'BLEND' && normalizeCartPurchaseMode(item.purchaseMode) === 'SUBSCRIPTION'
                ? 'SUBSCRIPTION'
                : item.itemType,
            purchaseMode: normalizeCartPurchaseMode(item.purchaseMode),
            intervalCount: normalizeCartPurchaseMode(item.purchaseMode) === 'SUBSCRIPTION'
                ? normalizeSubscriptionIntervalCount(item.subscriptionIntervalCount)
                : undefined,
            basePriceCents: normalizeCartPurchaseMode(item.purchaseMode) === 'SUBSCRIPTION'
                ? (item.basePriceCents || Math.max(0, Math.round(item.price * 100)))
                : undefined,
            productId: item.productId || null,
            variantId: item.variantId || null,
            subscriptionPlanId: item.subscriptionPlanId || null,
            isGift: Boolean(item.isGift),
        }));
        const buildFallbackSummary = (totals: {
            subtotalCents: number;
            shippingCents: number;
            discountTotalCents: number;
            totalCents: number;
        }): CartSummary => ({
            subtotalCents: totals.subtotalCents,
            shippingCents: totals.shippingCents,
            originalShippingCents: totals.shippingCents,
            discountTotalCents: totals.discountTotalCents,
            totalCents: totals.totalCents,
            discountLines: [],
            matchedDiscounts: [],
            messages: [],
            appliedCode: null,
            freeShippingProgress: null,
        });
        setIsCartSummaryLoading(true);
        if (isLoggedIn) {
            let summaryItems = mapLocalItemsToSummaryItems(cartItems);
            let fallbackSummary: CartSummary | null = null;
            try {
                const cart = await api.getCart(shippingSelection);
                if (!isCurrentRequest())
                    return;
                mapCartResponse(cart);
                if (!cart.items || cart.items.length === 0) {
                    setCartSummary(null);
                    setCartMessages([]);
                    if (isCurrentRequest())
                        setIsCartSummaryLoading(false);
                    return;
                }
                summaryItems = mapCartResponseToSummaryItems(cart);
                fallbackSummary = buildFallbackSummary(cart.totals);
            }
            catch (error) {
                if (!isCurrentRequest())
                    return;
                if (summaryItems.length === 0) {
                    setCartSummary(null);
                    setCartMessages([resolveErrorMessage(error, t("app.context.blend_context.failed_recuperer_cart"))]);
                    if (isCurrentRequest())
                        setIsCartSummaryLoading(false);
                    return;
                }
                const localSubtotalCents = summaryItems.reduce((sum, item) => sum + Math.max(0, Math.round(item.unitPriceCents || 0)) * Math.max(1, item.quantity || 1), 0);
                fallbackSummary = buildFallbackSummary({
                    subtotalCents: localSubtotalCents,
                    shippingCents: 0,
                    discountTotalCents: 0,
                    totalCents: localSubtotalCents,
                });
            }
            try {
                const summary = await api.getCartSummary({
                    items: summaryItems,
                    appliedDiscountCode,
                    customerEmail: customer?.email || null,
                    shippingSelection,
                });
                if (!isCurrentRequest())
                    return;
                setCartSummary(summary);
                setCartMessages(summary.messages || []);
            }
            catch (error) {
                if (!isCurrentRequest())
                    return;
                if (fallbackSummary) {
                    setCartSummary((previous) => previous || fallbackSummary);
                }
                setCartMessages([resolveErrorMessage(error, t("app.context.blend_context.failed_calculer_discounts"))]);
            }
            finally {
                if (isCurrentRequest()) {
                    setIsCartSummaryLoading(false);
                }
            }
            return;
        }
        if (!cartItems || cartItems.length === 0) {
            if (isCurrentRequest()) {
                setCartSummary(null);
                setCartMessages([]);
                setIsCartSummaryLoading(false);
            }
            return;
        }
        try {
            const summary = await api.getCartSummary({
                items: mapLocalItemsToSummaryItems(cartItems),
                appliedDiscountCode,
                customerEmail: customer?.email || null,
                shippingSelection,
            });
            if (!isCurrentRequest())
                return;
            const shippingKey = `${shippingSelection?.mode || ''}|${shippingSelection?.offerId || ''}|${shippingSelection?.offerCode || ''}|${shippingSelection?.countryCode || ''}|${shippingSelection?.postalCode || ''}|${shippingSelection?.city || ''}`;
            const signature = `guest-blend|${shippingKey}|${summary.subtotalCents}|${summary.shippingCents}|${summary.discountTotalCents}|${summary.totalCents}|${summary.messages?.join('|') ?? ''}`;
            if (signature !== lastSummarySignatureRef.current) {
                lastSummarySignatureRef.current = signature;
                setCartSummary(summary);
                setCartMessages(summary.messages || []);
            }
        }
        catch (error) {
            if (!isCurrentRequest())
                return;
            const localSubtotalCents = cartItems.reduce((sum, item) => sum + Math.max(0, Math.round(item.price * 100)) * Math.max(1, item.quantity || 1), 0);
            setCartSummary(buildFallbackSummary({
                subtotalCents: localSubtotalCents,
                shippingCents: 0,
                discountTotalCents: 0,
                totalCents: localSubtotalCents,
            }));
            setCartMessages([resolveErrorMessage(error, t("app.context.blend_context.failed_calculer_discounts"))]);
        }
        finally {
            if (isCurrentRequest()) {
                setIsCartSummaryLoading(false);
            }
        }
    }, [appliedDiscountCode, cartItems, customer?.email, getStoredShippingSelection, isLoggedIn, mapCartResponse]);
    const scheduleRefresh = useCallback(() => {
        if (refreshTimeoutRef.current) {
            window.clearTimeout(refreshTimeoutRef.current);
        }
        refreshTimeoutRef.current = window.setTimeout(() => {
            refreshTimeoutRef.current = null;
            refreshCartSummary();
        }, 200);
    }, [refreshCartSummary]);
    useEffect(() => {
        scheduleRefresh();
        return () => {
            if (refreshTimeoutRef.current) {
                window.clearTimeout(refreshTimeoutRef.current);
            }
        };
    }, [scheduleRefresh, cartItems, appliedDiscountCode, isLoggedIn, discountCodeRevision]);
    useEffect(() => {
        const handleShippingChange = () => {
            scheduleRefresh();
        };
        window.addEventListener('shipping-changed', handleShippingChange);
        return () => window.removeEventListener('shipping-changed', handleShippingChange);
    }, [scheduleRefresh]);
    useEffect(() => {
        if (isLoggedIn || cartItems.length === 0)
            return;
        void ensureGuestSession();
    }, [cartItems.length, ensureGuestSession, isLoggedIn]);
    useEffect(() => {
        if (!isLoggedIn)
            return;
        const mergeLocalCart = async () => {
            if (mergeAttemptedRef.current)
                return;
            mergeAttemptedRef.current = true;
            const raw = localStorage.getItem('tea_cart');
            if (!raw)
                return;
            try {
                const localItems = JSON.parse(raw) as CartItem[];
                if (localItems.length === 0)
                    return;
                const payloadItems = localItems
                    .map((item) => {
                    if (item.itemType === 'VARIANT' && (item.variantId || item.productId)) {
                        return { itemType: 'VARIANT' as const, qty: item.quantity, variantId: item.variantId, productId: item.productId };
                    }
                    const ingredientIds = item.ingredientIds || [];
                    if (ingredientIds.length === 0)
                        return null;
                    return {
                        itemType: 'BLEND' as const,
                        qty: normalizeCartPurchaseMode(item.purchaseMode) === 'SUBSCRIPTION' ? 1 : item.quantity,
                        name: item.name,
                        ingredientIds,
                        blendFormat: normalizeBlendFormat(item.blendFormat || DEFAULT_BLEND_FORMAT),
                        purchaseMode: normalizeCartPurchaseMode(item.purchaseMode),
                        sourceType: item.sourceType,
                        listingId: item.listingId,
                        intervalCount: normalizeSubscriptionIntervalCount(item.subscriptionIntervalCount),
                        basePriceCents: item.basePriceCents || Math.max(0, Math.round(item.price * 100)),
                    };
                })
                .filter(Boolean) as Array<{
                    itemType: 'BLEND' | 'VARIANT';
                    qty?: number;
                    name?: string;
                    ingredientIds?: string[];
                    blendFormat?: BlendFormatCode;
                    purchaseMode?: 'ONE_TIME' | 'SUBSCRIPTION';
                    sourceType?: 'LISTING' | 'CUSTOM';
                    listingId?: string;
                    intervalCount?: 1 | 2 | 3;
                    basePriceCents?: number;
                    variantId?: string;
                    productId?: string;
                }>;
                if (payloadItems.length === 0) {
                    localStorage.removeItem('tea_cart');
                    localStorage.removeItem('tea_cart_meta');
                    setCartItems([]);
                    return;
                }
                await api.addCartItem({ items: payloadItems }, getStoredShippingSelection());
                localStorage.removeItem('tea_cart');
                localStorage.removeItem('tea_cart_meta');
            }
            catch (e) {
                // ignore
            }
            refreshCartSummary();
        };
        mergeLocalCart();
    }, [getStoredShippingSelection, isLoggedIn, refreshCartSummary]);
    useEffect(() => {
        if (!isLoggedIn)
            return;
        void api.getCart(getStoredShippingSelection())
            .then((cart) => mapCartResponse(cart))
            .catch(() => {
            setCartMessages([t("app.context.blend_context.failed_recuperer_cart_2")]);
        });
    }, [getStoredShippingSelection, isLoggedIn, mapCartResponse]);
    useEffect(() => {
        if (isLoggedIn)
            return;
        mergeAttemptedRef.current = false;
    }, [isLoggedIn]);
    const applyDiscountCode = useCallback((code: string) => {
        const normalized = code.trim().toUpperCase();
        setAppliedDiscountCode(normalized.length > 0 ? normalized : null);
        setDiscountCodeRevision((prev) => prev + 1);
        scheduleRefresh();
    }, [scheduleRefresh]);
    const removeDiscountCode = useCallback(() => {
        setAppliedDiscountCode(null);
        setDiscountCodeRevision((prev) => prev + 1);
        scheduleRefresh();
    }, [scheduleRefresh]);
    const refreshWishlist = useCallback(async () => {
        if (!isAccountLoggedIn) {
            setWishlistItems([]);
            return;
        }
        setIsWishlistLoading(true);
        try {
            const items = await api.getWishlist();
            setWishlistItems(Array.isArray(items) ? items : []);
        }
        catch {
            setWishlistItems([]);
        }
        finally {
            setIsWishlistLoading(false);
        }
    }, [isAccountLoggedIn]);
    useEffect(() => {
        if (!isAccountLoggedIn) {
            setWishlistItems([]);
            setIsWishlistDrawerOpen(false);
            setWishlistDrawerMessage(null);
            return;
        }
        void refreshWishlist();
    }, [isAccountLoggedIn, refreshWishlist]);
    const openCartDrawer = useCallback(() => {
        setIsCartDrawerOpen(true);
    }, []);
    const closeCartDrawer = useCallback(() => {
        setIsCartDrawerOpen(false);
    }, []);
    const openWishlistDrawer = useCallback((message?: string | null) => {
        setIsWishlistDrawerOpen(true);
        setWishlistDrawerMessage(message ?? null);
    }, []);
    const closeWishlistDrawer = useCallback(() => {
        setIsWishlistDrawerOpen(false);
        setWishlistDrawerMessage(null);
    }, []);
    const addBlendToWishlist = useCallback(async (options: {
        name?: string;
        ingredientIds: string[];
        blendFormat?: BlendFormatCode;
        openDrawerOnSuccess?: boolean;
    }) => {
        if (!isAccountLoggedIn)
            return false;
        const ingredientIds = Array.isArray(options?.ingredientIds)
            ? options.ingredientIds.map((ingredientId) => String(ingredientId || '').trim()).filter(Boolean)
            : [];
        if (ingredientIds.length === 0) {
            return false;
        }
        const shouldOpenDrawer = options?.openDrawerOnSuccess !== false;
        const requestedName = typeof options?.name === 'string' ? options.name.trim() : '';
        const creationName = requestedName || t("app.context.blend_context.my_blend");
        const blendFormat = normalizeBlendFormat(options?.blendFormat || DEFAULT_BLEND_FORMAT);
        setIsWishlistLoading(true);
        try {
            const created = await api.addWishlistItem({
                name: creationName,
                ingredientIds,
                blendFormat,
            });
            setWishlistItems((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
            const successMessage = t("app.context.blend_context.blend_bien_summer");
            setWishlistDrawerMessage(successMessage);
            if (shouldOpenDrawer) {
                openWishlistDrawer(successMessage);
            }
            return true;
        }
        catch {
            const errorMessage = t("app.context.blend_context.failed_add_blend");
            setWishlistDrawerMessage(errorMessage);
            if (shouldOpenDrawer) {
                openWishlistDrawer(errorMessage);
            }
            return false;
        }
        finally {
            setIsWishlistLoading(false);
        }
    }, [isAccountLoggedIn, openWishlistDrawer]);
    const addCurrentBlendToWishlist = useCallback(async (options?: {
        name?: string;
        blendFormat?: BlendFormatCode;
        openDrawerOnSuccess?: boolean;
    }) => {
        return addBlendToWishlist({
            name: options?.name || blendName.trim(),
            ingredientIds: selectedIngredients.map((ingredient) => ingredient.id).filter(Boolean),
            blendFormat: options?.blendFormat,
            openDrawerOnSuccess: options?.openDrawerOnSuccess,
        });
    }, [addBlendToWishlist, blendName, selectedIngredients]);
    const addAccessoryToWishlist = useCallback(async (options: {
        name: string;
        productId?: string;
        variantId?: string;
        openDrawerOnSuccess?: boolean;
    }) => {
        if (!isAccountLoggedIn) {
            return false;
        }
        const variantId = typeof options?.variantId === 'string' ? options.variantId.trim() : '';
        const productId = typeof options?.productId === 'string' ? options.productId.trim() : '';
        if (!variantId && !productId) {
            return false;
        }
        const shouldOpenDrawer = options?.openDrawerOnSuccess !== false;
        const productName = typeof options?.name === 'string' && options.name.trim().length > 0
            ? options.name.trim()
            : t("app.context.blend_context.product");
        setIsWishlistLoading(true);
        try {
            const created = await api.addWishlistItem({
                name: productName,
                productId: productId || undefined,
                variantId: variantId || undefined,
            });
            setWishlistItems((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
            const successMessage = t("app.context.blend_context.product_bien_summer");
            setWishlistDrawerMessage(successMessage);
            if (shouldOpenDrawer) {
                openWishlistDrawer(successMessage);
            }
            return true;
        }
        catch {
            const errorMessage = t("app.context.blend_context.failed_add_product");
            setWishlistDrawerMessage(errorMessage);
            if (shouldOpenDrawer) {
                openWishlistDrawer(errorMessage);
            }
            return false;
        }
        finally {
            setIsWishlistLoading(false);
        }
    }, [isAccountLoggedIn, openWishlistDrawer]);
    const removeWishlistItem = useCallback(async (wishlistItemId: string) => {
        if (!isAccountLoggedIn)
            return;
        const previous = wishlistItems;
        setWishlistDrawerMessage(null);
        setWishlistItems((prev) => prev.filter((item) => item.id !== wishlistItemId));
        try {
            await api.removeWishlistItem(wishlistItemId);
        }
        catch {
            setWishlistItems(previous);
        }
    }, [isAccountLoggedIn, wishlistItems]);
    const checkout = useCallback((comment?: string) => {
        try {
            if (cartItems.length === 0)
                return null;
            const summary = cartSummary;
            const order = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                items: cartItems,
                comment: comment || '',
                total: summary ? summary.totalCents / 100 : cartItems.reduce((s, it) => s + it.price * it.quantity, 0),
                subtotal: summary ? summary.subtotalCents / 100 : cartItems.reduce((s, it) => s + it.price * it.quantity, 0),
                shipping: summary ? summary.shippingCents / 100 : 0,
                discountTotal: summary ? summary.discountTotalCents / 100 : 0,
                discountLines: summary ? summary.discountLines : [],
                appliedDiscountCode,
                createdAt: new Date().toISOString()
            };
            // persist orders array
            try {
                const raw = localStorage.getItem('tea_orders');
                const arr = raw ? JSON.parse(raw) : [];
                arr.push(order);
                localStorage.setItem('tea_orders', JSON.stringify(arr));
            }
            catch (e) {
                // ignore
            }
            // clear cart after checkout
            setCartItems([]);
            return order.id;
        }
        catch (e) {
            return null;
        }
    }, [cartItems, cartSummary, appliedDiscountCode]);
    const cartSubtotal = cartItems.reduce((s, it) => s + it.price * it.quantity, 0);
    const cartTotal = cartSummary ? cartSummary.totalCents / 100 : cartSubtotal;
    return (<BlendContext.Provider value={{
            selectedIngredients,
            blendName,
            currentStep,
            addIngredient,
            setBlendIngredients,
            removeIngredient,
            setBlendName,
            setCurrentStep,
            clearBlend,
            isIngredientSelected,
            canAddMore,
            totalPrice,
            getBlendColor,
            /* cart */
            cartItems,
            addToCart,
            addVariantToCart,
            removeFromCart,
            updateCartItemQuantity,
            clearCartItems,
            checkout,
            cartTotal,
            cartSubtotal,
            appliedDiscountCode,
            applyDiscountCode,
            removeDiscountCode,
            cartSummary,
            cartMessages,
            isCartSummaryLoading,
            pendingItemIds,
            isCartDrawerOpen,
            lastAddedCartItem,
            openCartDrawer,
            closeCartDrawer,
            /* wishlist */
            wishlistItems,
            isWishlistDrawerOpen,
            wishlistDrawerMessage,
            isWishlistLoading,
            openWishlistDrawer,
            closeWishlistDrawer,
            addBlendToWishlist,
            addCurrentBlendToWishlist,
            addAccessoryToWishlist,
            removeWishlistItem
        }}>
      {children}
    </BlendContext.Provider>);
}
export function useBlend() {
    const context = useContext(BlendContext);
    if (context === undefined) {
        throw new Error('useBlend must be used within a BlendProvider');
    }
    return context;
}
