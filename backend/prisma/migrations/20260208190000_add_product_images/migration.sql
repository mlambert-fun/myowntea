-- Add images array to Product
ALTER TABLE "Product"
ADD COLUMN "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
