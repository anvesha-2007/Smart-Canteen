import { Router } from 'express';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  categories,
  menuItems,
  orderItems,
  orders,
  payments,
  pickupSlots,
  profiles,
  roles,
  users,
} from '../../db/schema.ts';
import { requireAuth, requireRole } from '../../middleware/auth.ts';
import type { AuthRequest } from '../../middleware/auth.ts';

const router = Router();

// GET /api/admin/analytics?range=daily|weekly|monthly&scope=all|real|demo
router.get(
  '/analytics',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res) => {
    try {
      const range = typeof req.query.range === 'string' ? req.query.range : 'weekly';
      const scope = typeof req.query.scope === 'string' ? req.query.scope : 'all';

      const [allUsers, allOrders, allItems, allCats, allMenu] = await Promise.all([
        db.select().from(users),
        db.select().from(orders).orderBy(desc(orders.createdAt)),
        db.select().from(orderItems),
        db.select().from(categories),
        db.select().from(menuItems),
      ]);

      const scopedOrders = allOrders.filter((o) => {
        if (scope === 'real') return !o.isDemo;
        if (scope === 'demo') return o.isDemo;
        return true;
      });

      const now = new Date();
      const todayIso = now.toISOString().slice(0, 10);
      const validOrders = scopedOrders.filter(
        (o) => !['cancelled', 'rejected'].includes(o.status)
      );

      const todayOrders = validOrders.filter(
        (o) => new Date(o.createdAt).toISOString().slice(0, 10) === todayIso
      );

      const todaysRevenue = todayOrders.reduce((s, o) => s + o.totalAmount, 0);
      const totalRevenue = validOrders.reduce((s, o) => s + o.totalAmount, 0);
      const pendingOrders = scopedOrders.filter((o) =>
        ['order_received', 'accepted', 'preparing', 'ready_for_pickup'].includes(o.status)
      ).length;
      const completedOrders = scopedOrders.filter((o) => o.status === 'completed').length;

      // Range window for trend series
      const daysWindow = range === 'daily' ? 1 : range === 'monthly' ? 30 : 7;
      const trendBuckets: { date: string; label: string; revenue: number; orders: number }[] = [];

      if (range === 'daily') {
        // Hourly buckets for today (08:00 to 20:00)
        for (let h = 8; h <= 20; h++) {
          const label = `${String(h).padStart(2, '0')}:00`;
          const matching = todayOrders.filter(
            (o) => new Date(o.createdAt).getHours() === h
          );
          trendBuckets.push({
            date: label,
            label,
            revenue: matching.reduce((s, o) => s + o.totalAmount, 0),
            orders: matching.length,
          });
        }
      } else {
        for (let i = daysWindow - 1; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 86400000);
          const iso = d.toISOString().slice(0, 10);
          const label = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
          const matching = validOrders.filter(
            (o) => new Date(o.createdAt).toISOString().slice(0, 10) === iso
          );
          trendBuckets.push({
            date: iso,
            label,
            revenue: matching.reduce((s, o) => s + o.totalAmount, 0),
            orders: matching.length,
          });
        }
      }

      // Category sales breakdown
      const validOrderIds = new Set(validOrders.map((o) => o.id));
      const menuCatMap = new Map(allMenu.map((m) => [m.id, m.categoryId]));
      const catNameMap = new Map(allCats.map((c) => [c.id, c.name]));

      const categoryStats = new Map<string, { name: string; revenue: number; count: number }>();
      const itemSalesMap = new Map<string, { name: string; quantity: number; revenue: number }>();

      for (const item of allItems) {
        if (!validOrderIds.has(item.orderId)) continue;
        const catId = item.menuItemId ? menuCatMap.get(item.menuItemId) : undefined;
        const catName = (catId ? catNameMap.get(catId) : undefined) || 'Other';

        const prevCat = categoryStats.get(catName) || { name: catName, revenue: 0, count: 0 };
        prevCat.revenue += item.lineTotal;
        prevCat.count += item.quantity;
        categoryStats.set(catName, prevCat);

        const prevItem = itemSalesMap.get(item.itemName) || {
          name: item.itemName,
          quantity: 0,
          revenue: 0,
        };
        prevItem.quantity += item.quantity;
        prevItem.revenue += item.lineTotal;
        itemSalesMap.set(item.itemName, prevItem);
      }

      const topItems = Array.from(itemSalesMap.values())
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 6);

      return res.json({
        kpis: {
          totalUsers: allUsers.length,
          activeUsers: allUsers.filter((u) => u.isActive).length,
          totalOrders: scopedOrders.length,
          todaysRevenue,
          totalRevenue,
          pendingOrders,
          completedOrders,
        },
        trend: trendBuckets,
        categoryBreakdown: Array.from(categoryStats.values()),
        topItems,
      });
    } catch (error) {
      console.error('GET /api/admin/analytics error:', error);
      return res.status(500).json({ error: 'Failed to generate analytics.' });
    }
  }
);

