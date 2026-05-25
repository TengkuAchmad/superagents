import * as React from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'default' | 'ghost' | 'outline' | 'tab' | 'tab-active';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  default:
    'bg-primary text-primary-foreground ' +
    'hover:bg-primary/90 active:bg-primary/80 active:scale-[0.98] ' +
    'shadow-sm hover:shadow-md',
  ghost:
    'bg-transparent text-muted-foreground ' +
    'hover:text-foreground hover:bg-accent/80 ' +
    'active:bg-accent active:scale-[0.98]',
  outline:
    'bg-transparent border border-border text-muted-foreground ' +
    'hover:text-foreground hover:border-ring/60 hover:bg-accent/40 ' +
    'active:bg-accent/60 active:scale-[0.98]',
  tab:
    'rounded-t-[8px] rounded-b-none border border-transparent ' +
    'bg-transparent text-muted-foreground ' +
    'hover:text-foreground hover:bg-accent/40',
  'tab-active':
    'rounded-t-[8px] rounded-b-none border border-border border-b-background ' +
    'bg-card text-foreground',
};

export function Button({
  className,
  variant = 'default',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center gap-1.5 cursor-pointer select-none',
        'px-3 py-2 text-[13px] font-sans',
        'transition-all duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-40',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
