import { useState } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { cn } from '../lib/utils.ts';

interface FoodImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}

export function FoodImage({ src, alt, className, fallbackTitle }: FoodImageProps) {
  const [errored, setErrored] = useState(false);

  if (errored || !src) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center bg-[#FFF4E8] text-[#9A3412] p-4 text-center select-none',
          className
        )}
      >
        <UtensilsCrossed className="h-7 w-7 mb-2 opacity-70" />
        <span className="text-xs font-medium line-clamp-2">{fallbackTitle || alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
      className={cn('object-cover', className)}
    />
  );
}
