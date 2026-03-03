-- CreateEnum
CREATE TYPE "DiscountMethod" AS ENUM ('AUTOMATIC', 'CODE');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED', 'FREE_SHIPPING');

-- CreateEnum
CREATE TYPE "DiscountScope" AS ENUM ('ORDER', 'SHIPPING', 'PRODUCTS', 'CATEGORIES');

-- CreateEnum
CREATE TYPE "DiscountStatus" AS ENUM ('ACTIVE', 'DRAFT', 'EXPIRED');

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "flavor" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "appliedDiscountCode" TEXT,
ADD COLUMN     "appliedDiscounts" JSONB,
ADD COLUMN     "discountTotalCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shippingCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subtotalCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Discount" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "method" "DiscountMethod" NOT NULL,
    "code" TEXT,
    "type" "DiscountType" NOT NULL,
    "scope" "DiscountScope" NOT NULL DEFAULT 'ORDER',
    "valuePercent" INTEGER,
    "valueCents" INTEGER,
    "minimumSubtotalCents" INTEGER DEFAULT 0,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "usageLimitTotal" INTEGER,
    "usageLimitPerCustomer" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "status" "DiscountStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRedemption" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "orderId" TEXT,
    "customerEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "freeShippingThresholdCents" INTEGER NOT NULL DEFAULT 4500,
    "defaultShippingCents" INTEGER NOT NULL DEFAULT 590,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Discount_code_key" ON "Discount"("code");

-- CreateIndex
CREATE INDEX "Discount_status_method_idx" ON "Discount"("status", "method");

-- CreateIndex
CREATE INDEX "Discount_type_idx" ON "Discount"("type");

-- CreateIndex
CREATE INDEX "DiscountRedemption_discountId_idx" ON "DiscountRedemption"("discountId");

-- CreateIndex
CREATE INDEX "DiscountRedemption_customerEmail_idx" ON "DiscountRedemption"("customerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRedemption_discountId_orderId_key" ON "DiscountRedemption"("discountId", "orderId");

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
