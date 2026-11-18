import { Router } from 'express';
import crypto from 'crypto';
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  cartItems,
  carts,
  menuItems,
  notifications,
  orderItems,
  orders,
  orderStatusHistory,
  payments,
  pickupSlots,
} from '../../db/schema.ts';
import { requireAuth } from '../../middleware/auth.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import { wsHub } from '../../realtime/wsHub.ts';

const router = Router();

function generatePickupCode(): string {
  const digits = crypto.randomInt(1000, 9999);
  return `SC${digits}`;
}

async function hydrateOrders(orderRows: (typeof orders.$inferSelect)[]) {
  if (orderRows.length === 0) return [];
  const orderIds = orderRows.map((o) => o.id);

  const [allItems, allPayments, allSlots, allHistory] = await Promise.all([
    db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)),
    db.select().from(payments).where(inArray(payments.orderId, orderIds)),
    db.select().from(pickupSlots),
    db
      .select()
      .from(orderStatusHistory)
      .where(inArray(orderStatusHistory.orderId, orderIds))
      .orderBy(desc(orderStatusHistory.createdAt)),
  ]);

  const slotMap = new Map(allSlots.map((s) => [s.id, s]));
  const paymentMap = new Map(allPayments.map((p) => [p.orderId, p]));

  return orderRows.map((ord) => ({
    ...ord,
    pickupSlot: slotMap.get(ord.pickupSlotId) || null,
    items: allItems.filter((i) => i.orderId === ord.id),
    payment: paymentMap.get(ord.id) || null,
    statusHistory: allHistory.filter((h) => h.orderId === ord.id),
  }));
}

