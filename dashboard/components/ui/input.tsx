import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full rounded-[calc(var(--radius)-2px)] border border-input bg-card',
          'px-3.5 py-2.5 text-[13px] font-sans text-foreground',
          'placeholder:text-muted-foreground/60',
          'outline-none',
          'transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]',
          'focus:border-[hsl(var(--ring))] focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]',
          'disabled:opacity-50 disabled:pointer-events-none',
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';
