// @ts-nocheck
export function registerAdminCustomerRoutes(app, deps) {
  const {
    buildWishlistAccessorySkuMap,
    buildWishlistPricingIngredientMap,
    deleteWishlistRow,
    listWishlistRows,
    prisma,
    serializeWishlistCreation,
  } = deps;

  app.get('/api/admin/customers', async (_req, res) => {
    try {
      const customers = await prisma.customer.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          authProvider: true,
          salutation: true,
          firstName: true,
          lastName: true,
          birthDate: true,
          phoneE164: true,
          createdAt: true,
          carts: { select: { id: true, status: true } },
          orders: { select: { id: true, status: true } },
          addresses: {
            select: {
              id: true,
              address1: true,
              address2: true,
              postalCode: true,
              city: true,
              countryCode: true,
              phoneE164: true,
              isDefaultBilling: true,
              isDefaultShipping: true,
            },
          },
        },
      });
      res.json(customers);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch customers' });
    }
  });

  app.get('/api/admin/customers/:id', async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          email: true,
          authProvider: true,
          salutation: true,
          firstName: true,
          lastName: true,
          birthDate: true,
          phoneE164: true,
          createdAt: true,
          carts: { select: { id: true, status: true } },
          orders: { select: { id: true, status: true } },
          addresses: {
            select: {
              id: true,
              address1: true,
              address2: true,
              postalCode: true,
              city: true,
              countryCode: true,
              phoneE164: true,
              isDefaultBilling: true,
              isDefaultShipping: true,
            },
          },
        },
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const wishlistsCount = (await listWishlistRows(customer.id)).length;
      res.json({ ...customer, wishlistsCount });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch customer' });
    }
  });

  app.get('/api/admin/customers/:id/wishlists', async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const wishlistEntries = await listWishlistRows(customer.id);
      const wishlistIngredientById = await buildWishlistPricingIngredientMap(wishlistEntries);
      const wishlistAccessorySkuByIdentity = await buildWishlistAccessorySkuMap(wishlistEntries);
      const wishlists = wishlistEntries.map((entry) =>
        serializeWishlistCreation(entry, wishlistIngredientById, wishlistAccessorySkuByIdentity)
      );

      res.json({ customer, wishlists });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch customer wishlists' });
    }
  });

  app.delete('/api/admin/customers/:id', async (req, res) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.id },
        select: { id: true },
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const wishlists = await listWishlistRows(customer.id);
      for (const wishlist of wishlists) {
        await deleteWishlistRow(customer.id, wishlist.id);
      }

      await prisma.$transaction(async (tx) => {
        await tx.order.deleteMany({ where: { customerId: customer.id } });
        await tx.cart.deleteMany({ where: { customerId: customer.id } });
        await tx.subscription.deleteMany({ where: { customerId: customer.id } });
        await tx.address.deleteMany({ where: { customerId: customer.id } });
        await tx.session.deleteMany({ where: { customerId: customer.id } });
        await tx.passwordResetToken.deleteMany({ where: { customerId: customer.id } });
        await tx.emailPreference.deleteMany({ where: { customerId: customer.id } });
        await tx.emailCampaignLog.deleteMany({ where: { customerId: customer.id } });
        await tx.emailDelivery.deleteMany({ where: { customerId: customer.id } });
        await tx.customer.delete({ where: { id: customer.id } });
      });

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting customer:', error);
      res.status(500).json({ error: 'Failed to delete customer' });
    }
  });

  app.get('/api/admin/carts', async (_req, res) => {
    try {
      const carts = await prisma.cart.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          customer: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              authProvider: true,
            },
          },
          items: {
            select: {
              id: true,
              itemType: true,
              qty: true,
              unitPriceCents: true,
              snapshot: true,
              subscriptionPlanId: true,
            },
          },
        },
      });
      res.json(carts);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch carts' });
    }
  });
}
