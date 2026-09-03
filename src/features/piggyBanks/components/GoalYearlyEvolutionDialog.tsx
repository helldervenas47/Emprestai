import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, TrendingUp, X } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
} from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHideValues } from "@/contexts/HideValuesContext";
import { useMonthlyGoals, GoalType } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import { useGoalSnapshots } from "@/features/piggyBanks/hooks/useGoalSnapshots";
import { useActiveCapitalSnapshots } from "@/features/piggyBanks/hooks/useActiveCapitalSnapshots";
import { computeActual } from "@/features/piggyBanks/components/GoalsCard";
import { getLoanReceivable } from "@/features/loans/lib/loanLateFees";
import { Loan, Payment, Expense, Client, InstallmentSchedule, LoanRenegotiation } from "@/types/loan";

type Unit = "%" | "R$" | "qtd";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTH_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

interface Props {
  open: boolean;
  onClose: () => void;
  goalType: GoalType;
  goalLabel: string;
  unit: Unit;
  inverse?: boolean;
  loans: Loan[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  installmentSchedules: InstallmentSchedule[];
  renegotiations: LoanRenegotiation[];
}

function fmt(v: number, unit: Unit, hidden: boolean): string {
  if (!isFinite(v)) return "—";
  if (hidden && unit === "R$") return "R$ ••••";
  if (unit === "R$") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  if (unit === "%") return `${v.toFixed(2).replace(".", ",")}%`;
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.round(v));
}

function fmtCompact(v: number, unit: Unit): string {
  if (!isFinite(v)) return "—";
  if (unit === "%") return `${v.toFixed(2).replace(".", ",")}%`;
  if (unit === "qtd") return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.round(v));
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2).replace(".", ",")}M`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toFixed(2).replace(".", ",")}k`;
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

