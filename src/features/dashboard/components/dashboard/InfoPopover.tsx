import { Info } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

export const InfoPopover = ({
  text,
  className,
  open,
  onOpenChange,
}: {
  text: string;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) => (
  <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className={`${className ?? "absolute top-2 left-2 p-1 -m-1"} text-muted-foreground hover:text-foreground transition-colors z-10`}
        aria-label="Mais informações"
      >
        <Info className="h-3 w-3" />
      </button>
    </PopoverTrigger>
    <PopoverContent
      side="top"
      align="start"
      className="w-64 text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      {text}
    </PopoverContent>
  </Popover>
);
