import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

// Global rule: o teclado NÃO deve abrir automaticamente. `autoFocus` é
// ignorado — o foco só acontece após interação manual do usuário.
const Textarea = React.forwardRef<TextareaProps extends never ? never : HTMLTextAreaElement, TextareaProps>(
  ({ className, autoFocus: _autoFocus, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          [
            "flex min-h-[96px] w-full rounded-2xl",
            "border border-border bg-card dark:bg-card/70",
            "px-4 py-3 text-base leading-relaxed text-foreground",
            "ring-offset-background transition-[border-color,box-shadow] duration-200",
            "placeholder:text-muted-foreground/80",
            "hover:border-primary/40 dark:hover:border-accent/40",
            "focus-visible:outline-none focus-visible:border-accent",
            "focus-visible:shadow-[0_0_0_3px_hsl(var(--accent)/0.18)]",
            "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:shadow-[0_0_0_3px_hsl(var(--destructive)/0.18)]",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted",
            "md:text-sm touch-manipulation resize-y",
          ].join(" "),
          className,
        )}
        ref={ref as React.Ref<HTMLTextAreaElement>}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
