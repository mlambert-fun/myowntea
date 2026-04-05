// @ts-nocheck
export function registerCustomerWishlistRoutes(app, deps) {
  const {
    DEFAULT_BLEND_FORMAT,
    buildWishlistAccessorySkuMap,
    buildWishlistCreationSnapshot,
    buildWishlistPricingIngredientMap,
    buildWishlistVariantSnapshot,
    createWishlistRow,
    deleteWishlistRow,
    listWishlistRows,
    normalizeBlendFormat,
    requireAccountCustomer,
    serializeWishlistCreation,
    toBlendPricingErrorResponse,
  } = deps;

  app.get('/api/wishlist', requireAccountCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const entries = await listWishlistRows(customer.id);
      const ingredientById = await buildWishlistPricingIngredientMap(entries);
      const accessorySkuByIdentity = await buildWishlistAccessorySkuMap(entries);
      res.json(entries.map((entry) => serializeWishlistCreation(entry, ingredientById, accessorySkuByIdentity)));
    } catch (error) {
      console.error('Error fetching wishlist:', error);
      res.status(500).json({ error: 'Failed to fetch wishlist' });
    }
  });

  app.post('/api/wishlist', requireAccountCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const payload = req.body;
      const ingredientIds = Array.isArray(payload.ingredientIds) ? payload.ingredientIds : [];
      let snapshot;

      try {
        if (ingredientIds.length > 0) {
          snapshot = await buildWishlistCreationSnapshot({
            name: payload.name,
            ingredientIds,
            blendFormat: normalizeBlendFormat(payload.blendFormat || DEFAULT_BLEND_FORMAT),
          });
        } else {
          snapshot = await buildWishlistVariantSnapshot({
            name: payload.name,
            productId: payload.productId,
            variantId: payload.variantId,
          });
        }
      } catch (snapshotError) {
        const message = snapshotError instanceof Error ? snapshotError.message : 'Invalid wishlist payload';
        if (message === 'ingredientIds are required') {
          return res.status(400).json({ error: message });
        }
        if (message === 'variantId or productId is required') {
          return res.status(400).json({ error: message });
        }
        if (message === 'One or more ingredients not found') {
          return res.status(404).json({ error: message });
        }
        if (message === 'Variant not found' || message === 'Product not found') {
          return res.status(404).json({ error: message });
        }
        const pricingError = toBlendPricingErrorResponse(snapshotError);
        if (pricingError) {
          return res.status(400).json({ error: pricingError.message, code: pricingError.code });
        }
        return res.status(400).json({ error: 'Invalid wishlist payload' });
      }

      const created = await createWishlistRow(customer.id, snapshot);
      const ingredientById = await buildWishlistPricingIngredientMap([created]);
      const accessorySkuByIdentity = await buildWishlistAccessorySkuMap([created]);
      res.status(201).json(serializeWishlistCreation(created, ingredientById, accessorySkuByIdentity));
    } catch (error) {
      console.error('Error adding wishlist item:', error);
      res.status(500).json({ error: 'Failed to add wishlist item' });
    }
  });

  app.delete('/api/wishlist/:id', requireAccountCustomer, async (req, res) => {
    try {
      const customer = req.customer;
      const deleted = await deleteWishlistRow(customer.id, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Wishlist item not found' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing wishlist item:', error);
      res.status(500).json({ error: 'Failed to remove wishlist item' });
    }
  });
}
