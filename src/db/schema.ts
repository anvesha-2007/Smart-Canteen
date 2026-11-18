import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// 1. Roles
export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // 'student' | 'staff' | 'admin'
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. Users
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(), // Firebase UID or local UUID
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash'),
    roleId: integer('role_id')
      .references(() => roles.id)
      .notNull(),
    roleName: text('role_name').notNull().default('student'),
    isActive: boolean('is_active').notNull().default(true),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_users_role_name').on(table.roleName),
    index('idx_users_email').on(table.email),
  ]
);

// 3. Profiles
export const profiles = pgTable('profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  fullName: text('full_name').notNull(),
  department: text('department').default('Computer Science'),
  enrollmentId: text('enrollment_id').default(''),
  phone: text('phone').default(''),
  avatarUrl: text('avatar_url').default(''),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 4. Categories
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description').default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5. Menu Items
export const menuItems = pgTable(
  'menu_items',
  {
    id: serial('id').primaryKey(),
    categoryId: integer('category_id')
      .references(() => categories.id)
      .notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    price: doublePrecision('price').notNull(),
    imageUrl: text('image_url').notNull(),
    prepTimeMinutes: integer('prep_time_minutes').notNull().default(10),
    isAvailable: boolean('is_available').notNull().default(true),
    isFeatured: boolean('is_featured').notNull().default(false),
    isTodaysSpecial: boolean('is_todays_special').notNull().default(false),
    isVeg: boolean('is_veg').notNull().default(true),
    popularityScore: integer('popularity_score').notNull().default(50),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_menu_items_category_id').on(table.categoryId),
    index('idx_menu_items_available').on(table.isAvailable),
  ]
);

// 6. Carts
export const carts = pgTable('carts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 7. Cart Items
export const cartItems = pgTable(
  'cart_items',
  {
    id: serial('id').primaryKey(),
    cartId: integer('cart_id')
      .references(() => carts.id, { onDelete: 'cascade' })
      .notNull(),
    menuItemId: integer('menu_item_id')
      .references(() => menuItems.id, { onDelete: 'cascade' })
      .notNull(),
    quantity: integer('quantity').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_cart_items_cart_menu').on(table.cartId, table.menuItemId),
  ]
);

// 8. Pickup Slots
export const pickupSlots = pgTable('pickup_slots', {
  id: serial('id').primaryKey(),
  label: text('label').notNull().unique(),
  startTime: text('start_time').notNull(), // HH:MM (24h)
  endTime: text('end_time').notNull(), // HH:MM (24h)
  maxCapacity: integer('max_capacity').notNull().default(25),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 9. Orders
export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    orderNumber: text('order_number').notNull().unique(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    pickupSlotId: integer('pickup_slot_id')
      .references(() => pickupSlots.id)
      .notNull(),
    pickupDate: text('pickup_date').notNull(), // YYYY-MM-DD
    status: text('status').notNull().default('order_received'),
    // Allowed: order_received | accepted | preparing | ready_for_pickup | completed | rejected | cancelled
    subtotal: doublePrecision('subtotal').notNull(),
    taxAmount: doublePrecision('tax_amount').notNull().default(0),
    totalAmount: doublePrecision('total_amount').notNull(),
    pickupCode: text('pickup_code').notNull().unique(),
    qrPayload: text('qr_payload').notNull(),
    specialInstructions: text('special_instructions').default(''),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    isDemo: boolean('is_demo').notNull().default(false),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_orders_user_id').on(table.userId),
    index('idx_orders_status').on(table.status),
    index('idx_orders_slot_date').on(table.pickupSlotId, table.pickupDate),
    index('idx_orders_created_at').on(table.createdAt),
  ]
);

// 10. Order Items
export const orderItems = pgTable(
  'order_items',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    menuItemId: integer('menu_item_id')
      .references(() => menuItems.id, { onDelete: 'set null' }),
    itemName: text('item_name').notNull(),
    unitPrice: doublePrecision('unit_price').notNull(),
    quantity: integer('quantity').notNull(),
    lineTotal: doublePrecision('line_total').notNull(),
  },
  (table) => [index('idx_order_items_order_id').on(table.orderId)]
);

// 11. Payments
export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    method: text('method').notNull(), // 'upi_demo' | 'card_demo' | 'wallet_demo'
    status: text('status').notNull(), // 'pending' | 'success' | 'failed' | 'refunded'
    amount: doublePrecision('amount').notNull(),
    transactionRef: text('transaction_ref').notNull().unique(),
    isDemoMode: boolean('is_demo_mode').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_payments_user_id').on(table.userId)]
);

// 12. Order Status History
export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').notNull(),
    changedByUserId: integer('changed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    note: text('note').default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_order_history_order_id').on(table.orderId)]
);

// 13. Notifications
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    orderId: integer('order_id').references(() => orders.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    message: text('message').notNull(),
    type: text('type').notNull().default('info'),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_notifications_user_read').on(table.userId, table.isRead),
  ]
);

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  cart: one(carts, { fields: [users.id], references: [carts.userId] }),
  orders: many(orders),
  notifications: many(notifications),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  menuItems: many(menuItems),
}));

export const menuItemsRelations = relations(menuItems, ({ one }) => ({
  category: one(categories, {
    fields: [menuItems.categoryId],
    references: [categories.id],
  }),
}));

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, { fields: [carts.userId], references: [users.id] }),
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  menuItem: one(menuItems, {
    fields: [cartItems.menuItemId],
    references: [menuItems.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  pickupSlot: one(pickupSlots, {
    fields: [orders.pickupSlotId],
    references: [pickupSlots.id],
  }),
  items: many(orderItems),
  payment: one(payments, { fields: [orders.id], references: [payments.orderId] }),
  statusHistory: many(orderStatusHistory),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  menuItem: one(menuItems, {
    fields: [orderItems.menuItemId],
    references: [menuItems.id],
  }),
}));

export const orderStatusHistoryRelations = relations(
  orderStatusHistory,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderStatusHistory.orderId],
      references: [orders.id],
    }),
  })
);
