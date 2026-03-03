import { Router, Request, Response } from 'express';
import { authMiddleware, customerMiddleware } from '../middleware/auth';
import prisma from '../utils/prisma';
import { createShippingOrder } from '../lib/boxtal';

const router = Router();

const mapBoxtalStatus = (status?: string | null) => {
  if (!status) return 'UNKNOWN';
  const normalized = status.toUpperCase();
  if (['CREATED', 'CONFIRMED', 'REGISTERED'].includes(normalized)) return 'CREATED';
  if (['DOCUMENT_CREATED', 'LABEL_CREATED', 'READY'].includes(normalized)) return 'LABEL_CREATED';
  if (['IN_TRANSIT', 'PICKED_UP', 'SHIPPED', 'IN_DELIVERY'].includes(normalized)) return 'IN_TRANSIT';
  if (['DELIVERED', 'DELIVERED_TO_PARCEL_POINT'].includes(normalized)) return 'DELIVERED';
  if (['CANCELLED', 'CANCELED', 'REFUSED', 'RETURNED'].includes(normalized)) return 'CANCELLED';
  return 'UNKNOWN';
};

// Get all orders (admin) or user's orders (customer)
router.get('/orders', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.user?.role === 'ADMIN') {
      const orders = await prisma.order.findMany({
        include: { items: true, customer: true },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(orders);
    }

    // Customer: get their orders
    const orders = await prisma.order.findMany({
      where: { userId: req.user?.userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Create order
router.post('/orders', authMiddleware, customerMiddleware, async (req: Request, res: Response) => {
  try {
    const { items, shippingAddress, comment, shippingSelection } = req.body as {
      items: Array<{ ingredientId: string; quantity: number }>;
      shippingAddress?: string;
      comment?: string;
      shippingSelection?: {
        mode?: 'HOME' | 'RELAY';
        offerCode?: string;
        offerLabel?: string;
        relayPoint?: {
          id: string;
          network?: string;
          name?: string;
          address1?: string;
          address2?: string;
          postalCode?: string;
          city?: string;
          countryCode?: string;
        };
      } | null;
    };

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Order must have items' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { customer: true },
    });

    if (!user?.customer) {
      return res.status(400).json({ error: 'Customer profile not found' });
    }

    // Calculate order total
    let subtotal = 0;
    const orderItems = [] as Array<{
      quantity: number;
      price: number;
      ingredientName: string;
      ingredientColor: string;
    }>;

    for (const item of items) {
      const ingredient = await prisma.ingredient.findUnique({
        where: { id: item.ingredientId },
      });

      if (!ingredient) {
        return res.status(400).json({ error: `Ingredient ${item.ingredientId} not found` });
      }

      const itemTotal = ingredient.price * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        quantity: item.quantity,
        price: ingredient.price,
        ingredientName: ingredient.name,
        ingredientColor: ingredient.color || '#6B7280',
      });
    }

    const tax = subtotal * 0.20; // 20% VAT
    const shippingCost = 10; // Fixed shipping (or calculate based on provider)
    const total = subtotal + tax + shippingCost;

    const order = await prisma.order.create({
      data: {
        userId: req.user!.userId,
        customerId: user.customer.id,
        orderNumber: `ORD-${Date.now()}`,
        subtotal,
        tax,
        shippingCost,
        total,
        comment,
        shippingAddress: shippingAddress || user.customer.address,
        shippingProvider: shippingSelection?.offerCode ? 'BOXTAL' : null,
        shippingMode: shippingSelection?.mode || null,
        shippingOfferCode: shippingSelection?.offerCode || null,
        shippingOfferLabel: shippingSelection?.offerLabel || null,
        relayPointId: shippingSelection?.relayPoint?.id || null,
        relayPointLabel: shippingSelection?.relayPoint?.name || null,
        relayNetwork: shippingSelection?.relayPoint?.network || null,
        shippingMeta: shippingSelection || undefined,
        items: {
          create: orderItems,
        },
      },
      include: { items: true },
    });

    if (shippingSelection?.offerCode) {
      try {
        const shipper = {
          contact: {
            name: process.env.BOXTAL_SHIPPER_NAME || 'My Own Tea',
            email: process.env.BOXTAL_SHIPPER_EMAIL || 'contact@myowntea.com',
            phone: process.env.BOXTAL_SHIPPER_PHONE || '+33000000000',
            company: process.env.BOXTAL_SHIPPER_COMPANY || 'My Own Tea',
          },
          address: {
            line1: process.env.BOXTAL_SHIPPER_ADDRESS1 || 'Adresse expéditeur',
            line2: process.env.BOXTAL_SHIPPER_ADDRESS2 || '',
            postalCode: process.env.BOXTAL_SHIPPER_POSTAL_CODE || '75001',
            city: process.env.BOXTAL_SHIPPER_CITY || 'Paris',
            countryCode: process.env.BOXTAL_SHIPPER_COUNTRY || 'FR',
          },
        };

        const recipient = {
          contact: {
            name: `${user.customer.firstName} ${user.customer.lastName}`.trim() || 'Client',
            email: user.email,
            phone: user.customer.phone || null,
          },
          address: {
            line1: user.customer.address || 'Adresse indisponible',
            line2: '',
            postalCode: user.customer.postalCode || '00000',
            city: user.customer.city || 'Ville',
            countryCode: user.customer.country || 'FR',
          },
        };

        const parcels = [
          {
            weight: {
              value: Number(process.env.BOXTAL_PARCEL_WEIGHT_KG || 0.5),
              unit: 'KG',
            },
            length: Number(process.env.BOXTAL_PARCEL_LENGTH_CM || 20),
            width: Number(process.env.BOXTAL_PARCEL_WIDTH_CM || 20),
            height: Number(process.env.BOXTAL_PARCEL_HEIGHT_CM || 10),
          },
        ];

        const shippingPayload = {
          shippingOfferCode: shippingSelection.offerCode,
          shipper,
          recipient,
          parcels,
          parcelPointId: shippingSelection.relayPoint?.id || undefined,
        };

        const response = await createShippingOrder(shippingPayload);
        const boxtalOrderId = (response as any)?.shippingOrder?.id || (response as any)?.id || null;
        const trackingNumber = (response as any)?.shippingOrder?.trackingNumber || null;
        const providerStatus = (response as any)?.shippingOrder?.status || null;

        await prisma.shipment.create({
          data: {
            orderId: order.id,
            provider: 'BOXTAL',
            providerOrderId: boxtalOrderId,
            offerCode: shippingSelection.offerCode,
            offerLabel: shippingSelection.offerLabel || null,
            status: providerStatus,
            statusInternal: mapBoxtalStatus(providerStatus),
            trackingNumber,
            relayPointId: shippingSelection.relayPoint?.id || null,
            relayNetwork: shippingSelection.relayPoint?.network || null,
            payload: shippingPayload,
            response: response as any,
          },
        });
      } catch (error) {
        console.error('Error creating Boxtal shipment:', error);
      }
    }

    res.status(201).json(order);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Get order by ID
router.get('/orders/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: true, customer: true },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check access
    if (req.user?.role !== 'ADMIN' && order.userId !== req.user?.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Update order status (admin only)
router.patch('/orders/:id/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { status } = req.body;

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { status: status as any },
      include: { items: true },
    });

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

export default router;
