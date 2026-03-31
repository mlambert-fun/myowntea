ALTER TABLE "ProductVariant"
ADD COLUMN "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "ProductVariant"
SET "images" = CASE
  WHEN "imageUrl" IS NOT NULL THEN ARRAY["imageUrl"]
  ELSE ARRAY[]::TEXT[]
END
WHERE COALESCE(array_length("images", 1), 0) = 0;
