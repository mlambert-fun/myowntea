-- Customer
ALTER TABLE "Customer"
ADD COLUMN "stripeCustomerId" TEXT;

CREATE UNIQUE INDEX "Customer_stripeCustomerId_key" ON "Customer"("stripeCustomerId");

-- Order
ALTER TABLE "Order"
ADD COLUMN "stripeInvoiceId" TEXT;

CREATE UNIQUE INDEX "Order_stripeInvoiceId_key" ON "Order"("stripeInvoiceId");

-- Subscription
ALTER TABLE "Subscription"
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PLAN',
ADD COLUMN "title" TEXT,
ADD COLUMN "stripePriceId" TEXT,
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN "interval" TEXT NOT NULL DEFAULT 'month',
ADD COLUMN "intervalCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "shippingCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "discountPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "blendListingId" TEXT,
ADD COLUMN "blendFormat" TEXT,
ADD COLUMN "snapshot" JSONB,
ADD COLUMN "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cancelledAt" TIMESTAMP(3);

ALTER TABLE "Subscription"
ALTER COLUMN "planId" DROP NOT NULL;

CREATE INDEX "Subscription_kind_idx" ON "Subscription"("kind");
