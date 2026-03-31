-- AlterTable
ALTER TABLE "StoreSettings"
ADD COLUMN     "frHomeShippingCents" INTEGER NOT NULL DEFAULT 550,
ADD COLUMN     "frRelayShippingCents" INTEGER NOT NULL DEFAULT 460,
ADD COLUMN     "europeShippingCents" INTEGER NOT NULL DEFAULT 750,
ADD COLUMN     "internationalShippingCents" INTEGER NOT NULL DEFAULT 1590;
