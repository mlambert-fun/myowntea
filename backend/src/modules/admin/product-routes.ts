// @ts-nocheck
export function registerAdminProductRoutes(app, deps) {
  const {
    deleteUnusedMediaFiles,
    mapAdminProductForApi,
    mapProductVariant,
    normalizeProductTags,
    normalizeVariantImages,
    parseProductRanking,
    prisma,
  } = deps;

  app.get('/api/admin/products', async (_req, res) => {
    try {
      const products = await prisma.product.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          options: {
            orderBy: { position: 'asc' },
            include: { values: { orderBy: { position: 'asc' } } },
          },
          variants: {
            orderBy: { createdAt: 'asc' },
            include: {
              optionValues: {
                include: {
                  optionValue: { include: { option: true } },
                },
              },
            },
          },
        },
      });
      res.json(products.map(mapAdminProductForApi));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  });

  app.get('/api/admin/products/:id', async (req, res) => {
    try {
      const product = await prisma.product.findUnique({
        where: { id: req.params.id },
        include: {
          options: {
            orderBy: { position: 'asc' },
            include: { values: { orderBy: { position: 'asc' } } },
          },
          variants: {
            orderBy: { createdAt: 'asc' },
            include: {
              optionValues: {
                include: {
                  optionValue: { include: { option: true } },
                },
              },
            },
          },
        },
      });
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      res.json(mapAdminProductForApi(product));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch product' });
    }
  });

  app.post('/api/admin/products', async (req, res) => {
    try {
      const { title, slug, sku, type, description, additionalDetails, tags, isActive, images, priceCents, stockQty, ranking } = req.body;
      if (!title || !slug) {
        return res.status(400).json({ error: 'title and slug are required' });
      }

      const resolvedRanking = parseProductRanking(ranking, 0);
      if (resolvedRanking === null) {
        return res.status(400).json({ error: 'ranking must be a non-negative integer' });
      }

      const product = await prisma.product.create({
        data: {
          title,
          slug,
          sku: sku || null,
          type: type || 'ACCESSORY',
          description: description || null,
          additionalDetails: additionalDetails || null,
          tags: normalizeProductTags(tags),
          ranking: resolvedRanking,
          isActive: typeof isActive === 'boolean' ? isActive : true,
          images: Array.isArray(images) ? images : [],
          priceCents: typeof priceCents === 'number' ? priceCents : 0,
          stockQty: typeof stockQty === 'number' ? stockQty : null,
        },
      });
      res.status(201).json(product);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create product' });
    }
  });

  app.patch('/api/admin/products/:id', async (req, res) => {
    try {
      const { title, slug, sku, type, description, additionalDetails, tags, isActive, images, priceCents, stockQty, ranking } = req.body;
      const existingProduct = await prisma.product.findUnique({
        where: { id: req.params.id },
        select: {
          ranking: true,
          images: true,
          variants: { select: { imageUrl: true, images: true } },
        },
      });

      if (!existingProduct) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const resolvedRanking = parseProductRanking(ranking, existingProduct.ranking);
      if (resolvedRanking === null) {
        return res.status(400).json({ error: 'ranking must be a non-negative integer' });
      }

      const product = await prisma.product.update({
        where: { id: req.params.id },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(slug !== undefined ? { slug } : {}),
          ...(sku !== undefined ? { sku: sku || null } : {}),
          ...(type !== undefined ? { type } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(additionalDetails !== undefined ? { additionalDetails } : {}),
          ...(tags !== undefined ? { tags: normalizeProductTags(tags) } : {}),
          ...(resolvedRanking !== undefined ? { ranking: resolvedRanking } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
          ...(images !== undefined ? { images: Array.isArray(images) ? images : [] } : {}),
          ...(priceCents !== undefined ? { priceCents: typeof priceCents === 'number' ? priceCents : 0 } : {}),
          ...(stockQty !== undefined ? { stockQty: typeof stockQty === 'number' ? stockQty : null } : {}),
        },
      });

      if (images !== undefined) {
        const keptImages = new Set(Array.isArray(images) ? images : []);
        const removedImages = (existingProduct.images || []).filter((image) => !keptImages.has(image));
        await deleteUnusedMediaFiles(removedImages);
      }

      res.json(product);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update product' });
    }
  });

  app.delete('/api/admin/products/:id', async (req, res) => {
    try {
      const existingProduct = await prisma.product.findUnique({
        where: { id: req.params.id },
        select: {
          images: true,
          variants: { select: { imageUrl: true, images: true } },
        },
      });

      if (!existingProduct) {
        return res.status(404).json({ error: 'Product not found' });
      }

      await prisma.product.delete({ where: { id: req.params.id } });
      await deleteUnusedMediaFiles([
        ...(existingProduct.images || []),
        ...existingProduct.variants.flatMap((variant) => normalizeVariantImages(variant)),
      ]);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete product' });
    }
  });

  app.get('/api/admin/products/:id/options', async (req, res) => {
    try {
      const options = await prisma.productOption.findMany({
        where: { productId: req.params.id },
        orderBy: { position: 'asc' },
        include: { values: { orderBy: { position: 'asc' } } },
      });
      res.json(options);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch options' });
    }
  });

  app.post('/api/admin/products/:id/options', async (req, res) => {
    try {
      const { name, position } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      const option = await prisma.productOption.create({
        data: {
          productId: req.params.id,
          name,
          position: typeof position === 'number' ? position : 0,
        },
      });
      res.status(201).json(option);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create option' });
    }
  });

  app.patch('/api/admin/options/:id', async (req, res) => {
    try {
      const { name, position } = req.body;
      const option = await prisma.productOption.update({
        where: { id: req.params.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(position !== undefined ? { position } : {}),
        },
      });
      res.json(option);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update option' });
    }
  });

  app.delete('/api/admin/options/:id', async (req, res) => {
    try {
      await prisma.productOption.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete option' });
    }
  });

  app.post('/api/admin/options/:id/values', async (req, res) => {
    try {
      const { value, position } = req.body;
      if (!value) {
        return res.status(400).json({ error: 'value is required' });
      }

      const optionValue = await prisma.productOptionValue.create({
        data: {
          optionId: req.params.id,
          value,
          position: typeof position === 'number' ? position : 0,
        },
      });
      res.status(201).json(optionValue);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create option value' });
    }
  });

  app.patch('/api/admin/option-values/:id', async (req, res) => {
    try {
      const { value, position } = req.body;
      const optionValue = await prisma.productOptionValue.update({
        where: { id: req.params.id },
        data: {
          ...(value !== undefined ? { value } : {}),
          ...(position !== undefined ? { position } : {}),
        },
      });
      res.json(optionValue);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update option value' });
    }
  });

  app.delete('/api/admin/option-values/:id', async (req, res) => {
    try {
      await prisma.productOptionValue.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete option value' });
    }
  });

  app.get('/api/admin/products/:id/variants', async (req, res) => {
    try {
      const variants = await prisma.productVariant.findMany({
        where: { productId: req.params.id },
        orderBy: { createdAt: 'asc' },
        include: {
          optionValues: {
            include: {
              optionValue: { include: { option: true } },
            },
          },
        },
      });
      res.json(variants.map(mapProductVariant));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch variants' });
    }
  });

  app.post('/api/admin/products/:id/variants', async (req, res) => {
    try {
      const { sku, priceCents, stockQty, imageUrl, images, isActive, optionValueIds } = req.body;
      if (priceCents === undefined || priceCents === null) {
        return res.status(400).json({ error: 'priceCents is required' });
      }

      const normalizedImages = Array.isArray(images)
        ? images.filter((image) => typeof image === 'string' && image.trim().length > 0)
        : (typeof imageUrl === 'string' && imageUrl.trim().length > 0 ? [imageUrl] : []);

      const variant = await prisma.productVariant.create({
        data: {
          productId: req.params.id,
          sku: sku || null,
          priceCents,
          stockQty: typeof stockQty === 'number' ? stockQty : null,
          imageUrl: normalizedImages[0] || null,
          images: normalizedImages,
          isActive: typeof isActive === 'boolean' ? isActive : true,
        },
      });

      if (Array.isArray(optionValueIds) && optionValueIds.length > 0) {
        await prisma.variantOptionValue.createMany({
          data: optionValueIds.map((optionValueId) => ({
            variantId: variant.id,
            optionValueId,
          })),
          skipDuplicates: true,
        });
      }

      const updated = await prisma.productVariant.findUnique({
        where: { id: variant.id },
        include: { optionValues: { include: { optionValue: { include: { option: true } } } } },
      });
      res.status(201).json(mapProductVariant(updated));
    } catch (error) {
      res.status(500).json({ error: 'Failed to create variant' });
    }
  });

  app.patch('/api/admin/variants/:id', async (req, res) => {
    try {
      const { sku, priceCents, stockQty, imageUrl, images, isActive, optionValueIds } = req.body;
      const existingVariant = await prisma.productVariant.findUnique({
        where: { id: req.params.id },
        select: { imageUrl: true, images: true },
      });

      if (!existingVariant) {
        return res.status(404).json({ error: 'Variant not found' });
      }

      const normalizedImages = Array.isArray(images)
        ? images.filter((image) => typeof image === 'string' && image.trim().length > 0)
        : undefined;

      const variant = await prisma.productVariant.update({
        where: { id: req.params.id },
        data: {
          ...(sku !== undefined ? { sku } : {}),
          ...(priceCents !== undefined ? { priceCents } : {}),
          ...(stockQty !== undefined ? { stockQty } : {}),
          ...(normalizedImages !== undefined
            ? { images: normalizedImages, imageUrl: normalizedImages[0] || null }
            : (imageUrl !== undefined ? { imageUrl } : {})),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      });

      if (normalizedImages !== undefined) {
        const keptImages = new Set(normalizedImages);
        const removedImages = normalizeVariantImages(existingVariant).filter((image) => !keptImages.has(image));
        await deleteUnusedMediaFiles(removedImages);
      } else if (imageUrl !== undefined) {
        const previousImages = normalizeVariantImages(existingVariant);
        const removedImages = previousImages.filter((image) => image !== imageUrl);
        await deleteUnusedMediaFiles(removedImages);
      }

      if (Array.isArray(optionValueIds)) {
        await prisma.variantOptionValue.deleteMany({ where: { variantId: variant.id } });
        if (optionValueIds.length > 0) {
          await prisma.variantOptionValue.createMany({
            data: optionValueIds.map((optionValueId) => ({
              variantId: variant.id,
              optionValueId,
            })),
            skipDuplicates: true,
          });
        }
      }

      const updated = await prisma.productVariant.findUnique({
        where: { id: variant.id },
        include: { optionValues: { include: { optionValue: { include: { option: true } } } } },
      });
      res.json(mapProductVariant(updated));
    } catch (error) {
      res.status(500).json({ error: 'Failed to update variant' });
    }
  });

  app.delete('/api/admin/variants/:id', async (req, res) => {
    try {
      const existingVariant = await prisma.productVariant.findUnique({
        where: { id: req.params.id },
        select: { imageUrl: true, images: true },
      });

      if (!existingVariant) {
        return res.status(404).json({ error: 'Variant not found' });
      }

      await prisma.productVariant.delete({ where: { id: req.params.id } });
      await deleteUnusedMediaFiles(normalizeVariantImages(existingVariant));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete variant' });
    }
  });
}
