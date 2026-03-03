import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import prisma from '../utils/prisma';

const router = Router();

// Admin: Get all payment providers
router.get('/payment-providers', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const providers = await prisma.paymentProvider.findMany();
    res.json(providers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payment providers' });
  }
});

// Admin: Create payment provider
router.post('/payment-providers', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, config } = req.body;

    const provider = await prisma.paymentProvider.create({
      data: { name, config },
    });

    res.status(201).json(provider);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create payment provider' });
  }
});

// Admin: Update payment provider
router.put('/payment-providers/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, config, isActive } = req.body;

    const provider = await prisma.paymentProvider.update({
      where: { id: req.params.id },
      data: { name, config, isActive },
    });

    res.json(provider);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update payment provider' });
  }
});

// Admin: Get all shipping providers
router.get('/shipping-providers', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const providers = await prisma.shippingProvider.findMany();
    res.json(providers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shipping providers' });
  }
});

// Admin: Create shipping provider
router.post('/shipping-providers', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, config } = req.body;

    const provider = await prisma.shippingProvider.create({
      data: { name, config },
    });

    res.status(201).json(provider);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create shipping provider' });
  }
});

// Admin: Update shipping provider
router.put('/shipping-providers/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, config, isActive } = req.body;

    const provider = await prisma.shippingProvider.update({
      where: { id: req.params.id },
      data: { name, config, isActive },
    });

    res.json(provider);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update shipping provider' });
  }
});

export default router;
