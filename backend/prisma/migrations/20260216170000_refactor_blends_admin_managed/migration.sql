ALTER TABLE "Blend"
ADD COLUMN "coverImageUrl" TEXT;

ALTER TABLE "Blend"
DROP COLUMN "dayMoments",
DROP COLUMN "infusionTime",
DROP COLUMN "dosage",
DROP COLUMN "temperature",
DROP COLUMN "preparation",
DROP COLUMN "origin";
