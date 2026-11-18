import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CalendarClock,
  Download,
  Edit3,
  LayoutDashboard,
  Plus,
  Printer,
  Receipt,
  Trash2,
  Upload,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, getAuthToken } from '../../lib/api.ts';
import { cn, formatCurrency, formatStatusLabel } from '../../lib/utils.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Switch } from '../ui/switch.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { FoodImage } from '../FoodImage.tsx';
import { OrderReceiptModal } from '../OrderReceiptModal.tsx';
import type {
  AdminAnalytics,
  Category,
  MenuItem,
  Order,
  PickupSlot,
  UserRole,
} from '../../types/canteen.ts';

type AdminSection = 'analytics' | 'menu' | 'orders' | 'users' | 'slots';

interface AdminUserRow {
  id: number;
  uid: string;
  email: string;
  roleName: UserRole;
  isActive: boolean;
  isDemo: boolean;
  createdAt: string;
  fullName: string | null;
  department: string | null;
  enrollmentId: string | null;
  phone: string | null;
}

export function AdminDashboard() {
  const { user: currentUser, subscribeWs } = useAuth();
  const [section, setSection] = useState<AdminSection>('analytics');

  // Analytics & Reports
  const [range, setRange] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [scope, setScope] = useState<'all' | 'real' | 'demo'>('all');
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // Menu & Categories
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<MenuItem | null>(null);

  // Food Item Form
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formPrepTime, setFormPrepTime] = useState('10');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formAvailable, setFormAvailable] = useState(true);
  const [formFeatured, setFormFeatured] = useState(false);
  const [formSpecial, setFormSpecial] = useState(false);
  const [itemSaving, setItemSaving] = useState(false);

  // Orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  // Users
  const [usersList, setUsersList] = useState<AdminUserRow[]>([]);

  // Pickup Slots
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [newSlotLabel, setNewSlotLabel] = useState('');
  const [newSlotStart, setNewSlotStart] = useState('15:00');
  const [newSlotEnd, setNewSlotEnd] = useState('15:15');
  const [newSlotCapacity, setNewSlotCapacity] = useState('25');

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await apiFetch<AdminAnalytics>(
        `/api/admin/analytics?range=${range}&scope=${scope}`
      );
      setAnalytics(res);
    } catch {
      toast.error('Failed to load analytics.');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [range, scope]);

  const fetchMenuAndCats = useCallback(async () => {
    try {
      const [menuRes, catRes] = await Promise.all([
        apiFetch<{ items: MenuItem[] }>('/api/menu'),
        apiFetch<{ categories: Category[] }>('/api/categories'),
      ]);
      setMenuItems(menuRes.items);
      setCategories(catRes.categories);
    } catch {
      toast.error('Failed to load menu catalog.');
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiFetch<{ orders: Order[] }>('/api/admin/orders');
      setOrders(res.orders);
    } catch {
      toast.error('Failed to load orders.');
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await apiFetch<{ users: AdminUserRow[] }>('/api/admin/users');
      setUsersList(res.users);
    } catch {
      toast.error('Failed to load users.');
    }
  }, []);

  const fetchSlots = useCallback(async () => {
    try {
      const res = await apiFetch<{ slots: PickupSlot[] }>('/api/admin/slots');
      setSlots(res.slots);
    } catch {
      toast.error('Failed to load pickup slots.');
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    fetchMenuAndCats();
    fetchOrders();
    fetchUsers();
    fetchSlots();
  }, [fetchMenuAndCats, fetchOrders, fetchUsers, fetchSlots]);

  useEffect(() => {
    return subscribeWs((evt) => {
      if (evt.type === 'order:created' || evt.type === 'order:updated') {
        fetchAnalytics();
        fetchOrders();
      } else if (evt.type === 'menu:updated') {
        fetchMenuAndCats();
      }
    });
  }, [subscribeWs, fetchAnalytics, fetchOrders, fetchMenuAndCats]);

  const openCreateItem = () => {
    setEditingItem(null);
    setFormName('');
    setFormDesc('');
    setFormPrice('');
    setFormCategoryId(categories[0]?.id ? String(categories[0].id) : '');
    setFormPrepTime('10');
    setFormImageUrl('');
    setFormAvailable(true);
    setFormFeatured(false);
    setFormSpecial(false);
    setItemDialogOpen(true);
  };

  const openEditItem = (item: MenuItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormDesc(item.description);
    setFormPrice(String(item.price));
    setFormCategoryId(String(item.categoryId));
    setFormPrepTime(String(item.prepTimeMinutes));
    setFormImageUrl(item.imageUrl);
    setFormAvailable(item.isAvailable);
    setFormFeatured(item.isFeatured);
    setFormSpecial(item.isTodaysSpecial);
    setItemDialogOpen(true);
  };

  // Client-side image resize + base64 conversion for reliable DB storage
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (JPG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 720;
        const scale = img.width > maxW ? maxW / img.width : 1;
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          setFormImageUrl(dataUrl);
          toast.success('Image uploaded and optimized.');
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setItemSaving(true);
    try {
      const payload = {
        categoryId: Number(formCategoryId),
        name: formName.trim(),
        description: formDesc.trim(),
        price: Number(formPrice),
        prepTimeMinutes: Number(formPrepTime) || 10,
        imageUrl: formImageUrl.trim(),
        isAvailable: formAvailable,
        isFeatured: formFeatured,
        isTodaysSpecial: formSpecial,
      };

      if (editingItem) {
        await apiFetch(`/api/admin/menu/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success(`Updated ${payload.name}`);
      } else {
        await apiFetch('/api/admin/menu', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success(`Added ${payload.name} to menu`);
      }

      setItemDialogOpen(false);
      await fetchMenuAndCats();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save food item.');
    } finally {
      setItemSaving(false);
    }
  };

  const handleDeleteMenuItem = async () => {
    if (!deleteConfirmItem) return;
    try {
      await apiFetch(`/api/admin/menu/${deleteConfirmItem.id}`, { method: 'DELETE' });
      toast.success(`Deleted ${deleteConfirmItem.name}`);
      setDeleteConfirmItem(null);
      await fetchMenuAndCats();
    } catch (err: any) {
      toast.error(err?.message || 'Could not delete item.');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await apiFetch('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ name: newCatName.trim() }),
      });
      toast.success(`Added category "${newCatName.trim()}"`);
      setNewCatName('');
      await fetchMenuAndCats();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create category.');
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    try {
      await apiFetch(`/api/admin/categories/${cat.id}`, { method: 'DELETE' });
      toast.success(`Removed category ${cat.name}`);
      await fetchMenuAndCats();
    } catch (err: any) {
      toast.error(err?.message || 'Cannot delete category.');
    }
  };

  const handleUpdateUser = async (
    userId: number,
    patch: { roleName?: UserRole; isActive?: boolean }
  ) => {
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      toast.success('User account updated.');
      await fetchUsers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update user.');
    }
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlotLabel.trim()) return;
    try {
      await apiFetch('/api/admin/slots', {
        method: 'POST',
        body: JSON.stringify({
          label: newSlotLabel.trim(),
          startTime: newSlotStart,
          endTime: newSlotEnd,
          maxCapacity: Number(newSlotCapacity) || 25,
        }),
      });
      toast.success('Pickup slot created.');
      setNewSlotLabel('');
      await fetchSlots();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create slot.');
    }
  };

  const handleUpdateSlot = async (
    slotId: number,
    patch: { isActive?: boolean; maxCapacity?: number }
  ) => {
    try {
      await apiFetch(`/api/admin/slots/${slotId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      toast.success('Pickup slot updated.');
      await fetchSlots();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update slot.');
    }
  };

  const handleExportCsv = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/admin/reports/export?scope=${scope}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smart-canteen-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('CSV report downloaded.');
    } catch {
      toast.error('Failed to download CSV report.');
    }
  };

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((o) => {
      if (scope === 'real' && o.isDemo) return false;
      if (scope === 'demo' && !o.isDemo) return false;
      if (!q) return true;
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.pickupCode.toLowerCase().includes(q) ||
        (o.customer?.fullName || '').toLowerCase().includes(q)
      );
    });
  }, [orders, orderSearch, scope]);

  const navItems: { id: AdminSection; label: string; icon: any }[] = [
    { id: 'analytics', label: 'Analytics & Reports', icon: LayoutDashboard },
    { id: 'menu', label: 'Menu & Categories', icon: UtensilsCrossed },
    { id: 'orders', label: 'Order History', icon: Receipt },
    { id: 'users', label: 'Users & Roles', icon: Users },
    { id: 'slots', label: 'Pickup Slots', icon: CalendarClock },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Sidebar Navigation */}
        <aside className="w-full lg:w-64 shrink-0 rounded-2xl border border-[#E7E5E0] bg-white p-3 no-print">
          <p className="px-3 py-2 text-xs font-semibold text-[#5F6368]">
            Admin Console
          </p>
          <nav className="flex lg:flex-col gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                    active
                      ? 'bg-[#FFF4E8] text-[#EA580C]'
                      : 'text-[#5F6368] hover:bg-[#FAFAF7] hover:text-[#202124]'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Workspace Viewport */}
        <div className="flex-1 min-w-0 w-full space-y-6">
          {/* ANALYTICS & REPORTS */}
          {section === 'analytics' && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#202124]">
                    Canteen Revenue & Operations
                  </h1>
                  <p className="text-sm text-[#5F6368]">
                    Monitor campus sales performance, order throughput, and export reports.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 no-print">
                  <select
                    aria-label="Data scope"
                    value={scope}
                    onChange={(e) => setScope(e.target.value as any)}
                    className="h-9 rounded-lg border border-[#E7E5E0] bg-white px-2.5 text-xs font-semibold text-[#202124]"
                  >
                    <option value="all">All Data (Live + Demo)</option>
                    <option value="real">Live Orders Only</option>
                    <option value="demo">Demo Seed Only</option>
                  </select>

                  <div className="flex rounded-lg bg-[#F3F2EE] p-0.5 text-xs font-semibold">
                    {(['daily', 'weekly', 'monthly'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRange(r)}
                        className={cn(
                          'rounded-md px-3 py-1.5 capitalize cursor-pointer',
                          range === r ? 'bg-white text-[#202124] shadow-sm' : 'text-[#5F6368]'
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>

                  <Button size="sm" variant="outline" onClick={handleExportCsv}>
                    <Download className="h-4 w-4" />
                    Export CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => window.print()}>
                    <Printer className="h-4 w-4" />
                    Print PDF
                  </Button>
                </div>
              </div>

              {/* KPI Cards */}
              {analyticsLoading || !analytics ? (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div
                      key={n}
                      className="h-24 rounded-xl border border-[#E7E5E0] bg-white animate-pulse"
                    />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="rounded-xl border border-[#E7E5E0] bg-white p-4">
                      <p className="text-xs font-medium text-[#5F6368]">Total Users</p>
                      <p className="mt-1 text-2xl font-bold text-[#202124] tabular-nums">
                        {analytics.kpis.totalUsers}
                      </p>
                      <p className="mt-0.5 text-xs text-[#5F6368] tabular-nums">
                        {analytics.kpis.activeUsers} active
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#E7E5E0] bg-white p-4">
                      <p className="text-xs font-medium text-[#5F6368]">Total Orders</p>
                      <p className="mt-1 text-2xl font-bold text-[#202124] tabular-nums">
                        {analytics.kpis.totalOrders}
                      </p>
                      <p className="mt-0.5 text-xs text-[#5F6368] tabular-nums">
                        All scoped statuses
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#E7E5E0] bg-white p-4">
                      <p className="text-xs font-medium text-[#5F6368]">Today's Revenue</p>
                      <p className="mt-1 text-2xl font-bold text-[#EA580C] tabular-nums">
                        {formatCurrency(analytics.kpis.todaysRevenue)}
                      </p>
                      <p className="mt-0.5 text-xs text-[#5F6368] tabular-nums">
                        Total {formatCurrency(analytics.kpis.totalRevenue)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#E7E5E0] bg-white p-4">
                      <p className="text-xs font-medium text-[#5F6368]">Pending Orders</p>
                      <p className="mt-1 text-2xl font-bold text-amber-700 tabular-nums">
                        {analytics.kpis.pendingOrders}
                      </p>
                      <p className="mt-0.5 text-xs text-[#5F6368]">Active kitchen queue</p>
                    </div>
                    <div className="rounded-xl border border-[#E7E5E0] bg-white p-4">
                      <p className="text-xs font-medium text-[#5F6368]">Completed Orders</p>
                      <p className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
                        {analytics.kpis.completedOrders}
                      </p>
                      <p className="mt-0.5 text-xs text-[#5F6368]">Verified pickups</p>
                    </div>
                  </div>

                  {/* Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-7 rounded-2xl border border-[#E7E5E0] bg-white p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-[#202124]">
                          Revenue Trend ({range})
                        </h2>
                        <span className="text-xs text-[#5F6368]">INR (₹)</span>
                      </div>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.trend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F2EE" />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 11, fill: '#5F6368' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fontSize: 11, fill: '#5F6368' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              contentStyle={{
                                borderRadius: '8px',
                                border: '1px solid #E7E5E0',
                                fontSize: '12px',
                              }}
                            />
                            <Bar dataKey="revenue" fill="#F97316" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="lg:col-span-5 rounded-2xl border border-[#E7E5E0] bg-white p-5 space-y-4">
                      <h2 className="text-base font-bold text-[#202124]">
                        Sales by Category
                      </h2>
                      {analytics.categoryBreakdown.length === 0 ? (
                        <p className="text-sm text-[#5F6368] py-12 text-center">
                          No category sales recorded in this filter scope yet.
                        </p>
                      ) : (
                        <div className="h-64 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={analytics.categoryBreakdown}
                              layout="vertical"
                              margin={{ left: 12 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#F3F2EE" />
                              <XAxis type="number" tick={{ fontSize: 11, fill: '#5F6368' }} />
                              <YAxis
                                type="category"
                                dataKey="name"
                                width={86}
                                tick={{ fontSize: 11, fill: '#202124' }}
                              />
                              <Tooltip
                                contentStyle={{
                                  borderRadius: '8px',
                                  border: '1px solid #E7E5E0',
                                  fontSize: '12px',
                                }}
                              />
                              <Bar dataKey="revenue" fill="#202124" radius={[0, 6, 6, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Top Selling Dishes */}
                  <div className="rounded-2xl border border-[#E7E5E0] bg-white overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#E7E5E0]">
                      <h2 className="text-base font-bold text-[#202124]">Top Selling Dishes</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[#FAFAF7] text-xs text-[#5F6368]">
                          <tr>
                            <th className="px-5 py-3 text-left font-semibold">Dish Name</th>
                            <th className="px-5 py-3 text-right font-semibold">Units Sold</th>
                            <th className="px-5 py-3 text-right font-semibold">Revenue</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F3F2EE]">
                          {analytics.topItems.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="px-5 py-8 text-center text-[#5F6368]">
                                No item sales in this scope yet.
                              </td>
                            </tr>
                          ) : (
                            analytics.topItems.map((it) => (
                              <tr key={it.name} className="hover:bg-[#FAFAF7]">
                                <td className="px-5 py-3 font-semibold text-[#202124]">
                                  {it.name}
                                </td>
                                <td className="px-5 py-3 text-right tabular-nums">
                                  {it.quantity}
                                </td>
                                <td className="px-5 py-3 text-right font-semibold tabular-nums">
                                  {formatCurrency(it.revenue)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* MENU & CATEGORIES */}
          {section === 'menu' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#202124]">Menu & Categories</h1>
                  <p className="text-sm text-[#5F6368]">
                    Add, edit, or delete dishes, upload food photos, and manage categories.
                  </p>
                </div>
                <Button onClick={openCreateItem}>
                  <Plus className="h-4 w-4" />
                  Add Food Item
                </Button>
              </div>

              {/* Categories Bar */}
              <div className="rounded-2xl border border-[#E7E5E0] bg-white p-5 space-y-4">
                <h2 className="text-base font-bold text-[#202124]">Food Categories</h2>
                <form onSubmit={handleAddCategory} className="flex gap-2 max-w-md">
                  <Input
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="New category name (e.g., Combos)"
                  />
                  <Button type="submit" variant="outline">
                    Add
                  </Button>
                </form>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 rounded-lg border border-[#E7E5E0] bg-[#FAFAF7] px-3 py-1.5 text-sm font-medium"
                    >
                      <span>{c.name}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(c)}
                        aria-label={`Delete category ${c.name}`}
                        className="text-[#80868B] hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Menu Catalog Table */}
              <div className="rounded-2xl border border-[#E7E5E0] bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#FAFAF7] text-xs text-[#5F6368] border-b border-[#E7E5E0]">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Item</th>
                        <th className="px-4 py-3 text-left font-semibold">Category</th>
                        <th className="px-4 py-3 text-right font-semibold">Price</th>
                        <th className="px-4 py-3 text-left font-semibold">Status</th>
                        <th className="px-4 py-3 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3F2EE]">
                      {menuItems.map((item) => (
                        <tr key={item.id} className="hover:bg-[#FAFAF7]">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <FoodImage
                                src={item.imageUrl}
                                alt={item.name}
                                className="h-10 w-12 rounded-md shrink-0"
                                fallbackTitle={item.name}
                              />
                              <div>
                                <p className="font-semibold text-[#202124]">{item.name}</p>
                                <p className="text-xs text-[#5F6368]">
                                  {item.prepTimeMinutes}m prep
                                  {item.isTodaysSpecial ? ' · Special' : ''}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[#5F6368]">{item.categoryName}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">
                            {formatCurrency(item.price)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'text-xs font-semibold',
                                item.isAvailable ? 'text-emerald-700' : 'text-red-700'
                              )}
                            >
                              {item.isAvailable ? 'Available' : 'Sold Out'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditItem(item)}
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-700 hover:bg-red-50"
                                onClick={() => setDeleteConfirmItem(item)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ORDER HISTORY */}
          {section === 'orders' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-[#202124]">Order History</h1>
                  <p className="text-sm text-[#5F6368]">
                    Complete ledger of student and staff canteen orders.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Search Order ID, code, student..."
                    className="w-64"
                  />
                  <Button variant="outline" size="sm" onClick={handleExportCsv}>
                    <Download className="h-4 w-4" />
                    CSV
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-[#E7E5E0] bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#FAFAF7] text-xs text-[#5F6368] border-b border-[#E7E5E0]">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Order</th>
                        <th className="px-4 py-3 text-left font-semibold">Customer</th>
                        <th className="px-4 py-3 text-left font-semibold">Slot</th>
                        <th className="px-4 py-3 text-left font-semibold">Status</th>
                        <th className="px-4 py-3 text-right font-semibold">Amount</th>
                        <th className="px-4 py-3 text-right font-semibold">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3F2EE]">
                      {filteredOrders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-[#FAFAF7]">
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs font-semibold text-[#202124]">
                              {ord.orderNumber}
                            </p>
                            <p className="text-xs text-[#5F6368] tabular-nums">
                              Code {ord.pickupCode} · {ord.isDemo ? 'Demo' : 'Live'}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-[#202124]">
                              {ord.customer?.fullName}
                            </p>
                            <p className="text-xs text-[#5F6368]">{ord.customer?.email}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-[#5F6368] tabular-nums">
                            {ord.pickupDate} · {ord.pickupSlot?.label}
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold">
                            {formatStatusLabel(ord.status)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">
                            {formatCurrency(ord.totalAmount)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setReceiptOrder(ord)}
                            >
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* USERS & ROLES */}
          {section === 'users' && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-[#202124]">Users & Role Access</h1>
                <p className="text-sm text-[#5F6368]">
                  Assign Student, Canteen Staff, or Admin permissions and manage account status.
                </p>
              </div>

              <div className="rounded-2xl border border-[#E7E5E0] bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#FAFAF7] text-xs text-[#5F6368] border-b border-[#E7E5E0]">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">User</th>
                        <th className="px-4 py-3 text-left font-semibold">Department / ID</th>
                        <th className="px-4 py-3 text-left font-semibold">Role</th>
                        <th className="px-4 py-3 text-left font-semibold">Active</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3F2EE]">
                      {usersList.map((u) => {
                        const isSelf = currentUser?.id === u.id;
                        return (
                          <tr key={u.id} className="hover:bg-[#FAFAF7]">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-[#202124]">
                                {u.fullName || u.email}
                              </p>
                              <p className="text-xs text-[#5F6368]">
                                {u.email} {u.isDemo ? '· Demo Account' : ''}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-xs text-[#5F6368]">
                              {u.department || '—'} {u.enrollmentId ? `· ${u.enrollmentId}` : ''}
                            </td>
                            <td className="px-4 py-3">
                              <select
                                aria-label={`Role for ${u.email}`}
                                value={u.roleName}
                                disabled={isSelf}
                                onChange={(e) =>
                                  handleUpdateUser(u.id, {
                                    roleName: e.target.value as UserRole,
                                  })
                                }
                                className="h-9 rounded-lg border border-[#E7E5E0] bg-white px-2.5 text-xs font-semibold text-[#202124]"
                              >
                                <option value="student">Student / Staff</option>
                                <option value="staff">Canteen Staff</option>
                                <option value="admin">Admin</option>
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <Switch
                                checked={u.isActive}
                                disabled={isSelf}
                                onCheckedChange={(checked) =>
                                  handleUpdateUser(u.id, { isActive: checked })
                                }
                                aria-label={`Toggle active status for ${u.email}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* PICKUP SLOTS */}
          {section === 'slots' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#202124]">Pickup Slot Management</h1>
                <p className="text-sm text-[#5F6368]">
                  Configure 15-minute pickup windows and per-slot capacity limits to avoid counter crowding.
                </p>
              </div>

              <form
                onSubmit={handleAddSlot}
                className="rounded-2xl border border-[#E7E5E0] bg-white p-5 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
              >
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold">Slot Label</label>
                  <Input
                    required
                    placeholder="03:00 PM - 03:15 PM"
                    value={newSlotLabel}
                    onChange={(e) => setNewSlotLabel(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Start (24h)</label>
                  <Input
                    type="time"
                    required
                    value={newSlotStart}
                    onChange={(e) => setNewSlotStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">End (24h)</label>
                  <Input
                    type="time"
                    required
                    value={newSlotEnd}
                    onChange={(e) => setNewSlotEnd(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-semibold">Max Orders</label>
                    <Input
                      type="number"
                      min={1}
                      max={200}
                      value={newSlotCapacity}
                      onChange={(e) => setNewSlotCapacity(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="self-end">
                    Add
                  </Button>
                </div>
              </form>

              <div className="rounded-2xl border border-[#E7E5E0] bg-white divide-y divide-[#F3F2EE]">
                {slots.map((slot) => (
                  <div
                    key={slot.id}
                    className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div>
                      <p className="text-sm font-bold text-[#202124] tabular-nums">
                        {slot.label}
                      </p>
                      <p className="text-xs text-[#5F6368] tabular-nums">
                        {slot.startTime} – {slot.endTime} · Capacity: {slot.maxCapacity} orders
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleUpdateSlot(slot.id, {
                            maxCapacity: slot.maxCapacity + 5,
                          })
                        }
                      >
                        +5 Cap
                      </Button>
                      <Switch
                        checked={slot.isActive}
                        onCheckedChange={(checked) =>
                          handleUpdateSlot(slot.id, { isActive: checked })
                        }
                        aria-label={`Toggle slot ${slot.label}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Food Item Modal */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? `Edit ${editingItem.name}` : 'Add New Menu Item'}
            </DialogTitle>
            <DialogDescription>
              Configure dish details, pricing, category, and upload a food photograph.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveMenuItem} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold">Dish Name</label>
                <Input
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Paneer Butter Masala Bowl"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">Category</label>
                <select
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[#E7E5E0] bg-white px-3 text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold">Description</label>
              <Input
                required
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Freshly prepared with..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold">Price (₹ INR)</label>
                <Input
                  type="number"
                  min={1}
                  step="0.5"
                  required
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">Prep Time (min)</label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  required
                  value={formPrepTime}
                  onChange={(e) => setFormPrepTime(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold">
                Food Image (Upload File or Path)
              </label>
              <div className="flex items-center gap-2">
                <Input
                  value={formImageUrl}
                  onChange={(e) => setFormImageUrl(e.target.value)}
                  placeholder="/src/assets/images/..."
                  className="flex-1"
                />
                <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-[#E7E5E0] bg-white px-3 text-xs font-semibold hover:bg-[#FAFAF7] whitespace-nowrap shrink-0">
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleImageUpload}
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5 pt-1 text-xs font-semibold">
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={formAvailable} onCheckedChange={setFormAvailable} />
                Available Now
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={formFeatured} onCheckedChange={setFormFeatured} />
                Featured
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={formSpecial} onCheckedChange={setFormSpecial} />
                Today's Special
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setItemDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={itemSaving}>
                {itemSaving ? 'Saving...' : editingItem ? 'Save Changes' : 'Create Dish'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Item Confirmation */}
      <Dialog
        open={Boolean(deleteConfirmItem)}
        onOpenChange={(o) => !o && setDeleteConfirmItem(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deleteConfirmItem?.name}?</DialogTitle>
            <DialogDescription>
              This removes the dish from the active canteen menu. Existing historical order
              receipts keep their snapshot item name and price.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmItem(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteMenuItem}>
              Delete Dish
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <OrderReceiptModal
        order={receiptOrder}
        open={Boolean(receiptOrder)}
        onOpenChange={(o) => !o && setReceiptOrder(null)}
      />
    </div>
  );
}
