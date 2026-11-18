import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  Minus,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  ShoppingBag,
  User as UserIcon,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api.ts';
import { cn, formatCurrency, formatStatusLabel } from '../../lib/utils.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { FoodImage } from '../FoodImage.tsx';
import { OrderStatusStepper } from '../OrderStatusStepper.tsx';
import { OrderReceiptModal } from '../OrderReceiptModal.tsx';
import { CartDrawer } from './CartDrawer.tsx';
import type {
  AppNotification,
  CartState,
  Category,
  MenuItem,
  Order,
} from '../../types/canteen.ts';

type StudentView = 'menu' | 'orders' | 'notifications' | 'profile';

interface StudentDashboardProps {
  activeView: StudentView;
  setActiveView: (v: StudentView) => void;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  onCartCountChange: (count: number) => void;
  onUnreadNotifChange: (count: number) => void;
  onRequireAuth: () => void;
}

export function StudentDashboard({
  activeView,
  setActiveView,
  cartOpen,
  setCartOpen,
  onCartCountChange,
  onUnreadNotifChange,
  onRequireAuth,
}: StudentDashboardProps) {
  const { user, updateProfile, subscribeWs } = useAuth();

  // Menu state
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [maxPrice, setMaxPrice] = useState<string>('all');
  const [sortBy, setSortBy] = useState('popularity');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  // Selected dish detail modal
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);

  // Cart
  const [cart, setCart] = useState<CartState>({
    items: [],
    subtotal: 0,
    taxAmount: 0,
    totalAmount: 0,
    itemCount: 0,
  });

  // Orders & Notifications
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Profile form state
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [enrollmentId, setEnrollmentId] = useState('');
  const [phone, setPhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName || '');
      setDepartment(user.department || '');
      setEnrollmentId(user.enrollmentId || '');
      setPhone(user.phone || '');
    }
  }, [user]);

  const fetchMenu = useCallback(async () => {
    setMenuLoading(true);
    setMenuError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (selectedCategory !== 'all') params.set('category', selectedCategory);
      if (maxPrice !== 'all') params.set('maxPrice', maxPrice);
      if (sortBy) params.set('sort', sortBy);
      if (onlyAvailable) params.set('onlyAvailable', 'true');

      const res = await apiFetch<{ categories: Category[]; items: MenuItem[] }>(
        `/api/menu?${params.toString()}`
      );
      setCategories(res.categories);
      setMenuItems(res.items);
    } catch (err: any) {
      setMenuError(err?.message || 'Could not load canteen menu.');
    } finally {
      setMenuLoading(false);
    }
  }, [search, selectedCategory, maxPrice, sortBy, onlyAvailable]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMenu();
    }, 150);
    return () => clearTimeout(timer);
  }, [fetchMenu]);

  const fetchCart = useCallback(async () => {
    if (!user) {
      setCart({ items: [], subtotal: 0, taxAmount: 0, totalAmount: 0, itemCount: 0 });
      onCartCountChange(0);
      return;
    }
    try {
      const res = await apiFetch<CartState>('/api/cart');
      setCart(res);
      onCartCountChange(res.itemCount);
    } catch {
      // ignore
    }
  }, [user, onCartCountChange]);

  const fetchOrders = useCallback(async () => {
    if (!user) {
      setOrders([]);
      return;
    }
    setOrdersLoading(true);
    try {
      const res = await apiFetch<{ orders: Order[] }>('/api/orders/my');
      setOrders(res.orders);
    } catch {
      toast.error('Could not load your orders.');
    } finally {
      setOrdersLoading(false);
    }
  }, [user]);

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      onUnreadNotifChange(0);
      return;
    }
    try {
      const res = await apiFetch<{ notifications: AppNotification[] }>('/api/notifications');
      setNotifications(res.notifications);
      onUnreadNotifChange(res.notifications.filter((n) => !n.isRead).length);
    } catch {
      // ignore
    }
  }, [user, onUnreadNotifChange]);

  useEffect(() => {
    fetchCart();
    fetchOrders();
    fetchNotifications();
  }, [fetchCart, fetchOrders, fetchNotifications]);

  // Real-time WebSocket updates for menu stock & order status
  useEffect(() => {
    return subscribeWs((evt) => {
      if (evt.type === 'menu:updated') {
        fetchMenu();
        fetchCart();
      } else if (evt.type === 'order:updated') {
        fetchOrders();
        fetchNotifications();
        const updatedOrder = evt.payload?.order as Order | undefined;
        if (updatedOrder) {
          toast.info(
            `Order ${updatedOrder.orderNumber}: ${formatStatusLabel(updatedOrder.status)}`
          );
        }
      } else if (evt.type === 'notification:new') {
        fetchNotifications();
      }
    });
  }, [subscribeWs, fetchMenu, fetchCart, fetchOrders, fetchNotifications]);

  const cartQtyMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of cart.items) {
      map.set(item.menuItemId, item.quantity);
    }
    return map;
  }, [cart.items]);

  const handleAddToCart = async (item: MenuItem) => {
    if (!user) {
      onRequireAuth();
      return;
    }
    if (!item.isAvailable) {
      toast.error(`${item.name} is currently sold out.`);
      return;
    }
    try {
      const res = await apiFetch<CartState>('/api/cart/items', {
        method: 'POST',
        body: JSON.stringify({ menuItemId: item.id, quantity: 1 }),
      });
      setCart(res);
      onCartCountChange(res.itemCount);
      toast.success(`Added ${item.name} to cart`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add item.');
    }
  };

  const handleUpdateQty = async (menuItemId: number, quantity: number) => {
    if (!user) return;
    try {
      const res = await apiFetch<CartState>(`/api/cart/items/${menuItemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity }),
      });
      setCart(res);
      onCartCountChange(res.itemCount);
    } catch (err: any) {
      toast.error(err?.message || 'Could not update quantity.');
    }
  };

  const handleClearCart = async () => {
    try {
      const res = await apiFetch<CartState>('/api/cart', { method: 'DELETE' });
      setCart(res);
      onCartCountChange(0);
    } catch {
      toast.error('Failed to clear cart.');
    }
  };

  const handleOrderCreated = (order: Order) => {
    setCart({ items: [], subtotal: 0, taxAmount: 0, totalAmount: 0, itemCount: 0 });
    onCartCountChange(0);
    setCartOpen(false);
    setReceiptOrder(order);
    fetchOrders();
    fetchNotifications();
  };

  const handleCancelOrder = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await apiFetch(`/api/orders/${cancelTarget.id}/cancel`, { method: 'POST' });
      toast.success(`Order ${cancelTarget.orderNumber} cancelled.`);
      setCancelTarget(null);
      fetchOrders();
      fetchNotifications();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to cancel order.');
    } finally {
      setCancelling(false);
    }
  };

  const handleReorder = async (orderId: number) => {
    try {
      const res = await apiFetch<CartState & { skippedItems?: string[] }>(
        `/api/cart/reorder/${orderId}`,
        { method: 'POST' }
      );
      setCart(res);
      onCartCountChange(res.itemCount);
      if (res.skippedItems && res.skippedItems.length > 0) {
        toast.warning(
          `Added available items. Skipped sold-out items: ${res.skippedItems.join(', ')}`
        );
      } else {
        toast.success('Previous order items added to your cart.');
      }
      setCartOpen(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reorder.');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      onUnreadNotifChange(0);
    } catch {
      toast.error('Failed to mark notifications read.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      await updateProfile({ fullName, department, enrollmentId, phone });
      toast.success('Profile updated.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSaving(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast.success('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      toast.error(err?.message || 'Could not update password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const activeOrders = useMemo(
    () =>
      orders.filter((o) =>
        ['order_received', 'accepted', 'preparing', 'ready_for_pickup'].includes(o.status)
      ),
    [orders]
  );

  const pastOrders = useMemo(
    () =>
      orders.filter((o) => ['completed', 'rejected', 'cancelled'].includes(o.status)),
    [orders]
  );

  const todaysSpecials = useMemo(
    () => menuItems.filter((m) => m.isTodaysSpecial && m.isAvailable).slice(0, 3),
    [menuItems]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-10">
      {/* MENU VIEW */}
      {activeView === 'menu' && (
        <>
          {/* Hero Section */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-[#E7E5E0] bg-white p-6 sm:p-8">
              <div className="space-y-4">
                <p className="text-xs font-semibold tracking-wide text-[#EA580C]">
                  {user
                    ? `Welcome back, ${user.fullName} · ${user.department}`
                    : 'Main Campus Canteen · Open 08:30 AM – 05:30 PM'}
                </p>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#202124] leading-[1.15] text-balance">
                  Pre-order your campus meal and skip the counter queue.
                </h1>
                <p className="max-w-xl text-base text-[#5F6368] leading-relaxed">
                  Browse live kitchen availability, reserve a 15-minute pickup slot between
                  classes, and collect your order seamlessly with a unique QR pass.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  onClick={() => {
                    document.getElementById('canteen-menu-grid')?.scrollIntoView({
                      behavior: 'smooth',
                    });
                  }}
                >
                  Browse Menu
                  <ArrowRight className="h-4 w-4" />
                </Button>
                {user ? (
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => setActiveView('orders')}
                  >
                    Track Orders ({activeOrders.length})
                  </Button>
                ) : (
                  <Button size="lg" variant="outline" onClick={onRequireAuth}>
                    Sign In to Pre-Order
                  </Button>
                )}
              </div>

              {/* Active Order Quick Strip if Student has live order */}
              {activeOrders.length > 0 && (
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#FDBA74] bg-[#FFF4E8] px-4 py-3">
                  <div className="text-sm">
                    <span className="font-bold text-[#202124]">
                      Active Order {activeOrders[0].orderNumber}
                    </span>
                    <span className="mx-2 text-[#9A3412]">·</span>
                    <span className="font-semibold text-[#EA580C]">
                      {formatStatusLabel(activeOrders[0].status)}
                    </span>
                    <span className="ml-2 text-xs text-[#5F6368] tabular-nums">
                      Code {activeOrders[0].pickupCode}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setReceiptOrder(activeOrders[0])}
                  >
                    <QrCode className="h-4 w-4" />
                    View QR Pass
                  </Button>
                </div>
              )}
            </div>

            <div className="lg:col-span-5 rounded-2xl overflow-hidden border border-[#E7E5E0] min-h-[260px]">
              <FoodImage
                src="/src/assets/images/hero_canteen_spread_1794994427127.jpg"
                alt="Freshly prepared Smart Canteen meals on campus dining table"
                className="w-full h-full lg:h-full object-cover"
                fallbackTitle="Smart Canteen Campus Dining"
              />
            </div>
          </section>

          {/* Today's Specials Strip */}
          {todaysSpecials.length > 0 && selectedCategory === 'all' && !search && (
            <section className="space-y-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#202124]">Today’s Chef Specials</h2>
                  <p className="text-sm text-[#5F6368]">
                    Freshly prepared campus favorites ready for fast slot pickup.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {todaysSpecials.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 rounded-xl border border-[#E7E5E0] bg-white p-3.5 transition-transform hover:-translate-y-0.5"
                  >
                    <FoodImage
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-20 w-24 rounded-lg shrink-0"
                      fallbackTitle={item.name}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[#EA580C] font-semibold">
                        Today’s Special · {item.prepTimeMinutes} min
                      </p>
                      <h3 className="truncate text-base font-bold text-[#202124]">
                        {item.name}
                      </h3>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-sm font-bold text-[#202124] tabular-nums">
                          {formatCurrency(item.price)}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleAddToCart(item)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Full Menu Discovery & Filters */}
          <section id="canteen-menu-grid" className="space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-[#202124]">Canteen Menu</h2>
                <p className="text-sm text-[#5F6368]">
                  Real-time kitchen stock synced directly from the canteen counter.
                </p>
              </div>

              {/* Search & Controls */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 min-w-[220px] sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#80868B]" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search dishes..."
                    className="pl-9"
                  />
                </div>

                <select
                  aria-label="Filter by maximum price"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="h-10 rounded-lg border border-[#E7E5E0] bg-white px-3 text-sm text-[#202124] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]"
                >
                  <option value="all">Any Price</option>
                  <option value="50">Under ₹50</option>
                  <option value="80">Under ₹80</option>
                  <option value="120">Under ₹120</option>
                </select>

                <select
                  aria-label="Sort menu items"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="h-10 rounded-lg border border-[#E7E5E0] bg-white px-3 text-sm text-[#202124] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]"
                >
                  <option value="popularity">Most Popular</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="prep_time">Fastest Prep</option>
                </select>

                <button
                  type="button"
                  onClick={() => setOnlyAvailable((v) => !v)}
                  className={cn(
                    'h-10 rounded-lg border px-3 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                    onlyAvailable
                      ? 'border-[#F97316] bg-[#FFF4E8] text-[#EA580C]'
                      : 'border-[#E7E5E0] bg-white text-[#5F6368] hover:text-[#202124]'
                  )}
                >
                  In Stock Only
                </button>
              </div>
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                  selectedCategory === 'all'
                    ? 'bg-[#202124] text-white'
                    : 'bg-white border border-[#E7E5E0] text-[#5F6368] hover:text-[#202124]'
                )}
              >
                All Items
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.slug)}
                  className={cn(
                    'rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                    selectedCategory === cat.slug
                      ? 'bg-[#202124] text-white'
                      : 'bg-white border border-[#E7E5E0] text-[#5F6368] hover:text-[#202124]'
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Menu Grid States */}
            {menuError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center space-y-3">
                <p className="text-sm font-semibold text-red-800">{menuError}</p>
                <Button variant="outline" size="sm" onClick={fetchMenu}>
                  Retry Loading Menu
                </Button>
              </div>
            ) : menuLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="rounded-2xl border border-[#E7E5E0] bg-white overflow-hidden animate-pulse"
                  >
                    <div className="aspect-[4/3] bg-[#F3F2EE]" />
                    <div className="p-5 space-y-3">
                      <div className="h-3 w-1/3 rounded bg-[#F3F2EE]" />
                      <div className="h-5 w-2/3 rounded bg-[#F3F2EE]" />
                      <div className="h-8 w-full rounded bg-[#F3F2EE]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : menuItems.length === 0 ? (
              <div className="rounded-2xl border border-[#E7E5E0] bg-white py-14 px-6 text-center space-y-3">
                <p className="text-base font-bold text-[#202124]">No matching dishes found</p>
                <p className="text-sm text-[#5F6368]">
                  Try clearing your search query or switching to All Items.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setSelectedCategory('all');
                    setMaxPrice('all');
                    setOnlyAvailable(false);
                  }}
                >
                  Reset Filters
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {menuItems.map((item) => {
                  const qtyInCart = cartQtyMap.get(item.id) ?? 0;
                  return (
                    <article
                      key={item.id}
                      className={cn(
                        'flex flex-col rounded-2xl border border-[#E7E5E0] bg-white overflow-hidden transition-all duration-150',
                        item.isAvailable
                          ? 'hover:-translate-y-0.5 hover:shadow-md'
                          : 'opacity-80'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setDetailItem(item)}
                        className="relative aspect-[4/3] w-full overflow-hidden bg-[#F3F2EE] text-left cursor-pointer"
                      >
                        <FoodImage
                          src={item.imageUrl}
                          alt={item.name}
                          className={cn(
                            'h-full w-full transition-transform duration-300 hover:scale-[1.03]',
                            !item.isAvailable && 'grayscale-[60%]'
                          )}
                          fallbackTitle={item.name}
                        />
                        {!item.isAvailable && (
                          <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                            <span className="rounded-md bg-white px-3 py-1.5 text-xs font-bold text-[#202124]">
                              Sold Out Today
                            </span>
                          </div>
                        )}
                      </button>

                      <div className="flex flex-1 flex-col justify-between p-5">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-xs text-[#5F6368]">
                            <span>{item.categoryName}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{item.prepTimeMinutes} min</span>
                            {item.isFeatured && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-semibold text-[#EA580C]">Popular</span>
                              </>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => setDetailItem(item)}
                            className="text-left cursor-pointer"
                          >
                            <h3 className="text-lg font-bold text-[#202124] hover:text-[#EA580C] transition-colors">
                              {item.name}
                            </h3>
                          </button>

                          <p className="text-sm text-[#5F6368] line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                        </div>

                        <div className="mt-5 pt-4 border-t border-[#F3F2EE] flex items-center justify-between gap-3">
                          <span className="text-lg font-bold text-[#202124] tabular-nums">
                            {formatCurrency(item.price)}
                          </span>

                          {!item.isAvailable ? (
                            <Button size="sm" variant="outline" disabled>
                              Unavailable
                            </Button>
                          ) : qtyInCart > 0 ? (
                            <div className="flex items-center gap-1.5 rounded-lg border border-[#F97316] bg-[#FFF4E8] p-1">
                              <button
                                type="button"
                                onClick={() => handleUpdateQty(item.id, qtyInCart - 1)}
                                aria-label={`Remove one ${item.name}`}
                                className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-[#202124] hover:bg-[#FAFAF7] cursor-pointer"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-6 text-center text-sm font-bold text-[#EA580C] tabular-nums">
                                {qtyInCart}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateQty(item.id, qtyInCart + 1)}
                                aria-label={`Add one more ${item.name}`}
                                className="flex h-7 w-7 items-center justify-center rounded-md bg-[#F97316] text-white hover:bg-[#EA580C] cursor-pointer"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <Button size="sm" onClick={() => handleAddToCart(item)}>
                              <Plus className="h-4 w-4" />
                              Add to Cart
                            </Button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {/* ORDERS & TRACKING VIEW */}
      {activeView === 'orders' && (
        <section className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#202124]">My Orders & Live Tracking</h1>
              <p className="text-sm text-[#5F6368]">
                Track preparation status in real time, show your pickup QR, or reorder past meals.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchOrders}>
              <RefreshCw className="h-4 w-4" />
              Refresh Status
            </Button>
          </div>

          {!user ? (
            <div className="rounded-2xl border border-[#E7E5E0] bg-white p-10 text-center space-y-3">
              <p className="text-base font-bold text-[#202124]">Sign in to view your orders</p>
              <Button onClick={onRequireAuth}>Sign In</Button>
            </div>
          ) : ordersLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-40 rounded-2xl bg-white border border-[#E7E5E0] animate-pulse" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-2xl border border-[#E7E5E0] bg-white py-14 px-6 text-center space-y-3">
              <ShoppingBag className="h-8 w-8 mx-auto text-[#F97316]" />
              <h2 className="text-lg font-bold text-[#202124]">No pre-orders yet</h2>
              <p className="text-sm text-[#5F6368]">
                Place your first pre-order from the menu to receive a QR pickup pass.
              </p>
              <Button onClick={() => setActiveView('menu')}>Explore Menu</Button>
            </div>
          ) : (
            <>
              {/* Active Orders */}
              {activeOrders.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-[#202124]">
                    Active Pre-Orders ({activeOrders.length})
                  </h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {activeOrders.map((ord) => (
                      <div
                        key={ord.id}
                        className="rounded-2xl border border-[#E7E5E0] bg-white p-6 space-y-5"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 text-xs text-[#5F6368]">
                              <span className="font-mono font-semibold text-[#202124]">
                                {ord.orderNumber}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">{ord.pickupDate}</span>
                            </div>
                            <p className="mt-1 text-base font-bold text-[#202124]">
                              Pickup: {ord.pickupSlot?.label || 'Scheduled'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-[#5F6368]">Pickup Code</p>
                            <p className="font-mono text-xl font-bold text-[#EA580C] tabular-nums">
                              {ord.pickupCode}
                            </p>
                          </div>
                        </div>

                        <OrderStatusStepper status={ord.status} />

                        <div className="border-t border-[#F3F2EE] pt-3 space-y-1.5">
                          {ord.items.map((it) => (
                            <div
                              key={it.id}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-[#202124]">
                                {it.itemName} × {it.quantity}
                              </span>
                              <span className="font-semibold tabular-nums">
                                {formatCurrency(it.lineTotal)}
                              </span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between pt-2 border-t border-[#F3F2EE] text-sm font-bold">
                            <span>Total Paid</span>
                            <span className="tabular-nums">{formatCurrency(ord.totalAmount)}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          {['order_received', 'accepted'].includes(ord.status) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-700 hover:bg-red-50"
                              onClick={() => setCancelTarget(ord)}
                            >
                              <XCircle className="h-4 w-4" />
                              Cancel Order
                            </Button>
                          ) : (
                            <span className="text-xs text-[#5F6368]">
                              In kitchen — cancellation closed
                            </span>
                          )}

                          <Button size="sm" onClick={() => setReceiptOrder(ord)}>
                            <QrCode className="h-4 w-4" />
                            Show QR Pass
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Order History */}
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-[#202124]">
                  Previous Orders & Receipts ({pastOrders.length})
                </h2>
                {pastOrders.length === 0 ? (
                  <p className="text-sm text-[#5F6368]">
                    Completed and past orders will appear here.
                  </p>
                ) : (
                  <div className="rounded-2xl border border-[#E7E5E0] bg-white divide-y divide-[#E7E5E0]">
                    {pastOrders.map((ord) => (
                      <div
                        key={ord.id}
                        className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#5F6368]">
                            <span className="font-mono font-semibold text-[#202124]">
                              {ord.orderNumber}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{ord.pickupDate}</span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={cn(
                                'font-semibold',
                                ord.status === 'completed'
                                  ? 'text-emerald-700'
                                  : 'text-red-700'
                              )}
                            >
                              {formatStatusLabel(ord.status)}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-[#202124]">
                            {ord.items.map((i) => `${i.itemName} ×${i.quantity}`).join(', ')}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-base font-bold text-[#202124] tabular-nums">
                            {formatCurrency(ord.totalAmount)}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReceiptOrder(ord)}
                          >
                            Receipt
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleReorder(ord.id)}
                          >
                            Reorder
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {/* NOTIFICATIONS VIEW */}
      {activeView === 'notifications' && (
        <section className="max-w-3xl space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#202124]">Order Alerts & Notifications</h1>
              <p className="text-sm text-[#5F6368]">
                Instant updates when canteen staff accepts, prepares, or marks your order ready.
              </p>
            </div>
            {notifications.some((n) => !n.isRead) && (
              <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                <CheckCircle2 className="h-4 w-4" />
                Mark All Read
              </Button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="rounded-2xl border border-[#E7E5E0] bg-white py-14 text-center">
              <Bell className="h-8 w-8 mx-auto text-[#80868B] mb-2" />
              <p className="text-base font-bold text-[#202124]">No notifications yet</p>
              <p className="text-sm text-[#5F6368]">
                Updates about your pre-orders will appear here in real time.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#E7E5E0] bg-white divide-y divide-[#E7E5E0]">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn('p-4 sm:p-5 flex items-start justify-between gap-4', !n.isRead && 'bg-[#FFF4E8]/50')}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-[#202124]">{n.title}</p>
                    <p className="text-sm text-[#5F6368]">{n.message}</p>
                  </div>
                  <span className="text-xs text-[#80868B] whitespace-nowrap tabular-nums">
                    {new Date(n.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* PROFILE VIEW */}
      {activeView === 'profile' && user && (
        <section className="max-w-2xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-[#202124]">Account Profile</h1>
            <p className="text-sm text-[#5F6368]">
              Manage your campus identification details and security settings.
            </p>
          </div>

          <form
            onSubmit={handleSaveProfile}
            className="rounded-2xl border border-[#E7E5E0] bg-white p-6 space-y-4"
          >
            <div className="flex items-center gap-3 pb-4 border-b border-[#F3F2EE]">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF4E8] text-[#EA580C]">
                <UserIcon className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold text-[#202124]">{user.fullName}</p>
                <p className="text-xs text-[#5F6368]">
                  {user.email} · Role: {user.roleName.toUpperCase()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#202124]">
                  Full Name
                </label>
                <Input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#202124]">
                  Enrollment / Staff ID
                </label>
                <Input
                  value={enrollmentId}
                  onChange={(e) => setEnrollmentId(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#202124]">
                  Department
                </label>
                <Input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#202124]">
                  Phone Number
                </label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={profileSaving}>
                {profileSaving ? 'Saving...' : 'Save Profile'}
              </Button>
            </div>
          </form>

          <form
            onSubmit={handlePasswordChange}
            className="rounded-2xl border border-[#E7E5E0] bg-white p-6 space-y-4"
          >
            <h2 className="text-base font-bold text-[#202124]">Update Password</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#202124]">
                  Current Password (if set)
                </label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#202124]">
                  New Password
                </label>
                <Input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="outline" disabled={passwordSaving}>
                {passwordSaving ? 'Updating...' : 'Change Password'}
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Dish Detail Dialog */}
      <Dialog open={Boolean(detailItem)} onOpenChange={(o) => !o && setDetailItem(null)}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          {detailItem && (
            <>
              <div className="aspect-[4/3] w-full bg-[#F3F2EE]">
                <FoodImage
                  src={detailItem.imageUrl}
                  alt={detailItem.name}
                  className="h-full w-full"
                  fallbackTitle={detailItem.name}
                />
              </div>
              <div className="p-6 space-y-4">
                <DialogHeader>
                  <p className="text-xs font-medium text-[#5F6368]">
                    {detailItem.categoryName} · {detailItem.prepTimeMinutes} min prep ·{' '}
                    {detailItem.isAvailable ? 'Available Now' : 'Sold Out'}
                  </p>
                  <DialogTitle className="text-xl font-bold">{detailItem.name}</DialogTitle>
                  <DialogDescription className="text-sm text-[#5F6368] leading-relaxed">
                    {detailItem.description}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex items-center justify-between pt-2 border-t border-[#F3F2EE]">
                  <span className="text-2xl font-bold text-[#202124] tabular-nums">
                    {formatCurrency(detailItem.price)}
                  </span>
                  <Button
                    disabled={!detailItem.isAvailable}
                    onClick={() => {
                      handleAddToCart(detailItem);
                      setDetailItem(null);
                    }}
                  >
                    {detailItem.isAvailable ? 'Add to Cart' : 'Sold Out'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Order Confirmation Dialog */}
      <Dialog open={Boolean(cancelTarget)} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Order {cancelTarget?.orderNumber}?</DialogTitle>
            <DialogDescription>
              Since kitchen preparation has not started yet, cancelling will immediately release
              your pickup slot and refund your demo payment.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Keep Order
            </Button>
            <Button variant="destructive" disabled={cancelling} onClick={handleCancelOrder}>
              {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Receipt & QR Modal */}
      <OrderReceiptModal
        order={receiptOrder}
        open={Boolean(receiptOrder)}
        onOpenChange={(o) => !o && setReceiptOrder(null)}
      />

      {/* Slide-over Cart Drawer */}
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onUpdateQty={handleUpdateQty}
        onClearCart={handleClearCart}
        onOrderCreated={handleOrderCreated}
      />
    </div>
  );
}
