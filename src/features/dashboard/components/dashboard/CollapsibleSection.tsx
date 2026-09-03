import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Wrapper colapsável para seções do Dashboard.
 * Por padrão vem recolhido; expande ao clicar no cabeçalho.
 */
export function CollapsibleSection({ title, description, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-3">
      <Card no3d>
        <CardContent className="p-0">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4 text-left"
          >
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
              {description ? (
                <p className="text-xs text-muted-foreground truncate">{description}</p>
              ) : null}
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </CardContent>
      </Card>
      {open ? <div>{children}</div> : null}
    </div>
  );
}
