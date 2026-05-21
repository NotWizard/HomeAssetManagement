import * as React from 'react';

import { cn } from '../../lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        // 设计图风格：圆角更明显、极浅边线、focus 时浅蓝阴影 ring
        'flex h-10 w-full rounded-xl border border-border/70 bg-card px-3.5 py-2 text-sm text-foreground transition-all placeholder:text-muted-foreground/70',
        'focus-visible:outline-none focus-visible:border-primary/60 focus-visible:shadow-ring',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
