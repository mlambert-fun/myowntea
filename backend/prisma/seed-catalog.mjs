import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INGREDIENT_FIXTURES_PATH = path.join(__dirname, 'ingredients-fixtures.json');

function loadIngredientFixtures() {
  const raw = fs.readFileSync(INGREDIENT_FIXTURES_PATH, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error('Ingredient fixture payload is invalid.');
  }

  return parsed;
}

export async function seedCatalogFixtures(prisma) {
  const ingredients = loadIngredientFixtures();

  for (const ingredient of ingredients) {
    const normalizedIngredient = {
      ...ingredient,
      flavor: Array.isArray(ingredient.flavor)
        ? ingredient.flavor.join(', ')
        : ingredient.flavor,
    };

    await prisma.ingredient.upsert({
      where: {
        name_category: {
          name: ingredient.name,
          category: ingredient.category,
        },
      },
      update: normalizedIngredient,
      create: normalizedIngredient,
    });
    console.log(`Ingredient created: ${ingredient.name}`);
  }

  await prisma.storeSettings.upsert({
    where: { id: 'default' },
    update: {
      freeShippingThresholdCents: 4500,
      defaultShippingCents: 590,
      frHomeShippingCents: 550,
      frRelayShippingCents: 460,
      beHomeShippingCents: 900,
      beRelayShippingCents: 550,
      europeShippingCents: 750,
      internationalShippingCents: 1590,
      currency: 'EUR',
      shopAddress: '34 Place du Général de Gaulle, 59800 Lille, France',
      shopPhone: '+33 642 80 08 27',
      contactEmail: 'contact@myowntea.fr',
    },
    create: {
      id: 'default',
      freeShippingThresholdCents: 4500,
      defaultShippingCents: 590,
      frHomeShippingCents: 550,
      frRelayShippingCents: 460,
      beHomeShippingCents: 900,
      beRelayShippingCents: 550,
      europeShippingCents: 750,
      internationalShippingCents: 1590,
      currency: 'EUR',
      shopAddress: '34 Place du Général de Gaulle, 59800 Lille, France',
      shopPhone: '+33 642 80 08 27',
      contactEmail: 'contact@myowntea.fr',
    },
  });
  console.log('Store settings seeded');

  const autoDiscount = await prisma.discount.findFirst({
    where: { title: 'Livraison gratuite dès 45€', method: 'AUTOMATIC' },
  });

  if (!autoDiscount) {
    await prisma.discount.create({
      data: {
        title: 'Livraison gratuite dès 45€',
        method: 'AUTOMATIC',
        type: 'FREE_SHIPPING',
        scope: 'ORDER',
        minimumSubtotalCents: 4500,
        status: 'ACTIVE',
        stackable: true,
      },
    });
    console.log('Discount created: Livraison gratuite dès 45€');
  }

  await prisma.discount.upsert({
    where: { code: 'BIENVENUE10' },
    update: {
      title: 'Bienvenue -10%',
      method: 'CODE',
      type: 'PERCENTAGE',
      scope: 'ORDER',
      valuePercent: 10,
      status: 'ACTIVE',
      stackable: false,
    },
    create: {
      title: 'Bienvenue -10%',
      method: 'CODE',
      code: 'BIENVENUE10',
      type: 'PERCENTAGE',
      scope: 'ORDER',
      valuePercent: 10,
      status: 'ACTIVE',
      stackable: false,
    },
  });
  console.log('Discount created: Bienvenue -10%');

  const orenjiProduct = await prisma.product.upsert({
    where: { slug: 'theiere-orenji' },
    update: {
      type: 'ACCESSORY',
      title: 'Théière Orenji',
      description: 'Théière en verre élégante pour sublimer vos dégustations.',
      isActive: true,
    },
    create: {
      type: 'ACCESSORY',
      title: 'Théière Orenji',
      slug: 'theiere-orenji',
      description: 'Théière en verre élégante pour sublimer vos dégustations.',
      isActive: true,
    },
  });

  console.log('Product created:', orenjiProduct.title);

  const tasseProduct = await prisma.product.upsert({
    where: { slug: 'tasse-argile-infuseur' },
    update: {
      type: 'ACCESSORY',
      title: 'Tasse argile avec infuseur et couvercle',
      description: 'Tasse en argile artisanale avec infuseur et couvercle pour une infusion douce.',
      isActive: true,
    },
    create: {
      type: 'ACCESSORY',
      title: 'Tasse argile avec infuseur et couvercle',
      slug: 'tasse-argile-infuseur',
      description: 'Tasse en argile artisanale avec infuseur et couvercle pour une infusion douce.',
      isActive: true,
    },
  });

  const colorOption = await prisma.productOption.upsert({
    where: { id: `${tasseProduct.id}-color` },
    update: {
      productId: tasseProduct.id,
      name: 'Couleur',
      position: 1,
    },
    create: {
      id: `${tasseProduct.id}-color`,
      productId: tasseProduct.id,
      name: 'Couleur',
      position: 1,
    },
  });

  const blackValue = await prisma.productOptionValue.upsert({
    where: { id: `${colorOption.id}-noir` },
    update: {
      optionId: colorOption.id,
      value: 'Noir',
      position: 1,
    },
    create: {
      id: `${colorOption.id}-noir`,
      optionId: colorOption.id,
      value: 'Noir',
      position: 1,
    },
  });

  const redValue = await prisma.productOptionValue.upsert({
    where: { id: `${colorOption.id}-rouge` },
    update: {
      optionId: colorOption.id,
      value: 'Rouge',
      position: 2,
    },
    create: {
      id: `${colorOption.id}-rouge`,
      optionId: colorOption.id,
      value: 'Rouge',
      position: 2,
    },
  });

  const tasseNoir = await prisma.productVariant.upsert({
    where: { sku: 'TASSE-ARGILE-NOIR' },
    update: {
      productId: tasseProduct.id,
      priceCents: 2490,
      stockQty: 12,
      imageUrl: '/assets/misc/ingredient_placeholder.png',
      isActive: true,
    },
    create: {
      productId: tasseProduct.id,
      sku: 'TASSE-ARGILE-NOIR',
      priceCents: 2490,
      stockQty: 12,
      imageUrl: '/assets/misc/ingredient_placeholder.png',
      isActive: true,
    },
  });

  const tasseRouge = await prisma.productVariant.upsert({
    where: { sku: 'TASSE-ARGILE-ROUGE' },
    update: {
      productId: tasseProduct.id,
      priceCents: 2490,
      stockQty: 12,
      imageUrl: '/assets/misc/ingredient_placeholder.png',
      isActive: true,
    },
    create: {
      productId: tasseProduct.id,
      sku: 'TASSE-ARGILE-ROUGE',
      priceCents: 2490,
      stockQty: 12,
      imageUrl: '/assets/misc/ingredient_placeholder.png',
      isActive: true,
    },
  });

  await prisma.variantOptionValue.upsert({
    where: {
      variantId_optionValueId: {
        variantId: tasseNoir.id,
        optionValueId: blackValue.id,
      },
    },
    update: {},
    create: {
      variantId: tasseNoir.id,
      optionValueId: blackValue.id,
    },
  });

  await prisma.variantOptionValue.upsert({
    where: {
      variantId_optionValueId: {
        variantId: tasseRouge.id,
        optionValueId: redValue.id,
      },
    },
    update: {},
    create: {
      variantId: tasseRouge.id,
      optionValueId: redValue.id,
    },
  });

  console.log('Product created: Tasse argile avec infuseur et couvercle');
}

