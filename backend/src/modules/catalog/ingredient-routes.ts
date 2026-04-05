// @ts-nocheck
function normalizeIngredientMeta({ flavor, flavord, flavors, pairing }) {
  const normalizedFlavors = Array.isArray(flavors)
    ? flavors
      .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim())
    : [];
  const normalizedFlavorText =
    typeof flavor === 'string' && flavor.trim().length > 0
      ? flavor.trim()
      : typeof flavord === 'string' && flavord.trim().length > 0
        ? flavord.trim()
        : null;
  const normalizedPairing = typeof pairing === 'string' && pairing.trim().length > 0
    ? pairing.trim()
    : null;

  return {
    normalizedFlavors,
    normalizedFlavorText,
    normalizedPairing,
  };
}

export function registerIngredientRoutes(app, deps) {
  const {
    adminMutationAudit,
    localizeIngredientsForRequest,
    normalizeBaseFields,
    normalizeTasteMetric,
    prisma,
    requireAdminApi,
  } = deps;

  app.get('/api/ingredients', async (req, res) => {
    try {
      const ingredients = await prisma.ingredient.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          longDescription: true,
          category: true,
          flavor: true,
          flavors: true,
          image: true,
          color: true,
          intensity: true,
          umami: true,
          sweetness: true,
          thickness: true,
          finish: true,
          benefits: true,
          dayMoments: true,
          infusionTime: true,
          dosage: true,
          temperature: true,
          preparation: true,
          origin: true,
          pairing: true,
          price: true,
          stock: true,
          isActive: true,
        },
      });
      const localizedIngredients = await localizeIngredientsForRequest(req, ingredients);
      const mapped = localizedIngredients.map((ingredient) => ({ ...ingredient, basePrice: ingredient.price }));
      res.json(mapped);
    } catch (error) {
      console.error('Error fetching ingredients:', error);
      res.status(500).json({ error: 'Failed to fetch ingredients' });
    }
  });

  app.get('/api/ingredients/:id', async (req, res) => {
    try {
      const ingredient = await prisma.ingredient.findUnique({
        where: { id: req.params.id },
      });
      if (!ingredient) {
        return res.status(404).json({ error: 'Ingredient not found' });
      }
      const [localizedIngredient] = await localizeIngredientsForRequest(req, [ingredient]);
      res.json(localizedIngredient);
    } catch (error) {
      console.error('Error fetching ingredient:', error);
      res.status(500).json({ error: 'Failed to fetch ingredient' });
    }
  });

  app.post('/api/ingredients', requireAdminApi, adminMutationAudit, async (req, res) => {
    try {
      const { name, category, basePrice, stock, description, longDescription, image, color, intensity, umami, sweetness, thickness, finish, benefits, flavor, flavord, pairing, flavors, isActive } = req.body;
      const { normalizedFlavors, normalizedFlavorText, normalizedPairing } = normalizeIngredientMeta({
        flavor,
        flavord,
        flavors,
        pairing,
      });
      const baseFields = normalizeBaseFields(req.body, category);
      const ingredient = await prisma.ingredient.create({
        data: {
          name,
          category,
          price: parseFloat(basePrice || 0),
          stock: parseInt(stock || 0),
          description: description || '',
          longDescription: typeof longDescription === 'string' && longDescription.trim() ? longDescription.trim() : null,
          flavor: normalizedFlavorText || normalizedFlavors[0] || null,
          flavors: normalizedFlavors,
          pairing: normalizedPairing,
          image: image || '',
          color: color || '#667eea',
          intensity: normalizeTasteMetric(intensity),
          umami: normalizeTasteMetric(umami),
          sweetness: normalizeTasteMetric(sweetness),
          thickness: normalizeTasteMetric(thickness),
          finish: normalizeTasteMetric(finish),
          benefits: benefits || [],
          ...baseFields,
          isActive: typeof isActive === 'boolean' ? isActive : true,
        },
      });
      res.status(201).json({ ...ingredient, basePrice: ingredient.price });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create ingredient';
      if (error instanceof Error && /dayMoments|infusionTime|dosage|temperature|preparation|origin/.test(message)) {
        return res.status(400).json({ error: message });
      }
      console.error('Error creating ingredient:', error);
      res.status(500).json({ error: 'Failed to create ingredient' });
    }
  });

  app.put('/api/ingredients/:id', requireAdminApi, adminMutationAudit, async (req, res) => {
    try {
      const { name, category, basePrice, stock, description, longDescription, image, color, intensity, umami, sweetness, thickness, finish, benefits, flavor, flavord, pairing, flavors, isActive } = req.body;
      const { normalizedFlavors, normalizedFlavorText, normalizedPairing } = normalizeIngredientMeta({
        flavor,
        flavord,
        flavors,
        pairing,
      });
      const baseFields = normalizeBaseFields(req.body, category);
      const ingredient = await prisma.ingredient.update({
        where: { id: req.params.id },
        data: {
          name,
          category,
          price: parseFloat(basePrice || 0),
          stock: parseInt(stock || 0),
          description: description || '',
          longDescription: typeof longDescription === 'string' && longDescription.trim() ? longDescription.trim() : null,
          flavor: normalizedFlavorText || normalizedFlavors[0] || null,
          flavors: normalizedFlavors,
          pairing: normalizedPairing,
          image: image || '',
          color: color || '#667eea',
          intensity: normalizeTasteMetric(intensity),
          umami: normalizeTasteMetric(umami),
          sweetness: normalizeTasteMetric(sweetness),
          thickness: normalizeTasteMetric(thickness),
          finish: normalizeTasteMetric(finish),
          benefits: benefits || [],
          ...baseFields,
          isActive: typeof isActive === 'boolean' ? isActive : true,
        },
      });
      res.json({ ...ingredient, basePrice: ingredient.price });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update ingredient';
      if (error instanceof Error && /dayMoments|infusionTime|dosage|temperature|preparation|origin/.test(message)) {
        return res.status(400).json({ error: message });
      }
      console.error('Error updating ingredient:', error);
      res.status(500).json({ error: 'Failed to update ingredient' });
    }
  });

  app.delete('/api/ingredients/:id', requireAdminApi, adminMutationAudit, async (req, res) => {
    try {
      const ingredientId = req.params.id;
      await prisma.blendIngredient.deleteMany({
        where: { ingredientId },
      });
      const ingredient = await prisma.ingredient.delete({
        where: { id: ingredientId },
      });
      res.json({ ...ingredient, basePrice: ingredient.price });
    } catch (error) {
      console.error('Error deleting ingredient:', error);
      res.status(500).json({ error: 'Failed to delete ingredient' });
    }
  });
}
