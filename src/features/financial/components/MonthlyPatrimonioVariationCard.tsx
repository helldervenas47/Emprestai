import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
const formatBRL = (n: number) =>
  (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
import { useLoans } from "@/features/loans/hooks/useLoans";
import { getBalances } from "@/features/financial/lib/balance";
import { getLoanReceivable } from "@/features/loans/lib/loanLateFees";
import { ArrowUp, ArrowDown, Minus, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/userClient";

const PATRIMONIO_SNAP_KEY = "patrimonio.snapshots.v1";
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

type Snap = { account: number; rua: number; total: number };
const normalizeSnap = (v: any): Snap | null => {
  if (v == null) return null;
  if (typeof v === "number") return { account: 0, rua: 0, total: v };
  if (typeof v === "object" && typeof v.total === "number") {
    return { account: Number(v.account) || 0, rua: Number(v.rua) || 0, total: Number(v.total) };
  }
  return null;
};

export function MonthlyPatrimonioVariationCard() {
  const { loans, payments, installmentSchedules } = useLoans();
  const [dashboardAccount, setDashboardAccount] = useState(0);
  const [dashboardCash, setDashboardCash] = useState(0);
  const [snapsMap, setSnapsMap] = useState<Record<string, any>>({});

  const reloadBalances = useCallback(async () => {
    try {
      const b = await getBalances();
      setDashboardAccount(b.account || 0);
      setDashboardCash(b.cash || 0);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    reloadBalances();
    const onChange = () => { reloadBalances(); };
    window.addEventListener("balance:changed", onChange);
    return () => window.removeEventListener("balance:changed", onChange);
  }, [reloadBalances]);

  const pendingLoans = useMemo(
    () =>
      loans
        .filter((l) => l.status !== "paid")
        .reduce((s, l) => s + getLoanReceivable(l, payments, installmentSchedules), 0),
    [loans, payments, installmentSchedules],
  );

  const contaMaisDinheiro = dashboardAccount + dashboardCash;
  const patrimonioAtual = contaMaisDinheiro + pendingLoans;

  const now = new Date();
  const currentKey = monthKey(now);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = monthKey(prevDate);

  const prevMonthName = prevDate.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  const currentMonthName = now.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");

  const reloadSnaps = useCallback(async () => {
    try {
      let snaps: Record<string, any> = {};
      const raw = localStorage.getItem(PATRIMONIO_SNAP_KEY);
      if (raw) {
        snaps = JSON.parse(raw);
      }

      // Consulta backend se disponível
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (user) {
        const { data: ownerRow } = await supabase
          .from("user_owner" as any)
          .select("owner_id")
          .eq("user_id", user.id)
          .maybeSingle();
        const ownerId = (ownerRow as any)?.owner_id || user.id;

        const { data } = await (supabase as any)
          .from("patrimonio_snapshots")
          .select("month, account, rua, total")
          .eq("owner_id", ownerId);

        if (data && Array.isArray(data)) {
          data.forEach((row) => {
            snaps[row.month] = {
              account: Number(row.account) || 0,
              rua: Number(row.rua) || 0,
              total: Number(row.total) || 0,
            };
          });
        }
      }

      // Seeds padrão se não existirem
      if (snaps[prevKey] == null) {
        snaps[prevKey] = 79235.36;
      }

      setSnapsMap(snaps);
    } catch {
      setSnapsMap({});
    }
  }, [prevKey]);

  useEffect(() => {
    reloadSnaps();
    const onChange = () => { reloadSnaps(); };
    window.addEventListener("patrimonio:snapshots-changed", onChange);
    return () => window.removeEventListener("patrimonio:snapshots-changed", onChange);
  }, [reloadSnaps]);

  const prevSnap = useMemo(() => normalizeSnap(snapsMap[prevKey]), [snapsMap, prevKey]);
  const patrimonioMesPassado = prevSnap?.total ?? 79235.36;

  const diferenca = patrimonioAtual - patrimonioMesPassado;
  const variacaoPct =
    patrimonioMesPassado !== 0 ? (diferenca / Math.abs(patrimonioMesPassado)) * 100 : 0;

  const trend: "up" | "down" | "flat" =
    Math.abs(variacaoPct) < 0.005 ? "flat" : variacaoPct > 0 ? "up" : "down";

  const TrendIcon = trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : Minus;
  const trendTextColor =
    trend === "up" ? "text-emerald-600 dark:text-emerald-400" : trend === "down" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground";
  const trendBgColor =
    trend === "up"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
      : trend === "down"
      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
      : "bg-muted text-muted-foreground border-border";

  return (
    <div className="h-auto w-full rounded-2xl border border-border/60 bg-card hover:border-border transition-all duration-200 p-3.5 sm:p-4 space-y-3 shadow-2xs">
      {/* Header do Card */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-1.5 text-primary shrink-0">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-bold text-foreground leading-tight">Variação Mensal</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Comparativo de evolução patrimonial</p>
          </div>
        </div>

        <div className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold inline-flex items-center gap-1 border ${trendBgColor}`}>
          <TrendIcon className="h-3 w-3" />
          <span>{variacaoPct >= 0 ? "+" : ""}{variacaoPct.toFixed(2)}%</span>
        </div>
      </div>

      {/* Grid de 4 Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-2.5 pt-1">
        {/* Mês Passado */}
        <div className="rounded-xl border border-border/40 bg-muted/30 p-2.5 sm:p-3 flex flex-col justify-between">
          <p className="text-[10px] sm:text-[11px] font-medium text-muted-foreground truncate">
            Mês passado ({prevMonthName})
          </p>
          <p className="mt-1 text-xs sm:text-sm md:text-base font-bold tabular-nums text-foreground truncate">
            {formatBRL(patrimonioMesPassado)}
          </p>
        </div>

        {/* Patrimônio Atual */}
        <div className="rounded-xl border border-border/40 bg-muted/30 p-2.5 sm:p-3 flex flex-col justify-between">
          <p className="text-[10px] sm:text-[11px] font-medium text-muted-foreground truncate">
            Patrimônio atual ({currentMonthName})
          </p>
          <p className="mt-1 text-xs sm:text-sm md:text-base font-bold tabular-nums text-foreground truncate">
            {formatBRL(patrimonioAtual)}
          </p>
        </div>

        {/* Diferença */}
        <div className="rounded-xl border border-border/40 bg-muted/30 p-2.5 sm:p-3 flex flex-col justify-between">
          <p className="text-[10px] sm:text-[11px] font-medium text-muted-foreground truncate">
            Diferença
          </p>
          <p className={`mt-1 text-xs sm:text-sm md:text-base font-bold tabular-nums truncate ${trendTextColor}`}>
            {diferenca >= 0 ? "+" : "−"} {formatBRL(Math.abs(diferenca))}
          </p>
        </div>

        {/* Variação (%) */}
        <div className="rounded-xl border border-border/40 bg-muted/30 p-2.5 sm:p-3 flex flex-col justify-between">
          <p className="text-[10px] sm:text-[11px] font-medium text-muted-foreground truncate">
            Variação (%)
          </p>
          <p className={`mt-1 text-xs sm:text-sm md:text-base font-bold tabular-nums truncate flex items-center gap-1 ${trendTextColor}`}>
            <TrendIcon className="h-3 w-3 shrink-0" />
            <span>{variacaoPct >= 0 ? "+" : ""}{variacaoPct.toFixed(2)}%</span>
          </p>
        </div>
      </div>
    </div>
  );
}
