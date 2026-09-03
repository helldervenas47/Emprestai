import { useId, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHideValues } from "@/contexts/HideValuesContext";
import { useManagerCommissions } from "@/features/payroll/hooks/useManagerCommissions";
import { buildPaidCommissionEntries, sumPaidByMonth, roundCommission99 } from "@/features/payroll/lib/managerCommissionsCore";
import { Client, Loan, Payment } from "@/types/loan";
import { useActiveTooltip } from "./ActiveTooltipContext";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTH_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

interface Props {
  year: number;
  onYearChange: (y: number) => void;
  clients: Client[];
  loans: Loan[];
  payments: Payment[];
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


export function ManagerCommissionsYearlyCard({ year, onYearChange, clients, loans, payments }: Props) {
  const { commissions } = useManagerCommissions(true);
  const { hidden } = useHideValues();
  const isMobile = useIsMobile();
  const currentYear = new Date().getFullYear();
  const chartId = useId();
  const { isActive, claim } = useActiveTooltip(chartId);

  const paidEntries = useMemo(
    () => buildPaidCommissionEntries({ clients, loans, payments, commissions }),
    [clients, loans, payments, commissions]
  );

  const { rows, totalYear, monthsWithData } = useMemo(() => {
    const totals = sumPaidByMonth(paidEntries, year);
    const rows = totals.map((t, i) => ({ month: MONTH_LABELS[i], monthFull: MONTH_FULL[i], total: t }));
    const totalYear = totals.reduce((s, v) => s + v, 0);
    const monthsWithData = totals.filter((v) => v > 0).length;
    return { rows, totalYear, monthsWithData };
  }, [paidEntries, year]);


  const monthlyAvg = monthsWithData > 0 ? totalYear / monthsWithData : 0;

  return (
    <div
      data-chart-card
      onMouseEnter={claim}
      onMouseMove={claim}
      onTouchStart={claim}
      onPointerDown={claim}
      className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <TrendingUp className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm sm:text-base font-semibold text-foreground truncate">Comissões por Gerente</h3>
        </div>
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

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 shrink-0">
        <div className="rounded-md border border-border bg-card/60 p-1.5 text-center">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground leading-tight">Total anual</p>
          <p className="text-[11px] sm:text-xs font-bold text-success mt-0.5 truncate">{fmtBRL(totalYear, hidden)}</p>
        </div>
        <div className="rounded-md border border-border bg-card/60 p-1.5 text-center">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground leading-tight">Média mensal</p>
          <p className="text-[11px] sm:text-xs font-bold text-primary mt-0.5 truncate">{fmtBRL(monthlyAvg, hidden)}</p>
        </div>
        <div className="rounded-md border border-border bg-card/60 p-1.5 text-center">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground leading-tight">Meses</p>
          <p className="text-[11px] sm:text-xs font-bold text-foreground mt-0.5">{monthsWithData}/12</p>
        </div>
      </div>

      <div className="flex-1 min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: isMobile ? 10 : 22, right: 8, left: 0, bottom: 8 }}>
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
              tickFormatter={(v: number) => fmtCompactBRL(v)}
              width={54}
            />
            <Tooltip
              {...(isActive ? {} : { active: false })}
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
              fill="hsl(var(--primary))"
              radius={[6, 6, 0, 0]}
              maxBarSize={36}
              animationDuration={600}
            >
              {!isMobile && (
                <LabelList
                  dataKey="total"
                  position="top"
                  formatter={(v: number) => (v > 0 ? fmtBRL(v, hidden) : "")}
                  style={{ fontSize: 9, fill: "hsl(var(--primary))", fontWeight: 600 }}
                />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
