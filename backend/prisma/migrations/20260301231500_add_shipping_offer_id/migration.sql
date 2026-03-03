-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "shippingOfferId" TEXT;

-- AlterTable
ALTER TABLE "Shipment"
ADD COLUMN "offerId" TEXT;
