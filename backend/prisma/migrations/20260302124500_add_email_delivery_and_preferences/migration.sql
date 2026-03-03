-- CreateTable
CREATE TABLE "EmailPreference" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "transactionalOptIn" BOOLEAN NOT NULL DEFAULT true,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT true,
    "abandonedCartOptIn" BOOLEAN NOT NULL DEFAULT true,
    "postPurchaseOptIn" BOOLEAN NOT NULL DEFAULT true,
    "reorderOptIn" BOOLEAN NOT NULL DEFAULT true,
    "winbackOptIn" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDelivery" (
    "id" TEXT NOT NULL,
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaignLog" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "cartId" TEXT,
    "campaignKey" TEXT NOT NULL,
    "emailDeliveryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailCampaignLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailPreference_customerId_key" ON "EmailPreference"("customerId");

-- CreateIndex
CREATE INDEX "EmailDelivery_status_nextAttemptAt_idx" ON "EmailDelivery"("status", "nextAttemptAt");
CREATE INDEX "EmailDelivery_createdAt_idx" ON "EmailDelivery"("createdAt");
CREATE INDEX "EmailDelivery_customerId_idx" ON "EmailDelivery"("customerId");
CREATE INDEX "EmailDelivery_orderId_idx" ON "EmailDelivery"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailCampaignLog_customerId_campaignKey_key" ON "EmailCampaignLog"("customerId", "campaignKey");
CREATE INDEX "EmailCampaignLog_campaignKey_idx" ON "EmailCampaignLog"("campaignKey");
CREATE INDEX "EmailCampaignLog_orderId_idx" ON "EmailCampaignLog"("orderId");
CREATE INDEX "EmailCampaignLog_cartId_idx" ON "EmailCampaignLog"("cartId");

-- AddForeignKey
ALTER TABLE "EmailPreference"
ADD CONSTRAINT "EmailPreference_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailDelivery"
ADD CONSTRAINT "EmailDelivery_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailDelivery"
ADD CONSTRAINT "EmailDelivery_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailCampaignLog"
ADD CONSTRAINT "EmailCampaignLog_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailCampaignLog"
ADD CONSTRAINT "EmailCampaignLog_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailCampaignLog"
ADD CONSTRAINT "EmailCampaignLog_cartId_fkey"
FOREIGN KEY ("cartId") REFERENCES "Cart"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailCampaignLog"
ADD CONSTRAINT "EmailCampaignLog_emailDeliveryId_fkey"
FOREIGN KEY ("emailDeliveryId") REFERENCES "EmailDelivery"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
