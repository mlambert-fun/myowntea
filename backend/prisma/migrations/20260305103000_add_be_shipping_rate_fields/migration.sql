-- AlterTable
ALTER TABLE "StoreSettings"
ADD COLUMN     "beHomeShippingCents" INTEGER NOT NULL DEFAULT 900,
ADD COLUMN     "beRelayShippingCents" INTEGER NOT NULL DEFAULT 550;
