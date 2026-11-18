export type UserRole = 'student' | 'staff' | 'admin';

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  roleName: UserRole;
  isActive: boolean;
  isDemo: boolean;
  fullName: string;
  department: string;
  enrollmentId: string;
  phone: string;
  avatarUrl: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuItem {
  id: number;
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  prepTimeMinutes: number;
  isAvailable: boolean;
  isFeatured: boolean;
  isTodaysSpecial: boolean;
  isVeg: boolean;
  popularityScore: number;
  isDemo: boolean;
}

export interface CartItem {
  id: number;
  menuItemId: number;
  name: string;
  price: number;
  imageUrl: string;
  prepTimeMinutes: number;
  isAvailable: boolean;
  quantity: number;
  lineTotal: number;
}

export interface CartState {
  items: CartItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  itemCount: number;
}

export interface PickupSlot {
  id: number;
  label: string;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  isActive: boolean;
  date?: string;
  bookedCount?: number;
  remainingCapacity?: number;
  isFull?: boolean;
}

export interface OrderItem {
  id: number;
  orderId: number;
  menuItemId: number | null;
  itemName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface PaymentRecord {
  id: number;
  orderId: number;
  method: string;
  status: string;
  amount: number;
  transactionRef: string;
  isDemoMode: boolean;
  createdAt: string;
}

export interface OrderStatusHistoryEntry {
  id: number;
  orderId: number;
  status: string;
  note: string;
  createdAt: string;
}

export interface Order {
  id: number;
  orderNumber: string;
  userId: number;
  pickupSlotId: number;
  pickupDate: string;
  status:
    | 'order_received'
    | 'accepted'
    | 'preparing'
    | 'ready_for_pickup'
    | 'completed'
    | 'rejected'
    | 'cancelled';
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  pickupCode: string;
  qrPayload: string;
  specialInstructions: string;
  isDemo: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  pickupSlot: PickupSlot | null;
  items: OrderItem[];
  payment: PaymentRecord | null;
  statusHistory?: OrderStatusHistoryEntry[];
  customer?: {
    fullName: string;
    email: string;
    enrollmentId?: string;
    department?: string;
  };
}

export interface AppNotification {
  id: number;
  userId: number;
  orderId: number | null;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface AdminAnalytics {
  kpis: {
    totalUsers: number;
    activeUsers: number;
    totalOrders: number;
    todaysRevenue: number;
    totalRevenue: number;
    pendingOrders: number;
    completedOrders: number;
  };
  trend: { date: string; label: string; revenue: number; orders: number }[];
  categoryBreakdown: { name: string; revenue: number; count: number }[];
  topItems: { name: string; quantity: number; revenue: number }[];
}
