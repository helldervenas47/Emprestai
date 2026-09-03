import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { composeRefs, focusWithoutScrollOnNextFrame } from "@/lib/focusWithoutScroll";
import { withScrollPreserve } from "@/lib/preserveScrollOnOpen";

const Sheet = withScrollPreserve(SheetPrimitive.Root);

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-card/80 backdrop-blur-xl backdrop-saturate-150 p-6 shadow-[0_8px_32px_-8px_hsl(0_0%_0%/0.4)] transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  ({ side = "right", className, children, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
    const contentRef = React.useRef<React.ElementRef<typeof SheetPrimitive.Content>>(null);

    return (
      <SheetPortal>
        <SheetOverlay />
        <SheetPrimitive.Content
          ref={composeRefs(ref, contentRef)}
          tabIndex={-1}
          onOpenAutoFocus={(e) => {
            onOpenAutoFocus?.(e);
            if (e.defaultPrevented) return;

            e.preventDefault();
            focusWithoutScrollOnNextFrame(contentRef.current);
          }}
          // No fechamento, mantemos a proteção contra scroll-to-top.
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            onCloseAutoFocus?.(e);
          }}
          className={cn(
            sheetVariants({ side }),
            "max-h-[100dvh] overflow-y-auto overflow-x-hidden overscroll-contain",
            className,
          )}

          style={{
            paddingTop: `calc(env(safe-area-inset-top) + 1.5rem)`,
            paddingBottom: `calc(env(safe-area-inset-bottom) + 1.5rem)`,
          }}
          {...props}
        >

        {children}
        <SheetPrimitive.Close
          className="absolute right-4 inline-flex items-center justify-center min-h-11 min-w-11 rounded-md opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-secondary hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          style={{ top: `calc(env(safe-area-inset-top) + 1rem)` }}
        >
          <X className="w-5 h-5" aria-hidden="true" />
          <span className="sr-only">Fechar</span>
        </SheetPrimitive.Close>
        </SheetPrimitive.Content>
      </SheetPortal>
    );
  },
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title ref={ref} className={cn("text-lg md:text-xl font-semibold leading-tight tracking-tight text-foreground", className)} {...props} />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
