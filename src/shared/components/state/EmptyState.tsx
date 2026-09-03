import * as React from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  size?: "sm" | "md" | "lg";
}

/**
 * Estado vazio unificado — use sempre que uma lista/grid não tiver registros.
 * Padrão visual consistente em todo o app.
 */
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, description, action, size = "md", className, ...props }, ref) => {
    const paddings = {
      sm: "py-8 px-4",
      md: "py-12 px-6",
      lg: "py-16 px-8",
    } as const;
    const iconSizes = {
      sm: "h-10 w-10",
      md: "h-12 w-12",
      lg: "h-14 w-14",
    } as const;

    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center text-center",
          "rounded-2xl border border-dashed border-border/60",
          "bg-muted/20 dark:bg-muted/10",
          "animate-fade-in",
          paddings[size],
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            "mb-4 rounded-full bg-muted/60 dark:bg-muted/30 flex items-center justify-center",
            "text-muted-foreground",
            size === "sm" ? "h-12 w-12" : size === "md" ? "h-16 w-16" : "h-20 w-20",
          )}
        >
          {icon ?? <Inbox className={iconSizes[size]} aria-hidden="true" />}
        </div>
        <h3 className="text-h3 mb-1.5">{title}</h3>
        {description ? (
          <p className="text-body-sm text-muted-foreground max-w-sm mx-auto">{description}</p>
        ) : null}
        {action ? (
          <Button onClick={action.onClick} size="sm" className="mt-5">
            {action.icon}
            {action.label}
          </Button>
        ) : null}
      </div>
    );
  },
);
EmptyState.displayName = "EmptyState";