// POST /api/orders — transactional pre-order placement with slot validation, idempotency, and demo payment
router.post('/orders', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.authUser!;
    const {
      pickupSlotId,
      pickupDate,
      paymentMethod = 'upi_demo',
      paymentOutcome = 'success',
      specialInstructions = '',
      idempotencyKey,
    } = req.body || {};

    const slotId = Number(pickupSlotId);
    if (Number.isNaN(slotId)) {
      return res.status(400).json({ error: 'Please select a valid pickup slot.' });
    }

    const dateStr =
      typeof pickupDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pickupDate)
        ? pickupDate
        : new Date().toISOString().slice(0, 10);

    const idemKey =
      typeof idempotencyKey === 'string' && idempotencyKey.trim()
        ? idempotencyKey.trim()
        : `ord-${authUser.id}-${crypto.randomUUID()}`;

    // 1. Check duplicate submission via idempotency key
    const existingByIdem = await db
      .select()
      .from(orders)
      .where(eq(orders.idempotencyKey, idemKey))
      .limit(1);

    if (existingByIdem[0]) {
      const [hydrated] = await hydrateOrders([existingByIdem[0]]);
      return res.status(200).json({ order: hydrated, deduplicated: true });
    }

    // 2. Simulate failed demo payment cleanly BEFORE creating paid order (FR-4.6)
    if (paymentOutcome === 'failed') {
      return res.status(402).json({
        error: 'Payment declined (Demo Payment Mode). No order was created and your cart has been preserved.',
        paymentStatus: 'failed',
      });
    }

    // 3. Validate user's cart items & availability
    const [userCart] = await db
      .select()
      .from(carts)
      .where(eq(carts.userId, authUser.id))
      .limit(1);

    if (!userCart) {
      return res.status(400).json({ error: 'Your cart is empty.' });
    }

    const cartRows = await db
      .select({
        cartItemId: cartItems.id,
        menuItemId: menuItems.id,
        name: menuItems.name,
        price: menuItems.price,
        isAvailable: menuItems.isAvailable,
        quantity: cartItems.quantity,
      })
      .from(cartItems)
      .innerJoin(menuItems, eq(cartItems.menuItemId, menuItems.id))
      .where(eq(cartItems.cartId, userCart.id));

    if (cartRows.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty. Add food items before checking out.' });
    }

    const unavailable = cartRows.filter((item) => !item.isAvailable);
    if (unavailable.length > 0) {
      return res.status(409).json({
        error: `These items just sold out: ${unavailable.map((u) => u.name).join(', ')}. Please remove them from your cart.`,
      });
    }

    // 4. Transactional slot capacity check + order creation
    const createdOrder = await db.transaction(async (tx) => {
      const [slot] = await tx
        .select()
        .from(pickupSlots)
        .where(and(eq(pickupSlots.id, slotId), eq(pickupSlots.isActive, true)))
        .limit(1);

      if (!slot) {
        throw new Error('INVALID_SLOT');
      }

      const [bookedRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(
          and(
            eq(orders.pickupSlotId, slotId),
            eq(orders.pickupDate, dateStr),
            notInArray(orders.status, ['cancelled', 'rejected'])
          )
        );

      if ((bookedRow?.count ?? 0) >= slot.maxCapacity) {
        throw new Error('SLOT_FULL');
      }

      const subtotal = cartRows.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const dateCompact = dateStr.replace(/-/g, '');
      const orderNumber = `SC-${dateCompact}-${crypto.randomInt(1000, 9999)}`;

      let pickupCode = generatePickupCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const dup = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.pickupCode, pickupCode))
          .limit(1);
        if (dup.length === 0) break;
        pickupCode = generatePickupCode();
      }

      const qrPayload = JSON.stringify({
        orderNumber,
        pickupCode,
        userId: authUser.id,
        v: 1,
      });

      const [insertedOrder] = await tx
        .insert(orders)
        .values({
          orderNumber,
          userId: authUser.id,
          pickupSlotId: slot.id,
          pickupDate: dateStr,
          status: 'order_received',
          subtotal,
          taxAmount: 0,
          totalAmount: subtotal,
          pickupCode,
          qrPayload,
          specialInstructions:
            typeof specialInstructions === 'string' ? specialInstructions.trim().slice(0, 300) : '',
          idempotencyKey: idemKey,
          isDemo: false,
        })
        .returning();

      await tx.insert(orderItems).values(
        cartRows.map((item) => ({
          orderId: insertedOrder.id,
          menuItemId: item.menuItemId,
          itemName: item.name,
          unitPrice: item.price,
          quantity: item.quantity,
          lineTotal: item.price * item.quantity,
        }))
      );

      await tx.insert(payments).values({
        orderId: insertedOrder.id,
        userId: authUser.id,
        method: String(paymentMethod),
        status: 'success',
        amount: subtotal,
        transactionRef: `TXN-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
        isDemoMode: true,
      });

      await tx.insert(orderStatusHistory).values({
        orderId: insertedOrder.id,
        status: 'order_received',
        changedByUserId: authUser.id,
        note: 'Pre-order placed and payment confirmed (Demo Payment Mode)',
      });

      await tx.insert(notifications).values({
        userId: authUser.id,
        orderId: insertedOrder.id,
        title: `Order ${orderNumber} Confirmed`,
        message: `Pickup code ${pickupCode} for ${slot.label}. Show this QR at the canteen counter.`,
        type: 'order_placed',
      });

      // Clear cart
      await tx.delete(cartItems).where(eq(cartItems.cartId, userCart.id));

      return insertedOrder;
    });

    // Increment popularity scores asynchronously
    for (const item of cartRows) {
      await db
        .update(menuItems)
        .set({ popularityScore: sql`${menuItems.popularityScore} + ${item.quantity}` })
        .where(eq(menuItems.id, item.menuItemId));
    }

    const [hydrated] = await hydrateOrders([createdOrder]);

    // Real-time broadcast to Canteen Staff & Admin
    wsHub.emitToRoles(['staff', 'admin'], 'order:created', {
      order: hydrated,
      customerName: authUser.fullName,
    });
    wsHub.emitToUser(authUser.id, 'notification:new', {
      title: `Order ${createdOrder.orderNumber} Confirmed`,
      orderId: createdOrder.id,
    });

    return res.status(201).json({ order: hydrated });
  } catch (error: any) {
    if (error?.message === 'INVALID_SLOT') {
      return res.status(400).json({ error: 'Selected pickup slot is invalid or inactive.' });
    }
    if (error?.message === 'SLOT_FULL') {
      return res.status(409).json({
        error: 'This pickup slot has just reached full capacity. Please choose another time slot.',
      });
    }
    console.error('POST /api/orders error:', error);
    return res.status(500).json({ error: 'Failed to place pre-order. Please try again.' });
  }
});

// GET /api/orders/my — student/staff sees ONLY their own orders
router.get('/orders/my', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, req.authUser!.id))
      .orderBy(desc(orders.createdAt));

    const hydrated = await hydrateOrders(rows);
    return res.json({ orders: hydrated });
  } catch (error) {
    console.error('GET /api/orders/my error:', error);
    return res.status(500).json({ error: 'Failed to load your orders.' });
  }
});

// POST /api/orders/:id/cancel — allowed before preparation begins
router.post('/orders/:id/cancel', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID.' });
    }

    const [existing] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, req.authUser!.id)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (!['order_received', 'accepted'].includes(existing.status)) {
      return res.status(400).json({
        error: `Cannot cancel an order once it is "${existing.status.replace(/_/g, ' ')}".`,
      });
    }

    const [updated] = await db
      .update(orders)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();

    await db
      .update(payments)
      .set({ status: 'refunded' })
      .where(eq(payments.orderId, orderId));

    await db.insert(orderStatusHistory).values({
      orderId,
      status: 'cancelled',
      changedByUserId: req.authUser!.id,
      note: 'Cancelled by customer prior to kitchen preparation',
    });

    await db.insert(notifications).values({
      userId: req.authUser!.id,
      orderId,
      title: `Order ${existing.orderNumber} Cancelled`,
      message: 'Your order was cancelled and demo payment has been marked refunded.',
      type: 'order_cancelled',
    });

    const [hydrated] = await hydrateOrders([updated]);
    wsHub.emitToRoles(['staff', 'admin'], 'order:updated', { order: hydrated });
    wsHub.emitToUser(req.authUser!.id, 'order:updated', { order: hydrated });

    return res.json({ order: hydrated });
  } catch (error) {
    console.error('Cancel order error:', error);
    return res.status(500).json({ error: 'Failed to cancel order.' });
  }
});

// GET /api/notifications
router.get('/notifications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, req.authUser!.id))
      .orderBy(desc(notifications.createdAt))
      .limit(30);
    return res.json({ notifications: rows });
  } catch (error) {
    console.error('GET /api/notifications error:', error);
    return res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

router.post('/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, req.authUser!.id));
    return res.json({ success: true });
  } catch (error) {
    console.error('Read all notifications error:', error);
    return res.status(500).json({ error: 'Failed to mark notifications read.' });
  }
});

export default router;
