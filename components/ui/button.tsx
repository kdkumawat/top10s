import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-body font-medium transition-all duration-quick ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-fg hover:bg-primary-hover hover:shadow-glow",
        accent:
          "bg-accent text-accent-fg hover:bg-accent-hover",
        outline:
          "border border-border-strong bg-transparent text-fg hover:border-primary hover:text-primary",
        ghost: "text-fg-muted hover:bg-surface hover:text-fg",
        danger:
          "bg-danger text-danger-fg hover:opacity-90",
        gold: "bg-gold text-gold-fg hover:brightness-110 hover:shadow-glow font-display",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-base",
        lg: "h-14 px-8 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, asChild, children, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);
    const spinner = loading ? (
      <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
    ) : null;

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string; children?: React.ReactNode }>;
      return React.cloneElement(
        child,
        {
          className: cn(classes, child.props.className),
          "data-motion-essential": true,
        } as Record<string, unknown>,
        spinner,
        child.props.children,
      );
    }

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        data-motion-essential
        {...props}
      >
        {spinner}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };

