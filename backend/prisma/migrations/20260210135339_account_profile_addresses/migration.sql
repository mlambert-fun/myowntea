-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('PASSWORD', 'GOOGLE');

-- CreateEnum
CREATE TYPE "Salutation" AS ENUM ('MME', 'MR');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "authProvider" "AuthProvider" NOT NULL DEFAULT 'PASSWORD',
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "phoneE164" TEXT,
ADD COLUMN     "salutation" "Salutation";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "billingAddressSnapshot" JSONB,
ADD COLUMN     "shippingAddressSnapshot" JSONB,
ADD COLUMN     "trackingUrl" TEXT;

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "salutation" "Salutation",
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "hamlet" TEXT,
    "address1" TEXT NOT NULL,
    "address2" TEXT,
    "phoneE164" TEXT NOT NULL,
    "isDefaultBilling" BOOLEAN NOT NULL DEFAULT false,
    "isDefaultShipping" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Address_customerId_idx" ON "Address"("customerId");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
