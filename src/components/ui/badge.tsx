import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center rounded-full border px-2.5 py-0.5",
    "shrink-0 whitespace-nowrap",
    "text-[11px] font-semibold tracking-wide uppercase",
    "transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive/10 text-destructive hover:bg-destructive/15 dark:bg-destructive/20",
        "destructive-solid": "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border-border text-foreground bg-transparent",
        success: "border-transparent bg-success/12 text-success hover:bg-success/18 dark:bg-success/20",
        "success-solid": "border-transparent bg-success text-success-foreground hover:bg-success/90",
        warning: "border-transparent bg-warning/15 text-warning-foreground hover:bg-warning/20 dark:bg-warning/25",
        info: "border-transparent bg-accent/12 text-accent hover:bg-accent/20 dark:bg-accent/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(({ className, variant, ...props }, ref) => {
  return <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />;
});

Badge.displayName = "Badge";

export { Badge, badgeVariants };