export function GoalYearlyEvolutionDialog({
  open, onClose, goalType, goalLabel, unit, inverse,
  loans, payments, expenses, clients, installmentSchedules, renegotiations,
}: Props) {
  const { hidden } = useHideValues();
  const { goals } = useMonthlyGoals();
  const { getSnapshot } = useGoalSnapshots();
  const isMobile = useIsMobile();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);

  // Fonte única para Capital Ativo: mesmos snapshots usados no card.
  const currentActiveCapital = useMemo(
    () => loans
      .filter((l: any) => l.status !== "completed" && l.status !== "paid")
      .reduce((s: number, l: any) => s + getLoanReceivable(l, payments, installmentSchedules), 0),
    [loans, payments, installmentSchedules]
  );
  const { currentMonth: acCurrentMonth, getSnapshotAmount } = useActiveCapitalSnapshots(currentActiveCapital);

  const data = useMemo(() => {
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const monthKey = `${year}-${String(m).padStart(2, "0")}`;
      const isClosed = monthKey < currentMonthKey;
      const isFuture = monthKey > currentMonthKey;

      let realized = 0;
      if (!isFuture) {
        if (goalType === "active_capital") {
          // Usa a mesma fonte do card: snapshot do mês (histórico) ou valor atual (mês corrente).
          if (monthKey === acCurrentMonth) {
            realized = currentActiveCapital;
          } else {
            realized = getSnapshotAmount(monthKey) ?? 0;
          }
        } else {
          const snap = getSnapshot(goalType, monthKey);
          if (isClosed && snap?.finalized && goalType !== "daily_received_avg") {
            realized = Number(snap.realizedValue) || 0;
          } else {
            const v = computeActual(goalType, monthKey, loans, payments, expenses, clients, installmentSchedules, renegotiations);
            realized = isFinite(v) ? v : 0;
          }
        }
      }

      // Para "Receita Média Diária", converter total mensal → média diária
      if (goalType === "daily_received_avg" && !isFuture) {
        const [yy, mm] = monthKey.split("-").map(Number);
        const daysInMonth = new Date(yy, mm, 0).getDate();
        const isCurrent = monthKey === currentMonthKey;
        const days = isCurrent ? today.getDate() : daysInMonth;
        realized = days > 0 ? realized / days : 0;
      }

      // Meta exata (não herdada) apenas
      const exactGoal = goals.find((g) => g.goalType === goalType && g.month === monthKey);
      const hasValidGoal = !!exactGoal;
      const target = exactGoal ? Number(exactGoal.targetValue) || 0 : 0;

      const diff = inverse ? target - realized : realized - target;
      // Atingimento inverso: quanto menor o realizado, melhor. target/realized*100.
      let pct = 0;
      if (target > 0) {
        if (inverse) {
          pct = realized <= 0 ? 200 : (target / realized) * 100;
        } else {
          pct = (realized / target) * 100;
        }
      } else if (inverse && target === 0) {
        pct = realized === 0 ? 100 : 0;
      }

      return {
        month: MONTH_LABELS[i],
        monthFull: MONTH_FULL[i],
        realized,
        target,
        diff,
        pct,
        isFuture,
        hasValidGoal,
      };
    });
  }, [year, goalType, loans, payments, expenses, clients, installmentSchedules, renegotiations, goals, getSnapshot, inverse, acCurrentMonth, currentActiveCapital, getSnapshotAmount]);

  const totals = useMemo(() => {
    const valid = data.filter((d) => d.hasValidGoal && !d.isFuture);
    const n = valid.length;
    const realizedAvg = n > 0 ? valid.reduce((s, d) => s + d.realized, 0) / n : 0;
    const targetAvg = n > 0 ? valid.reduce((s, d) => s + d.target, 0) / n : 0;
    let attainmentPct = 0;
    if (targetAvg > 0) {
      attainmentPct = inverse ? (realizedAvg <= 0 ? 200 : (targetAvg / realizedAvg) * 100) : (realizedAvg / targetAvg) * 100;
    } else if (inverse && targetAvg === 0) {
      attainmentPct = realizedAvg === 0 ? 100 : 0;
    }
    const isPositive = inverse ? realizedAvg <= targetAvg : realizedAvg >= targetAvg;
    return { realizedAvg, targetAvg, attainmentPct, activeMonths: n, isPositive };
  }, [data, inverse]);


  const labelFmt = (v: number) => {
    if (!isFinite(v) || v === 0) return "";
    if (hidden && unit === "R$") return "••••";
    return fmt(v, unit, hidden);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        style={{ padding: 0 }}
        className="w-screen h-[100dvh] max-w-none sm:max-w-none max-h-none rounded-none border-0 flex flex-col gap-0 p-0 overflow-hidden [&>button.absolute]:hidden"
      >
        <DialogHeader
          className="shrink-0 relative px-4 sm:px-5 pb-3 border-b border-border/40 bg-background pt-[max(env(safe-area-inset-top),0.75rem)] sm:pt-8"
        >
          {/* Botão fechar: absoluto no mobile (canto sup. esquerdo) / inline no desktop/tablet */}
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden absolute left-3 top-[max(env(safe-area-inset-top),0.5rem)] h-9 w-9 z-10"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </Button>

          {/* Mobile: título centralizado, com espaço acima para não colidir com o X */}
          <div className="sm:hidden mt-9 flex flex-col items-center text-center gap-2 px-8">
            <div className="flex items-center justify-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <DialogTitle className="text-base leading-tight">
                Evolução Anual · {goalLabel}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-center">
              Comparativo mês a mês entre o realizado (barras) e a meta (linha).
            </DialogDescription>
          </div>

          {/* Desktop/Tablet: layout em linha */}
          <div className="hidden sm:flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onClose} aria-label="Fechar">
              <X className="h-5 w-5" />
            </Button>
            <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg truncate">Evolução Anual · {goalLabel}</DialogTitle>
              <DialogDescription className="text-xs">
                Comparativo mês a mês entre o realizado (barras) e a meta (linha).
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

          {/* Mobile: seletor de ano abaixo do título centralizado */}
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
          {/* Totais rápidos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 shrink-0">
            <div className="rounded-lg border border-border bg-card/60 p-2.5 sm:p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Realizado no ano (média)</p>
              <p className="text-sm sm:text-base font-bold text-success mt-1">{fmt(totals.realizedAvg, unit, hidden)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card/60 p-2.5 sm:p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Meta acumulada (média)</p>
              <p className="text-sm sm:text-base font-bold text-foreground mt-1">{fmt(totals.targetAvg, unit, hidden)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card/60 p-2.5 sm:p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Meses considerados</p>
              <p className="text-sm sm:text-base font-bold text-primary mt-1">{totals.activeMonths} de 12</p>
            </div>
            <div className="rounded-lg border border-border bg-card/60 p-2.5 sm:p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Resultado anual</p>
              <p className={`text-sm sm:text-base font-bold mt-1 ${totals.isPositive ? "text-success" : "text-destructive"}`}>
                {totals.targetAvg > 0 ? `${totals.attainmentPct.toFixed(2).replace(".", ",")}%` : "—"}
              </p>
            </div>
          </div>

          {/* Gráfico ocupa espaço restante */}
          <div className="rounded-lg border border-border bg-card p-2 sm:p-3 flex-1 min-h-[240px] sm:min-h-[280px] flex flex-col">
            <div className="w-full min-w-0 flex-1 min-h-[260px] sm:min-h-[260px]">

              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: isMobile ? 10 : 24, right: 12, left: 0, bottom: 18 }}>
                  <defs>
                    <linearGradient id="goalBarFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis
                    dataKey="month"
                    height={34}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    tickMargin={8}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    interval={0}
                    minTickGap={0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tickFormatter={(v: number) => fmtCompact(v, unit)}
                    width={60}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--primary) / 0.06)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d: any = payload[0].payload;
                      const okColor = inverse ? (d.realized <= d.target ? "text-success" : "text-destructive")
                                              : (d.realized >= d.target ? "text-success" : "text-destructive");
                      return (
                        <div className="rounded-md border border-border bg-popover shadow-lg p-3 text-xs min-w-[180px]">
                          <div className="font-semibold text-foreground mb-1.5">{d.monthFull}</div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Realizado</span>
                            <span className="font-semibold text-primary">{fmt(d.realized, unit, hidden)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Meta</span>
                            <span className="font-semibold text-foreground">{fmt(d.target, unit, hidden)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Atingimento</span>
                            <span className={`font-semibold ${okColor}`}>{d.target > 0 ? `${d.pct.toFixed(2).replace(".", ",")}%` : "—"}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Diferença</span>
                            <span className={`font-semibold ${d.diff >= 0 ? "text-success" : "text-destructive"}`}>
                              {d.diff >= 0 ? "+" : ""}{fmt(d.diff, unit, hidden)}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    verticalAlign={isMobile ? "bottom" : "top"}
                    align="center"
                    height={isMobile ? 24 : 28}
                    wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))", paddingTop: isMobile ? 4 : 0 }}
                    iconType="circle"
                  />
                  <Bar
                    dataKey="realized"
                    name="Realizado"
                    fill="url(#goalBarFill)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                    animationDuration={600}
                  >
                    {!isMobile && (
                      <LabelList
                        dataKey="realized"
                        content={(props: any) => {
                          const { x, y, width, value, index } = props;
                          if (value == null || value === 0) return null;
                          const d: any = data[index];
                          if (!d) return null;
                          const max = Math.max(Math.abs(d.realized), Math.abs(d.target), 1);
                          const rel = Math.abs(d.realized - d.target) / max;
                          // Se realizado ≤ meta e valores muito próximos, meta ficará acima; empurra rótulo do realizado mais para cima
                          const dy = (d.realized < d.target && rel < 0.08) ? -14 : -6;
                          return (
                            <text
                              x={Number(x) + Number(width) / 2}
                              y={Number(y) + dy}
                              textAnchor="middle"
                              fontSize={10}
                              fontWeight={600}
                              fill="hsl(var(--primary))"
                            >
                              {labelFmt(value)}
                            </text>
                          );
                        }}
                      />
                    )}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="target"
                    name="Meta"
                    stroke="hsl(var(--success))"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "hsl(var(--success))", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    animationDuration={700}
                  >
                    {!isMobile && (
                      <LabelList
                        dataKey="target"
                        content={(props: any) => {
                          const { x, y, value, index } = props;
                          if (value == null || value === 0) return null;
                          const d: any = data[index];
                          if (!d) return null;
                          const max = Math.max(Math.abs(d.realized), Math.abs(d.target), 1);
                          const rel = Math.abs(d.realized - d.target) / max;
                          // Regra anti-sobreposição:
                          // - Se realizado ≥ meta: rótulo da meta abaixo da linha (dy = +16).
                          // - Se realizado < meta e valores próximos: empurra meta bem acima (dy = -22).
                          // - Caso contrário: acima da linha por padrão (dy = -10).
                          let dy = -10;
                          if (d.realized >= d.target) dy = 16;
                          else if (rel < 0.08) dy = -22;
                          return (
                            <text
                              x={Number(x)}
                              y={Number(y) + dy}
                              textAnchor="middle"
                              fontSize={10}
                              fontWeight={600}
                              fill="hsl(var(--success))"
                            >
                              {labelFmt(value)}
                            </text>
                          );
                        }}
                      />
                    )}
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground text-center italic shrink-0">
            Passe o mouse (ou toque) sobre um mês para ver o detalhamento completo.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
