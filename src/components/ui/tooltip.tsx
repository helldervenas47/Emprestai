import * as React from "react";

import { cn } from "@/lib/utils";

type TooltipProviderProps = {
  children: React.ReactNode;
  delayDuration?: number;
  skipDelayDuration?: number;
  disableHoverableContent?: boolean;
};

const TooltipProvider = ({ children }: TooltipProviderProps) => <>{children}</>;

const Tooltip = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, children, ...props }, ref) => (
    <span ref={ref} className={cn("group/tooltip relative inline-flex", className)} {...props}>
      {children}
    </span>
  ),
);
Tooltip.displayName = "Tooltip";

type TooltipTriggerProps = React.HTMLAttributes<HTMLElement> & {
  asChild?: boolean;
  children: React.ReactElement;
};

const TooltipTrigger = React.forwardRef<HTMLElement, TooltipTriggerProps>(({ asChild, children, ...props }, ref) => {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ...props,
      ref,
      className: cn((children.props as { className?: string }).className, props.className),
    } as React.HTMLAttributes<HTMLElement> & { ref: React.Ref<HTMLElement> });
  }

  return (
    <span ref={ref as React.Ref<HTMLSpanElement>} {...props}>
      {children}
    </span>
  );
});
TooltipTrigger.displayName = "TooltipTrigger";

type TooltipContentProps = React.HTMLAttributes<HTMLSpanElement> & {
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  collisionPadding?: number;
};

const sideClasses: Record<NonNullable<TooltipContentProps["side"]>, string> = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
  bottom: "left-1/2 top-full mt-2 -translate-x-1/2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
};

const TooltipContent = React.forwardRef<
  HTMLSpanElement,
  TooltipContentProps
>(({ className, side = "top", hidden, children, align: _align, sideOffset: _sideOffset, collisionPadding: _collisionPadding, ...props }, ref) => {
  if (hidden) return null;

  return (
    <span
      ref={ref}
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-50 w-max max-w-xs overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100",
        sideClasses[side],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
});
TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
