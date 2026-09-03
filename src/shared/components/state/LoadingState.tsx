import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Loading unificado com spinner + label opcional.
 * Para skeletons de listas, use a classe utilitária `.skeleton` de index.css.
 */
export const LoadingState = React.forwardRef<HTMLDivElement, LoadingStateProps>(
  ({ label, size = "md", className, ...props }, ref) => {
    const sizes = {
      sm: { pad: "py-6 px-4", icon: "h-5 w-5", text: "text-body-sm" },
      md: { pad: "py-10 px-6", icon: "h-6 w-6", text: "text-body-sm" },
      lg: { pad: "py-14 px-8", icon: "h-7 w-7", text: "text-body" },
    } as const;
    const s = sizes[size];

    return (
      <div
        ref={ref}
        role="status"
        aria-live="polite"
        className={cn(
          "flex flex-col items-center justify-center text-center gap-3",
          "text-muted-foreground animate-fade-in",
          s.pad,
          className,
        )}
        {...props}
      >
        <Loader2 className={cn("animate-spin text-primary", s.icon)} aria-hidden="true" />
        {label ? <span className={s.text}>{label}</span> : <span className="sr-only">Carregando…</span>}
      </div>
    );
  },
);
LoadingState.displayName = "LoadingState";
