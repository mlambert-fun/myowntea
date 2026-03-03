-- Add base-only preparation fields to Ingredient and Blend
ALTER TABLE "Ingredient"
ADD COLUMN "dayMoments" JSONB,
ADD COLUMN "infusionTime" TEXT,
ADD COLUMN "dosage" TEXT,
ADD COLUMN "temperature" TEXT,
ADD COLUMN "preparation" TEXT,
ADD COLUMN "origin" TEXT;

ALTER TABLE "Blend"
ADD COLUMN "dayMoments" JSONB,
ADD COLUMN "infusionTime" TEXT,
ADD COLUMN "dosage" TEXT,
ADD COLUMN "temperature" TEXT,
ADD COLUMN "preparation" TEXT,
ADD COLUMN "origin" TEXT;
