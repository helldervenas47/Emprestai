import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import { ArrowDownCircle, ArrowUpCircle, Plus, TrendingUp, TrendingDown, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PiggyBankDeposit } from "@/features/piggyBanks/hooks/usePiggyBanks";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface Props {
  totalBalance: number;
  totalYield: number;
  totalGross?: number;
  totalIof?: number;
  totalIr?: number;
  deposits: PiggyBankDeposit[];
  cdiAnnualRate?: number | null;
  count: number;
  readOnly?: boolean;
  hasBanks: boolean;
  mask: (v: string) => string;
  onStore: () => void;
  onWithdraw: () => void;
  onCreate: () => void;
}

const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function PiggyBanksHero({
  totalBalance,
  totalYield,
  totalGross,
  totalIof,
  totalIr,
  deposits,
  cdiAnnualRate,
  count,
  readOnly = false,
  hasBanks,
  mask,
  onStore,
  onWithdraw,
  onCreate,
}: Props) {
  // Evolução do total guardado nos últimos 6 meses (acumulado dos aportes/resgates),
  // ancorando o último ponto no saldo atual real (que já inclui rendimento).
  const { series, variation } = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; end: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: MONTH_LABELS[d.getMonth()],
        end: `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`,
      });
    }
    const rows = months.map((m) => {
      const acc = deposits.reduce((s, d) => (d.depositDate <= m.end ? s + d.amount : s), 0);
      return { label: m.label, value: Math.max(0, acc) };
    });
    if (rows.length > 0) rows[rows.length - 1].value = Math.max(0, totalBalance);
    const prev = rows.length > 1 ? rows[rows.length - 2].value : 0;
    const curr = rows.length > 0 ? rows[rows.length - 1].value : 0;
    const variation = prev > 0 ? ((curr - prev) / prev) * 100 : null;
    return { series: rows, variation };
  }, [deposits, totalBalance]);

  const up = (variation ?? 0) >= 0;
  const hasTaxInfo = (totalGross ?? 0) > 0 || (totalIof ?? 0) > 0 || (totalIr ?? 0) > 0;

  return (
    <div className="rounded-3xl border border-border/50 bg-gradient-to-b from-primary/[0.08] via-card to-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Total guardado
          </p>
          <p className="mt-1 text-[2rem] leading-none font-black tabular-nums tracking-tight text-foreground">
            {mask(fmt(totalBalance))}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="inline-flex items-center gap-1 font-semibold text-success">
              <TrendingUp className="h-3 w-3" />
              {mask(fmt(totalYield))} <span className="font-normal text-muted-foreground">de rendimento líquido</span>
            </span>
            {variation !== null && (
              <span
                className={`inline-flex items-center gap-1 font-semibold ${up ? "text-success" : "text-destructive"}`}
              >
                {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {up ? "+" : ""}
                {variation.toFixed(1)}%
                <span className="font-normal text-muted-foreground">vs mês anterior</span>
              </span>
            )}
          </div>

          {/* Demonstrativo de Rendimento Bruto e Impostos (IOF e IR) - informações soltas */}
          {hasTaxInfo && (
            <div className="mt-3 pt-2.5 border-t border-border/40 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]">
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-medium">Bruto (CDI)</span>
                <span className="font-bold text-foreground tabular-nums text-xs">{mask(fmt(totalGross ?? totalYield))}</span>
              </div>
              <div className="hidden sm:block h-6 w-px bg-border/40" />
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-medium">IOF</span>
                <span className={`font-bold tabular-nums text-xs ${(totalIof ?? 0) > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {(totalIof ?? 0) > 0 ? `-${mask(fmt(totalIof ?? 0))}` : "R$ 0,00"}
                </span>
              </div>
              <div className="hidden sm:block h-6 w-px bg-border/40" />
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-medium">IR</span>
                <span className={`font-bold tabular-nums text-xs ${(totalIr ?? 0) > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {(totalIr ?? 0) > 0 ? `-${mask(fmt(totalIr ?? 0))}` : "R$ 0,00"}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="h-9 w-9 rounded-2xl bg-primary/10 flex items-center justify-center">
            <PiggyBank className="h-4.5 w-4.5 text-primary" />
          </div>
          {cdiAnnualRate ? (
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
              CDI {cdiAnnualRate.toFixed(2)}%
            </span>
          ) : null}
          <span className="text-[10px] text-muted-foreground">
            {count} {count === 1 ? "caixinha" : "caixinhas"}
          </span>
        </div>
      </div>

      {/* Evolução */}
      <div className="mt-4 h-24 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="pbHeroFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <RTooltip
              cursor={{ stroke: "hsl(var(--border))" }}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                fontSize: 11,
                color: "hsl(var(--popover-foreground))",
              }}
              formatter={(v: number) => [fmt(Number(v)), "Guardado"]}
              labelFormatter={(l) => String(l).toUpperCase()}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#pbHeroFill)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {series.map((s, i) => (
          <span key={`${s.label}-${i}`}>{s.label}</span>
        ))}
      </div>

      {/* Ações rápidas */}
      {!readOnly && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button
            data-mutation
            variant="default"
            className="h-11 rounded-2xl text-xs font-semibold"
            onClick={onStore}
            disabled={!hasBanks}
          >
            <ArrowDownCircle className="h-4 w-4 mr-1.5" /> Guardar
          </Button>
          <Button
            data-mutation
            variant="outline"
            className="h-11 rounded-2xl text-xs font-semibold"
            onClick={onWithdraw}
            disabled={!hasBanks}
          >
            <ArrowUpCircle className="h-4 w-4 mr-1.5" /> Resgatar
          </Button>
          <Button
            data-mutation
            variant="outline"
            className="h-11 rounded-2xl text-xs font-semibold"
            onClick={onCreate}
          >
            <Plus className="h-4 w-4 mr-1.5" /> Nova
          </Button>
        </div>
      )}
    </div>
  );
}
