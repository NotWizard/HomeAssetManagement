import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../lib/cn';

type DialogProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function Dialog({ open, title, description, onClose, children, footer }: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Escape 关闭 + 轻量焦点陷阱：弹窗打开即聚焦面板，Tab 在面板内循环。
  // 原先只支持点遮罩关闭，键盘用户无法退出弹窗。
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const panel = panelRef.current;
    panel?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="关闭弹窗"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border bg-card shadow-card animate-fade-in outline-none')}
      >
        <div className="px-5 pt-5">
          <h3 className="text-lg font-semibold">{title}</h3>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-border/60 px-5 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
