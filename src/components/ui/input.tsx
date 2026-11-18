import * as React from 'react';
import { cn } from '../../lib/utils.ts';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-sm text-[#202124] placeholder:text-[#80868B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';
