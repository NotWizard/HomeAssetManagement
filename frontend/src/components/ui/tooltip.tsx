import { Info } from 'lucide-react';
import { ReactNode } from 'react';

import { cn } from '../../lib/cn';

type TooltipProps = {
  content: ReactNode;
  label?: string;
  className?: string;
};

export function Tooltip({ content, label = '查看提示', className }: TooltipProps) {
  return (
    <span className={cn('group relative inline-flex items-center', className)}>
      <button
        type="button"
        aria-label={label}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-44 rounded-lg border bg-popover px-3 py-2 text-xs leading-5 text-popover-foreground shadow-card group-hover:block group-focus-within:block"
      >
        {content}
      </span>
    </span>
  );
}