// GET /api/admin/orders
router.get(
  '/orders',
  requireAuth,
  requireRole('admin'),
  async (_req: AuthRequest, res) => {
    try {
      const orderRows = await db
        .select()
        .from(orders)
        .orderBy(desc(orders.createdAt))
        .limit(250);

      if (orderRows.length === 0) return res.json({ orders: [] });

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

      const hydrated = orderRows.map((ord) => ({
        ...ord,
        pickupSlot: slotMap.get(ord.pickupSlotId) || null,
        items: allItems.filter((i) => i.orderId === ord.id),
        payment: paymentMap.get(ord.id) || null,
        customer: {
          fullName: profileMap.get(ord.userId)?.fullName || userMap.get(ord.userId)?.email || 'User',
          email: userMap.get(ord.userId)?.email || '',
        },
      }));

      return res.json({ orders: hydrated });
    } catch (error) {
      console.error('GET /api/admin/orders error:', error);
      return res.status(500).json({ error: 'Failed to load order history.' });
    }
  }
);

// GET /api/admin/reports/export — CSV download
router.get(
  '/reports/export',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res) => {
    try {
      const scope = typeof req.query.scope === 'string' ? req.query.scope : 'all';
      const orderRows = await db.select().from(orders).orderBy(desc(orders.createdAt));
      const allProfiles = await db.select().from(profiles);
      const allUsers = await db.select({ id: users.id, email: users.email }).from(users);
      const allSlots = await db.select().from(pickupSlots);

      const profileMap = new Map(allProfiles.map((p) => [p.userId, p.fullName]));
      const userMap = new Map(allUsers.map((u) => [u.id, u.email]));
      const slotMap = new Map(allSlots.map((s) => [s.id, s.label]));

      const filtered = orderRows.filter((o) => {
        if (scope === 'real') return !o.isDemo;
        if (scope === 'demo') return o.isDemo;
        return true;
      });

      const escapeCsv = (val: unknown) => {
        const s = String(val ?? '');
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const headers = [
        'Order Number',
        'Date',
        'Pickup Slot',
        'Customer Name',
        'Customer Email',
        'Status',
        'Total Amount (INR)',
        'Pickup Code',
        'Data Type',
      ];

      const lines = [
        headers.join(','),
        ...filtered.map((o) =>
          [
            o.orderNumber,
            o.pickupDate,
            slotMap.get(o.pickupSlotId) || '',
            profileMap.get(o.userId) || '',
            userMap.get(o.userId) || '',
            o.status,
            o.totalAmount.toFixed(2),
            o.pickupCode,
            o.isDemo ? 'Demo' : 'Live',
          ]
            .map(escapeCsv)
            .join(',')
        ),
      ];

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="smart-canteen-orders-${new Date().toISOString().slice(0, 10)}.csv"`
      );
      return res.send(lines.join('\n'));
    } catch (error) {
      console.error('CSV export error:', error);
      return res.status(500).json({ error: 'Failed to export CSV report.' });
    }
  }
);

// GET /api/admin/users
router.get(
  '/users',
  requireAuth,
  requireRole('admin'),
  async (_req: AuthRequest, res) => {
    try {
      const rows = await db
        .select({
          id: users.id,
          uid: users.uid,
          email: users.email,
          roleName: users.roleName,
          isActive: users.isActive,
          isDemo: users.isDemo,
          createdAt: users.createdAt,
          fullName: profiles.fullName,
          department: profiles.department,
          enrollmentId: profiles.enrollmentId,
          phone: profiles.phone,
        })
        .from(users)
        .leftJoin(profiles, eq(profiles.userId, users.id))
        .orderBy(asc(users.id));

      return res.json({ users: rows });
    } catch (error) {
      console.error('GET /api/admin/users error:', error);
      return res.status(500).json({ error: 'Failed to fetch users.' });
    }
  }
);

// PATCH /api/admin/users/:id
router.patch(
  '/users/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res) => {
    try {
      const targetId = Number(req.params.id);
      if (Number.isNaN(targetId)) {
        return res.status(400).json({ error: 'Invalid user ID.' });
      }

      const { roleName, isActive } = req.body || {};
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.id, targetId))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'User not found.' });
      }

      if (targetId === req.authUser!.id && isActive === false) {
        return res.status(400).json({ error: 'You cannot deactivate your own admin account.' });
      }

      let nextRoleId = existing.roleId;
      let nextRoleName = existing.roleName;
      if (typeof roleName === 'string' && ['student', 'staff', 'admin'].includes(roleName)) {
        const [r] = await db
          .select()
          .from(roles)
          .where(eq(roles.name, roleName))
          .limit(1);
        if (r) {
          nextRoleId = r.id;
          nextRoleName = r.name;
        }
      }

      const [updated] = await db
        .update(users)
        .set({
          roleId: nextRoleId,
          roleName: nextRoleName,
          isActive: typeof isActive === 'boolean' ? isActive : existing.isActive,
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetId))
        .returning();

      return res.json({ user: updated });
    } catch (error) {
      console.error('PATCH /api/admin/users/:id error:', error);
      return res.status(500).json({ error: 'Failed to update user.' });
    }
  }
);

// Pickup Slots Admin Management
router.get(
  '/slots',
  requireAuth,
  requireRole('admin'),
  async (_req: AuthRequest, res) => {
    try {
      const rows = await db
        .select()
        .from(pickupSlots)
        .orderBy(asc(pickupSlots.startTime));
      return res.json({ slots: rows });
    } catch (error) {
      console.error('GET /api/admin/slots error:', error);
      return res.status(500).json({ error: 'Failed to load pickup slots.' });
    }
  }
);

router.post(
  '/slots',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res) => {
    try {
      const { label, startTime, endTime, maxCapacity } = req.body || {};
      if (!label || !startTime || !endTime) {
        return res.status(400).json({ error: 'Slot label, start time, and end time are required.' });
      }
      const cap = Math.max(1, Number(maxCapacity) || 25);
      const [created] = await db
        .insert(pickupSlots)
        .values({
          label: String(label).trim(),
          startTime: String(startTime).trim(),
          endTime: String(endTime).trim(),
          maxCapacity: cap,
          isActive: true,
        })
        .returning();

      return res.status(201).json({ slot: created });
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'A pickup slot with that label already exists.' });
      }
      console.error('POST /api/admin/slots error:', error);
      return res.status(500).json({ error: 'Failed to create pickup slot.' });
    }
  }
);

router.patch(
  '/slots/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { maxCapacity, isActive } = req.body || {};
      const [existing] = await db
        .select()
        .from(pickupSlots)
        .where(eq(pickupSlots.id, id))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'Slot not found.' });
      }

      const [updated] = await db
        .update(pickupSlots)
        .set({
          maxCapacity:
            maxCapacity !== undefined ? Math.max(1, Number(maxCapacity)) : existing.maxCapacity,
          isActive: typeof isActive === 'boolean' ? isActive : existing.isActive,
        })
        .where(eq(pickupSlots.id, id))
        .returning();

      return res.json({ slot: updated });
    } catch (error) {
      console.error('PATCH /api/admin/slots/:id error:', error);
      return res.status(500).json({ error: 'Failed to update pickup slot.' });
    }
  }
);

export default router;
