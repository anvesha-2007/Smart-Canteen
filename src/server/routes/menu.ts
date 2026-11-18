import { Router } from 'express';
import { and, asc, desc, eq, gte, ilike, lte, notInArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { categories, menuItems, orders, pickupSlots } from '../../db/schema.ts';
import { ensureDatabaseSeeded } from '../../db/seed.ts';
import { requireAuth, requireRole } from '../../middleware/auth.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import { wsHub } from '../../realtime/wsHub.ts';

const router = Router();

// GET /api/menu — public menu browsing with search, category, price filter, and sorting
router.get('/menu', async (req, res) => {
  try {
    await ensureDatabaseSeeded();

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const categorySlug = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;
    const onlyAvailable = req.query.onlyAvailable === 'true';
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'popularity';

    const allCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.name));

    const conditions = [];

    if (search) {
      conditions.push(ilike(menuItems.name, `%${search}%`));
    }
    if (categorySlug && categorySlug !== 'all') {
      const matchedCat = allCategories.find((c) => c.slug === categorySlug);
      if (matchedCat) {
        conditions.push(eq(menuItems.categoryId, matchedCat.id));
      } else {
        return res.json({ categories: allCategories, items: [] });
      }
    }
    if (minPrice !== undefined && !Number.isNaN(minPrice)) {
      conditions.push(gte(menuItems.price, minPrice));
    }
    if (maxPrice !== undefined && !Number.isNaN(maxPrice)) {
      conditions.push(lte(menuItems.price, maxPrice));
    }
    if (onlyAvailable) {
      conditions.push(eq(menuItems.isAvailable, true));
    }

    let orderClause = desc(menuItems.popularityScore);
    if (sort === 'price_asc') orderClause = asc(menuItems.price);
    else if (sort === 'price_desc') orderClause = desc(menuItems.price);
    else if (sort === 'prep_time') orderClause = asc(menuItems.prepTimeMinutes);
    else if (sort === 'name') orderClause = asc(menuItems.name);

    const rows = await db
      .select({
        id: menuItems.id,
        categoryId: menuItems.categoryId,
        categoryName: categories.name,
        categorySlug: categories.slug,
        name: menuItems.name,
        description: menuItems.description,
        price: menuItems.price,
        imageUrl: menuItems.imageUrl,
        prepTimeMinutes: menuItems.prepTimeMinutes,
        isAvailable: menuItems.isAvailable,
        isFeatured: menuItems.isFeatured,
        isTodaysSpecial: menuItems.isTodaysSpecial,
        isVeg: menuItems.isVeg,
        popularityScore: menuItems.popularityScore,
        isDemo: menuItems.isDemo,
      })
      .from(menuItems)
      .innerJoin(categories, eq(menuItems.categoryId, categories.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderClause, asc(menuItems.id));

    return res.json({ categories: allCategories, items: rows });
  } catch (error) {
    console.error('GET /api/menu error:', error);
    return res.status(500).json({ error: 'Failed to load menu items.' });
  }
});

// GET /api/categories
router.get('/categories', async (_req, res) => {
  try {
    await ensureDatabaseSeeded();
    const rows = await db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
    return res.json({ categories: rows });
  } catch (error) {
    console.error('GET /api/categories error:', error);
    return res.status(500).json({ error: 'Failed to load categories.' });
  }
});

// GET /api/slots?date=YYYY-MM-DD — returns slots with live capacity count
router.get('/slots', async (req, res) => {
  try {
    await ensureDatabaseSeeded();
    const dateStr =
      typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : new Date().toISOString().slice(0, 10);

    const allSlots = await db
      .select()
      .from(pickupSlots)
      .where(eq(pickupSlots.isActive, true))
      .orderBy(asc(pickupSlots.startTime));

    const bookingCounts = await db
      .select({
        pickupSlotId: orders.pickupSlotId,
        bookedCount: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.pickupDate, dateStr),
          notInArray(orders.status, ['cancelled', 'rejected'])
        )
      )
      .groupBy(orders.pickupSlotId);

    const countMap = new Map(bookingCounts.map((b) => [b.pickupSlotId, Number(b.bookedCount)]));

    const enriched = allSlots.map((slot) => {
      const bookedCount = countMap.get(slot.id) ?? 0;
      const remainingCapacity = Math.max(0, slot.maxCapacity - bookedCount);
      return {
        ...slot,
        date: dateStr,
        bookedCount,
        remainingCapacity,
        isFull: remainingCapacity <= 0,
      };
    });

    return res.json({ date: dateStr, slots: enriched });
  } catch (error) {
    console.error('GET /api/slots error:', error);
    return res.status(500).json({ error: 'Failed to load pickup slots.' });
  }
});

// POST /api/staff/menu/:id/toggle — Staff or Admin toggles food availability
router.post(
  '/staff/menu/:id/toggle',
  requireAuth,
  requireRole('staff', 'admin'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid menu item ID.' });
      }

      const existing = await db
        .select()
        .from(menuItems)
        .where(eq(menuItems.id, id))
        .limit(1);

      if (!existing[0]) {
        return res.status(404).json({ error: 'Menu item not found.' });
      }

      const nextAvailable =
        typeof req.body?.isAvailable === 'boolean'
          ? req.body.isAvailable
          : !existing[0].isAvailable;

      const [updated] = await db
        .update(menuItems)
        .set({ isAvailable: nextAvailable, updatedAt: new Date() })
        .where(eq(menuItems.id, id))
        .returning();

      wsHub.broadcast('menu:updated', {
        id: updated.id,
        isAvailable: updated.isAvailable,
      });

      return res.json({ item: updated });
    } catch (error) {
      console.error('Toggle availability error:', error);
      return res.status(500).json({ error: 'Failed to update availability.' });
    }
  }
);

