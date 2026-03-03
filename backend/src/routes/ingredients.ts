import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import prisma from '../utils/prisma';

const router = Router();

// Get all ingredients (public)
router.get('/ingredients', async (req: Request, res: Response) => {
  try {
    const ingredients = await prisma.ingredient.findMany({
      where: { isActive: true },
    });
    res.json(ingredients);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch ingredients' });
  }
});

// Get single ingredient (public)
router.get('/ingredients/:id', async (req: Request, res: Response) => {
  try {
    const ingredient = await prisma.ingredient.findUnique({
      where: { id: req.params.id },
    });
    if (!ingredient) {
      return res.status(404).json({ error: 'Ingredient not found' });
    }
    res.json(ingredient);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch ingredient' });
  }
});

// Create ingredient (admin only)
router.post('/ingredients', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, description, longDescription, category, image, color, intensity, benefits, flavors, price, stock } = req.body;

    const ingredient = await prisma.ingredient.create({
      data: {
        name,
        description,
        longDescription: longDescription || null,
        category,
        image,
        color,
        intensity: intensity || 3,
        benefits: benefits || [],
        flavors: flavors || [],
        price: price || 0,
        stock: stock || 100,
      },
    });

    res.status(201).json(ingredient);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create ingredient' });
  }
});

// Update ingredient (admin only)
router.put('/ingredients/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, description, longDescription, category, image, color, intensity, benefits, flavors, price, stock, isActive } = req.body;

    const ingredient = await prisma.ingredient.update({
      where: { id: req.params.id },
      data: {
        name,
        description,
        longDescription: longDescription || null,
        category,
        image,
        color,
        intensity,
        benefits,
        flavors: flavors || [],
        price,
        stock,
        isActive,
      },
    });

    res.json(ingredient);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update ingredient' });
  }
});

// Delete ingredient (admin only)
router.delete('/ingredients/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await prisma.ingredient.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Ingredient deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete ingredient' });
  }
});

export default router;
