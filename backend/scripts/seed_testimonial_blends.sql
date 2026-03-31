BEGIN;

CREATE TEMP TABLE tmp_testimonial_blend (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "color" TEXT NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE tmp_testimonial_blend_ingredient (
  "blendId" TEXT NOT NULL,
  "ingredientName" TEXT NOT NULL,
  "ingredientCategory" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE tmp_testimonial_listing (
  "id" TEXT PRIMARY KEY,
  "blendId" TEXT NOT NULL,
  "createdBy" TEXT,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "ranking" INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_testimonial_blend ("id", "name", "description", "color")
VALUES
  (
    'blend_testimonial_reveil_provence',
    'Réveil en Provence',
    'J''ai créé ce mélange pour mes matins: la lavande apaise tout de suite, puis le thé vert apporte une énergie nette et douce. C''est ma parenthèse claire et parfumée avant de commencer la journée.',
    '#8CA37D'
  ),
  (
    'blend_testimonial_epices_orient',
    'Épices d''Orient',
    'Je voulais un thé qui accompagne vraiment mes desserts. J''adore la chaleur de la cannelle et de la cardamome, relevée par une pointe de gingembre: c''est gourmand, rond et très élégant.',
    '#8B5E3C'
  ),
  (
    'blend_testimonial_serenite',
    'Sérénité',
    'Après le sport, j''ai besoin d''un goût doux et enveloppant. Ce mélange camomille-verveine, avec une touche de mélisse et de tilleul, me donne une sensation de calme immédiat.',
    '#A8C3A0'
  ),
  (
    'blend_testimonial_energie_collective',
    'Énergie Collective',
    'Je l''ai pensé pour partager: frais, tonique et facile à aimer. Le gingembre et le citron réveillent la tasse, pendant que la menthe et le ginseng gardent une belle longueur en bouche.',
    '#7BAA74'
  ),
  (
    'blend_testimonial_concentration_max',
    'Concentration Max',
    'Quand j''ai besoin de focus, c''est celui-ci que je prépare. La base verte reste légère, la bergamote apporte de la netteté, et le duo ginkgo-ginseng soutient une concentration régulière.',
    '#5E8F7A'
  );

INSERT INTO tmp_testimonial_blend_ingredient ("blendId", "ingredientName", "ingredientCategory", "quantity")
VALUES
  -- Réveil en Provence
  ('blend_testimonial_reveil_provence', 'Thé Vert Sencha - Lu Yu', 'base', 5),
  ('blend_testimonial_reveil_provence', 'Lavande', 'flower', 2),
  ('blend_testimonial_reveil_provence', 'Citron', 'aroma', 1),

  -- Épices d''Orient
  ('blend_testimonial_epices_orient', 'Thé Noir Rukeri', 'base', 4),
  ('blend_testimonial_epices_orient', 'Cannelle', 'aroma', 2),
  ('blend_testimonial_epices_orient', 'Graines de Cardamome', 'vegetal', 1),
  ('blend_testimonial_epices_orient', 'Gingembre', 'aroma', 1),
  ('blend_testimonial_epices_orient', 'Orange', 'fruit', 1),

  -- Sérénité
  ('blend_testimonial_serenite', 'Rooibos Africa', 'base', 4),
  ('blend_testimonial_serenite', 'Camomille', 'flower', 2),
  ('blend_testimonial_serenite', 'Feuilles de Verveine', 'vegetal', 2),
  ('blend_testimonial_serenite', 'Feuilles de Mélisse', 'vegetal', 1),
  ('blend_testimonial_serenite', 'Feuilles de Tilleul', 'vegetal', 1),

  -- Énergie Collective
  ('blend_testimonial_energie_collective', 'Thé Vert Sencha - Lu Yu', 'base', 4),
  ('blend_testimonial_energie_collective', 'Racines de Gingembre', 'vegetal', 2),
  ('blend_testimonial_energie_collective', 'Citron', 'fruit', 1),
  ('blend_testimonial_energie_collective', 'Racines de Ginseng Sibérien', 'vegetal', 1),
  ('blend_testimonial_energie_collective', 'Feuilles de Menthe', 'vegetal', 1),

  -- Concentration Max
  ('blend_testimonial_concentration_max', 'Thé Vert Sencha - Lu Yu', 'base', 4),
  ('blend_testimonial_concentration_max', 'Feuilles de Ginko Biloba', 'vegetal', 2),
  ('blend_testimonial_concentration_max', 'Feuilles de Menthe poivrée', 'vegetal', 1),
  ('blend_testimonial_concentration_max', 'Bergamote', 'aroma', 1),
  ('blend_testimonial_concentration_max', 'Racines de Ginseng Sibérien', 'vegetal', 1);

INSERT INTO tmp_testimonial_listing ("id", "blendId", "createdBy", "title", "slug", "description", "ranking")
VALUES
  (
    'listing_testimonial_reveil_provence',
    'blend_testimonial_reveil_provence',
    'Claire D.',
    'Réveil en Provence',
    'reveil-en-provence',
    'Ma création du matin: florale, fraîche et parfaitement équilibrée pour démarrer la journée avec énergie.',
    500
  ),
  (
    'listing_testimonial_epices_orient',
    'blend_testimonial_epices_orient',
    'Marc L.',
    'Épices d''Orient',
    'epices-d-orient',
    'Mon blend dessert préféré: des notes épicées chaudes, une vraie signature gourmande en fin de repas.',
    499
  ),
  (
    'listing_testimonial_serenite',
    'blend_testimonial_serenite',
    'Sophie M.',
    'Sérénité',
    'serenite',
    'Je le bois après mes séances: doux, relaxant et très réconfortant, c''est mon instant calme.',
    498
  ),
  (
    'listing_testimonial_energie_collective',
    'blend_testimonial_energie_collective',
    'Pierre B.',
    'Énergie Collective',
    'energie-collective',
    'Je l''ai créé pour partager avec mon équipe: tonique, frais et agréable pour tout le monde.',
    497
  ),
  (
    'listing_testimonial_concentration_max',
    'blend_testimonial_concentration_max',
    'Emilie R.',
    'Concentration Max',
    'concentration-max',
    'Mon allié étude: une tasse vive et nette qui m''aide à rester concentrée longtemps.',
    496
  );

DO $$
DECLARE missing_list TEXT;
BEGIN
  SELECT string_agg(
    format('%s/%s (blend=%s)', t."ingredientName", t."ingredientCategory", t."blendId"),
    ', '
  )
  INTO missing_list
  FROM tmp_testimonial_blend_ingredient t
  LEFT JOIN "Ingredient" i
    ON i."name" = t."ingredientName"
   AND i."category" = t."ingredientCategory"
  WHERE i."id" IS NULL;

  IF missing_list IS NOT NULL THEN
    RAISE EXCEPTION 'Missing ingredient(s): %', missing_list;
  END IF;
END $$;

INSERT INTO "Blend" ("id", "name", "description", "color", "coverImageUrl", "createdAt", "updatedAt")
SELECT
  b."id",
  b."name",
  b."description",
  b."color",
  NULL,
  NOW(),
  NOW()
FROM tmp_testimonial_blend b
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "color" = EXCLUDED."color",
  "updatedAt" = NOW();

DELETE FROM "BlendIngredient" bi
USING tmp_testimonial_blend b
WHERE bi."blendId" = b."id";

INSERT INTO "BlendIngredient" ("id", "blendId", "ingredientId", "quantity")
SELECT
  md5(t."blendId" || '|' || i."id"),
  t."blendId",
  i."id",
  t."quantity"
FROM tmp_testimonial_blend_ingredient t
JOIN "Ingredient" i
  ON i."name" = t."ingredientName"
 AND i."category" = t."ingredientCategory"
ON CONFLICT ("blendId", "ingredientId") DO UPDATE SET
  "quantity" = EXCLUDED."quantity";

INSERT INTO "BlendListing" (
  "id",
  "blendId",
  "createdFromOrderId",
  "createdBy",
  "title",
  "slug",
  "description",
  "coverImageUrl",
  "isActive",
  "ranking",
  "createdAt",
  "updatedAt"
)
SELECT
  l."id",
  l."blendId",
  NULL,
  l."createdBy",
  l."title",
  l."slug",
  l."description",
  NULL,
  TRUE,
  l."ranking",
  NOW(),
  NOW()
FROM tmp_testimonial_listing l
ON CONFLICT ("id") DO UPDATE SET
  "blendId" = EXCLUDED."blendId",
  "createdBy" = EXCLUDED."createdBy",
  "title" = EXCLUDED."title",
  "slug" = EXCLUDED."slug",
  "description" = EXCLUDED."description",
  "isActive" = EXCLUDED."isActive",
  "ranking" = EXCLUDED."ranking",
  "updatedAt" = NOW();

COMMIT;
