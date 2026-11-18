import { Check, ChefHat, Clock, PackageCheck, ShoppingBag, XCircle } from 'lucide-react';
import { cn } from '../lib/utils.ts';

const STEPS = [
  { key: 'order_received', label: 'Received', icon: ShoppingBag },
  { key: 'accepted', label: 'Accepted', icon: Check },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'ready_for_pickup', label: 'Ready', icon: Clock },
  { key: 'completed', label: 'Collected', icon: PackageCheck },
];

export function OrderStatusStepper({ status }: { status: string }) {
  if (status === 'cancelled' || status === 'rejected') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
        <XCircle className="h-4 w-4 shrink-0" />
        <span>
          {status === 'cancelled'
            ? 'Order cancelled before preparation'
            : 'Order rejected by canteen staff'}
        </span>
      </div>
    );
  }

  const activeIdx = STEPS.findIndex((s) => s.key === status);

  return (
    <div className="w-full py-2">
      <div className="flex items-center justify-between gap-1">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const reached = idx <= activeIdx;
          const isCurrent = idx === activeIdx;
          return (
            <div key={step.key} className="flex flex-1 flex-col items-center relative">
              {idx > 0 && (
                <div
                  className={cn(
                    'absolute top-3.5 right-1/2 w-full h-0.5 -z-0',
                    idx <= activeIdx ? 'bg-[#F97316]' : 'bg-[#E7E5E0]'
                  )}
                />
              )}
              <div
                className={cn(
                  'relative z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-colors',
                  isCurrent
                    ? 'border-[#F97316] bg-[#F97316] text-white'
                    : reached
                    ? 'border-[#F97316] bg-[#FFF4E8] text-[#EA580C]'
                    : 'border-[#E7E5E0] bg-white text-[#80868B]'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span
                className={cn(
                  'mt-1.5 text-[11px] text-center whitespace-nowrap',
                  reached ? 'font-semibold text-[#202124]' : 'text-[#80868B]'
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
