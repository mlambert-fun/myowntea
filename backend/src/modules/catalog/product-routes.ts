// @ts-nocheck
export function registerProductPublicRoutes(app, deps) {
  const {
    localizeProductsForRequest,
    mapProductForApi,
    prisma,
  } = deps;

  app.get('/api/products', async (req, res) => {
    try {
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      const products = await prisma.product.findMany({
        where: {
          isActive: true,
          ...(type ? { type } : {}),
        },
        orderBy: [{ ranking: 'asc' }, { createdAt: 'desc' }],
        include: {
          options: {
            orderBy: { position: 'asc' },
            include: { values: { orderBy: { position: 'asc' } } },
          },
          variants: {
            where: { isActive: true },
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
      const localizedProducts = await localizeProductsForRequest(req, products);
      res.json(localizedProducts.map(mapProductForApi));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  });

  app.get('/api/products/:slug', async (req, res) => {
    try {
      const product = await prisma.product.findUnique({
        where: { slug: req.params.slug },
        include: {
          options: {
            orderBy: { position: 'asc' },
            include: { values: { orderBy: { position: 'asc' } } },
          },
          variants: {
            where: { isActive: true },
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
      if (!product || !product.isActive) {
        return res.status(404).json({ error: 'Product not found' });
      }
      const [localizedProduct] = await localizeProductsForRequest(req, [product]);
      res.json(mapProductForApi(localizedProduct));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch product' });
    }
  });
}
