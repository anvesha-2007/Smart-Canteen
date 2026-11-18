import { Router } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { cartItems, carts, menuItems, orderItems, orders } from '../../db/schema.ts';
import { requireAuth } from '../../middleware/auth.ts';
import type { AuthRequest } from '../../middleware/auth.ts';

const router = Router();

async function getOrCreateCartId(userId: number): Promise<number> {
  const existing = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, userId))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const inserted = await db
    .insert(carts)
    .values({ userId })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) return inserted[0].id;

  const fallback = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, userId))
    .limit(1);
  return fallback[0].id;
}

async function buildCartResponse(cartId: number) {
  const rows = await db
    .select({
      id: cartItems.id,
      menuItemId: menuItems.id,
      name: menuItems.name,
      price: menuItems.price,
      imageUrl: menuItems.imageUrl,
      prepTimeMinutes: menuItems.prepTimeMinutes,
      isAvailable: menuItems.isAvailable,
      quantity: cartItems.quantity,
    })
    .from(cartItems)
    .innerJoin(menuItems, eq(cartItems.menuItemId, menuItems.id))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.id));

  const subtotal = rows.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = rows.reduce((sum, item) => sum + item.quantity, 0);

  return {
    items: rows.map((r) => ({
      ...r,
      lineTotal: r.price * r.quantity,
    })),
    subtotal,
    taxAmount: 0,
    totalAmount: subtotal,
    itemCount,
  };
}

// GET /api/cart
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const cartId = await getOrCreateCartId(req.authUser!.id);
    const cart = await buildCartResponse(cartId);
    return res.json(cart);
  } catch (error) {
    console.error('GET /api/cart error:', error);
    return res.status(500).json({ error: 'Failed to load cart.' });
  }
});

// POST /api/cart/items
router.post('/items', requireAuth, async (req: AuthRequest, res) => {
  try {
    const menuItemId = Number(req.body?.menuItemId);
    const qtyDelta = Math.max(1, Math.min(20, Number(req.body?.quantity) || 1));

    if (Number.isNaN(menuItemId)) {
      return res.status(400).json({ error: 'Invalid food item ID.' });
    }

    const itemRows = await db
      .select()
      .from(menuItems)
      .where(eq(menuItems.id, menuItemId))
      .limit(1);

    const food = itemRows[0];
    if (!food) {
      return res.status(404).json({ error: 'Food item not found.' });
    }
    if (!food.isAvailable) {
      return res.status(400).json({ error: `${food.name} is currently sold out.` });
    }

    const cartId = await getOrCreateCartId(req.authUser!.id);
    const existingRow = await db
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.menuItemId, menuItemId)))
      .limit(1);

    if (existingRow[0]) {
      const nextQty = Math.min(20, existingRow[0].quantity + qtyDelta);
      await db
        .update(cartItems)
        .set({ quantity: nextQty })
        .where(eq(cartItems.id, existingRow[0].id));
    } else {
      await db.insert(cartItems).values({
        cartId,
        menuItemId,
        quantity: qtyDelta,
      });
    }

    const cart = await buildCartResponse(cartId);
    return res.json(cart);
  } catch (error) {
    console.error('POST /api/cart/items error:', error);
    return res.status(500).json({ error: 'Failed to add item to cart.' });
  }
});

// PATCH /api/cart/items/:menuItemId
router.patch('/items/:menuItemId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const menuItemId = Number(req.params.menuItemId);
    const quantity = Number(req.body?.quantity);

    if (Number.isNaN(menuItemId) || Number.isNaN(quantity)) {
      return res.status(400).json({ error: 'Invalid item or quantity.' });
    }

    const cartId = await getOrCreateCartId(req.authUser!.id);

    if (quantity <= 0) {
      await db
        .delete(cartItems)
        .where(and(eq(cartItems.cartId, cartId), eq(cartItems.menuItemId, menuItemId)));
    } else {
      const clampedQty = Math.min(20, quantity);
      await db
        .update(cartItems)
        .set({ quantity: clampedQty })
        .where(and(eq(cartItems.cartId, cartId), eq(cartItems.menuItemId, menuItemId)));
    }

    const cart = await buildCartResponse(cartId);
    return res.json(cart);
  } catch (error) {
    console.error('PATCH /api/cart/items error:', error);
    return res.status(500).json({ error: 'Failed to update cart quantity.' });
  }
});

// DELETE /api/cart/items/:menuItemId
router.delete('/items/:menuItemId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const menuItemId = Number(req.params.menuItemId);
    const cartId = await getOrCreateCartId(req.authUser!.id);
    await db
      .delete(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.menuItemId, menuItemId)));

    const cart = await buildCartResponse(cartId);
    return res.json(cart);
  } catch (error) {
    console.error('DELETE /api/cart/items error:', error);
    return res.status(500).json({ error: 'Failed to remove item from cart.' });
  }
});

// DELETE /api/cart
router.delete('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const cartId = await getOrCreateCartId(req.authUser!.id);
    await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
    const cart = await buildCartResponse(cartId);
    return res.json(cart);
  } catch (error) {
    console.error('DELETE /api/cart error:', error);
    return res.status(500).json({ error: 'Failed to clear cart.' });
  }
});

// POST /api/cart/reorder/:orderId
router.post('/reorder/:orderId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (Number.isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID.' });
    }

    const ord = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, req.authUser!.id)))
      .limit(1);

    if (!ord[0]) {
      return res.status(404).json({ error: 'Previous order not found.' });
    }

    const prevItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    const cartId = await getOrCreateCartId(req.authUser!.id);
    const skippedItems: string[] = [];

    for (const prev of prevItems) {
      if (!prev.menuItemId) {
        skippedItems.push(prev.itemName);
        continue;
      }
      const [food] = await db
        .select()
        .from(menuItems)
        .where(eq(menuItems.id, prev.menuItemId))
        .limit(1);

      if (!food || !food.isAvailable) {
        skippedItems.push(prev.itemName);
        continue;
      }

      const existing = await db
        .select()
        .from(cartItems)
        .where(and(eq(cartItems.cartId, cartId), eq(cartItems.menuItemId, food.id)))
        .limit(1);

      if (existing[0]) {
        await db
          .update(cartItems)
          .set({ quantity: Math.min(20, existing[0].quantity + prev.quantity) })
          .where(eq(cartItems.id, existing[0].id));
      } else {
        await db.insert(cartItems).values({
          cartId,
          menuItemId: food.id,
          quantity: prev.quantity,
        });
      }
    }

    const cart = await buildCartResponse(cartId);
    return res.json({ ...cart, skippedItems });
  } catch (error) {
    console.error('Reorder error:', error);
    return res.status(500).json({ error: 'Failed to reorder items.' });
  }
});

export default router;
