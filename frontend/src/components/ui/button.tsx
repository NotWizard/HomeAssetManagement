import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/cn';

const buttonVariants = cva(
  // 基础：圆角 xl、柔和过渡、focus ring 用 box-shadow.ring（更现代）
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:shadow-ring disabled:pointer-events-none disabled:opacity-50 active:translate-y-px',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-soft hover:bg-primary/92',
        secondary:
          'bg-secondary text-secondary-foreground border border-border/60 hover:bg-surface-strong',
        ghost: 'text-foreground hover:bg-secondary',
        outline:
          'border border-border bg-card text-foreground hover:bg-secondary',
        destructive:
          'bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90',
        subtle:
          'bg-accent text-accent-foreground hover:bg-accent/80',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3',
        lg: 'h-11 rounded-xl px-6',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
