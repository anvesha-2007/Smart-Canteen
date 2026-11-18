import { Router } from 'express';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  notifications,
  orderItems,
  orders,
  orderStatusHistory,
  payments,
  pickupSlots,
  profiles,
  users,
} from '../../db/schema.ts';
import { requireAuth, requireRole } from '../../middleware/auth.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import { wsHub } from '../../realtime/wsHub.ts';

const router = Router();

const VALID_TRANSITIONS: Record<string, string[]> = {
  order_received: ['accepted', 'rejected'],
  accepted: ['preparing', 'rejected'],
  preparing: ['ready_for_pickup'],
  ready_for_pickup: ['completed'],
};

const STATUS_NOTIFICATION_LABELS: Record<string, { title: string; message: string; type: string }> = {
  accepted: {
    title: 'Order Accepted',
    message: 'Canteen staff has accepted your order and queued it for the kitchen.',
    type: 'order_accepted',
  },
  preparing: {
    title: 'Preparing Your Meal',
    message: 'Your food is currently being freshly prepared at the canteen.',
    type: 'order_preparing',
  },
  ready_for_pickup: {
    title: 'Ready for Pickup!',
    message: 'Your order is ready at the counter. Present your QR or pickup code to collect.',
    type: 'order_ready',
  },
  completed: {
    title: 'Order Collected',
    message: 'Your order has been handed over. Enjoy your meal!',
    type: 'order_completed',
  },
  rejected: {
    title: 'Order Rejected',
    message: 'Unfortunately the canteen could not fulfill your order. Demo payment marked refunded.',
    type: 'order_rejected',
  },
};

async function hydrateStaffOrders(orderRows: (typeof orders.$inferSelect)[]) {
  if (orderRows.length === 0) return [];
  const orderIds = orderRows.map((o) => o.id);
  const userIds = Array.from(new Set(orderRows.map((o) => o.userId)));

  const [allItems, allPayments, allSlots, allProfiles, allUsers] = await Promise.all([
    db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)),
    db.select().from(payments).where(inArray(payments.orderId, orderIds)),
    db.select().from(pickupSlots),
    db.select().from(profiles).where(inArray(profiles.userId, userIds)),
    db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, userIds)),
  ]);

  const slotMap = new Map(allSlots.map((s) => [s.id, s]));
  const paymentMap = new Map(allPayments.map((p) => [p.orderId, p]));
  const profileMap = new Map(allProfiles.map((p) => [p.userId, p]));
  const userMap = new Map(allUsers.map((u) => [u.id, u]));

  return orderRows.map((ord) => {
    const prof = profileMap.get(ord.userId);
    const usr = userMap.get(ord.userId);
    return {
      ...ord,
      pickupSlot: slotMap.get(ord.pickupSlotId) || null,
      items: allItems.filter((i) => i.orderId === ord.id),
      payment: paymentMap.get(ord.id) || null,
      customer: {
        fullName: prof?.fullName || usr?.email || 'Campus User',
        email: usr?.email || '',
        enrollmentId: prof?.enrollmentId || '',
        department: prof?.department || '',
      },
    };
  });
}

// GET /api/staff/orders
router.get(
  '/orders',
  requireAuth,
  requireRole('staff', 'admin'),
  async (_req: AuthRequest, res) => {
    try {
      const rows = await db
        .select()
        .from(orders)
        .orderBy(desc(orders.createdAt))
        .limit(150);

      const hydrated = await hydrateStaffOrders(rows);
      return res.json({ orders: hydrated });
    } catch (error) {
      console.error('GET /api/staff/orders error:', error);
      return res.status(500).json({ error: 'Failed to fetch staff orders.' });
    }
  }
);

