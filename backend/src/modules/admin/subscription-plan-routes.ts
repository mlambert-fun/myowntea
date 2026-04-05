// @ts-nocheck
export function registerSubscriptionPlanRoutes(app, deps) {
  const { prisma } = deps;

  app.get('/api/admin/subscription-plans', async (_req, res) => {
    try {
      const plans = await prisma.subscriptionPlan.findMany({
        include: { product: true },
        orderBy: { createdAt: 'desc' },
      });
      res.json(plans);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch subscription plans' });
    }
  });

  app.post('/api/admin/subscription-plans', async (req, res) => {
    try {
      const { productId, interval, intervalCount, stripePriceId, isActive } = req.body;
      if (!productId || !stripePriceId) {
        return res.status(400).json({ error: 'productId and stripePriceId are required' });
      }

      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product || product.type !== 'SUBSCRIPTION') {
        return res.status(404).json({ error: 'Subscription product not found' });
      }

      const plan = await prisma.subscriptionPlan.create({
        data: {
          productId,
          interval: interval || 'month',
          intervalCount: intervalCount || 1,
          stripePriceId,
          isActive: typeof isActive === 'boolean' ? isActive : true,
        },
      });
      res.status(201).json(plan);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create subscription plan' });
    }
  });

  app.patch('/api/admin/subscription-plans/:id', async (req, res) => {
    try {
      const { interval, intervalCount, stripePriceId, isActive } = req.body;
      const plan = await prisma.subscriptionPlan.update({
        where: { id: req.params.id },
        data: {
          ...(interval !== undefined ? { interval } : {}),
          ...(intervalCount !== undefined ? { intervalCount } : {}),
          ...(stripePriceId !== undefined ? { stripePriceId } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      });
      res.json(plan);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update subscription plan' });
    }
  });

  app.delete('/api/admin/subscription-plans/:id', async (req, res) => {
    try {
      await prisma.subscriptionPlan.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete subscription plan' });
    }
  });

  app.get('/api/subscription-plans', async (_req, res) => {
    try {
      const plans = await prisma.subscriptionPlan.findMany({
        where: { isActive: true, product: { isActive: true } },
        include: { product: true },
        orderBy: { createdAt: 'desc' },
      });
      res.json(plans);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch subscription plans' });
    }
  });
}
