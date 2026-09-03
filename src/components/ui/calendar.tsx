import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { ptBR } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const touchStartX = React.useRef<number | null>(null);
  const touchStartY = React.useRef<number | null>(null);

  const selectedDate = (props as any).selected;
  const initialMonth = (props as any).month || (props as any).defaultMonth || (selectedDate instanceof Date ? selectedDate : null) || new Date();
  const [displayMonth, setDisplayMonth] = React.useState<Date>(initialMonth);

  // When the calendar opens with a selected date, jump to that month
  React.useEffect(() => {
    if (selectedDate instanceof Date) {
      setDisplayMonth(selectedDate);
    }
  }, []);

  React.useEffect(() => {
    if ((props as any).month) {
      setDisplayMonth((props as any).month);
    }
  }, [(props as any).month]);

  const goToPrevMonth = () => {
    const prev = new Date(displayMonth.getFullYear(), displayMonth.getMonth() - 1, 1);
    setDisplayMonth(prev);
    (props as any).onMonthChange?.(prev);
  };

  const goToNextMonth = () => {
    const next = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 1);
    setDisplayMonth(next);
    (props as any).onMonthChange?.(next);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goToNextMonth();
      else goToPrevMonth();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    touchStartX.current = e.clientX;
    touchStartY.current = e.clientY;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.clientX - touchStartX.current;
    const dy = e.clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goToNextMonth();
      else goToPrevMonth();
    }
  };

  // Wrap onSelect to auto-close parent Popover when a date is selected in single mode
  const originalOnSelect = (props as any).onSelect;
  const wrappedOnSelect = React.useCallback(
    (...args: any[]) => {
      originalOnSelect?.(...args);
      // If a date was selected (first arg is truthy), close parent popover
      if (args[0] && props.mode === "single") {
        // Use requestAnimationFrame to let the state update first
        requestAnimationFrame(() => {
          // Find the closest popover content and trigger Escape to close it
          const el = containerRef.current;
          if (el) {
            const popoverContent = el.closest('[data-radix-popper-content-wrapper]');
            if (popoverContent) {
              // Dispatch Escape key to close the popover
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            }
          }
        });
      }
    },
    [originalOnSelect, props.mode]
  );

  const restProps = { ...props };
  if (props.mode === "single" && originalOnSelect) {
    (restProps as any).onSelect = wrappedOnSelect;
  }

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <DayPicker
        showOutsideDays={showOutsideDays}
        month={displayMonth}
        onMonthChange={(m) => {
          setDisplayMonth(m);
          (props as any).onMonthChange?.(m);
        }}
        locale={ptBR}
        className={cn("p-2.5 pointer-events-auto", className)}
        classNames={{
          months: "flex flex-col sm:flex-row space-y-3 sm:space-x-3 sm:space-y-0",
          month: "space-y-2",
          caption: "flex justify-center pt-0.5 pb-1 relative items-center",
          caption_label: "text-sm sm:text-base font-semibold text-foreground capitalize tracking-tight",
          nav: "space-x-1 flex items-center",
          nav_button: cn(
            buttonVariants({ variant: "outline" }),
            "h-7 w-7 rounded-lg bg-muted/30 border-border/60 p-0 text-foreground opacity-80 hover:opacity-100 hover:bg-muted transition-all",
          ),
          nav_button_previous: "absolute left-1",
          nav_button_next: "absolute right-1",
          table: "w-full border-collapse space-y-1",
          head_row: "flex justify-between gap-0.5 mb-1",
          head_cell: "text-muted-foreground/80 rounded-md w-9 sm:w-9.5 text-center font-semibold text-[11px] uppercase tracking-wider py-0.5",
          row: "flex w-full mt-1 justify-between gap-0.5",
          cell: "h-9 w-9 sm:h-9.5 sm:w-9.5 text-center text-xs sm:text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-lg [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-lg last:[&:has([aria-selected])]:rounded-r-lg focus-within:relative focus-within:z-20",
          day: cn(
            buttonVariants({ variant: "ghost" }),
            "h-9 w-9 sm:h-9.5 sm:w-9.5 p-0 font-medium text-xs sm:text-sm rounded-lg transition-all duration-150 hover:bg-muted/80 aria-selected:opacity-100",
          ),
          day_range_end: "day-range-end",
          day_selected:
            "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground font-bold shadow-xs rounded-lg",
          day_today: "border border-primary text-primary font-bold rounded-lg bg-primary/10",
          day_outside:
            "day-outside text-muted-foreground/30 opacity-40 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
          day_disabled: "text-muted-foreground opacity-30 cursor-not-allowed",
          day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
          day_hidden: "invisible",
          ...classNames,
        }}
        components={{
          IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
          IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
        }}
        {...restProps}
      />
    </div>
  );
}
Calendar.displayName = "Calendar";

export { Calendar };

