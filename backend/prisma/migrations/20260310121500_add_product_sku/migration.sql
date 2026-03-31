ALTER TABLE "Product"
ADD COLUMN "sku" TEXT;

CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
