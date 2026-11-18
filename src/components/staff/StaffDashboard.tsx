import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChefHat,
  Clock,
  PackageCheck,
  QrCode,
  RefreshCw,
  Search,
  Utensils,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api.ts';
import { cn, formatCurrency, formatStatusLabel } from '../../lib/utils.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Switch } from '../ui/switch.tsx';
import { FoodImage } from '../FoodImage.tsx';
import type { MenuItem, Order } from '../../types/canteen.ts';

type StaffTab = 'queue' | 'availability';
type QueueFilter = 'active' | 'order_received' | 'preparing' | 'ready_for_pickup' | 'completed';

export function StaffDashboard() {
  const { subscribeWs } = useAuth();
  const [tab, setTab] = useState<StaffTab>('queue');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('active');
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);

  // QR / Pickup verification bar
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean;
    message: string;
    order?: Order;
  } | null>(null);

  // Menu search
  const [menuSearch, setMenuSearch] = useState('');

  const fetchStaffOrders = useCallback(async () => {
    try {
      const res = await apiFetch<{ orders: Order[] }>('/api/staff/orders');
      setOrders(res.orders);
    } catch {
      toast.error('Failed to load kitchen queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMenu = useCallback(async () => {
    try {
      const res = await apiFetch<{ items: MenuItem[] }>('/api/menu');
      setMenuItems(res.items);
    } catch {
      toast.error('Failed to load menu availability.');
    }
  }, []);

  useEffect(() => {
    fetchStaffOrders();
    fetchMenu();
  }, [fetchStaffOrders, fetchMenu]);

  // Real-time WebSocket listener for incoming student orders & updates
  useEffect(() => {
    return subscribeWs((evt) => {
      if (evt.type === 'order:created') {
        fetchStaffOrders();
        toast.info(`New pre-order arrived: ${evt.payload?.order?.orderNumber || ''}`);
      } else if (evt.type === 'order:updated') {
        fetchStaffOrders();
      } else if (evt.type === 'menu:updated') {
        fetchMenu();
      }
    });
  }, [subscribeWs, fetchStaffOrders, fetchMenu]);

  const handleStatusChange = async (orderId: number, status: string) => {
    setUpdatingOrderId(orderId);
    try {
      await apiFetch(`/api/staff/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast.success(`Order updated to ${formatStatusLabel(status)}`);
      await fetchStaffOrders();
    } catch (err: any) {
      toast.error(err?.message || 'Could not update status.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleVerifyPickup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim()) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await apiFetch<{ verified: boolean; message: string; order: Order }>(
        '/api/staff/verify-pickup',
        {
          method: 'POST',
          body: JSON.stringify({ code: verifyCode.trim() }),
        }
      );
      setVerifyResult({ ok: true, message: res.message, order: res.order });
      toast.success(res.message);
      setVerifyCode('');
      await fetchStaffOrders();
    } catch (err: any) {
      const msg = err?.message || 'Pickup verification failed.';
      setVerifyResult({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setVerifying(false);
    }
  };

  const handleToggleStock = async (item: MenuItem) => {
    try {
      const next = !item.isAvailable;
      setMenuItems((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, isAvailable: next } : m))
      );
      await apiFetch(`/api/staff/menu/${item.id}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ isAvailable: next }),
      });
      toast.success(`${item.name} marked ${next ? 'Available' : 'Sold Out'}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update stock.');
      fetchMenu();
    }
  };

  const stats = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayOrders = orders.filter(
      (o) => new Date(o.createdAt).toISOString().slice(0, 10) === todayIso
    );
    return {
      dailyCount: todayOrders.length,
      incoming: orders.filter((o) => o.status === 'order_received').length,
      preparing: orders.filter((o) => ['accepted', 'preparing'].includes(o.status)).length,
      ready: orders.filter((o) => o.status === 'ready_for_pickup').length,
      completed: orders.filter((o) => o.status === 'completed').length,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (queueFilter === 'active') {
      return orders.filter((o) =>
        ['order_received', 'accepted', 'preparing', 'ready_for_pickup'].includes(o.status)
      );
    }
    if (queueFilter === 'preparing') {
      return orders.filter((o) => ['accepted', 'preparing'].includes(o.status));
    }
    if (queueFilter === 'completed') {
      return orders.filter((o) => ['completed', 'rejected', 'cancelled'].includes(o.status));
    }
    return orders.filter((o) => o.status === queueFilter);
  }, [orders, queueFilter]);

  const filteredMenu = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    if (!q) return menuItems;
    return menuItems.filter(
      (m) =>
        m.name.toLowerCase().includes(q) || m.categoryName.toLowerCase().includes(q)
    );
  }, [menuItems, menuSearch]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Bar Summary & Mode Switch */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#202124]">Canteen Kitchen & Counter</h1>
          <p className="text-sm text-[#5F6368]">
            Manage incoming pre-orders, verify pickup QR codes, and toggle live dish stock.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-[#F3F2EE] p-1">
            <button
              type="button"
              onClick={() => setTab('queue')}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                tab === 'queue' ? 'bg-white text-[#202124] shadow-sm' : 'text-[#5F6368]'
              )}
            >
              Order Queue ({stats.incoming + stats.preparing + stats.ready})
            </button>
            <button
              type="button"
              onClick={() => setTab('availability')}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                tab === 'availability'
                  ? 'bg-white text-[#202124] shadow-sm'
                  : 'text-[#5F6368]'
              )}
            >
              Menu Stock ({menuItems.filter((m) => m.isAvailable).length}/{menuItems.length})
            </button>
          </div>
          <Button variant="outline" size="icon" onClick={fetchStaffOrders} aria-label="Refresh orders">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Today's Orders", value: stats.dailyCount, accent: 'text-[#202124]' },
          { label: 'New Incoming', value: stats.incoming, accent: 'text-[#EA580C]' },
          { label: 'Preparing', value: stats.preparing, accent: 'text-amber-700' },
          { label: 'Ready at Counter', value: stats.ready, accent: 'text-emerald-700' },
          { label: 'Completed', value: stats.completed, accent: 'text-[#5F6368]' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-[#E7E5E0] bg-white px-4 py-3.5"
          >
            <p className="text-xs font-medium text-[#5F6368]">{kpi.label}</p>
            <p className={cn('mt-1 text-2xl font-bold tabular-nums', kpi.accent)}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* Instant QR / Pickup Code Verifier */}
      <section className="rounded-2xl border border-[#E7E5E0] bg-white p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-[#F97316]" />
            <h2 className="text-base font-bold text-[#202124]">
              Verify Pickup Code or Scan QR Payload
            </h2>
          </div>
          <span className="text-xs text-[#5F6368]">
            Prevents duplicate collections automatically
          </span>
        </div>

        <form onSubmit={handleVerifyPickup} className="flex flex-col sm:flex-row gap-2.5">
          <Input
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value)}
            placeholder="Enter Pickup Code (e.g., SC7394), Order ID, or paste QR payload..."
            className="flex-1 font-mono"
          />
          <Button type="submit" disabled={verifying || !verifyCode.trim()}>
            <PackageCheck className="h-4 w-4" />
            {verifying ? 'Verifying...' : 'Verify & Complete Pickup'}
          </Button>
        </form>

        {verifyResult && (
          <div
            className={cn(
              'flex items-start gap-2.5 rounded-xl border p-3.5 text-sm',
              verifyResult.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            )}
          >
            {verifyResult.ok ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />
            ) : (
              <XCircle className="h-5 w-5 shrink-0 text-red-700" />
            )}
            <div>
              <p className="font-semibold">{verifyResult.message}</p>
              {verifyResult.order && (
                <p className="text-xs mt-1">
                  Customer: {verifyResult.order.customer?.fullName} · Items:{' '}
                  {verifyResult.order.items
                    .map((i) => `${i.itemName} ×${i.quantity}`)
                    .join(', ')}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* QUEUE TAB */}
      {tab === 'queue' && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { id: 'active', label: 'All Active' },
              { id: 'order_received', label: `New (${stats.incoming})` },
              { id: 'preparing', label: `Preparing (${stats.preparing})` },
              { id: 'ready_for_pickup', label: `Ready (${stats.ready})` },
              { id: 'completed', label: 'Completed / Closed' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setQueueFilter(f.id as QueueFilter)}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                  queueFilter === f.id
                    ? 'bg-[#202124] text-white'
                    : 'bg-white border border-[#E7E5E0] text-[#5F6368] hover:text-[#202124]'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-56 rounded-2xl border border-[#E7E5E0] bg-white animate-pulse"
                />
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="rounded-2xl border border-[#E7E5E0] bg-white py-14 text-center">
              <ChefHat className="h-8 w-8 mx-auto text-[#80868B] mb-2" />
              <p className="text-base font-bold text-[#202124]">No orders in this queue</p>
              <p className="text-sm text-[#5F6368]">
                Incoming student pre-orders will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredOrders.map((ord) => {
                const busy = updatingOrderId === ord.id;
                return (
                  <div
                    key={ord.id}
                    className="flex flex-col justify-between rounded-2xl border border-[#E7E5E0] bg-white p-5 space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-mono text-xs font-semibold text-[#5F6368]">
                            {ord.orderNumber}
                          </p>
                          <h3 className="text-base font-bold text-[#202124]">
                            {ord.customer?.fullName || 'Campus Student'}
                          </h3>
                          <p className="text-xs text-[#5F6368]">
                            {ord.customer?.enrollmentId || ord.customer?.email}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-lg font-bold text-[#EA580C] tabular-nums">
                            {ord.pickupCode}
                          </span>
                          <p className="text-xs font-semibold text-[#202124]">
                            {formatStatusLabel(ord.status)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 rounded-lg bg-[#FAFAF7] px-3 py-2 text-xs text-[#202124]">
                        <Clock className="h-3.5 w-3.5 text-[#F97316] shrink-0" />
                        <span className="font-semibold">
                          {ord.pickupSlot?.label || 'Scheduled Slot'}
                        </span>
                        <span className="text-[#5F6368] tabular-nums">· {ord.pickupDate}</span>
                      </div>

                      <div className="divide-y divide-[#F3F2EE] border-t border-b border-[#F3F2EE] py-1">
                        {ord.items.map((item) => (
                          <div
                            key={item.id}
                            className="py-1.5 flex items-center justify-between text-sm"
                          >
                            <span className="font-semibold text-[#202124]">
                              {item.quantity}× {item.itemName}
                            </span>
                            <span className="text-xs text-[#5F6368] tabular-nums">
                              {formatCurrency(item.lineTotal)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {ord.specialInstructions && (
                        <p className="text-xs text-[#9A3412] bg-[#FFF4E8] rounded-lg px-3 py-2">
                          Note: {ord.specialInstructions}
                        </p>
                      )}
                    </div>

                    <div className="pt-1 space-y-2">
                      <div className="flex items-center justify-between text-xs text-[#5F6368]">
                        <span>Total Paid</span>
                        <span className="text-sm font-bold text-[#202124] tabular-nums">
                          {formatCurrency(ord.totalAmount)}
                        </span>
                      </div>

                      {ord.status === 'order_received' && (
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => handleStatusChange(ord.id, 'accepted')}
                          >
                            Accept Order
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-700 hover:bg-red-50"
                            disabled={busy}
                            onClick={() => handleStatusChange(ord.id, 'rejected')}
                          >
                            Reject
                          </Button>
                        </div>
                      )}

                      {ord.status === 'accepted' && (
                        <Button
                          size="sm"
                          className="w-full"
                          disabled={busy}
                          onClick={() => handleStatusChange(ord.id, 'preparing')}
                        >
                          <ChefHat className="h-4 w-4" />
                          Start Preparing
                        </Button>
                      )}

                      {ord.status === 'preparing' && (
                        <Button
                          size="sm"
                          className="w-full bg-emerald-600 hover:bg-emerald-700"
                          disabled={busy}
                          onClick={() => handleStatusChange(ord.id, 'ready_for_pickup')}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Mark Ready for Pickup
                        </Button>
                      )}

                      {ord.status === 'ready_for_pickup' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full"
                          disabled={busy}
                          onClick={() => handleStatusChange(ord.id, 'completed')}
                        >
                          <PackageCheck className="h-4 w-4" />
                          Hand Over & Mark Completed
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* AVAILABILITY TAB */}
      {tab === 'availability' && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Utensils className="h-5 w-5 text-[#F97316]" />
              <h2 className="text-lg font-bold text-[#202124]">Live Kitchen Stock Control</h2>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#80868B]" />
              <Input
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder="Filter menu items..."
                className="pl-9"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[#E7E5E0] bg-white divide-y divide-[#E7E5E0]">
            {filteredMenu.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <FoodImage
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-12 w-14 rounded-lg shrink-0"
                    fallbackTitle={item.name}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#202124]">{item.name}</p>
                    <p className="text-xs text-[#5F6368] tabular-nums">
                      {item.categoryName} · {formatCurrency(item.price)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={cn(
                      'text-xs font-semibold',
                      item.isAvailable ? 'text-emerald-700' : 'text-red-700'
                    )}
                  >
                    {item.isAvailable ? 'Available' : 'Sold Out'}
                  </span>
                  <Switch
                    checked={item.isAvailable}
                    onCheckedChange={() => handleToggleStock(item)}
                    aria-label={`Toggle availability for ${item.name}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
