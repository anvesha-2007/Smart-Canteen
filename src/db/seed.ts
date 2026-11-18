import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  categories,
  menuItems,
  orderItems,
  orders,
  orderStatusHistory,
  payments,
  pickupSlots,
  profiles,
  roles,
  users,
} from './schema.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureDatabaseSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runIdempotentSeed().catch((err) => {
      seedPromise = null;
      console.error('Database seed error:', err);
      throw err;
    });
  }
  return seedPromise;
}

async function runIdempotentSeed(): Promise<void> {
  // 1. Seed Roles
  const roleData = [
    { name: 'student', description: 'College Student or Faculty placing pre-orders' },
    { name: 'staff', description: 'Canteen Staff managing kitchen queue and pickups' },
    { name: 'admin', description: 'System Administrator managing menu, users, and reports' },
  ];

  for (const r of roleData) {
    await db.insert(roles).values(r).onConflictDoNothing();
  }

  const allRoles = await db.select().from(roles);
  const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));

  // 2. Seed Demo Users (only if no users exist yet or upsert demo emails)
  const existingUsersCount = await db.select({ value: count() }).from(users);
  if ((existingUsersCount[0]?.value ?? 0) === 0) {
    const demoAccounts = [
      {
        uid: 'demo-student-anvesha',
        email: 'student@campus.edu',
        passwordHash: await bcrypt.hash('Student@123', 10),
        roleId: roleMap.get('student')!,
        roleName: 'student',
        isActive: true,
        isDemo: true,
        profile: {
          fullName: 'Anvesha Jaiswal',
          department: 'Computer Science & Engg',
          enrollmentId: 'EN24CS3010200',
          phone: '+91 98765 43210',
        },
      },
      {
        uid: 'demo-staff-ramesh',
        email: 'staff@campus.edu',
        passwordHash: await bcrypt.hash('Staff@123', 10),
        roleId: roleMap.get('staff')!,
        roleName: 'staff',
        isActive: true,
        isDemo: true,
        profile: {
          fullName: 'Ramesh Verma',
          department: 'Main Canteen Kitchen',
          enrollmentId: 'STAFF-CAN-04',
          phone: '+91 98230 11223',
        },
      },
      {
        uid: 'demo-admin-priya',
        email: 'admin@campus.edu',
        passwordHash: await bcrypt.hash('Admin@123', 10),
        roleId: roleMap.get('admin')!,
        roleName: 'admin',
        isActive: true,
        isDemo: true,
        profile: {
          fullName: 'Dr. Priya Nair',
          department: 'Campus Dining Office',
          enrollmentId: 'ADM-001',
          phone: '+91 98111 77889',
        },
      },
    ];

    for (const acc of demoAccounts) {
      const inserted = await db
        .insert(users)
        .values({
          uid: acc.uid,
          email: acc.email,
          passwordHash: acc.passwordHash,
          roleId: acc.roleId,
          roleName: acc.roleName,
          isActive: acc.isActive,
          isDemo: acc.isDemo,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted[0]) {
        await db
          .insert(profiles)
          .values({
            userId: inserted[0].id,
            fullName: acc.profile.fullName,
            department: acc.profile.department,
            enrollmentId: acc.profile.enrollmentId,
            phone: acc.profile.phone,
          })
          .onConflictDoNothing();
      }
    }
  }

  // 3. Seed Categories
  const categoryData = [
    { name: 'Breakfast', slug: 'breakfast', description: 'Fresh morning tiffins and hot bites', sortOrder: 1 },
    { name: 'Lunch', slug: 'lunch', description: 'Hearty wholesome plates and rice bowls', sortOrder: 2 },
    { name: 'Snacks', slug: 'snacks', description: 'Quick between-lecture bites and chaat', sortOrder: 3 },
    { name: 'Beverages', slug: 'beverages', description: 'Hot chai, cold coffee, and fresh shakes', sortOrder: 4 },
    { name: 'Fast Food', slug: 'fast-food', description: 'Rolls, burgers, and crispy fries', sortOrder: 5 },
    { name: 'Desserts', slug: 'desserts', description: 'Sweet treats and warm classics', sortOrder: 6 },
  ];

  for (const cat of categoryData) {
    await db.insert(categories).values(cat).onConflictDoNothing();
  }

  const allCats = await db.select().from(categories);
  const catMap = new Map(allCats.map((c) => [c.name, c.id]));

  // 4. Seed Menu Items
  const existingItemsCount = await db.select({ value: count() }).from(menuItems);
  if ((existingItemsCount[0]?.value ?? 0) === 0) {
    const sampleItems = [
      {
        categoryId: catMap.get('Breakfast')!,
        name: 'Masala Dosa',
        description: 'Crisp fermented rice crepe filled with spiced potato masala, served with coconut chutney and piping hot sambar.',
        price: 65,
        imageUrl: '/src/assets/images/food_masala_dosa_1794994427326.jpg',
        prepTimeMinutes: 10,
        isAvailable: true,
        isFeatured: true,
        isTodaysSpecial: true,
        isVeg: true,
        popularityScore: 98,
        isDemo: true,
      },
      {
        categoryId: catMap.get('Breakfast')!,
        name: 'Poha',
        description: 'Light flattened rice tempered with mustard seeds, curry leaves, onions, roasted peanuts, crispy sev, and fresh lemon.',
        price: 35,
        imageUrl: '/src/assets/images/food_kanda_poha_1794994427605.jpg',
        prepTimeMinutes: 6,
        isAvailable: true,
        isFeatured: false,
        isTodaysSpecial: false,
        isVeg: true,
        popularityScore: 86,
        isDemo: true,
      },
      {
        categoryId: catMap.get('Snacks')!,
        name: 'Samosa',
        description: 'Two golden flaky pastry triangles stuffed with cumin-spiced potatoes and green peas, paired with mint and tamarind chutney.',
        price: 30,
        imageUrl: '/src/assets/images/food_crispy_samosa_1794994428071.jpg',
        prepTimeMinutes: 5,
        isAvailable: true,
        isFeatured: true,
        isTodaysSpecial: false,
        isVeg: true,
        popularityScore: 95,
        isDemo: true,
      },
      {
        categoryId: catMap.get('Snacks')!,
        name: 'Veg Sandwich',
        description: 'Bombay-style triple-layered grilled sandwich with spiced potato, cucumber, tomato, melted cheddar, and fresh coriander chutney.',
        price: 55,
        imageUrl: '/src/assets/images/food_veg_sandwich_1794994428438.jpg',
        prepTimeMinutes: 8,
        isAvailable: true,
        isFeatured: true,
        isTodaysSpecial: true,
        isVeg: true,
        popularityScore: 91,
        isDemo: true,
      },
      {
        categoryId: catMap.get('Fast Food')!,
        name: 'Paneer Roll',
        description: 'Char-grilled tikka paneer cubes, crisp onions, and creamy mint mayo wrapped in a warm flaky whole-wheat paratha.',
        price: 95,
        imageUrl: '/src/assets/images/food_paneer_roll_1794994429702.jpg',
        prepTimeMinutes: 12,
        isAvailable: true,
        isFeatured: true,
        isTodaysSpecial: false,
        isVeg: true,
        popularityScore: 94,
        isDemo: true,
      },
      {
        categoryId: catMap.get('Fast Food')!,
        name: 'Veg Burger',
        description: 'Toasted sesame brioche bun layered with a crunchy herb-potato patty, cheddar cheese, crisp lettuce, and house sauce.',
        price: 75,
        imageUrl: '/src/assets/images/food_veg_burger_1794994430021.jpg',
        prepTimeMinutes: 10,
        isAvailable: true,
        isFeatured: false,
        isTodaysSpecial: false,
        isVeg: true,
        popularityScore: 84,
        isDemo: true,
      },
      {
        categoryId: catMap.get('Fast Food')!,
        name: 'French Fries',
        description: 'Hand-cut golden potato fries tossed in smoky peri-peri seasoning and sea salt, served hot with tomato dip.',
        price: 60,
        imageUrl: '/src/assets/images/food_french_fries_1794994430107.jpg',
        prepTimeMinutes: 7,
        isAvailable: true,
        isFeatured: false,
        isTodaysSpecial: false,
        isVeg: true,
        popularityScore: 89,
        isDemo: true,
      },
      {
        categoryId: catMap.get('Beverages')!,
        name: 'Cold Coffee',
        description: 'Velvety blended iced espresso with chilled milk, chocolate swirl, and thick crema foam.',
        price: 55,
        imageUrl: '/src/assets/images/food_cold_coffee_1794994429346.jpg',
        prepTimeMinutes: 5,
        isAvailable: true,
        isFeatured: true,
        isTodaysSpecial: false,
        isVeg: true,
        popularityScore: 96,
        isDemo: true,
      },
      {
        categoryId: catMap.get('Beverages')!,
        name: 'Tea',
        description: 'Authentic campus kulhad masala chai brewed slowly with crushed ginger, green cardamom, and Assam tea leaves.',
        price: 20,
        imageUrl: '/src/assets/images/food_masala_chai_1794994430694.jpg',
        prepTimeMinutes: 4,
        isAvailable: true,
        isFeatured: true,
        isTodaysSpecial: false,
        isVeg: true,
        popularityScore: 99,
        isDemo: true,
      },
      {
        categoryId: catMap.get('Beverages')!,
        name: 'Mango Shake',
        description: 'Thick chilled Alphonso mango milkshake crowned with fresh diced mango cubes and mint.',
        price: 70,
        imageUrl: '/src/assets/images/food_mango_shake_1794994430786.jpg',
        prepTimeMinutes: 5,
        isAvailable: true,
        isFeatured: false,
        isTodaysSpecial: false,
        isVeg: true,
        popularityScore: 82,
        isDemo: true,
      },
      {
        categoryId: catMap.get('Lunch')!,
        name: 'Veg Fried Rice',
        description: 'Wok-tossed long-grain basmati rice with crunchy bell peppers, carrots, French beans, soy glaze, and spring onions.',
        price: 90,
        imageUrl: '/src/assets/images/food_fried_rice_1794994431894.jpg',
        prepTimeMinutes: 12,
        isAvailable: true,
        isFeatured: false,
        isTodaysSpecial: false,
        isVeg: true,
        popularityScore: 88,
        isDemo: true,
      },
      {
        categoryId: catMap.get('Lunch')!,
        name: 'Chole Bhature',
        description: 'Two fluffy golden bhature paired with slow-simmered Amritsari spiced chickpea curry, pickled onions, and green chili.',
        price: 110,
        imageUrl: '/src/assets/images/food_chole_bhature_1794994432227.jpg',
        prepTimeMinutes: 12,
        isAvailable: true,
        isFeatured: true,
        isTodaysSpecial: true,
        isVeg: true,
        popularityScore: 97,
        isDemo: true,
      },
      {
        categoryId: catMap.get('Desserts')!,
        name: 'Gulab Jamun',
        description: 'Two warm melt-in-mouth khoya dumplings steeped in saffron-cardamom rose syrup and topped with pistachios.',
        price: 45,
        imageUrl: '/src/assets/images/food_gulab_jamun_1794994461532.jpg',
        prepTimeMinutes: 4,
        isAvailable: true,
        isFeatured: false,
        isTodaysSpecial: false,
        isVeg: true,
        popularityScore: 85,
        isDemo: true,
      },
      {
        categoryId: catMap.get('Desserts')!,
        name: 'Choco Walnut Brownie',
        description: 'Warm fudgy dark chocolate brownie studded with toasted walnuts and finished with rich ganache drizzle.',
        price: 65,
        imageUrl: '/src/assets/images/food_choco_brownie_1794994462378.jpg',
        prepTimeMinutes: 5,
        isAvailable: false, // Intentionally one sold-out item to demonstrate availability state
        isFeatured: false,
        isTodaysSpecial: false,
        isVeg: true,
        popularityScore: 80,
        isDemo: true,
      },
    ];

    await db.insert(menuItems).values(sampleItems);
  }

  // 5. Seed Pickup Slots
  const existingSlotsCount = await db.select({ value: count() }).from(pickupSlots);
  if ((existingSlotsCount[0]?.value ?? 0) === 0) {
    const slotList = [
      { label: '08:30 AM - 08:45 AM', startTime: '08:30', endTime: '08:45', maxCapacity: 25 },
      { label: '09:30 AM - 09:45 AM', startTime: '09:30', endTime: '09:45', maxCapacity: 25 },
      { label: '10:30 AM - 10:45 AM', startTime: '10:30', endTime: '10:45', maxCapacity: 30 },
      { label: '11:30 AM - 11:45 AM', startTime: '11:30', endTime: '11:45', maxCapacity: 30 },
      { label: '12:30 PM - 12:45 PM', startTime: '12:30', endTime: '12:45', maxCapacity: 35 },
      { label: '01:00 PM - 01:15 PM', startTime: '13:00', endTime: '13:15', maxCapacity: 40 },
      { label: '01:30 PM - 01:45 PM', startTime: '13:30', endTime: '13:45', maxCapacity: 35 },
      { label: '02:30 PM - 02:45 PM', startTime: '14:30', endTime: '14:45', maxCapacity: 25 },
      { label: '04:00 PM - 04:15 PM', startTime: '16:00', endTime: '16:15', maxCapacity: 30 },
      { label: '05:00 PM - 05:15 PM', startTime: '17:00', endTime: '17:15', maxCapacity: 25 },
    ];
    for (const slot of slotList) {
      await db.insert(pickupSlots).values(slot).onConflictDoNothing();
    }
  }

  // 6. Seed Sample Demo Orders (clearly tagged isDemo: true)
  const existingOrdersCount = await db.select({ value: count() }).from(orders);
  if ((existingOrdersCount[0]?.value ?? 0) === 0) {
    const studentRows = await db
      .select()
      .from(users)
      .where(eq(users.email, 'student@campus.edu'))
      .limit(1);
    const staffRows = await db
      .select()
      .from(users)
      .where(eq(users.email, 'staff@campus.edu'))
      .limit(1);
    const allMenu = await db.select().from(menuItems);
    const allSlots = await db.select().from(pickupSlots);

    if (studentRows[0] && allMenu.length >= 4 && allSlots.length >= 3) {
      const studentId = studentRows[0].id;
      const staffId = staffRows[0]?.id ?? studentId;
      const todayStr = new Date().toISOString().slice(0, 10);
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      const dosa = allMenu.find((m) => m.name === 'Masala Dosa') || allMenu[0];
      const chai = allMenu.find((m) => m.name === 'Tea') || allMenu[1];
      const sandwich = allMenu.find((m) => m.name === 'Veg Sandwich') || allMenu[2];
      const coffee = allMenu.find((m) => m.name === 'Cold Coffee') || allMenu[3];
      const chole = allMenu.find((m) => m.name === 'Chole Bhature') || allMenu[0];

      const demoOrdersSeed = [
        {
          orderNumber: 'SC-DEMO-1001',
          pickupDate: yesterdayStr,
          slotId: allSlots[4].id,
          status: 'completed',
          pickupCode: 'SC4821',
          method: 'upi_demo',
          items: [
            { item: chole, qty: 1 },
            { item: chai, qty: 2 },
          ],
          daysAgo: 1,
        },
        {
          orderNumber: 'SC-DEMO-1002',
          pickupDate: todayStr,
          slotId: allSlots[5].id,
          status: 'ready_for_pickup',
          pickupCode: 'SC7394',
          method: 'upi_demo',
          items: [
            { item: sandwich, qty: 2 },
            { item: coffee, qty: 1 },
          ],
          daysAgo: 0,
        },
        {
          orderNumber: 'SC-DEMO-1003',
          pickupDate: todayStr,
          slotId: allSlots[6].id,
          status: 'preparing',
          pickupCode: 'SC5108',
          method: 'card_demo',
          items: [
            { item: dosa, qty: 1 },
            { item: chai, qty: 1 },
          ],
          daysAgo: 0,
        },
      ];

      for (const seedOrd of demoOrdersSeed) {
        const subtotal = seedOrd.items.reduce(
          (acc, entry) => acc + entry.item.price * entry.qty,
          0
        );
        const createdAt = new Date(Date.now() - seedOrd.daysAgo * 86400000);
        const qrPayload = JSON.stringify({
          orderNumber: seedOrd.orderNumber,
          pickupCode: seedOrd.pickupCode,
          v: 1,
        });

        const [createdOrder] = await db
          .insert(orders)
          .values({
            orderNumber: seedOrd.orderNumber,
            userId: studentId,
            pickupSlotId: seedOrd.slotId,
            pickupDate: seedOrd.pickupDate,
            status: seedOrd.status,
            subtotal,
            taxAmount: 0,
            totalAmount: subtotal,
            pickupCode: seedOrd.pickupCode,
            qrPayload,
            specialInstructions: 'Sample demo pre-order',
            idempotencyKey: `seed-${seedOrd.orderNumber}`,
            isDemo: true,
            completedAt: seedOrd.status === 'completed' ? createdAt : null,
            createdAt,
            updatedAt: createdAt,
          })
          .onConflictDoNothing()
          .returning();

        if (createdOrder) {
          await db.insert(orderItems).values(
            seedOrd.items.map((entry) => ({
              orderId: createdOrder.id,
              menuItemId: entry.item.id,
              itemName: entry.item.name,
              unitPrice: entry.item.price,
              quantity: entry.qty,
              lineTotal: entry.item.price * entry.qty,
            }))
          );

          await db.insert(payments).values({
            orderId: createdOrder.id,
            userId: studentId,
            method: seedOrd.method,
            status: 'success',
            amount: subtotal,
            transactionRef: `TXN-DEMO-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
            isDemoMode: true,
            createdAt,
          });

          await db.insert(orderStatusHistory).values({
            orderId: createdOrder.id,
            status: seedOrd.status,
            changedByUserId: staffId,
            note: 'Demo seed status',
            createdAt,
          });
        }
      }
    }
  }
}
