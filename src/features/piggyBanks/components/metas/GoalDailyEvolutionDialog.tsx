import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { useHideValues } from "@/contexts/HideValuesContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { computeDailyEvolution } from "@/features/piggyBanks/lib/metasDailyEvolution";
import type { GoalType } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import type { Loan, Payment, Expense, Client, InstallmentSchedule, LoanRenegotiation } from "@/types/loan";

type Unit = "%" | "R$" | "qtd";

const MONTH_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  goalType: GoalType;
  goalLabel: string;
  unit: Unit;
  inverse?: boolean;
  year: number;
  month: number; // 1-12
  target: number;
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
  if (unit === "R$") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  if (unit === "%") return `${v.toFixed(2).replace(".", ",")}%`;
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.round(v));
}

function fmtCompact(v: number, unit: Unit): string {
  if (!isFinite(v)) return "—";
  if (unit === "%") return `${v.toFixed(1).replace(".", ",")}%`;
  if (unit === "qtd") return String(Math.round(v));
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toFixed(1).replace(".", ",")}k`;
  return `R$ ${v.toFixed(0)}`;
}

export function GoalDailyEvolutionDialog({
  open, onOpenChange,
  goalType, goalLabel, unit, inverse, year, month, target,
  loans, payments, expenses, clients, installmentSchedules, renegotiations,
}: Props) {
  const { hidden } = useHideValues();
  const isMobile = useIsMobile();

  const points = useMemo(() => {
    if (!open) return [];
    return computeDailyEvolution(goalType, year, month, {
      loans, payments, expenses, clients, installmentSchedules, renegotiations,
    });
  }, [open, goalType, year, month, loans, payments, expenses, clients, installmentSchedules, renegotiations]);

  const data = useMemo(
    () => points.map((p, i) => {
      const prev = i > 0 ? points[i - 1] : null;
      const daily = p.isFuture ? null
        : (prev && !prev.isFuture && Number.isFinite(prev.value) ? p.value - prev.value : p.value);
      return {
        day: p.dayLabel,
        value: p.isFuture ? null : p.value,
        daily,
        target: target > 0 ? target : null,
        isFuture: p.isFuture,
      };
    }),
    [points, target],
  );

  const stats = useMemo(() => {
    const valid = points.filter((p) => !p.isFuture && Number.isFinite(p.value));
    if (valid.length === 0) return null;
    // Daily delta: value of the day minus previous valid day (0 for first day)
    const deltas = valid.map((p, i) => ({
      dayLabel: p.dayLabel,
      value: i === 0 ? p.value : p.value - valid[i - 1].value,
      absolute: p.value,
    }));
    const values = deltas.map((d) => d.value);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const best = deltas.reduce((b, d) => (inverse ? d.value < b.value : d.value > b.value) ? d : b, deltas[0]);
    const worst = deltas.reduce((b, d) => (inverse ? d.value > b.value : d.value < b.value) ? d : b, deltas[0]);
    const last = valid[valid.length - 1];
    return { avg, best, worst, last, count: valid.length };
  }, [points, inverse]);

  const notAvailable = goalType === "monthly_variation";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {goalLabel}
            <span className="text-sm font-normal text-muted-foreground">
              — {MONTH_FULL[month - 1]} {year}
            </span>
          </DialogTitle>
          <DialogDescription>
            Evolução dia a dia dentro do mês selecionado. A linha tracejada representa a meta mensal.
          </DialogDescription>
        </DialogHeader>

        {notAvailable ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            A meta de Variação Mensal depende do patrimônio consolidado por mês e
            não possui granularidade diária.
          </div>
        ) : (
          <>
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-md border border-border bg-card/60 p-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Meta</p>
                  <p className="text-sm font-bold text-foreground">{fmt(target, unit, hidden)}</p>
                </div>
                <div className="rounded-md border border-border bg-card/60 p-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Último dia</p>
                  <p className="text-sm font-bold text-primary">{fmt(stats.last.value, unit, hidden)}</p>
                </div>
                <div className="rounded-md border border-border bg-card/60 p-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Melhor ({stats.best.dayLabel})</p>
                  <p className="text-sm font-bold text-success">{fmt(stats.best.value, unit, hidden)}</p>
                </div>
                <div className="rounded-md border border-border bg-card/60 p-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pior ({stats.worst.dayLabel})</p>
                  <p className="text-sm font-bold text-destructive">{fmt(stats.worst.value, unit, hidden)}</p>
                </div>
              </div>
            )}

            <div className="h-[320px] sm:h-[380px] mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    interval={isMobile ? 2 : 1}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    tickFormatter={(v: number) => fmtCompact(v, unit)}
                    width={60}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const p: any = payload[0].payload;
                      if (p.isFuture) return null;
                      const val = p.value ?? 0;
                      const daily = p.daily ?? 0;
                      const diff = target > 0 ? (inverse ? target - val : val - target) : 0;
                      const ok = target > 0 ? (inverse ? val <= target : val >= target) : true;
                      return (
                        <div className="rounded-md border border-border bg-popover shadow-lg p-3 text-xs min-w-[180px]">
                          <div className="font-semibold text-foreground mb-1.5">Dia {label}</div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Realizado do dia</span>
                            <span className="font-semibold text-primary">
                              {daily >= 0 ? "+" : ""}{fmt(daily, unit, hidden)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Acumulado</span>
                            <span className="font-semibold text-foreground">{fmt(val, unit, hidden)}</span>
                          </div>
                          {target > 0 && (
                            <>
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Meta</span>
                                <span className="font-semibold text-foreground">{fmt(target, unit, hidden)}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Diferença</span>
                                <span className={`font-semibold ${ok ? "text-success" : "text-destructive"}`}>
                                  {diff >= 0 ? "+" : ""}{fmt(diff, unit, hidden)}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={22}
                    wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
                    iconType="circle"
                  />
                  {target > 0 && (
                    <ReferenceLine y={target} stroke="hsl(var(--success))" strokeDasharray="4 4" ifOverflow="extendDomain" />
                  )}
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="Realizado"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="target"
                    name="Meta"
                    stroke="hsl(var(--success))"
                    strokeWidth={0}
                    dot={false}
                    legendType="line"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
