import * as React from "react";

import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  no3d?: boolean;
}

const CARD_BASE = [
  "rounded-2xl border border-border/70",
  "bg-card text-card-foreground",
  "shadow-[0_1px_2px_hsl(220_30%_10%/0.04),0_8px_24px_-16px_hsl(220_40%_10%/0.10)]",
  "dark:shadow-[0_1px_2px_hsl(220_60%_2%/0.4),0_16px_40px_-24px_hsl(220_60%_2%/0.55)]",
  "h-full transition-[box-shadow,border-color,transform] duration-300 ease-out",
].join(" ");

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, no3d, ...props }, ref) => {
  if (no3d) {
    return <div ref={ref} className={cn(CARD_BASE, className)} {...props} />;
  }
  return (
    <div className="card-3d h-full">
      <div ref={ref} className={cn("card-3d-inner", CARD_BASE, className)} {...props} />
    </div>
  );
});
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-xl md:text-2xl font-bold leading-tight tracking-tight text-foreground", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground leading-relaxed", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
