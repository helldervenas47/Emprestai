import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PiggyBank, ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import type { PiggyBank as PB, PiggyBankDeposit } from "@/features/piggyBanks/hooks/usePiggyBanks";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  piggyBanks: PB[];
  deposits: PiggyBankDeposit[];
  balances: Map<string, { principal: number; balance: number; yield: number }>;
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PiggyBanksBreakdownDialog({
  open,
  onOpenChange,
  piggyBanks,
  deposits,
  balances,
}: Props) {
  const rows = useMemo(() => {
    return piggyBanks
      .map((pb) => {
        const ds = deposits.filter((d) => d.piggyBankId === pb.id);
        let entradas = 0;
        let saidas = 0;
        for (const d of ds) {
          if (d.amount >= 0) entradas += d.amount;
          else saidas += Math.abs(d.amount);
        }
        const liquido = entradas - saidas;
        const saldo = balances.get(pb.id)?.balance ?? 0;
        return {
          id: pb.id,
          name: pb.name,
          color: pb.color,
          saldo,
          entradas,
          saidas,
          liquido,
          movimentacoes: ds.length,
        };
      })
      .sort((a, b) => b.saldo - a.saldo);
  }, [piggyBanks, deposits, balances]);

  const totalSaldo = rows.reduce((s, r) => s + r.saldo, 0);
  const totalEntradas = rows.reduce((s, r) => s + r.entradas, 0);
  const totalSaidas = rows.reduce((s, r) => s + r.saidas, 0);
  const totalMov = rows.reduce((s, r) => s + r.movimentacoes, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:flex max-sm:flex-col">
        <DialogHeader
          className="px-5 pt-5 pb-3 border-b"
          style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
        >
          <DialogTitle className="flex items-center gap-2 text-base">
            <PiggyBank className="h-4 w-4 text-pink-500" />
            Detalhamento dos Cofrinhos
          </DialogTitle>
          <div className="mt-3 rounded-2xl border border-border/60 bg-gradient-to-br from-pink-500/10 via-pink-500/5 to-transparent p-4 shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Total nos cofrinhos
            </p>
            <p className="text-3xl font-bold tabular-nums leading-tight mt-1">
              {fmt(totalSaldo)}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3 text-success" />
                Entradas: <span className="font-semibold text-foreground tabular-nums">{fmt(totalEntradas)}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <ArrowDownRight className="h-3 w-3 text-destructive" />
                Saídas: <span className="font-semibold text-foreground tabular-nums">{fmt(totalSaidas)}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Activity className="h-3 w-3" />
                {totalMov} mov.
              </span>
            </div>
          </div>
        </DialogHeader>
        <ScrollArea
          className="max-h-[60vh] max-sm:max-h-none max-sm:flex-1 max-sm:h-full px-5 py-4"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum cofrinho cadastrado.
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: `hsl(${r.color})` }}
                      />
                      <p className="text-sm font-semibold text-foreground truncate">
                        {r.name}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        r.saldo < 0 ? "text-destructive" : "text-foreground"
                      }`}
                    >
                      {fmt(r.saldo)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <Stat
                      icon={<ArrowUpRight className="h-3 w-3 text-success" />}
                      label="Entradas"
                      value={fmt(r.entradas)}
                    />
                    <Stat
                      icon={<ArrowDownRight className="h-3 w-3 text-destructive" />}
                      label="Saídas"
                      value={fmt(r.saidas)}
                    />
                    <Stat
                      label="Líquido"
                      value={fmt(r.liquido)}
                      valueClass={r.liquido < 0 ? "text-destructive" : "text-foreground"}
                    />
                    <Stat
                      icon={<Activity className="h-3 w-3" />}
                      label="Movimentações"
                      value={String(r.movimentacoes)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  icon,
  label,
  value,
  valueClass,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="uppercase tracking-wide text-[10px]">{label}</span>
      </div>
      <p className={`mt-0.5 font-semibold tabular-nums ${valueClass ?? "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
