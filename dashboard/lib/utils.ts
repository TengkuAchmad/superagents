/**
 * cn — minimal className utility (shadcn/ui pattern).
 * Filters falsy values and joins all class strings.
 * Drop-in compatible if clsx/tailwind-merge are added later.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
