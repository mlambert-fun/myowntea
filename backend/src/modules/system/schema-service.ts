// @ts-nocheck
export function createSchemaService({ AUTOMATION_JOB_DEFAULTS, prisma }) {
  let passwordResetTableEnsurePromise = null;
  let passwordResetTableEnsured = false;

  const ensurePasswordResetTable = async () => {
    if (passwordResetTableEnsured) {
      return;
    }
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
    } catch (error) {
      passwordResetTableEnsurePromise = null;
      passwordResetTableEnsured = false;
      throw error;
    }
  };

  let workflowTablesEnsurePromise = null;
  let workflowTablesEnsured = false;

  const ensureOrderWorkflowTables = async () => {
    if (workflowTablesEnsured) {
      return;
    }
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
      CREATE TABLE IF NOT EXISTS "NewsletterSubscription" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL UNIQUE,
        "status" TEXT NOT NULL DEFAULT 'SUBSCRIBED',
        "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
        "consentSource" TEXT,
        "consentIp" TEXT,
        "consentUserAgent" TEXT,
        "subscribedAt" TIMESTAMP(3),
        "unsubscribedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
      await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EmailConsentEvent" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "customerId" TEXT,
        "email" TEXT NOT NULL,
        "channel" TEXT NOT NULL DEFAULT 'EMAIL',
        "purpose" TEXT NOT NULL DEFAULT 'MARKETING',
        "action" TEXT NOT NULL,
        "source" TEXT,
        "legalBasis" TEXT NOT NULL DEFAULT 'CONSENT',
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "metadata" JSONB,
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
      CREATE INDEX IF NOT EXISTS "NewsletterSubscription_status_updatedAt_idx"
      ON "NewsletterSubscription"("status", "updatedAt" DESC);
    `);
      await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "EmailConsentEvent_email_createdAt_idx"
      ON "EmailConsentEvent"("email", "createdAt" DESC);
    `);
      await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "EmailConsentEvent_customerId_createdAt_idx"
      ON "EmailConsentEvent"("customerId", "createdAt" DESC);
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
      await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'EmailConsentEvent_customerId_fkey'
        ) THEN
          ALTER TABLE "EmailConsentEvent"
          ADD CONSTRAINT "EmailConsentEvent_customerId_fkey"
          FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);

      const defaultEntries = Object.entries(AUTOMATION_JOB_DEFAULTS);
      for (const [id, config] of defaultEntries) {
        await prisma.$executeRaw`
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
    } catch (error) {
      workflowTablesEnsurePromise = null;
      workflowTablesEnsured = false;
      throw error;
    }
  };

  return {
    ensureOrderWorkflowTables,
    ensurePasswordResetTable,
  };
}
