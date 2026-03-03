-- Drop legacy global unique index on ingredient name
DROP INDEX IF EXISTS "Ingredient_name_key";

-- Allow same ingredient name across categories, while keeping uniqueness per category
CREATE UNIQUE INDEX "Ingredient_name_category_key" ON "Ingredient"("name", "category");
