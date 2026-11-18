import { QRCodeSVG } from 'qrcode.react';
import { Printer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.tsx';
import { Button } from './ui/button.tsx';
import { OrderStatusStepper } from './OrderStatusStepper.tsx';
import { formatCurrency, formatStatusLabel } from '../lib/utils.ts';
import type { Order } from '../types/canteen.ts';

interface OrderReceiptModalProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderReceiptModal({
  order,
  open,
  onOpenChange,
}: OrderReceiptModalProps) {
  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>Order {order.orderNumber}</span>
          </DialogTitle>
          <DialogDescription>
            Present this QR code or 6-character pickup code at the canteen counter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* QR & Pickup Code Pass */}
          <div className="flex flex-col sm:flex-row items-center gap-5 rounded-xl border border-[#E7E5E0] bg-[#FAFAF7] p-5">
            <div className="rounded-lg bg-white p-3 border border-[#E7E5E0] shrink-0">
              <QRCodeSVG value={order.qrPayload} size={136} level="M" />
            </div>
            <div className="flex-1 text-center sm:text-left space-y-1.5">
              <p className="text-xs font-medium text-[#5F6368]">Counter Pickup Code</p>
              <p className="font-mono text-3xl font-bold tracking-wider text-[#202124] tabular-nums">
                {order.pickupCode}
              </p>
              <div className="text-xs text-[#5F6368] space-y-0.5 pt-1">
                <p>
                  Slot: <span className="font-semibold text-[#202124]">{order.pickupSlot?.label || 'Scheduled'}</span>
                </p>
                <p>
                  Date: <span className="font-semibold text-[#202124] tabular-nums">{order.pickupDate}</span>
                </p>
                <p>
                  Status: <span className="font-semibold text-[#EA580C]">{formatStatusLabel(order.status)}</span>
                </p>
              </div>
            </div>
          </div>

          <OrderStatusStepper status={order.status} />

          {/* Itemized Receipt */}
          <div className="rounded-xl border border-[#E7E5E0] bg-white divide-y divide-[#E7E5E0]">
            <div className="px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-[#5F6368]">
              <span>Items Ordered</span>
              <span>Amount</span>
            </div>
            <div className="divide-y divide-[#F3F2EE] px-4">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="py-2.5 flex items-center justify-between text-sm"
                >
                  <div>
                    <span className="font-medium text-[#202124]">{item.itemName}</span>
                    <span className="ml-2 text-xs text-[#5F6368] tabular-nums">
                      × {item.quantity} ({formatCurrency(item.unitPrice)})
                    </span>
                  </div>
                  <span className="font-semibold text-[#202124] tabular-nums">
                    {formatCurrency(item.lineTotal)}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 flex items-center justify-between bg-[#FAFAF7] rounded-b-xl">
              <div className="text-xs text-[#5F6368]">
                {order.payment ? (
                  <span>
                    Paid via {order.payment.method.replace('_demo', '').toUpperCase()} (Demo) · Ref{' '}
                    <span className="font-mono">{order.payment.transactionRef}</span>
                  </span>
                ) : (
                  <span>Payment recorded</span>
                )}
              </div>
              <div className="text-base font-bold text-[#202124] tabular-nums">
                {formatCurrency(order.totalAmount)}
              </div>
            </div>
          </div>

          {order.specialInstructions && (
            <p className="text-xs text-[#5F6368]">
              Note: <span className="text-[#202124]">{order.specialInstructions}</span>
            </p>
          )}

          <div className="flex justify-end gap-2 no-print">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print Receipt
            </Button>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
