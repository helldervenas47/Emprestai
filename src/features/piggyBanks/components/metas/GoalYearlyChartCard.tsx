import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList, Cell,
} from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHideValues } from "@/contexts/HideValuesContext";
import { useMonthlyGoals, GoalType } from "@/features/piggyBanks/hooks/useMonthlyGoals";
import { useGoalSnapshots } from "@/features/piggyBanks/hooks/useGoalSnapshots";
import { useActiveCapitalSnapshots } from "@/features/piggyBanks/hooks/useActiveCapitalSnapshots";
import { computeActual } from "@/features/piggyBanks/components/GoalsCard";
import { Loan, Payment, Expense, Client, InstallmentSchedule, LoanRenegotiation } from "@/types/loan";
import { getLoanReceivable } from "@/features/loans/lib/loanLateFees";
import { useActiveTooltip } from "./ActiveTooltipContext";
import { StatusSeal } from "./StatusSeal";
import { computeMonthResult } from "@/features/piggyBanks/lib/metasMonthResult";
import { computePeriodAverage, getPeriodMonths, isGoalReached, PeriodSelection } from "@/features/piggyBanks/lib/metasPeriod";
import { GoalDailyEvolutionDialog } from "@/features/piggyBanks/components/metas/GoalDailyEvolutionDialog";

type Unit = "%" | "R$" | "qtd";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTH_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

interface Props {
  goalType: GoalType;
  goalLabel: string;
  unit: Unit;
  inverse?: boolean;
  year: number;
  onYearChange: (y: number) => void;
  loans: Loan[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  installmentSchedules: InstallmentSchedule[];
  renegotiations: LoanRenegotiation[];
  /** Reduced chrome (used inside grid cells) */
  compact?: boolean;
  /** Período usado para calcular o selo de status (OK / Atenção). */
  period?: PeriodSelection;
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

export function GoalYearlyChartCard({
  goalType, goalLabel, unit, inverse, year, onYearChange,
  loans, payments, expenses, clients, installmentSchedules, renegotiations,
  compact = false,
  period,
}: Props) {
  const { hidden } = useHideValues();
  const { goals } = useMonthlyGoals();
  const { getSnapshot } = useGoalSnapshots();
  const isMobile = useIsMobile();
  const currentYear = new Date().getFullYear();
  const chartId = useId();
  const { isActive, claim } = useActiveTooltip(chartId);
  const [dailyMonth, setDailyMonth] = useState<number | null>(null);

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
          if (monthKey === acCurrentMonth) {
            realized = currentActiveCapital;
          } else {
            realized = getSnapshotAmount(monthKey) ?? 0;
          }
        } else {
          const snap = getSnapshot(goalType, monthKey);
          if (isClosed && snap?.finalized) {
            realized = Number(snap.realizedValue) || 0;
          } else {
            const v = computeActual(goalType, monthKey, loans, payments, expenses, clients, installmentSchedules, renegotiations);
            realized = isFinite(v) ? v : 0;
          }
        }
      }

      const snapFinalized = isClosed && !!getSnapshot(goalType, monthKey)?.finalized;
      if (goalType === "daily_received_avg" && !isFuture && !snapFinalized) {
        const [yy, mm] = monthKey.split("-").map(Number);
        const daysInMonth = new Date(yy, mm, 0).getDate();
        const isCurrent = monthKey === currentMonthKey;
        const days = isCurrent ? today.getDate() : daysInMonth;
        realized = days > 0 ? realized / days : 0;
      }

      const exactGoal = goals.find((g) => g.goalType === goalType && g.month === monthKey);
      const hasValidGoal = !!exactGoal;
      const target = exactGoal ? Number(exactGoal.targetValue) || 0 : 0;

      const diff = inverse ? target - realized : realized - target;
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

  // Selo de status: usa o período selecionado (padrão = mês vigente),
  // independente do resultado anual — mesma lógica dos cards/pontuação.
  const seal = useMemo(() => {
    const today = new Date();
    const effective: PeriodSelection = period ?? {
      mode: "month",
      year: today.getFullYear(),
      month: today.getMonth() + 1,
    };
    const months = getPeriodMonths(effective);
    const rows = months.map((mk) =>
      computeMonthResult(goalType, mk, {
        loans, payments, expenses, clients, installmentSchedules, renegotiations,
        goals, getSnapshot, acCurrentMonth, currentActiveCapital, getSnapshotAmount,
      }),
    );
    const { targetAvg, realizedAvg, validCount } = computePeriodAverage(rows);
    const ok = validCount > 0 && isGoalReached(!!inverse, targetAvg, realizedAvg);
    return { show: validCount > 0, ok };
  }, [period, goalType, inverse, loans, payments, expenses, clients, installmentSchedules, renegotiations, goals, getSnapshot, acCurrentMonth, currentActiveCapital, getSnapshotAmount]);

  const showBadge = seal.show;
  const badgeOk = seal.ok;

