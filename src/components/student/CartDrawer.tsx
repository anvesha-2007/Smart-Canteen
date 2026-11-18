import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Clock,
  CreditCard,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api.ts';
import { cn, formatCurrency } from '../../lib/utils.ts';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { FoodImage } from '../FoodImage.tsx';
import type { CartState, Order, PickupSlot } from '../../types/canteen.ts';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  cart: CartState;
  onUpdateQty: (menuItemId: number, quantity: number) => Promise<void>;
  onClearCart: () => Promise<void>;
  onOrderCreated: (order: Order) => void;
}

export function CartDrawer({
  open,
  onClose,
  cart,
  onUpdateQty,
  onClearCart,
  onOrderCreated,
}: CartDrawerProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const [pickupDate, setPickupDate] = useState(todayStr);
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'upi_demo' | 'card_demo' | 'wallet_demo'>(
    'upi_demo'
  );
  const [paymentOutcome, setPaymentOutcome] = useState<'success' | 'failed'>('success');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!open) return;
    setCheckoutError('');
    const loadSlots = async () => {
      setSlotsLoading(true);
      try {
        const res = await apiFetch<{ slots: PickupSlot[] }>(`/api/slots?date=${pickupDate}`);
        setSlots(res.slots);
        setSelectedSlotId((prev) => {
          const valid = res.slots.find((s) => s.id === prev && !s.isFull);
          if (valid) return valid.id;
          const firstOpen = res.slots.find((s) => !s.isFull);
          return firstOpen ? firstOpen.id : null;
        });
      } catch {
        toast.error('Could not load pickup slots.');
      } finally {
        setSlotsLoading(false);
      }
    };
    loadSlots();
  }, [open, pickupDate]);

  if (!open) return null;

  const handleCheckout = async () => {
    if (cart.items.length === 0) return;
    if (!selectedSlotId) {
      setCheckoutError('Please select an available pickup time slot.');
      return;
    }

    setCheckoutError('');
    setSubmitting(true);
    try {
      const res = await apiFetch<{ order: Order }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          pickupSlotId: selectedSlotId,
          pickupDate,
          paymentMethod,
          paymentOutcome,
          specialInstructions,
          idempotencyKey,
        }),
      });
      toast.success(`Order ${res.order.orderNumber} confirmed!`);
      setSpecialInstructions('');
      setIdempotencyKey(crypto.randomUUID());
      onOrderCreated(res.order);
    } catch (err: any) {
      const msg = err?.message || 'Checkout failed. Please try again.';
      setCheckoutError(msg);
      toast.error(msg);
      // Generate a fresh idempotency key after a failed payment attempt so user can retry
      setIdempotencyKey(crypto.randomUUID());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[2px]">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl border-l border-[#E7E5E0]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E7E5E0] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="h-5 w-5 text-[#F97316]" />
            <h2 className="text-lg font-bold text-[#202124]">
              Your Pre-Order Cart
            </h2>
            <span className="text-xs font-medium text-[#5F6368] tabular-nums">
              ({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'})
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cart"
            className="rounded-lg p-2 text-[#5F6368] hover:bg-[#F3F2EE] hover:text-[#202124] cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {cart.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF4E8] text-[#F97316]">
                <ShoppingBag className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-[#202124]">Your cart is empty</h3>
              <p className="mt-1 max-w-xs text-sm text-[#5F6368]">
                Add fresh dishes from the canteen menu and choose a convenient pickup slot.
              </p>
              <Button className="mt-5" variant="outline" onClick={onClose}>
                Browse Menu
              </Button>
            </div>
          ) : (
            <>
              {/* Cart Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#202124]">Selected Items</h3>
                  <button
                    type="button"
                    onClick={onClearCart}
                    className="text-xs font-medium text-[#5F6368] hover:text-red-600 cursor-pointer"
                  >
                    Clear all
                  </button>
                </div>

                <div className="divide-y divide-[#F3F2EE] rounded-xl border border-[#E7E5E0]">
                  {cart.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-3">
                      <FoodImage
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-14 w-16 rounded-lg shrink-0"
                        fallbackTitle={item.name}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#202124]">
                          {item.name}
                        </p>
                        <p className="text-xs text-[#5F6368] tabular-nums">
                          {formatCurrency(item.price)} each · {item.prepTimeMinutes}m
                        </p>
                        {!item.isAvailable && (
                          <p className="text-xs font-semibold text-red-600 mt-0.5">
                            Sold out — please remove
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onUpdateQty(item.menuItemId, item.quantity - 1)}
                          aria-label={`Decrease ${item.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-[#E7E5E0] bg-white text-[#202124] hover:bg-[#FAFAF7] cursor-pointer"
                        >
                          {item.quantity === 1 ? (
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          ) : (
                            <Minus className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <span className="w-6 text-center text-sm font-semibold tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQty(item.menuItemId, item.quantity + 1)}
                          aria-label={`Increase ${item.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-[#E7E5E0] bg-white text-[#202124] hover:bg-[#FAFAF7] cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pickup Date & Slot Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-[#202124] flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-[#F97316]" />
                    Pickup Slot
                  </label>
                  <div className="flex items-center gap-1 rounded-lg bg-[#F3F2EE] p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setPickupDate(todayStr)}
                      className={cn(
                        'rounded-md px-2.5 py-1 font-medium cursor-pointer transition-colors',
                        pickupDate === todayStr
                          ? 'bg-white text-[#202124] shadow-sm'
                          : 'text-[#5F6368]'
                      )}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickupDate(tomorrowStr)}
                      className={cn(
                        'rounded-md px-2.5 py-1 font-medium cursor-pointer transition-colors',
                        pickupDate === tomorrowStr
                          ? 'bg-white text-[#202124] shadow-sm'
                          : 'text-[#5F6368]'
                      )}
                    >
                      Tomorrow
                    </button>
                  </div>
                </div>

                {slotsLoading ? (
                  <div className="grid grid-cols-2 gap-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-12 animate-pulse rounded-lg bg-[#F3F2EE]"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {slots.map((slot) => {
                      const active = selectedSlotId === slot.id;
                      const full = Boolean(slot.isFull);
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          disabled={full}
                          onClick={() => setSelectedSlotId(slot.id)}
                          className={cn(
                            'rounded-lg border p-2.5 text-left transition-colors cursor-pointer',
                            full
                              ? 'border-[#E7E5E0] bg-[#F3F2EE] opacity-55 cursor-not-allowed'
                              : active
                              ? 'border-[#F97316] bg-[#FFF4E8] text-[#202124]'
                              : 'border-[#E7E5E0] bg-white hover:border-[#D1CFC7]'
                          )}
                        >
                          <p className="text-xs font-semibold text-[#202124] tabular-nums">
                            {slot.label}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#5F6368] tabular-nums">
                            {full
                              ? 'Slot Full'
                              : `${slot.remainingCapacity ?? slot.maxCapacity} spots left`}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Special Instructions */}
              <div>
                <label className="mb-1.5 block text-sm font-bold text-[#202124]">
                  Kitchen Note (optional)
                </label>
                <Input
                  placeholder="e.g., Less spicy, pack chutney separately"
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  maxLength={200}
                />
              </div>

              {/* Demo Payment Mode */}
              <div className="space-y-3 rounded-xl border border-[#E7E5E0] bg-[#FAFAF7] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#202124] flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4 text-[#F97316]" />
                    Demo Payment Gateway
                  </span>
                  <span className="text-[11px] font-semibold text-[#9A3412]">
                    Test Mode Active
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'upi_demo', label: 'UPI Demo' },
                    { id: 'card_demo', label: 'Card Demo' },
                    { id: 'wallet_demo', label: 'Campus Pay' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id as any)}
                      className={cn(
                        'rounded-lg border py-2 px-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap',
                        paymentMethod === m.id
                          ? 'border-[#F97316] bg-white text-[#EA580C]'
                          : 'border-[#E7E5E0] bg-white text-[#5F6368] hover:text-[#202124]'
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-[#5F6368]">Simulated Outcome:</span>
                  <div className="flex items-center gap-1 rounded-md bg-[#E7E5E0]/60 p-0.5">
                    <button
                      type="button"
                      onClick={() => setPaymentOutcome('success')}
                      className={cn(
                        'rounded px-2 py-1 font-semibold cursor-pointer',
                        paymentOutcome === 'success'
                          ? 'bg-white text-emerald-700 shadow-sm'
                          : 'text-[#5F6368]'
                      )}
                    >
                      Success
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentOutcome('failed')}
                      className={cn(
                        'rounded px-2 py-1 font-semibold cursor-pointer',
                        paymentOutcome === 'failed'
                          ? 'bg-white text-red-700 shadow-sm'
                          : 'text-[#5F6368]'
                      )}
                    >
                      Fail Test
                    </button>
                  </div>
                </div>
              </div>

              {checkoutError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{checkoutError}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {cart.items.length > 0 && (
          <div className="border-t border-[#E7E5E0] bg-white px-6 py-4 space-y-3">
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between text-[#5F6368]">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(cart.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-base font-bold text-[#202124]">
                <span>Total Payable</span>
                <span className="tabular-nums">{formatCurrency(cart.totalAmount)}</span>
              </div>
            </div>

            <Button
              className="w-full h-11 text-base"
              disabled={submitting || !selectedSlotId}
              onClick={handleCheckout}
            >
              <Calendar className="h-4 w-4" />
              {submitting
                ? 'Processing Demo Payment...'
                : `Pay ${formatCurrency(cart.totalAmount)} & Confirm Pre-Order`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
