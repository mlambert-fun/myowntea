-- Add price and stock to Product
ALTER TABLE "Product"
ADD COLUMN "priceCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "stockQty" INTEGER;
