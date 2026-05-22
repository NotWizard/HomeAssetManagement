import { ReactNode } from 'react';
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
  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="关闭弹窗"
      />
      <div className={cn('relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border bg-card shadow-card animate-fade-in')}>
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
