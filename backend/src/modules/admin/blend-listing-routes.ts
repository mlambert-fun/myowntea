// @ts-nocheck
export function registerBlendListingRoutes(app, deps) {
  const {
    assertBlendPricingIngredients,
    ensureUniqueBlendListingSlug,
    localizeBlendListingsForRequest,
    normalizeIngredientIds,
    parseBlendListingRanking,
    prisma,
    serializeBlendListingWithPricing,
    slugify,
    toBlendPricingErrorPayload,
    toBlendPricingIngredientsFromBlendEntries,
  } = deps;

  app.get('/api/blend-listings', async (req, res) => {
    try {
      const listings = await prisma.blendListing.findMany({
        where: { isActive: true },
        include: {
          blend: { include: { ingredients: { include: { ingredient: true } } } },
          createdFromOrder: {
            select: {
              id: true,
              orderNumber: true,
              customer: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy: [{ ranking: 'asc' }, { createdAt: 'desc' }],
      });
      const localizedListings = await localizeBlendListingsForRequest(req, listings);
      res.json(localizedListings.map(serializeBlendListingWithPricing));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch blend listings' });
    }
  });

  app.get('/api/blend-listings/:slug', async (req, res) => {
    try {
      const listing = await prisma.blendListing.findUnique({
        where: { slug: req.params.slug },
        include: {
          blend: { include: { ingredients: { include: { ingredient: true } } } },
          createdFromOrder: {
            select: {
              id: true,
              orderNumber: true,
              customer: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      });
      if (!listing || !listing.isActive) {
        return res.status(404).json({ error: 'Blend listing not found' });
      }
      const [localizedListing] = await localizeBlendListingsForRequest(req, [listing]);
      res.json(serializeBlendListingWithPricing(localizedListing));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch blend listing' });
    }
  });

  app.get('/api/admin/blend-listings', async (_req, res) => {
    try {
      const listings = await prisma.blendListing.findMany({
        include: {
          blend: {
            include: {
              ingredients: {
                include: {
                  ingredient: {
                    select: { id: true, name: true, category: true, color: true, price: true },
                  },
                },
              },
            },
          },
          createdFromOrder: { select: { id: true, orderNumber: true } },
        },
        orderBy: [{ ranking: 'asc' }, { createdAt: 'desc' }],
      });
      res.json(listings.map(serializeBlendListingWithPricing));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch blend listings' });
    }
  });

  app.get('/api/admin/blend-listings/:id', async (req, res) => {
    try {
      const listing = await prisma.blendListing.findUnique({
        where: { id: req.params.id },
        include: {
          blend: {
            include: {
              ingredients: {
                include: {
                  ingredient: {
                    select: { id: true, name: true, category: true, color: true, price: true },
                  },
                },
              },
            },
          },
          createdFromOrder: { select: { id: true, orderNumber: true } },
        },
      });
      if (!listing) {
        return res.status(404).json({ error: 'Blend listing not found' });
      }
      res.json(serializeBlendListingWithPricing(listing));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch blend listing' });
    }
  });

  app.post('/api/admin/blend-listings', async (req, res) => {
    try {
      const { blendId, blend, title, slug, description, coverImageUrl, isActive, createdFromOrderId, createdBy, ranking } = req.body;
      if (!title) {
        return res.status(400).json({ error: 'title is required' });
      }

      const resolvedRanking = parseBlendListingRanking(ranking, 0);
      if (resolvedRanking === null) {
        return res.status(400).json({ error: 'ranking must be a non-negative integer' });
      }

      const normalizedCreatedFromOrderId = typeof createdFromOrderId === 'string' ? createdFromOrderId.trim() : '';
      let resolvedCreatedFromOrderId = null;
      if (normalizedCreatedFromOrderId) {
        const sourceOrder = await prisma.order.findFirst({
          where: {
            OR: [{ id: normalizedCreatedFromOrderId }, { orderNumber: normalizedCreatedFromOrderId }],
          },
          select: { id: true },
        });
        if (!sourceOrder) {
          return res.status(400).json({ error: 'createdFromOrderId is invalid' });
        }
        resolvedCreatedFromOrderId = sourceOrder.id;
      }

      const normalizedCreatedBy = typeof createdBy === 'string' ? createdBy.trim() : '';
      const resolvedCreatedBy = normalizedCreatedBy || null;
      let resolvedBlendId = blendId || null;
      if (resolvedBlendId) {
        const existingBlend = await prisma.blend.findUnique({
          where: { id: resolvedBlendId },
          select: {
            id: true,
            ingredients: {
              include: {
                ingredient: {
                  select: { id: true, category: true, price: true },
                },
              },
            },
          },
        });
        if (!existingBlend) {
          return res.status(400).json({ error: 'blendId is invalid' });
        }
        try {
          assertBlendPricingIngredients(toBlendPricingIngredientsFromBlendEntries(existingBlend.ingredients));
        } catch (pricingError) {
          const pricingPayload = toBlendPricingErrorPayload(pricingError);
          if (pricingPayload) {
            return res.status(400).json(pricingPayload);
          }
          throw pricingError;
        }
      } else {
        const blendName = typeof blend.name === 'string' ? blend.name.trim() : '';
        if (!blendName) {
          return res.status(400).json({ error: 'blend.name is required when blendId is not provided' });
        }

        const ingredientIds = normalizeIngredientIds(blend.ingredientIds);
        if (ingredientIds.length === 0) {
          return res.status(400).json({ error: 'blend.ingredientIds must contain at least one ingredientId' });
        }

        const ingredients = await prisma.ingredient.findMany({
          where: { id: { in: ingredientIds } },
          select: { id: true, category: true, price: true },
        });
        if (ingredients.length !== ingredientIds.length) {
          return res.status(400).json({ error: 'One or more blend.ingredientIds are invalid' });
        }

        const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
        const orderedIngredients = ingredientIds.map((ingredientId) => ingredientById.get(ingredientId)).filter(Boolean);
        try {
          assertBlendPricingIngredients(orderedIngredients);
        } catch (pricingError) {
          const pricingPayload = toBlendPricingErrorPayload(pricingError);
          if (pricingPayload) {
            return res.status(400).json(pricingPayload);
          }
          throw pricingError;
        }

        const blendDescription = typeof blend.description === 'string' ? blend.description.trim() : null;
        const blendCoverImageUrl = typeof blend.coverImageUrl === 'string' ? blend.coverImageUrl.trim() : null;
        const createdBlend = await prisma.blend.create({
          data: {
            name: blendName,
            description: blendDescription && blendDescription.length > 0 ? blendDescription : null,
            color: typeof blend.color === 'string' && blend.color.trim() ? blend.color.trim() : '#C4A77D',
            coverImageUrl: blendCoverImageUrl && blendCoverImageUrl.length > 0 ? blendCoverImageUrl : null,
            ingredients: {
              create: ingredientIds.map((ingredientId) => ({ ingredientId, quantity: 1 })),
            },
          },
          select: { id: true },
        });
        resolvedBlendId = createdBlend.id;
      }

      const uniqueSlug = await ensureUniqueBlendListingSlug(slug || title);
      const listing = await prisma.blendListing.create({
        data: {
          blendId: resolvedBlendId,
          createdFromOrderId: resolvedCreatedFromOrderId,
          createdBy: resolvedCreatedBy,
          title,
          slug: uniqueSlug,
          description: description || null,
          coverImageUrl: coverImageUrl || null,
          isActive: typeof isActive === 'boolean' ? isActive : false,
          ranking: resolvedRanking,
        },
      });
      res.status(201).json(listing);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create blend listing' });
    }
  });

  app.patch('/api/admin/blend-listings/:id', async (req, res) => {
    try {
      const { title, slug, description, coverImageUrl, isActive, createdFromOrderId, createdBy, blendId, blend, ranking } = req.body;
      const existing = await prisma.blendListing.findUnique({
        where: { id: req.params.id },
        include: { blend: { include: { ingredients: true } } },
      });
      if (!existing) {
        return res.status(404).json({ error: 'Blend listing not found' });
      }

      let resolvedRanking = undefined;
      if (ranking !== undefined) {
        const parsedRanking = parseBlendListingRanking(ranking, existing.ranking);
        if (parsedRanking === null) {
          return res.status(400).json({ error: 'ranking must be a non-negative integer' });
        }
        resolvedRanking = parsedRanking;
      }

      let resolvedCreatedFromOrderId = undefined;
      if (createdFromOrderId !== undefined) {
        const normalizedCreatedFromOrderId = typeof createdFromOrderId === 'string' ? createdFromOrderId.trim() : '';
        if (!normalizedCreatedFromOrderId) {
          resolvedCreatedFromOrderId = null;
        } else {
          const sourceOrder = await prisma.order.findFirst({
            where: {
              OR: [{ id: normalizedCreatedFromOrderId }, { orderNumber: normalizedCreatedFromOrderId }],
            },
            select: { id: true },
          });
          if (!sourceOrder) {
            return res.status(400).json({ error: 'createdFromOrderId is invalid' });
          }
          resolvedCreatedFromOrderId = sourceOrder.id;
        }
      }

      let resolvedCreatedBy = undefined;
      if (createdBy !== undefined) {
        const normalizedCreatedBy = typeof createdBy === 'string' ? createdBy.trim() : '';
        resolvedCreatedBy = normalizedCreatedBy || null;
      }

      let nextBlendId = existing.blendId;
      if (blendId && blendId !== existing.blendId) {
        const targetBlend = await prisma.blend.findUnique({
          where: { id: blendId },
          select: {
            id: true,
            ingredients: {
              include: {
                ingredient: {
                  select: { id: true, category: true, price: true },
                },
              },
            },
          },
        });
        if (!targetBlend) {
          return res.status(400).json({ error: 'blendId is invalid' });
        }
        try {
          assertBlendPricingIngredients(toBlendPricingIngredientsFromBlendEntries(targetBlend.ingredients));
        } catch (pricingError) {
          const pricingPayload = toBlendPricingErrorPayload(pricingError);
          if (pricingPayload) {
            return res.status(400).json(pricingPayload);
          }
          throw pricingError;
        }
        nextBlendId = blendId;
      }

      if (blend) {
        const ingredientIds = normalizeIngredientIds(blend.ingredientIds);
        if (blend.ingredientIds !== undefined) {
          if (ingredientIds.length === 0) {
            return res.status(400).json({ error: 'blend.ingredientIds must contain at least one ingredientId' });
          }
          const ingredients = await prisma.ingredient.findMany({
            where: { id: { in: ingredientIds } },
            select: { id: true, category: true, price: true },
          });
          if (ingredients.length !== ingredientIds.length) {
            return res.status(400).json({ error: 'One or more blend.ingredientIds are invalid' });
          }
          const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
          const orderedIngredients = ingredientIds.map((ingredientId) => ingredientById.get(ingredientId)).filter(Boolean);
          try {
            assertBlendPricingIngredients(orderedIngredients);
          } catch (pricingError) {
            const pricingPayload = toBlendPricingErrorPayload(pricingError);
            if (pricingPayload) {
              return res.status(400).json(pricingPayload);
            }
            throw pricingError;
          }
        }

        const blendData = {};
        if (typeof blend.name === 'string') {
          blendData.name = blend.name.trim() || existing.blend.name;
        }
        if (blend.description !== undefined) {
          blendData.description =
            typeof blend.description === 'string' && blend.description.trim().length > 0
              ? blend.description.trim()
              : null;
        }
        if (typeof blend.color === 'string') {
          blendData.color = blend.color.trim() || existing.blend.color;
        }
        if (blend.coverImageUrl !== undefined) {
          blendData.coverImageUrl =
            typeof blend.coverImageUrl === 'string' && blend.coverImageUrl.trim().length > 0
              ? blend.coverImageUrl.trim()
              : null;
        }
        if (Object.keys(blendData).length > 0) {
          await prisma.blend.update({
            where: { id: nextBlendId },
            data: blendData,
          });
        }
        if (blend.ingredientIds !== undefined) {
          await prisma.$transaction([
            prisma.blendIngredient.deleteMany({ where: { blendId: nextBlendId } }),
            prisma.blendIngredient.createMany({
              data: ingredientIds.map((ingredientId) => ({
                blendId: nextBlendId,
                ingredientId,
                quantity: 1,
              })),
            }),
          ]);
        }
      }

      let nextSlug = existing.slug;
      if (slug || title) {
        const base = slug || title || existing.title;
        const normalized = slugify(base);
        if (normalized && normalized !== existing.slug) {
          nextSlug = await ensureUniqueBlendListingSlug(base);
        }
      }

      const listing = await prisma.blendListing.update({
        where: { id: req.params.id },
        data: {
          ...(nextBlendId !== existing.blendId ? { blendId: nextBlendId } : {}),
          ...(createdFromOrderId !== undefined ? { createdFromOrderId: resolvedCreatedFromOrderId } : {}),
          ...(createdBy !== undefined ? { createdBy: resolvedCreatedBy } : {}),
          ...(title !== undefined ? { title } : {}),
          ...(slug !== undefined || title !== undefined ? { slug: nextSlug } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(coverImageUrl !== undefined ? { coverImageUrl } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
          ...(resolvedRanking !== undefined ? { ranking: resolvedRanking } : {}),
        },
      });
      res.json(listing);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update blend listing' });
    }
  });

  app.delete('/api/admin/blend-listings/:id', async (req, res) => {
    try {
      const existing = await prisma.blendListing.findUnique({
        where: { id: req.params.id },
        select: { id: true },
      });
      if (!existing) {
        return res.status(404).json({ error: 'Blend listing not found' });
      }
      await prisma.blendListing.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete blend listing' });
    }
  });
}
