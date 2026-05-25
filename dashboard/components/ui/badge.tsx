import * as React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'blue'
  | 'secondary';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:     'bg-secondary/70 text-muted-foreground',
  secondary:   'bg-secondary/70 text-muted-foreground',
  success:     'bg-[hsl(142_71%_45%/0.12)] text-[hsl(142_71%_55%)]',
  warning:     'bg-[hsl(38_92%_50%/0.12)]  text-[hsl(38_92%_60%)]',
  destructive: 'bg-[hsl(0_72%_51%/0.12)]   text-[hsl(0_72%_65%)]',
  blue:        'bg-[hsl(213_100%_60%/0.12)] text-[hsl(213_100%_72%)]',
};

export function Badge({
  className,
  variant = 'default',
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5',
        'text-[11px] font-mono font-medium tabular-nums leading-none select-none',
        'transition-colors duration-150',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
