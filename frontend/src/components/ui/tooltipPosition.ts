export type TooltipRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type Viewport = {
  width: number;
  height: number;
};

export type TooltipPosition = {
  left: number;
  top: number;
  placement: 'top' | 'bottom';
};

export function calculateTooltipPosition(
  triggerRect: TooltipRect,
  tooltipRect: TooltipRect,
  viewport: Viewport
): TooltipPosition {
  const gap = 8;
  const padding = 8;
  const belowTop = triggerRect.bottom + gap;
  const aboveTop = triggerRect.top - gap - tooltipRect.height;
  const fitsBelow = belowTop + tooltipRect.height <= viewport.height - padding;
  const fitsAbove = aboveTop >= padding;
  const placement =
    fitsBelow || (!fitsAbove && viewport.height - triggerRect.bottom >= triggerRect.top)
      ? 'bottom'
      : 'top';
  const maxLeft = Math.max(padding, viewport.width - tooltipRect.width - padding);
  const maxTop = Math.max(padding, viewport.height - tooltipRect.height - padding);
  const centeredLeft =
    triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
  const preferredTop = placement === 'bottom' ? belowTop : aboveTop;

  return {
    left: Math.min(Math.max(centeredLeft, padding), maxLeft),
    top: Math.min(Math.max(preferredTop, padding), maxTop),
    placement,
  };
}