  return (
    <div
      data-chart-card
      onMouseEnter={claim}
      onMouseMove={claim}
      onTouchStart={claim}
      onPointerDown={claim}
      className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4"
    >
      {/* Header */}
      <div className="flex items-center gap-2 flex-nowrap">
        <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <TrendingUp className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm sm:text-base font-semibold text-foreground truncate">{goalLabel}</h3>
          {!compact && (
            <p className="text-[11px] text-muted-foreground">Realizado (barras) vs Meta (linha)</p>
          )}
        </div>
        {showBadge && !isMobile && <StatusSeal ok={badgeOk} size={compact ? 44 : 56} />}
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onYearChange(year - 1)} aria-label="Ano anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={() => year !== currentYear && onYearChange(currentYear)}
            disabled={year === currentYear}
            title="Voltar ao ano atual"
            className="min-w-[68px] text-center rounded-md border border-border bg-card px-2 py-1 transition-colors hover:bg-accent hover:border-primary/40 disabled:cursor-default"
          >
            <span className="text-sm font-bold tabular-nums">{year}</span>
          </button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onYearChange(year + 1)} aria-label="Próximo ano">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 shrink-0">
        <div className="rounded-md border border-border bg-card/60 p-1.5 text-center">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground leading-tight">Realizado</p>
          <p className="text-[11px] sm:text-xs font-bold text-success mt-0.5 truncate">{fmt(totals.realizedAvg, unit, hidden)}</p>
        </div>
        <div className="rounded-md border border-border bg-card/60 p-1.5 text-center">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground leading-tight">Meta</p>
          <p className="text-[11px] sm:text-xs font-bold text-foreground mt-0.5 truncate">{fmt(totals.targetAvg, unit, hidden)}</p>
        </div>
        <div className="rounded-md border border-border bg-card/60 p-1.5 text-center">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground leading-tight">Meses</p>
          <p className="text-[11px] sm:text-xs font-bold text-primary mt-0.5">{totals.activeMonths}/12</p>
        </div>
        <div className="rounded-md border border-border bg-card/60 p-1.5 text-center">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground leading-tight">Atingimento</p>
          <p className={`text-[11px] sm:text-xs font-bold mt-0.5 ${totals.isPositive ? "text-success" : "text-destructive"}`}>
            {totals.targetAvg > 0 ? `${totals.attainmentPct.toFixed(1).replace(".", ",")}%` : "—"}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: isMobile ? 10 : 20, right: 8, left: 0, bottom: 8 }}>
            <defs>
              <linearGradient id={`goalBarFill-${goalType}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id={`goalBarFillOff-${goalType}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.75} />
                <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis
              dataKey="month"
              height={28}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              tickMargin={6}
              axisLine={{ stroke: "hsl(var(--border))" }}
              interval={0}
              minTickGap={0}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickFormatter={(v: number) => fmtCompact(v, unit)}
              width={54}
            />
            <Tooltip
              {...(isActive ? {} : { active: false })}
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
              verticalAlign="top"
              align="center"
              height={22}
              wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
              iconType="circle"
            />
            <Bar
              dataKey="realized"
              name="Realizado"
              fill={`url(#goalBarFill-${goalType})`}
              radius={[6, 6, 0, 0]}
              maxBarSize={36}
              animationDuration={600}
              cursor={isMobile ? "default" : "pointer"}
              onClick={(entry: any) => {
                if (isMobile) return;
                const idx = MONTH_LABELS.indexOf(entry?.month);
                if (idx < 0) return;
                const row = data[idx];
                if (row?.isFuture) return;
                setDailyMonth(idx + 1);
              }}
            >
              {data.map((d, i) => {
                const off = d.hasValidGoal && !d.isFuture && (inverse ? d.realized > d.target : d.realized < d.target);
                return (
                  <Cell
                    key={`cell-${i}`}
                    fill={off ? `url(#goalBarFillOff-${goalType})` : `url(#goalBarFill-${goalType})`}
                  />
                );
              })}
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
                    const dy = (d.realized < d.target && rel < 0.08) ? -14 : -6;
                    const off = d.hasValidGoal && !d.isFuture && (inverse ? d.realized > d.target : d.realized < d.target);
                    return (
                      <text
                        x={Number(x) + Number(width) / 2}
                        y={Number(y) + dy}
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight={600}
                        fill={off ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
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
                    let dy = -10;
                    if (d.realized >= d.target) dy = 16;
                    else if (rel < 0.08) dy = -22;
                    return (
                      <text
                        x={Number(x)}
                        y={Number(y) + dy}
                        textAnchor="middle"
                        fontSize={9}
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

      {dailyMonth !== null && (
        <GoalDailyEvolutionDialog
          open={dailyMonth !== null}
          onOpenChange={(v) => { if (!v) setDailyMonth(null); }}
          goalType={goalType}
          goalLabel={goalLabel}
          unit={unit}
          inverse={inverse}
          year={year}
          month={dailyMonth}
          target={data[dailyMonth - 1]?.target ?? 0}
          loans={loans}
          payments={payments}
          expenses={expenses}
          clients={clients}
          installmentSchedules={installmentSchedules}
          renegotiations={renegotiations}
        />
      )}
    </div>
  );
}
