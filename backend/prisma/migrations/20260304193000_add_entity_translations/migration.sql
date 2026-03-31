-- CreateEnum
CREATE TYPE "TranslatableEntityType" AS ENUM (
  'INGREDIENT',
  'PRODUCT',
  'PRODUCT_OPTION',
  'PRODUCT_OPTION_VALUE',
  'BLEND',
  'BLEND_LISTING'
);

-- CreateTable
CREATE TABLE "EntityTranslation" (
  "id" TEXT NOT NULL,
  "entityType" "TranslatableEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EntityTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntityTranslation_entity_field_locale_key"
ON "EntityTranslation"("entityType", "entityId", "field", "locale");

-- CreateIndex
CREATE INDEX "EntityTranslation_entity_idx"
ON "EntityTranslation"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EntityTranslation_entity_locale_idx"
ON "EntityTranslation"("entityType", "locale");
