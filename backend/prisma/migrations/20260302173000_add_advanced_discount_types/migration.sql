-- Add advanced discount types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'DiscountType' AND e.enumlabel = 'BOGO'
  ) THEN
    ALTER TYPE "DiscountType" ADD VALUE 'BOGO';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'DiscountType' AND e.enumlabel = 'TIERED'
  ) THEN
    ALTER TYPE "DiscountType" ADD VALUE 'TIERED';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'DiscountType' AND e.enumlabel = 'BUNDLE'
  ) THEN
    ALTER TYPE "DiscountType" ADD VALUE 'BUNDLE';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'DiscountType' AND e.enumlabel = 'SALE_PRICE'
  ) THEN
    ALTER TYPE "DiscountType" ADD VALUE 'SALE_PRICE';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'DiscountType' AND e.enumlabel = 'SUBSCRIPTION'
  ) THEN
    ALTER TYPE "DiscountType" ADD VALUE 'SUBSCRIPTION';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'DiscountType' AND e.enumlabel = 'GIFT'
  ) THEN
    ALTER TYPE "DiscountType" ADD VALUE 'GIFT';
  END IF;
END
$$;

-- Add JSON configuration payload for advanced promotion rules
ALTER TABLE "Discount"
ADD COLUMN IF NOT EXISTS "config" JSONB;
