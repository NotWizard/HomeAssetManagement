import { Info } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../lib/cn';
import {
  calculateTooltipPosition,
  type TooltipPosition,
} from './tooltipPosition';

type TooltipProps = {
  content: ReactNode;
  label?: string;
  className?: string;
};

export function Tooltip({ content, label = '查看提示', className }: TooltipProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const hide = () => {
    setOpen(false);
    setPosition(null);
  };
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    setPosition(
      calculateTooltipPosition(
        trigger.getBoundingClientRect(),
        tooltip.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight }
      )
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <span
      className={cn('inline-flex items-center', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) hide();
      }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hide();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <span
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              data-placement={position?.placement}
              className="pointer-events-none fixed z-[60] w-44 rounded-lg border bg-popover px-3 py-2 text-xs leading-5 text-popover-foreground shadow-card"
              style={
                position
                  ? { left: position.left, top: position.top }
                  : { left: 0, top: 0, visibility: 'hidden' }
              }
            >
              {content}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
