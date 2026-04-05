// @ts-nocheck
export function registerAdminPackRoutes(app, deps) {
  const { prisma } = deps;

  app.get('/api/admin/packs', async (_req, res) => {
    try {
      const packs = await prisma.product.findMany({
        where: { type: 'PACK' },
        include: {
          variants: true,
          packItems: { include: { componentVariant: { include: { product: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });
      res.json(packs);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch packs' });
    }
  });

  app.get('/api/admin/packs/:id/items', async (req, res) => {
    try {
      const items = await prisma.packItem.findMany({
        where: { packProductId: req.params.id },
        include: { componentVariant: { include: { product: true } } },
        orderBy: { id: 'asc' },
      });
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch pack items' });
    }
  });

  app.post('/api/admin/packs/:id/items', async (req, res) => {
    try {
      const { componentVariantId, qty } = req.body;
      if (!componentVariantId) {
        return res.status(400).json({ error: 'componentVariantId is required' });
      }

      const packProduct = await prisma.product.findUnique({ where: { id: req.params.id } });
      if (!packProduct || packProduct.type !== 'PACK') {
        return res.status(404).json({ error: 'Pack product not found' });
      }

      const componentVariant = await prisma.productVariant.findUnique({ where: { id: componentVariantId } });
      if (!componentVariant) {
        return res.status(404).json({ error: 'Component variant not found' });
      }

      const created = await prisma.packItem.upsert({
        where: { packProductId_componentVariantId: { packProductId: req.params.id, componentVariantId } },
        update: { qty: Math.max(1, qty || 1) },
        create: { packProductId: req.params.id, componentVariantId, qty: Math.max(1, qty || 1) },
      });
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create pack item' });
    }
  });

  app.patch('/api/admin/pack-items/:id', async (req, res) => {
    try {
      const { qty } = req.body;
      const updated = await prisma.packItem.update({
        where: { id: req.params.id },
        data: { qty: Math.max(1, qty || 1) },
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update pack item' });
    }
  });

  app.delete('/api/admin/pack-items/:id', async (req, res) => {
    try {
      await prisma.packItem.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete pack item' });
    }
  });
}
