import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { composeRefs, focusWithoutScrollOnNextFrame } from "@/lib/focusWithoutScroll";
import { withScrollPreserve } from "@/lib/preserveScrollOnOpen";

const Dialog = withScrollPreserve(DialogPrimitive.Root);

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-foreground/40 dark:bg-background/80 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }
>(({ className, children, showCloseButton = true, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
  const contentRef = React.useRef<React.ElementRef<typeof DialogPrimitive.Content>>(null);

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={composeRefs(ref, contentRef)}
        tabIndex={-1}
        onOpenAutoFocus={(e) => {
          onOpenAutoFocus?.(e);
          if (e.defaultPrevented) return;

          e.preventDefault();
          focusWithoutScrollOnNextFrame(contentRef.current);
        }}
        // Ao fechar, evitamos que o Radix devolva o foco ao trigger sem
        // preventScroll — quando o trigger foi desmontado (DropdownMenu/portal
        // já fechado), esse foco causava scroll-to-top.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onCloseAutoFocus?.(e);
        }}
        style={{
          paddingTop: "calc(1.5rem + env(safe-area-inset-top))",
          paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))",
          paddingLeft: "calc(1.5rem + env(safe-area-inset-left))",
          paddingRight: "calc(1.5rem + env(safe-area-inset-right))",
        }}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-1rem)] sm:w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-card p-6 shadow-[0_24px_64px_-24px_hsl(220_40%_10%/0.35)] dark:shadow-[0_32px_80px_-24px_hsl(220_60%_2%/0.7)] rounded-2xl duration-200 max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden overscroll-contain data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          className,
        )}
        {...props}
      >

      {children}
      {showCloseButton && (
        <DialogPrimitive.Close
          style={{
            top: "calc(env(safe-area-inset-top) + 1rem)",
            right: "calc(env(safe-area-inset-right) + 1rem)",
          }}
          className="absolute inline-flex items-center justify-center min-h-11 min-w-11 rounded-md opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        >
          <X className="w-5 h-5" aria-hidden="true" />
          <span className="sr-only">Fechar</span>
        </DialogPrimitive.Close>
      )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg md:text-xl font-semibold leading-tight tracking-tight text-foreground", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
