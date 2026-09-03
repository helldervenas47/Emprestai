import * as React from "react";

import { cn } from "@/lib/utils";

// Global rule: o teclado NÃO deve abrir automaticamente. Ignoramos qualquer
// `autoFocus` passado a Input — o foco só ocorre por interação manual do
// usuário. Para casos legítimos use `data-allow-autofocus` + foco programático.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, autoFocus: _autoFocus, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          [
            "flex h-11 min-h-[44px] w-full rounded-2xl",
            "border border-border bg-card dark:bg-card/70",
            "px-4 py-0 text-base leading-[1.2] align-middle text-foreground",
            "ring-offset-background transition-[border-color,box-shadow] duration-200",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
            "placeholder:text-muted-foreground/80 placeholder:leading-[1.2]",
            "hover:border-primary/40 dark:hover:border-accent/40",
            "focus-visible:outline-none focus-visible:border-accent",
            "focus-visible:shadow-[0_0_0_3px_hsl(var(--accent)/0.18)]",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted",
            "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:shadow-[0_0_0_3px_hsl(var(--destructive)/0.18)]",
            "md:text-sm touch-manipulation",
          ].join(" "),
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
