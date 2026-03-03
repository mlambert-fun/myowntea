-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "relayNetwork" TEXT,
ADD COLUMN     "relayPointId" TEXT,
ADD COLUMN     "relayPointLabel" TEXT,
ADD COLUMN     "shippingMeta" JSONB,
ADD COLUMN     "shippingMode" TEXT,
ADD COLUMN     "shippingOfferCode" TEXT,
ADD COLUMN     "shippingOfferLabel" TEXT,
ADD COLUMN     "shippingProvider" TEXT;

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'BOXTAL',
    "providerOrderId" TEXT,
    "offerCode" TEXT,
    "offerLabel" TEXT,
    "status" TEXT,
    "trackingNumber" TEXT,
    "labelUrl" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "relayPointId" TEXT,
    "relayNetwork" TEXT,
    "payload" JSONB,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT,
    "occurredAt" TIMESTAMP(3),
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
