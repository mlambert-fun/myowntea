-- CreateTable
CREATE TABLE "WishlistCreation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WishlistCreation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WishlistCreation_customerId_createdAt_idx" ON "WishlistCreation"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "WishlistCreation" ADD CONSTRAINT "WishlistCreation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