// Admin Menu CRUD
router.post(
  '/admin/menu',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res) => {
    try {
      const {
        categoryId,
        name,
        description,
        price,
        imageUrl,
        prepTimeMinutes,
        isAvailable,
        isFeatured,
        isTodaysSpecial,
        isVeg,
      } = req.body || {};

      if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({ error: 'Food name is required.' });
      }
      const numericPrice = Number(price);
      if (Number.isNaN(numericPrice) || numericPrice <= 0) {
        return res.status(400).json({ error: 'Price must be greater than 0.' });
      }
      if (!categoryId || Number.isNaN(Number(categoryId))) {
        return res.status(400).json({ error: 'Valid category is required.' });
      }

      const [created] = await db
        .insert(menuItems)
        .values({
          categoryId: Number(categoryId),
          name: name.trim(),
          description:
            typeof description === 'string' && description.trim()
              ? description.trim()
              : 'Freshly prepared at the campus canteen.',
          price: numericPrice,
          imageUrl:
            typeof imageUrl === 'string' && imageUrl.trim()
              ? imageUrl.trim()
              : '/src/assets/images/hero_canteen_spread_1794994427127.jpg',
          prepTimeMinutes: Math.max(1, Number(prepTimeMinutes) || 10),
          isAvailable: isAvailable !== false,
          isFeatured: Boolean(isFeatured),
          isTodaysSpecial: Boolean(isTodaysSpecial),
          isVeg: isVeg !== false,
          popularityScore: 70,
          isDemo: false,
        })
        .returning();

      wsHub.broadcast('menu:updated', { id: created.id, action: 'created' });
      return res.status(201).json({ item: created });
    } catch (error) {
      console.error('Create menu item error:', error);
      return res.status(500).json({ error: 'Failed to create menu item.' });
    }
  }
);

router.put(
  '/admin/menu/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid menu item ID.' });
      }

      const existing = await db
        .select()
        .from(menuItems)
        .where(eq(menuItems.id, id))
        .limit(1);
      if (!existing[0]) {
        return res.status(404).json({ error: 'Menu item not found.' });
      }

      const b = req.body || {};
      const numericPrice = b.price !== undefined ? Number(b.price) : existing[0].price;
      if (Number.isNaN(numericPrice) || numericPrice <= 0) {
        return res.status(400).json({ error: 'Price must be greater than 0.' });
      }

      const [updated] = await db
        .update(menuItems)
        .set({
          categoryId: b.categoryId ? Number(b.categoryId) : existing[0].categoryId,
          name: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : existing[0].name,
          description:
            typeof b.description === 'string' ? b.description.trim() : existing[0].description,
          price: numericPrice,
          imageUrl:
            typeof b.imageUrl === 'string' && b.imageUrl.trim()
              ? b.imageUrl.trim()
              : existing[0].imageUrl,
          prepTimeMinutes:
            b.prepTimeMinutes !== undefined
              ? Math.max(1, Number(b.prepTimeMinutes))
              : existing[0].prepTimeMinutes,
          isAvailable:
            typeof b.isAvailable === 'boolean' ? b.isAvailable : existing[0].isAvailable,
          isFeatured:
            typeof b.isFeatured === 'boolean' ? b.isFeatured : existing[0].isFeatured,
          isTodaysSpecial:
            typeof b.isTodaysSpecial === 'boolean'
              ? b.isTodaysSpecial
              : existing[0].isTodaysSpecial,
          isVeg: typeof b.isVeg === 'boolean' ? b.isVeg : existing[0].isVeg,
          updatedAt: new Date(),
        })
        .where(eq(menuItems.id, id))
        .returning();

      wsHub.broadcast('menu:updated', { id: updated.id, action: 'updated' });
      return res.json({ item: updated });
    } catch (error) {
      console.error('Update menu item error:', error);
      return res.status(500).json({ error: 'Failed to update menu item.' });
    }
  }
);

router.delete(
  '/admin/menu/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid menu item ID.' });
      }

      await db.delete(menuItems).where(eq(menuItems.id, id));
      wsHub.broadcast('menu:updated', { id, action: 'deleted' });
      return res.json({ success: true });
    } catch (error) {
      console.error('Delete menu item error:', error);
      return res.status(500).json({ error: 'Failed to delete menu item.' });
    }
  }
);

// Admin Category CRUD
router.post(
  '/admin/categories',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res) => {
    try {
      const { name, description, sortOrder } = req.body || {};
      if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({ error: 'Category name is required.' });
      }
      const slug = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const [created] = await db
        .insert(categories)
        .values({
          name: name.trim(),
          slug,
          description: typeof description === 'string' ? description.trim() : '',
          sortOrder: Number(sortOrder) || 10,
          isActive: true,
        })
        .returning();

      return res.status(201).json({ category: created });
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'A category with this name already exists.' });
      }
      console.error('Create category error:', error);
      return res.status(500).json({ error: 'Failed to create category.' });
    }
  }
);

router.delete(
  '/admin/categories/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const linked = await db
        .select({ id: menuItems.id })
        .from(menuItems)
        .where(eq(menuItems.categoryId, id))
        .limit(1);

      if (linked.length > 0) {
        return res.status(400).json({
          error: 'Cannot delete category while menu items are assigned to it. Reassign or remove items first.',
        });
      }

      await db.delete(categories).where(eq(categories.id, id));
      return res.json({ success: true });
    } catch (error) {
      console.error('Delete category error:', error);
      return res.status(500).json({ error: 'Failed to delete category.' });
    }
  }
);

export default router;
