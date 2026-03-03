-- Extend CartItemType enum
ALTER TYPE "CartItemType" ADD VALUE 'PACK';
ALTER TYPE "CartItemType" ADD VALUE 'SUBSCRIPTION';

-- Pack items
CREATE TABLE "PackItem" (
    "id" TEXT NOT NULL,
    "packProductId" TEXT NOT NULL,
    "componentVariantId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PackItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PackItem_packProductId_fkey" FOREIGN KEY ("packProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PackItem_componentVariantId_fkey" FOREIGN KEY ("componentVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PackItem_packProductId_componentVariantId_key" ON "PackItem"("packProductId", "componentVariantId");
CREATE INDEX "PackItem_packProductId_idx" ON "PackItem"("packProductId");
CREATE INDEX "PackItem_componentVariantId_idx" ON "PackItem"("componentVariantId");

-- Blend listings
CREATE TABLE "BlendListing" (
    "id" TEXT NOT NULL,
    "blendId" TEXT NOT NULL,
    "createdFromOrderId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "priceCents" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlendListing_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BlendListing_blendId_fkey" FOREIGN KEY ("blendId") REFERENCES "Blend"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BlendListing_createdFromOrderId_fkey" FOREIGN KEY ("createdFromOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BlendListing_slug_key" ON "BlendListing"("slug");
CREATE INDEX "BlendListing_blendId_idx" ON "BlendListing"("blendId");
CREATE INDEX "BlendListing_isActive_idx" ON "BlendListing"("isActive");

-- Subscription plans
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "interval" TEXT NOT NULL DEFAULT 'month',
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "stripePriceId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubscriptionPlan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SubscriptionPlan_productId_idx" ON "SubscriptionPlan"("productId");

-- Subscriptions
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Subscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");
CREATE INDEX "Subscription_customerId_idx" ON "Subscription"("customerId");
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- Discount application snapshots
CREATE TABLE "CartDiscountApplication" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "cartItemId" TEXT,
    "discountId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "scope" "DiscountScope" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartDiscountApplication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CartDiscountApplication_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CartDiscountApplication_cartItemId_fkey" FOREIGN KEY ("cartItemId") REFERENCES "CartItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CartDiscountApplication_cartId_idx" ON "CartDiscountApplication"("cartId");
CREATE INDEX "CartDiscountApplication_cartItemId_idx" ON "CartDiscountApplication"("cartItemId");
CREATE INDEX "CartDiscountApplication_discountId_idx" ON "CartDiscountApplication"("discountId");

CREATE TABLE "OrderDiscountApplication" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "discountId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "scope" "DiscountScope" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDiscountApplication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrderDiscountApplication_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderDiscountApplication_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "OrderDiscountApplication_orderId_idx" ON "OrderDiscountApplication"("orderId");
CREATE INDEX "OrderDiscountApplication_orderItemId_idx" ON "OrderDiscountApplication"("orderItemId");
CREATE INDEX "OrderDiscountApplication_discountId_idx" ON "OrderDiscountApplication"("discountId");

-- Subscription link on cart/order items
ALTER TABLE "OrderItem" ADD COLUMN "subscriptionPlanId" TEXT;
ALTER TABLE "CartItem" ADD COLUMN "subscriptionPlanId" TEXT;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_subscriptionPlanId_fkey" FOREIGN KEY ("subscriptionPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_subscriptionPlanId_fkey" FOREIGN KEY ("subscriptionPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "OrderItem_subscriptionPlanId_idx" ON "OrderItem"("subscriptionPlanId");
CREATE INDEX "CartItem_subscriptionPlanId_idx" ON "CartItem"("subscriptionPlanId");
