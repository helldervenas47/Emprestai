import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

/**
 * Estado de erro unificado. Use em queries falhas / erros de rede.
 */
export const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  (
    {
      title = "Não conseguimos carregar os dados",
      description = "Verifique sua conexão e tente novamente em instantes.",
      onRetry,
      retryLabel = "Tentar novamente",
      className,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          "flex flex-col items-center justify-center text-center",
          "rounded-2xl border border-destructive/25 bg-destructive/5 dark:bg-destructive/10",
          "py-10 px-6 animate-fade-in",
          className,
        )}
        {...props}
      >
        <div className="mb-4 h-14 w-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </div>
        <h3 className="text-h3 mb-1.5">{title}</h3>
        <p className="text-body-sm text-muted-foreground max-w-sm mx-auto">{description}</p>
        {onRetry ? (
          <Button onClick={onRetry} variant="outline" size="sm" className="mt-5">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {retryLabel}
          </Button>
        ) : null}
      </div>
    );
  },
);
ErrorState.displayName = "ErrorState";