// PATCH /api/staff/orders/:id/status
router.patch(
  '/orders/:id/status',
  requireAuth,
  requireRole('staff', 'admin'),
  async (req: AuthRequest, res) => {
    try {
      const orderId = Number(req.params.id);
      const { status, note } = req.body || {};

      if (Number.isNaN(orderId) || !status || typeof status !== 'string') {
        return res.status(400).json({ error: 'Invalid order ID or target status.' });
      }

      const [existing] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      const allowed = VALID_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(status)) {
        return res.status(400).json({
          error: `Cannot move order from "${existing.status.replace(/_/g, ' ')}" to "${status.replace(/_/g, ' ')}".`,
        });
      }

      const [updated] = await db
        .update(orders)
        .set({
          status,
          completedAt: status === 'completed' ? new Date() : existing.completedAt,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();

      if (status === 'rejected') {
        await db
          .update(payments)
          .set({ status: 'refunded' })
          .where(eq(payments.orderId, orderId));
      }

      await db.insert(orderStatusHistory).values({
        orderId,
        status,
        changedByUserId: req.authUser!.id,
        note: typeof note === 'string' ? note.trim() : `Updated by ${req.authUser!.fullName}`,
      });

      const meta = STATUS_NOTIFICATION_LABELS[status];
      if (meta) {
        await db.insert(notifications).values({
          userId: existing.userId,
          orderId,
          title: `${existing.orderNumber}: ${meta.title}`,
          message: meta.message,
          type: meta.type,
        });
      }

      const [hydrated] = await hydrateStaffOrders([updated]);
      wsHub.emitToUser(existing.userId, 'order:updated', { order: hydrated });
      wsHub.emitToUser(existing.userId, 'notification:new', {
        title: `${existing.orderNumber}: ${meta?.title || status}`,
        orderId,
      });
      wsHub.emitToRoles(['staff', 'admin'], 'order:updated', { order: hydrated });

      return res.json({ order: hydrated });
    } catch (error) {
      console.error('PATCH /api/staff/orders/:id/status error:', error);
      return res.status(500).json({ error: 'Failed to update order status.' });
    }
  }
);

// POST /api/staff/verify-pickup — verifies pickup code, order number, or scanned QR JSON payload
router.post(
  '/verify-pickup',
  requireAuth,
  requireRole('staff', 'admin'),
  async (req: AuthRequest, res) => {
    try {
      const rawInput = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
      if (!rawInput) {
        return res.status(400).json({ error: 'Please enter a pickup code, Order ID, or scan a QR payload.' });
      }

      let lookupCode = rawInput.toUpperCase();
      let lookupOrderNum = rawInput.toUpperCase();

      // Parse QR JSON payload if scanned
      if (rawInput.startsWith('{')) {
        try {
          const parsed = JSON.parse(rawInput);
          if (parsed.pickupCode) lookupCode = String(parsed.pickupCode).toUpperCase();
          if (parsed.orderNumber) lookupOrderNum = String(parsed.orderNumber).toUpperCase();
        } catch {
          // treat as plain code
        }
      }

      let matched = await db
        .select()
        .from(orders)
        .where(eq(orders.pickupCode, lookupCode))
        .limit(1);

      if (!matched[0]) {
        matched = await db
          .select()
          .from(orders)
          .where(eq(orders.orderNumber, lookupOrderNum))
          .limit(1);
      }

      const ord = matched[0];
      if (!ord) {
        return res.status(404).json({
          error: 'No matching order found for that pickup code or Order ID.',
        });
      }

      if (ord.status === 'completed') {
        const [hydrated] = await hydrateStaffOrders([ord]);
        return res.status(409).json({
          error: `Duplicate pickup blocked: Order ${ord.orderNumber} (${ord.pickupCode}) was already collected${
            ord.completedAt ? ` at ${new Date(ord.completedAt).toLocaleTimeString()}` : ''
          }.`,
          order: hydrated,
        });
      }

      if (ord.status === 'cancelled' || ord.status === 'rejected') {
        return res.status(400).json({
          error: `Order ${ord.orderNumber} cannot be collected because it was ${ord.status}.`,
        });
      }

      const now = new Date();
      const [updated] = await db
        .update(orders)
        .set({
          status: 'completed',
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(orders.id, ord.id))
        .returning();

      await db.insert(orderStatusHistory).values({
        orderId: ord.id,
        status: 'completed',
        changedByUserId: req.authUser!.id,
        note: `Verified pickup code ${ord.pickupCode} at counter`,
      });

      await db.insert(notifications).values({
        userId: ord.userId,
        orderId: ord.id,
        title: `${ord.orderNumber}: Order Collected`,
        message: 'Pickup verified at counter. Enjoy your meal!',
        type: 'order_completed',
      });

      const [hydrated] = await hydrateStaffOrders([updated]);
      wsHub.emitToUser(ord.userId, 'order:updated', { order: hydrated });
      wsHub.emitToRoles(['staff', 'admin'], 'order:updated', { order: hydrated });

      return res.json({
        verified: true,
        message: `Verified & completed Order ${ord.orderNumber} (${ord.pickupCode}).`,
        order: hydrated,
      });
    } catch (error) {
      console.error('Verify pickup error:', error);
      return res.status(500).json({ error: 'Failed to verify pickup code.' });
    }
  }
);

export default router;
