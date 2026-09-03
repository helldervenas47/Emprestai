import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";

export interface CategoryEntry {
  id: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  type: "receita" | "despesa";
  account?: string | null;
  status?: "paid" | "pending" | "overdue";
  clientName?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName: string;
  entries: CategoryEntry[];
  total: number;
  monthKey?: string;
  onMonthChange?: (monthKey: string) => void;
}

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return new Date(y, m - 1, day).toLocaleDateString("pt-BR");
}

export function CategoryDetailsSheet({ open, onOpenChange, categoryName, entries, total, monthKey, onMonthChange }: Props) {
  const isMobile = useIsMobile();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const sorted = useMemo(
    () => [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [entries],
  );

  const isExtra = categoryName.trim().toLowerCase() === "extra";

  const groups = useMemo(() => {
    if (!isExtra) return [];
    const map = new Map<string, { description: string; total: number; items: CategoryEntry[] }>();
    sorted.forEach((e) => {
      const key = (e.description || "Sem descrição").trim();
      const g = map.get(key) ?? { description: key, total: 0, items: [] };
      g.total += Number(e.amount) || 0;
      g.items.push(e);
      map.set(key, g);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [sorted, isExtra]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85vh] rounded-t-2xl flex flex-col p-0"
      >
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
          <SheetTitle className="text-base text-foreground">{categoryName}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex items-center justify-between pt-2">
              <div>
                <div className="text-xs text-muted-foreground">Total acumulado</div>
                <div className="text-lg font-semibold text-foreground">{fmtBRL(total)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Lançamentos</div>
                <div className="text-lg font-semibold text-foreground">{sorted.length}</div>
              </div>
            </div>
          </SheetDescription>
          {monthKey && onMonthChange && (() => {
            const [yy, mm] = monthKey.split("-").map(Number);
            const monthLabel = new Date(yy, mm - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
            return (
              <div className="pt-3 flex justify-center">
                <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/60 p-1">
                  <button
                    type="button"
                    aria-label="Mês anterior"
                    onClick={() => {
                      const d = new Date(yy, mm - 2, 1);
                      onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                    }}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      onMonthChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
                    }}
                    className="px-3 h-9 text-sm font-medium text-foreground capitalize rounded-md hover:bg-background transition-colors min-w-[170px]"
                    title="Voltar ao mês atual"
                  >
                    {monthLabel}
                  </button>
                  <button
                    type="button"
                    aria-label="Próximo mês"
                    onClick={() => {
                      const d = new Date(yy, mm, 1);
                      onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                    }}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            );
          })()}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum lançamento encontrado.
            </p>
          ) : isExtra ? (
            groups.map((g) => {
              const open = expandedGroups.has(g.description);
              return (
                <div key={g.description} className="rounded-lg border border-border bg-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.description)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
                  >
                    <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium text-foreground truncate">
                          {g.description}
                        </div>
                        <div className="text-sm font-semibold shrink-0 text-emerald-500">
                          {fmtBRL(g.total)}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {g.items.length} {g.items.length === 1 ? "registro" : "registros"}
                      </div>
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-border divide-y divide-border">
                      {g.items.map((e) => {
                        const isIncome = e.type === "receita";
                        const Icon = isIncome ? ArrowDownLeft : ArrowUpRight;
                        return (
                          <div key={e.id} className="flex items-start gap-3 p-3 pl-4 bg-muted/20">
                            <div
                              className={`mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                                isIncome ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-sm text-foreground truncate">
                                  {e.description || "Sem descrição"}
                                </div>
                                <div
                                  className={`text-sm font-semibold shrink-0 ${
                                    isIncome ? "text-emerald-500" : "text-rose-500"
                                  }`}
                                >
                                  {isIncome ? "+" : "-"} {fmtBRL(e.amount)}
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground truncate min-h-[16px] leading-4">
                                {e.clientName || "\u00A0"}
                              </div>
                              <div className="mt-1 flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                <span>{fmtDate(e.date)}</span>
                                {e.status && (
                                  <span
                                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                                      e.status === "paid"
                                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                        : e.status === "overdue"
                                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                    }`}
                                  >
                                    {e.status === "paid" ? "Pago" : e.status === "overdue" ? "Atrasado" : "Pendente"}
                                  </span>
                                )}
                                {e.account && <span className="truncate">{e.account}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            sorted.map((e) => {
              const isIncome = e.type === "receita";
              const Icon = isIncome ? ArrowDownLeft : ArrowUpRight;
              return (
                <div
                  key={e.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card"
                >
                  <div
                    className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                      isIncome ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium text-foreground truncate">
                        {e.description || "Sem descrição"}
                      </div>
                      <div
                        className={`text-sm font-semibold shrink-0 ${
                          isIncome ? "text-emerald-500" : "text-rose-500"
                        }`}
                      >
                        {isIncome ? "+" : "-"} {fmtBRL(e.amount)}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground truncate min-h-[16px] leading-4">
                      {e.clientName || "\u00A0"}
                    </div>
                    <div className="mt-1 flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{fmtDate(e.date)}</span>
                      {e.status && (
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                            e.status === "paid"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : e.status === "overdue"
                                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {e.status === "paid" ? "Pago" : e.status === "overdue" ? "Atrasado" : "Pendente"}
                        </span>
                      )}
                      {e.account && <span className="truncate">{e.account}</span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
