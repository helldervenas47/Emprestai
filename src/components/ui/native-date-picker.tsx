import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

export interface NativeDatePickerProps {
  /** Value as YYYY-MM-DD string */
  value: string;
  /** Callback with YYYY-MM-DD string */
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  /** Visual size — matches Button variants */
  size?: "sm" | "default";
}

// Detect environments where <input type="date"> / showPicker() are unreliable
// (Lovable preview iframe, sandboxed iframes, some embedded webviews). In those
// cases we fall back to a shadcn Popover + Calendar so the picker always opens.
function useNeedsFallback(): boolean {
  const [needs, setNeeds] = React.useState(false);
  React.useEffect(() => {
    try {
      const inIframe = window.self !== window.top;
      setNeeds(inIframe);
    } catch {
      // Cross-origin access threw — we're definitely in an iframe.
      setNeeds(true);
    }
  }, []);
  return needs;
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Date picker that delegates to the OS-native picker (iOS wheel, Android
 * Material picker, desktop browser picker) via <input type="date">. When
 * running inside an iframe (e.g. Lovable preview) it falls back to a
 * shadcn Popover + Calendar so the picker still opens reliably.
 */
import { Button } from "@/components/ui/button";

export function NativeDatePicker({
  value,
  onChange,
  placeholder = "Selecione a data",
  className,
  id,
  min,
  max,
  disabled,
  size = "default",
}: NativeDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const dateValue = value ? new Date(value + "T00:00:00") : undefined;
  const label = dateValue && !isNaN(dateValue.getTime())
    ? format(dateValue, "dd/MM/yyyy", { locale: ptBR })
    : placeholder;

  const minDate = min ? new Date(min + "T00:00:00") : undefined;
  const maxDate = max ? new Date(max + "T00:00:00") : undefined;

  const shellClasses = cn(
    "relative inline-flex w-full items-center rounded-xl border border-input bg-background text-left font-medium ring-offset-background transition-all hover:bg-muted/40",
    "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
    size === "sm" ? "h-9 px-3 text-xs" : "h-10 px-3.5 text-sm",
    disabled && "opacity-50 pointer-events-none",
    className,
  );

  const handleSelect = (d?: Date) => {
    if (d) {
      onChange(toISO(d));
      setOpen(false);
    }
  };

  const handleQuickSelect = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    onChange(toISO(d));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          disabled={disabled}
          className={cn(shellClasses, "cursor-pointer select-none")}
        >
          <CalendarIcon className="mr-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={cn("flex-1 truncate", !value ? "text-muted-foreground font-normal" : "text-foreground font-semibold")}>
            {label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-2.5 sm:p-3 rounded-2xl shadow-xl border border-border/60 bg-popover/95 backdrop-blur-xl z-50 animate-in fade-in-50 zoom-in-95"
        align="start"
      >
        <div className="space-y-2">
          <Calendar
            mode="single"
            selected={dateValue}
            onSelect={handleSelect}
            disabled={(d) => {
              if (minDate && d < minDate) return true;
              if (maxDate && d > maxDate) return true;
              return false;
            }}
            initialFocus
          />
          {/* Barra de atalhos rápidos para agilizar lançamentos */}
          <div className="flex items-center justify-between gap-1 border-t border-border/40 pt-2">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6.5 px-2 text-[11px] rounded-md font-medium hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
                onClick={() => handleQuickSelect(0)}
              >
                Hoje
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6.5 px-2 text-[11px] rounded-md font-medium hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
                onClick={() => handleQuickSelect(1)}
              >
                Amanhã
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6.5 px-2 text-[11px] rounded-md font-medium hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
                onClick={() => handleQuickSelect(-1)}
              >
                Ontem
              </Button>
            </div>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6.5 px-1.5 text-[11px] rounded-md text-muted-foreground hover:text-destructive transition-colors"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Limpar
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export interface NativeDateRangePickerProps {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  className?: string;
  disabled?: boolean;
}

export function NativeDateRangePicker({
  from,
  to,
  onChange,
  className,
  disabled,
}: NativeDateRangePickerProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <NativeDatePicker
        value={from}
        onChange={(v) => onChange({ from: v, to })}
        placeholder="De"
        max={to || undefined}
        disabled={disabled}
      />
      <NativeDatePicker
        value={to}
        onChange={(v) => onChange({ from, to: v })}
        placeholder="Até"
        min={from || undefined}
        disabled={disabled}
      />
    </div>
  );
}
