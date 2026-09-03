import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-2xl text-sm font-semibold tracking-tight",
    "ring-offset-background transition-[background-color,box-shadow,transform,border-color,color] duration-200 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    "touch-manipulation active:scale-[0.98]",
    "relative after:absolute after:inset-[-4px] after:content-[''] md:after:hidden ripple-touch",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-[0_6px_20px_-8px_hsl(var(--primary)/0.5)] hover:shadow-[0_10px_28px_-8px_hsl(var(--accent)/0.55)] hover:brightness-110",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md",
        outline:
          "border border-primary/40 bg-transparent text-primary hover:bg-secondary hover:border-primary/60 dark:border-accent/40 dark:text-accent dark:hover:bg-secondary",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-transparent",
        ghost:
          "text-foreground hover:bg-secondary hover:text-foreground",
        link:
          "text-primary underline-offset-4 hover:underline dark:text-accent",
        success:
          "bg-success text-success-foreground shadow-sm hover:bg-success/90 hover:shadow-md",
      },
      size: {
        default: "h-11 px-5 min-h-[44px]",
        sm: "h-10 rounded-xl px-3.5 min-h-[40px] text-[13px]",
        lg: "h-12 rounded-2xl px-8 min-h-[48px]",
        icon: "h-11 w-11 min-h-[44px] min-w-[44px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
