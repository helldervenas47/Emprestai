import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, TrendingUp, X } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHideValues } from "@/contexts/HideValuesContext";
import { useManagerCommissions } from "@/features/payroll/hooks/useManagerCommissions";
import { buildPaidCommissionEntries, toDate, roundCommission99 } from "@/features/payroll/lib/managerCommissionsCore";
import { Client, Loan, Payment, InstallmentSchedule } from "@/types/loan";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTH_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const BAR_COLOR = "hsl(var(--primary))";

interface Props {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
}

function fmtBRL(v: number, hidden: boolean): string {
  if (hidden) return "R$ ••••";
  const adjusted = roundCommission99(v);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(adjusted);
}

function fmtCompactBRL(v: number): string {
  const adjusted = roundCommission99(v);
  const abs = Math.abs(adjusted);
  if (abs >= 1_000_000) return `R$ ${(adjusted / 1_000_000).toFixed(2).replace(".", ",")}M`;
  if (abs >= 1_000) return `R$ ${(adjusted / 1_000).toFixed(2).replace(".", ",")}k`;
  return `R$ ${adjusted.toFixed(2).replace(".", ",")}`;
}

// Lógica de comissões pagas centralizada em managerCommissionsCore.


export function ManagerCommissionsYearlyDialog({
  open, onClose, clients, loans, payments, installmentSchedules,
}: Props) {
  const { commissions } = useManagerCommissions(true);
  const { hidden } = useHideValues();
  const isMobile = useIsMobile();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);

  const paidEntries = useMemo(
    () => buildPaidCommissionEntries({ clients, loans, payments, commissions }),
    [clients, loans, payments, commissions]
  );

  // Comissões pagas (registradas + derivadas) por mês e gerente para o ano selecionado
  const { rows, managersInYear, totalYear, monthsWithData, topManager } = useMemo(() => {
    // matriz[monthIndex][managerId] = valor
    const matrix: Record<string, Record<string, number>> = {};
    for (let i = 0; i < 12; i++) matrix[String(i)] = {};

    const nameById = new Map<string, string>();
    paidEntries.forEach((e) => {
      const d = toDate(e.date);
      if (Number.isNaN(d.getTime()) || d.getFullYear() !== year) return;
      const mi = String(d.getMonth());
      matrix[mi][e.managerId] = (matrix[mi][e.managerId] || 0) + e.amount;
      nameById.set(e.managerId, e.managerName);
    });

    // Descobrir gerentes com valores no ano
    const idsInYear = new Set<string>();
    for (let i = 0; i < 12; i++) {
      Object.entries(matrix[String(i)]).forEach(([id, v]) => { if (v > 0) idsInYear.add(id); });
    }
    const managersInYear = Array.from(idsInYear)
      .map((id) => ({ id, name: nameById.get(id) ?? "Gerente removido" }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));


    const rows = Array.from({ length: 12 }, (_, i) => {
      const row: any = { month: MONTH_LABELS[i], monthFull: MONTH_FULL[i], total: 0 };
      managersInYear.forEach((m) => {
        const v = matrix[String(i)][m.id] || 0;
        row[m.id] = v;
        row.total += v;
      });
      return row;
    });

    const totalYear = rows.reduce((s, r) => s + r.total, 0);
    const monthsWithData = rows.filter((r) => r.total > 0).length;
    // top manager acumulado
    const perManagerYear: Record<string, number> = {};
    managersInYear.forEach((m) => {
      perManagerYear[m.id] = rows.reduce((s, r) => s + (r[m.id] || 0), 0);
    });
    let topId: string | null = null;
    let topVal = 0;
    Object.entries(perManagerYear).forEach(([id, v]) => { if (v > topVal) { topVal = v; topId = id; } });
    const topManager = topId ? { name: managersInYear.find((m) => m.id === topId)?.name ?? "—", value: topVal } : null;

    return { rows, managersInYear, totalYear, monthsWithData, topManager };
  }, [year, paidEntries]);

  const monthlyAvg = monthsWithData > 0 ? totalYear / monthsWithData : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        style={{ padding: 0 }}
        className="w-screen h-[100dvh] max-w-none sm:max-w-none max-h-none rounded-none border-0 flex flex-col gap-0 p-0 overflow-hidden [&>button.absolute]:hidden"
      >
        <DialogHeader
          className="shrink-0 relative px-4 sm:px-5 pb-3 border-b border-border/40 bg-background pt-[max(env(safe-area-inset-top),0.75rem)] sm:pt-8"
        >
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden absolute left-3 top-[max(env(safe-area-inset-top),0.5rem)] h-9 w-9 z-10"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </Button>

          {/* Mobile: título centralizado */}
          <div className="sm:hidden mt-9 flex flex-col items-center text-center gap-2 px-8">
            <div className="flex items-center justify-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <DialogTitle className="text-base leading-tight">
                Evolução Anual · Comissões por Gerente
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-center">
              Valor real de comissões pagas em cada mês, agrupado por gerente.
            </DialogDescription>
          </div>

          {/* Desktop/Tablet */}
          <div className="hidden sm:flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onClose} aria-label="Fechar">
              <X className="h-5 w-5" />
            </Button>
            <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg truncate">Evolução Anual · Comissões por Gerente</DialogTitle>
              <DialogDescription className="text-xs">
                Valor real de comissões pagas em cada mês, agrupado por gerente.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setYear((y) => y - 1)} aria-label="Ano anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <button
                type="button"
                onClick={() => year !== currentYear && setYear(currentYear)}
                disabled={year === currentYear}
                title="Voltar ao ano atual"
                aria-label="Voltar ao ano atual"
                className="min-w-[90px] text-center rounded-lg border border-border bg-card px-3 py-1.5 transition-colors hover:bg-accent hover:border-primary/40 active:scale-[0.98] disabled:cursor-default disabled:opacity-100 cursor-pointer"
              >
                <span className="text-base font-bold text-foreground tabular-nums">{year}</span>
              </button>
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setYear((y) => y + 1)} aria-label="Próximo ano">
                <ChevronRight className="h-4 w-4" />
              </Button>
              {year !== currentYear && (
                <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setYear(currentYear)}>
                  Hoje
                </Button>
              )}
            </div>
          </div>

          {/* Mobile: seletor de ano */}
          <div className="mt-3 flex sm:hidden items-center justify-center gap-2">
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setYear((y) => y - 1)} aria-label="Ano anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={() => year !== currentYear && setYear(currentYear)}
              disabled={year === currentYear}
              title="Voltar ao ano atual"
              aria-label="Voltar ao ano atual"
              className="min-w-[110px] text-center rounded-lg border border-border bg-card px-4 py-1.5 transition-colors hover:bg-accent hover:border-primary/40 active:scale-[0.98] disabled:cursor-default disabled:opacity-100 cursor-pointer"
            >
              <span className="text-lg font-bold text-foreground tabular-nums">{year}</span>
            </button>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setYear((y) => y + 1)} aria-label="Próximo ano">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {year !== currentYear && (
              <Button variant="ghost" size="sm" className="h-9 text-xs ml-1" onClick={() => setYear(currentYear)}>
                Hoje
              </Button>
            )}
          </div>
        </DialogHeader>


        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-5 py-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 shrink-0">
            <div className="rounded-lg border border-border bg-card/60 p-2.5 sm:p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total anual</p>
              <p className="text-sm sm:text-base font-bold text-success mt-1">{fmtBRL(totalYear, hidden)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card/60 p-2.5 sm:p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Média mensal</p>
              <p className="text-sm sm:text-base font-bold text-primary mt-1">{fmtBRL(monthlyAvg, hidden)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card/60 p-2.5 sm:p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Meses com dados</p>
              <p className="text-sm sm:text-base font-bold text-foreground mt-1">{monthsWithData} de 12</p>
            </div>
            <div className="rounded-lg border border-border bg-card/60 p-2.5 sm:p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Maior comissão</p>
              <p className="text-xs sm:text-sm font-bold text-foreground mt-1 truncate" title={topManager?.name ?? "—"}>
                {topManager?.name ?? "—"}
              </p>
              <p className="text-[10px] sm:text-xs font-semibold text-primary">
                {topManager ? fmtBRL(topManager.value, hidden) : ""}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-2 sm:p-3 flex-1 min-h-[240px] sm:min-h-[280px] flex flex-col">
            <div className="w-full min-w-0 flex-1 min-h-[220px] sm:min-h-[260px] max-h-[46vh] sm:max-h-none">

              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: isMobile ? 10 : 24, right: 12, left: 0, bottom: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="month" height={34} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} tickMargin={8} axisLine={{ stroke: "hsl(var(--border))" }} interval={0} minTickGap={0} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={(v: number) => fmtCompactBRL(v)} width={70} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--primary) / 0.06)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d: any = payload[0].payload;
                      return (
                        <div className="rounded-md border border-border bg-popover shadow-lg p-3 text-xs min-w-[180px]">
                          <div className="font-semibold text-foreground mb-1.5">{d.monthFull}</div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Comissões pagas</span>
                            <span className="font-bold text-primary">{fmtBRL(d.total, hidden)}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="total"
                    name="Comissões pagas"
                    fill={BAR_COLOR}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                    animationDuration={600}
                  >
                    {!isMobile && (
                      <LabelList
                        dataKey="total"
                        position="top"
                        formatter={(v: number) => (v > 0 ? fmtBRL(v, hidden) : "")}
                        style={{ fontSize: 10, fill: "hsl(var(--primary))", fontWeight: 600 }}
                      />
                    )}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {managersInYear.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-2">Sem comissões registradas em {year}.</p>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground text-center italic shrink-0">
            Passe o mouse (ou toque) sobre um mês para ver a participação de cada gerente.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
