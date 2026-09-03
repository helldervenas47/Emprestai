import type { ReactNode, SyntheticEvent } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface RowAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  hidden?: boolean;
  disabled?: boolean;
  title?: string;
}

interface RowActionsProps {
  actions: RowAction[];
  /** Tamanho dos botões inline no desktop. */
  size?: "sm" | "md";
  /** Esconde o kebab no mobile e mantém apenas inline (opt-out). */
  alwaysInline?: boolean;
  /** Esconde os inline no desktop e mantém apenas kebab. */
  alwaysKebab?: boolean;
  className?: string;
}

/**
 * RowActions — exibe ações de linha (editar/excluir/etc.) como botões
 * inline no desktop e como menu kebab no mobile, para reduzir o espaço
 * ocupado em listas/tabelas.
 */
export function RowActions({
  actions,
  size = "sm",
  alwaysInline = false,
  alwaysKebab = false,
  className,
}: RowActionsProps) {
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;

  const stopRowEvent = (e: SyntheticEvent) => {
    e.stopPropagation();
  };

  const iconBtn = size === "md" ? "h-8 w-8" : "h-7 w-7";
  const iconSize = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  const inline = (
    <div
      className={cn(
        "items-center gap-1",
        alwaysInline ? "flex" : alwaysKebab ? "hidden" : "hidden sm:flex",
        className,
      )}
      onClick={stopRowEvent}
      onPointerDown={stopRowEvent}
      onMouseDown={stopRowEvent}
      onTouchStart={stopRowEvent}
    >
      {visible.map((a, i) => (
        <Button
          key={i}
          type="button"
          variant="ghost"
          size="icon"
          className={iconBtn}
          onClick={(e) => {
            e.stopPropagation();
            if (!a.disabled) a.onClick();
          }}
          disabled={a.disabled}
          title={a.title ?? a.label}
          aria-label={a.label}
        >
          {a.icon ?? (a.destructive ? <Trash2 className={cn(iconSize, "text-destructive")} /> : <Pencil className={cn(iconSize, "text-muted-foreground")} />)}
        </Button>
      ))}
    </div>
  );

  const kebab = (
    <div
      className={cn(alwaysInline ? "hidden" : alwaysKebab ? "flex" : "flex sm:hidden", className)}
      onClick={stopRowEvent}
      onPointerDown={stopRowEvent}
      onMouseDown={stopRowEvent}
      onTouchStart={stopRowEvent}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={iconBtn}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            aria-label="Mais ações"
          >
            <MoreVertical className={iconSize} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-44"
          onClick={stopRowEvent}
          onPointerDown={stopRowEvent}
          onMouseDown={stopRowEvent}
          onTouchStart={stopRowEvent}
        >
          {visible.map((a, i) => {
            const isLast = i === visible.length - 1;
            const showSep = a.destructive && !isLast === false && i > 0 && a.destructive;
            return (
              <div key={i}>
                {showSep && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  disabled={a.disabled}
                  className={cn(a.destructive && "text-destructive focus:text-destructive")}
                  onSelect={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!a.disabled) a.onClick();
                  }}
                >
                  <span className="mr-2 inline-flex items-center">
                    {a.icon ?? (a.destructive ? <Trash2 className="h-4 w-4" /> : <Pencil className="h-4 w-4" />)}
                  </span>
                  {a.label}
                </DropdownMenuItem>
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <>
      {inline}
      {kebab}
    </>
  );
}
