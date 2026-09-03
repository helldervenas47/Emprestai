import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Settings, TrendingUp, Wallet, Landmark, Banknote, PiggyBank, Car, ArrowDownCircle, ArrowUpRight, ArrowDownRight, PieChart, Percent, Hourglass, BarChart3, Trophy, CalendarClock, CalendarX, LineChart, Gem, ArrowUp, ArrowDown, Minus, ChevronLeft, ChevronRight } from "lucide-react";
import { useLoans } from "@/features/loans/hooks/useLoans";
import { getLoanReceivable } from "@/features/loans/lib/loanLateFees";
import { useProducts } from "@/features/sales/hooks/useProducts";
import { usePiggyBanks } from "@/features/piggyBanks/hooks/usePiggyBanks";
import { useIncomes } from "@/features/financial/hooks/useIncomes";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import { useUnifiedAccountBalanceState } from "@/features/financial/hooks/useUnifiedAccountBalance";
import { getBalances } from "@/features/financial/lib/balance";
import { supabase } from "@/integrations/supabase/userClient";
import { useDashboardPrefs, DEFAULT_EXTRA as PREFS_DEFAULT_EXTRA, DEFAULT_VIS as PREFS_DEFAULT_VIS } from "@/features/dashboard/hooks/useDashboardPrefs";
import type { Sale } from "@/types/loan";
import { PiggyBanksBreakdownDialog } from "@/features/piggyBanks/components/PiggyBanksBreakdownDialog";
import { StockBreakdownDialog } from "@/features/sales/components/StockBreakdownDialog";
import { useFinanceComponentDebug } from "@/lib/financeDebug";

type MaosVisibility = {
  account: boolean;
  cash: boolean;
  incomes: boolean;
  piggy: boolean;
  vehicle: boolean;
};
const VIS_STORAGE_KEY = "balanceMaos.visibility.v1";
const DEFAULT_VIS: MaosVisibility = {
  account: true,
  cash: true,
  incomes: true,
  piggy: true,
  vehicle: true,
};

// Cards extras (escolha 2) — aparecem abaixo dos cards de valores
type ExtraCardKey =
  | "composicao"
  | "projecao30"
  | "savingsRate"
  | "runway"
  | "topCategories"
  | "biggest"
  | "nextIncomes7"
  | "nextBills7"
  | "piggySummary"
  | "monthCompare";
const EXTRA_STORAGE_KEY = "balanceMaos.extraCards.v1";
const DEFAULT_EXTRA: ExtraCardKey[] = ["composicao", "projecao30"];
const EXTRA_CARDS_META: { key: ExtraCardKey; label: string; hint: string }[] = [
  { key: "composicao", label: "Composição do saldo", hint: "Distribuição % por carteira" },
  { key: "projecao30", label: "Projeção do mês", hint: "Saldo projetado até o fim do mês vigente" },
  { key: "savingsRate", label: "Taxa de poupança do mês", hint: "(Entradas − Saídas) / Entradas" },
  { key: "runway", label: "Fôlego financeiro", hint: "Meses cobertos pelo saldo atual" },
  { key: "topCategories", label: "Top 3 categorias do mês", hint: "Maiores categorias de despesa" },
  { key: "biggest", label: "Maior entrada e saída", hint: "Destaques do mês" },
  { key: "nextIncomes7", label: "Próximos recebimentos (7d)", hint: "Receitas pendentes da semana" },
  { key: "nextBills7", label: "Contas a vencer (7d)", hint: "Despesas pessoais da semana" },
  { key: "piggySummary", label: "Resumo dos cofrinhos", hint: "Total guardado e quantidade" },
  { key: "monthCompare", label: "Comparativo mês a mês", hint: "Atual vs mês anterior" },
];

const formatBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });


/** Mesmo cálculo da aba Vendas: total pago considerando installmentAmounts/downPayment/partialPaid. */
function getSalePaidAmount(s: Sale): number {
  const amounts = s.installmentAmounts;
  if (amounts && amounts.length > 0) {
    let paid = s.downPayment || 0;
    for (let i = 0; i < s.paidInstallments && i < amounts.length; i++) {
      paid += amounts[i] || 0;
    }
    return paid + (s.partialPaid || 0);
  }
  const vp = s.installments > 0 ? Math.max(0, s.total - (s.downPayment || 0)) / s.installments : s.total;
  return vp * s.paidInstallments + (s.downPayment || 0) + (s.partialPaid || 0);
}

/** Categoriza igual à aba Vendas, para excluir vendas quitadas do "a receber". */
function isSalePaid(s: Sale): boolean {
  const isRecorrente = s.paymentMode === "recorrente" && s.installments > 1;
  return isRecorrente ? s.paidInstallments >= s.installments : s.paidInstallments >= 1;
}

interface ConsolidatedBalanceCardsProps {
  variant?: "grid" | "bento";
}

export function ConsolidatedBalanceCards({ variant = "grid" }: ConsolidatedBalanceCardsProps) {
  useFinanceComponentDebug("ConsolidatedBalanceCards");
  const { loans, payments, installmentSchedules } = useLoans();
  const { sales, products } = useProducts(true);
  const { piggyBanks, deposits: piggyDeposits, balances: piggyBalances } = usePiggyBanks();

  // Espelha EXATAMENTE o "Saldo em Conta" da aba Receitas (IncomeBalanceCard)
  // via hook unificado — mantém os dois cards sempre sincronizados.
  const unifiedBalanceState = useUnifiedAccountBalanceState();
  const incomesBalance = unifiedBalanceState.balance ?? 0;
  // Enquanto não há saldo confiável (nem cache), mostramos uma tarja de
  // carregamento — nunca um valor zerado/divergente do saldo real em conta.
  const balanceLoading = unifiedBalanceState.loading;
  // Necessário para a projeção de 30 dias abaixo.
  const { incomes } = useIncomes(true);
  const { expenses } = useExpenses(true);


  const [dashboardAccount, setDashboardAccount] = useState(0);
  const [dashboardCash, setDashboardCash] = useState(0);
  const [vehicleBalance, setVehicleBalance] = useState(0);
  const [openRua, setOpenRua] = useState(false);
  const [openMaos, setOpenMaos] = useState(false);
  const [openTotal, setOpenTotal] = useState(false);
  const [openPatrimonio, setOpenPatrimonio] = useState(false);
  const [openVariacao, setOpenVariacao] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);
  const [openPiggyBreakdown, setOpenPiggyBreakdown] = useState(false);
  const [openStockBreakdown, setOpenStockBreakdown] = useState(false);
  const { extraCards, visibility, setExtraCards, setVisibility, toggleExtra, toggleVis } = useDashboardPrefs();


  const reloadExternalBalances = useCallback(async () => {
    const [b, { data: { session } }] = await Promise.all([
      getBalances(),
      supabase.auth.getSession(),
    ]);
    setDashboardAccount(b.account);
    setDashboardCash(b.cash);
    const user = session?.user;
    if (user) {
      const { data: ownerRow } = await supabase
        .from("user_owner" as any)
        .select("owner_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const ownerId = (ownerRow as any)?.owner_id || user.id;
      const { data } = await supabase
        .from("vehicle_balance" as any)
        .select("amount")
        .eq("user_id", ownerId)
        .maybeSingle();
      setVehicleBalance(Number((data as any)?.amount ?? 0));
    }
  }, []);

  useEffect(() => { reloadExternalBalances(); }, [reloadExternalBalances]);
  useEffect(() => {
    const onChange = () => { reloadExternalBalances(); };
    window.addEventListener("balance:changed", onChange);
    return () => window.removeEventListener("balance:changed", onChange);
  }, [reloadExternalBalances]);

  const pendingLoans = useMemo(
    () => loans
      .filter((l) => l.status !== "paid")
      .reduce((s, l) => s + getLoanReceivable(l, payments, installmentSchedules), 0),
    [loans, payments, installmentSchedules],
  );
  const pendingSales = useMemo(
    () => sales
      .filter((s) => s.businessType === "venda" && !isSalePaid(s))
      .reduce((s, sale) => s + Math.max(0, sale.total - getSalePaidAmount(sale)), 0),
    [sales],
  );
  const totalNaRua = pendingLoans + pendingSales;

  const piggyTotal = useMemo(() => {
    let sum = 0;
    piggyBanks.forEach((pb) => {
      const b = piggyBalances.get(pb.id);
      if (b) sum += b.balance;
    });
    return sum;
  }, [piggyBanks, piggyBalances]);

  // "Saldo Total em Mãos" = soma de todos os saldos
  // (Conta + Dinheiro em mãos + Saldo em Conta (Receitas) + Cofrinhos + Veículos).
  // Os toggles em Configurações afetam apenas os cards do detalhamento,
  // não alteram o total nem a composição.
  const totalEmMaos =
    dashboardAccount + dashboardCash + incomesBalance + piggyTotal + vehicleBalance;

  const contaMaisDinheiro = dashboardAccount + dashboardCash;
  const stockValue = useMemo(
    () => products.reduce((s, p) => s + (p.price || 0) * Math.max(0, p.stock || 0), 0),
    [products],
  );

  // Patrimônio Total = Saldo total (conta + dinheiro) + Pendente de empréstimos
  const patrimonioTotal = contaMaisDinheiro + pendingLoans;

  // Variação mensal: compara com snapshot "travado" no último dia do mês anterior.
  const PATRIMONIO_SNAP_KEY = "patrimonio.snapshots.v1";
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const now = new Date();
  const currentKey = monthKey(now);
  const prevKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  // Publica o patrimônio "ao vivo" para outros módulos (ex.: metas) sempre que os componentes do cálculo mudarem.
  useEffect(() => {
    try {
      localStorage.setItem(
        "patrimonio.current.v1",
        JSON.stringify({ 
          month: currentKey, 
          account: contaMaisDinheiro, 
          rua: pendingLoans, 
          total: patrimonioTotal 
        }),
      );
      window.dispatchEvent(new Event("patrimonio:snapshots-changed"));
    } catch (e) {
      console.warn("Erro ao atualizar snapshot de patrimônio:", e);
    }
  }, [patrimonioTotal, contaMaisDinheiro, pendingLoans, currentKey]);
  const isLastDayOfMonth = (d: Date) => {
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return next.getMonth() !== d.getMonth();
  };

  type Snap = { account: number; rua: number; total: number };
  const normalizeSnap = (v: any): Snap | null => {
    if (v == null) return null;
    if (typeof v === "number") return { account: 0, rua: 0, total: v };
    if (typeof v === "object" && typeof v.total === "number") {
      return { account: Number(v.account) || 0, rua: Number(v.rua) || 0, total: Number(v.total) };
    }
    return null;
  };

  const [snapsMap, setSnapsMap] = useState<Record<string, any>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PATRIMONIO_SNAP_KEY);
      const snaps: Record<string, any> = raw ? JSON.parse(raw) : {};

      // Seed único: patrimônio do fim do mês passado informado pelo usuário.
      const SEED_FLAG = "patrimonio.snapshots.seed.v1";
      if (!localStorage.getItem(SEED_FLAG)) {
        snaps[prevKey] = 79235.36;
        localStorage.setItem(PATRIMONIO_SNAP_KEY, JSON.stringify(snaps));
        localStorage.setItem(SEED_FLAG, "1");
      }

      // Seed v2: valores históricos manuais fornecidos pelo usuário (imutáveis).
      const SEED_FLAG_V2 = "patrimonio.snapshots.seed.v2";
      if (!localStorage.getItem(SEED_FLAG_V2)) {
        snaps["2026-05"] = { account: 0, rua: 0, total: 79235.36 };
        snaps["2026-06"] = { account: 8848.70, rua: 78656.00, total: 87413.76 };
        localStorage.setItem(PATRIMONIO_SNAP_KEY, JSON.stringify(snaps));
        localStorage.setItem(SEED_FLAG_V2, "1");
      }

      // Trava o snapshot do mês corrente APENAS no último dia do mês.
      if (isLastDayOfMonth(now) && snaps[currentKey] == null) {
        snaps[currentKey] = { account: contaMaisDinheiro, rua: pendingLoans, total: patrimonioTotal };
        localStorage.setItem(PATRIMONIO_SNAP_KEY, JSON.stringify(snaps));
      }
      setSnapsMap(snaps);
    } catch {
      setSnapsMap({});
    }
  }, [patrimonioTotal, contaMaisDinheiro, pendingLoans, currentKey, prevKey]);

  // Seletor de mês para o card "Variação Mensal" (0 = mês atual, -1 = anterior, etc.)
  const [variacaoMonthOffset, setVariacaoMonthOffset] = useState(0);
  const selDate = useMemo(
    () => new Date(now.getFullYear(), now.getMonth() + variacaoMonthOffset, 1),
    [now, variacaoMonthOffset],
  );
  const selKey = monthKey(selDate);
  const selPrevKey = monthKey(new Date(selDate.getFullYear(), selDate.getMonth() - 1, 1));
  const selLabel = selDate
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .replace(/^./, (c) => c.toUpperCase())
    .replace(" de ", "/");

  // "Atual" do mês selecionado: usa valores ao vivo quando é o mês corrente;
  // caso contrário, o snapshot travado do fim daquele mês.
  const selCurrentSnap: Snap | null = useMemo(() => {
    if (selKey === currentKey) {
      return { account: contaMaisDinheiro, rua: pendingLoans, total: patrimonioTotal };
    }
    return normalizeSnap(snapsMap[selKey]);
  }, [selKey, currentKey, contaMaisDinheiro, pendingLoans, patrimonioTotal, snapsMap]);

  const selPrevSnap: Snap | null = useMemo(() => {
    if (selPrevKey === currentKey) {
      return { account: contaMaisDinheiro, rua: pendingLoans, total: patrimonioTotal };
    }
    return normalizeSnap(snapsMap[selPrevKey]);
  }, [selPrevKey, currentKey, contaMaisDinheiro, pendingLoans, patrimonioTotal, snapsMap]);

  const prevSnap = selPrevSnap;
  const prevPatrimonio = prevSnap?.total ?? null;
  const selTotal = selCurrentSnap?.total ?? null;

  const variacaoPct = useMemo(() => {
    if (selTotal == null || prevPatrimonio == null || prevPatrimonio === 0) return null;
    return ((selTotal - prevPatrimonio) / Math.abs(prevPatrimonio)) * 100;
  }, [selTotal, prevPatrimonio]);

  const variacaoTrend: "up" | "down" | "flat" =
    variacaoPct == null || Math.abs(variacaoPct) < 0.005 ? "flat" : variacaoPct > 0 ? "up" : "down";
  const variacaoColor =
    variacaoTrend === "up" ? "text-success" : variacaoTrend === "down" ? "text-destructive" : "text-muted-foreground";
  const VariacaoIcon = variacaoTrend === "up" ? ArrowUp : variacaoTrend === "down" ? ArrowDown : Minus;

  const Row = ({ label, value }: { label: string; value: number }) => (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${value < 0 ? "text-destructive" : "text-foreground"}`}>
        {formatBRL(value)}
      </span>
    </div>
  );

  return (
    <>
      {variant === "bento" ? (
        <div className="space-y-3">
          {/* Hero card — Saldo Total */}
          <Card
            no3d
            className="cursor-pointer border-none bg-success text-success-foreground shadow-sm transition-transform active:scale-[0.99]"
            onClick={() => setOpenTotal(true)}
          >
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-success-foreground/20 p-1.5">
                      <Landmark className="h-4 w-4 sm:h-5 sm:w-5 text-success-foreground" />
                    </div>
                    <p className="text-xs sm:text-sm font-medium text-success-foreground/90">Saldo total</p>
                  </div>
                  <p className="mt-2 text-2xl sm:text-3xl font-bold tabular-nums tracking-tight text-success-foreground truncate">
                    {formatBRL(contaMaisDinheiro)}
                  </p>
                </div>
                <div className="shrink-0 rounded-full bg-success-foreground/20 px-2.5 py-1 text-[11px] font-semibold text-success-foreground inline-flex items-center gap-1">
                  <VariacaoIcon className="h-3 w-3" />
                  {variacaoPct == null ? "—" : `${variacaoPct >= 0 ? "+" : ""}${variacaoPct.toFixed(2)}%`}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bento grid — 4 secondary metrics */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Card
              no3d
              className="cursor-pointer border border-border/60 bg-muted/40 transition-colors hover:bg-muted/60"
              onClick={() => setOpenPatrimonio(true)}
            >
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-1.5">
                  <div className="rounded-md bg-primary/10 p-1">
                    <Gem className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">Patrimônio</p>
                </div>
                <p className={`mt-1.5 text-sm sm:text-base font-bold tabular-nums truncate ${patrimonioTotal < 0 ? "text-destructive" : "text-foreground"}`}>
                  {formatBRL(patrimonioTotal)}
                </p>
              </CardContent>
            </Card>

            <Card
              no3d
              className="cursor-pointer border border-border/60 bg-muted/40 transition-colors hover:bg-muted/60"
              onClick={() => setOpenMaos(true)}
            >
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-1.5">
                  <div className="rounded-md bg-success/10 p-1">
                    <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-success" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">Total Geral</p>
                </div>
                {balanceLoading ? (
                  <span aria-hidden className="mt-2 inline-block h-5 w-24 animate-pulse rounded-md bg-muted-foreground/25" />
                ) : (
                  <p className={`mt-1.5 text-sm sm:text-base font-bold tabular-nums truncate ${totalEmMaos < 0 ? "text-destructive" : "text-foreground"}`}>
                    {formatBRL(totalEmMaos)}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card
              no3d
              className="cursor-pointer border border-border/60 bg-primary/5 transition-colors hover:bg-primary/10"
              onClick={() => setOpenRua(true)}
            >
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-1.5">
                  <div className="rounded-md bg-primary/10 p-1">
                    <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-medium text-primary/80">Na Rua</p>
                </div>
                <p className={`mt-1.5 text-sm sm:text-base font-bold tabular-nums truncate ${totalNaRua < 0 ? "text-destructive" : "text-foreground"}`}>
                  {formatBRL(totalNaRua)}
                </p>
              </CardContent>
            </Card>

            <Card
              no3d
              className="cursor-pointer border border-border/60 bg-warning/10 transition-colors hover:bg-warning/15"
              onClick={() => setOpenStockBreakdown(true)}
            >
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-1.5">
                  <div className="rounded-md bg-warning/15 p-1">
                    <PiggyBank className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-warning" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">Em estoque</p>
                </div>
                <p className={`mt-1.5 text-sm sm:text-base font-bold tabular-nums truncate ${stockValue < 0 ? "text-destructive" : "text-foreground"}`}>
                  {formatBRL(stockValue)}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Card no3d className="cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => setOpenTotal(true)}>
            <CardContent className="p-2.5 sm:p-3 flex flex-col items-center text-center">
              <div className="flex items-center justify-center gap-1.5">
                <Landmark className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                <p className="text-[11px] sm:text-xs text-muted-foreground">Saldo total</p>
              </div>
              <p className={`text-base sm:text-xl font-bold truncate leading-tight mt-0.5 ${contaMaisDinheiro < 0 ? "text-destructive" : "text-foreground"}`}>
                {formatBRL(contaMaisDinheiro)}
              </p>
            </CardContent>
          </Card>

          <Card no3d className="cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => setOpenMaos(true)}>
            <CardContent className="p-2.5 sm:p-3 flex flex-col items-center text-center">
              <div className="flex items-center justify-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-success" />
                <p className="text-[11px] sm:text-xs text-muted-foreground">Total Geral</p>
              </div>
              {balanceLoading ? (
                <span aria-hidden className="mt-1 inline-block h-5 w-24 animate-pulse rounded-md bg-muted-foreground/25 sm:h-6 sm:w-28" />
              ) : (
                <p className={`text-base sm:text-xl font-bold truncate leading-tight mt-0.5 ${totalEmMaos < 0 ? "text-destructive" : "text-foreground"}`}>
                  {formatBRL(totalEmMaos)}
                </p>
              )}
            </CardContent>
          </Card>
          <Card no3d className="cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => setOpenRua(true)}>
            <CardContent className="p-2.5 sm:p-3 flex flex-col items-center text-center">
              <div className="flex items-center justify-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-warning" />
                <p className="text-[11px] sm:text-xs text-muted-foreground">Saldo Total na Rua</p>
              </div>
              <p className={`text-base sm:text-xl font-bold truncate leading-tight mt-0.5 ${totalNaRua < 0 ? "text-destructive" : "text-foreground"}`}>
                {formatBRL(totalNaRua)}
              </p>
            </CardContent>
          </Card>
          <Card no3d className="cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => setOpenStockBreakdown(true)}>
            <CardContent className="p-2.5 sm:p-3 flex flex-col items-center text-center">
              <div className="flex items-center justify-center gap-1.5">
                <PiggyBank className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                <p className="text-[11px] sm:text-xs text-muted-foreground">Saldo em estoque</p>
              </div>
              <p className={`text-base sm:text-xl font-bold truncate leading-tight mt-0.5 ${stockValue < 0 ? "text-destructive" : "text-foreground"}`}>
                {formatBRL(stockValue)}
              </p>
            </CardContent>
          </Card>
          <Card no3d className="cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => setOpenPatrimonio(true)}>
            <CardContent className="p-2.5 sm:p-3 flex flex-col items-center text-center">
              <div className="flex items-center justify-center gap-1.5">
                <Gem className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                <p className="text-[11px] sm:text-xs text-muted-foreground">Patrimônio Total</p>
              </div>
              <p className={`text-base sm:text-xl font-bold truncate leading-tight mt-0.5 ${patrimonioTotal < 0 ? "text-destructive" : "text-foreground"}`}>
                {formatBRL(patrimonioTotal)}
              </p>
            </CardContent>
          </Card>
          <Card no3d className="cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => setOpenVariacao(true)}>
            <CardContent className="p-2.5 sm:p-3 flex flex-col items-center text-center">
              <div className="flex items-center justify-center gap-1.5">
                <BarChart3 className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${variacaoColor}`} />
                <p className="text-[11px] sm:text-xs text-muted-foreground">Variação Mensal</p>
              </div>
              <p className={`text-base sm:text-xl font-bold truncate leading-tight mt-0.5 flex items-center justify-center gap-1 ${variacaoColor}`}>
                <VariacaoIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                {variacaoPct == null ? "—" : `${variacaoPct >= 0 ? "+" : ""}${variacaoPct.toFixed(2)}%`}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{"\n"}</p>
            </CardContent>
          </Card>
        </div>
      )}


      <Dialog open={openPatrimonio} onOpenChange={setOpenPatrimonio}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gem className="h-4 w-4 text-primary" /> Patrimônio Total
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Row label="Saldo em Conta" value={contaMaisDinheiro} />
            <Row label="Pendente de Empréstimos" value={pendingLoans} />
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-border">
              <span className="text-sm font-semibold">Patrimônio Total</span>
              <span className={`text-base font-bold tabular-nums ${patrimonioTotal < 0 ? "text-destructive" : "text-foreground"}`}>
                {formatBRL(patrimonioTotal)}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openVariacao}
        onOpenChange={(o) => {
          setOpenVariacao(o);
          if (o) setVariacaoMonthOffset(0);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className={`h-4 w-4 ${variacaoColor}`} /> Variação Mensal
            </DialogTitle>
          </DialogHeader>

          {/* Seletor de mês */}
          <div className="flex items-center justify-center gap-1 sm:gap-2 -mt-1">
            <button
              type="button"
              onClick={() => setVariacaoMonthOffset((v) => v - 1)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-accent transition-colors"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setVariacaoMonthOffset(0)}
              className="text-sm font-medium capitalize min-w-[140px] text-center hover:text-primary transition-colors"
              title="Voltar ao mês atual"
            >
              {selLabel}
            </button>
            <button
              type="button"
              onClick={() => setVariacaoMonthOffset((v) => v + 1)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-accent transition-colors"
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                {variacaoMonthOffset === 0 ? "Mês Atual" : "Mês Selecionado"}
              </p>
              {selCurrentSnap ? (
                <>
                  <Row label="Saldo em Conta" value={selCurrentSnap.account} />
                  <Row label="Pendente de Empréstimos" value={selCurrentSnap.rua} />
                  <Row label="Patrimônio" value={selCurrentSnap.total} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-2">Sem snapshot deste mês.</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Mês Anterior</p>
              {prevSnap ? (
                <>
                  <Row label="Saldo em Conta" value={prevSnap.account} />
                  <Row label="Pendente de Empréstimos" value={prevSnap.rua} />
                  <Row label="Patrimônio" value={prevSnap.total} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-2">Sem snapshot do mês anterior.</p>
              )}
            </div>
            <div className="pt-3 border-t border-border space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Diferença</span>
                <span className={`text-sm font-bold tabular-nums ${selTotal == null || prevPatrimonio == null ? "text-muted-foreground" : (selTotal - prevPatrimonio) >= 0 ? "text-success" : "text-destructive"}`}>
                  {selTotal == null || prevPatrimonio == null ? "—" : `${(selTotal - prevPatrimonio) >= 0 ? "+" : ""}${formatBRL(selTotal - prevPatrimonio)}`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Variação</span>
                <span className={`text-sm font-bold tabular-nums inline-flex items-center gap-1 ${variacaoColor}`}>
                  <VariacaoIcon className="h-4 w-4" />
                  {variacaoPct == null ? "—" : `${variacaoPct >= 0 ? "+" : ""}${variacaoPct.toFixed(2)}%`}
                </span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>





      <Dialog open={openRua} onOpenChange={setOpenRua}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-warning" /> Saldo Total na Rua
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Row label="Pendente de empréstimos" value={pendingLoans} />
            <Row label="Pendente de vendas" value={pendingSales} />
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-border">
              <span className="text-sm font-semibold">Total consolidado</span>
              <span className={`text-base font-bold tabular-nums ${totalNaRua < 0 ? "text-destructive" : "text-foreground"}`}>
                {formatBRL(totalNaRua)}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openTotal} onOpenChange={setOpenTotal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-primary" /> Saldo total
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Row label="Saldo em conta" value={dashboardAccount} />
            <Row label="Dinheiro" value={dashboardCash} />
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-border">
              <span className="text-sm font-semibold">Total</span>
              <span className={`text-base font-bold tabular-nums ${contaMaisDinheiro < 0 ? "text-destructive" : "text-foreground"}`}>
                {formatBRL(contaMaisDinheiro)}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openMaos} onOpenChange={setOpenMaos}>
        <DialogContent
          className="!p-0 overflow-hidden border-border/60 bg-gradient-to-br from-background via-background to-muted/30 backdrop-blur-xl max-sm:!fixed max-sm:!inset-0 max-sm:!left-0 max-sm:!top-0 max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!max-w-none max-sm:!w-screen max-sm:!h-screen max-sm:!max-h-screen max-sm:!rounded-none max-sm:!flex max-sm:!flex-col max-sm:!gap-0 sm:max-w-md"
        >
          <DialogHeader className="px-5 pt-5 pb-3" style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}>
            <DialogTitle className="flex items-center gap-2 text-base pr-20">
              <Wallet className="h-4 w-4 text-success" /> Saldo Total em Mãos
            </DialogTitle>
            <button
              type="button"
              onClick={() => setOpenSettings(true)}
              aria-label="Configurações do saldo"
              title="Configurações do saldo"
              className="absolute right-12 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/80 hover:text-foreground hover:bg-accent/60 transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40"
              style={{ top: "calc(0.625rem + env(safe-area-inset-top))" }}
            >
              <Settings className="w-[25px] h-[20px]" />
            </button>
            <div className="mt-3 rounded-2xl border border-border/60 bg-gradient-to-br from-success/10 via-success/5 to-transparent p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total consolidado</p>
              {balanceLoading ? (
                <span aria-hidden className="mt-2 inline-block h-8 w-44 animate-pulse rounded-md bg-muted-foreground/25" />
              ) : (
                <p className={`text-3xl font-bold tabular-nums leading-tight mt-1 ${totalEmMaos < 0 ? "text-destructive" : "text-foreground"}`}>
                  {formatBRL(totalEmMaos)}
                </p>
              )}
            </div>
          </DialogHeader>
          <ScrollArea
            className="max-h-[60vh] max-sm:max-h-none max-sm:flex-1 max-sm:h-full px-5 pb-5"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
          >
            {(() => {
              const baseReceitas = incomesBalance;
              const Item = ({
                icon: Icon,
                label,
                hint,
                value,
                tint,
                onClick,
                loading,
              }: {
                icon: typeof Wallet;
                label: string;
                hint?: string;
                value: number;
                tint: string;
                onClick?: () => void;
                loading?: boolean;
              }) => {
                const inner = (
                  <>
                    <div className={`shrink-0 h-9 w-9 rounded-full flex items-center justify-center ${tint}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{label}</p>
                      {hint && <p className="text-[10px] text-muted-foreground truncate">{hint}</p>}
                    </div>
                    {loading ? (
                      <span aria-hidden className="inline-block h-4 w-20 animate-pulse rounded bg-muted-foreground/25" />
                    ) : (
                      <span className={`text-sm font-bold tabular-nums ${value < 0 ? "text-destructive" : "text-foreground"}`}>
                        {formatBRL(value)}
                      </span>
                    )}
                  </>
                );
                if (onClick) {
                  return (
                    <button
                      type="button"
                      onClick={onClick}
                      className="w-full flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3 shadow-sm hover:bg-card/80 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-ring/40"
                    >
                      {inner}
                    </button>
                  );
                }
                return (
                  <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3 shadow-sm hover:bg-card/80 transition-colors">
                    {inner}
                  </div>
                );
              };

              const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">{title}</p>
                  <div className="space-y-2">{children}</div>
                </div>
              );

              const contasItems = [
                visibility.account && (
                  <Item key="account" icon={Landmark} label="Conta" hint="Saldo bancário (Dashboard)" value={dashboardAccount} tint="bg-primary/15 text-primary" />
                ),
                visibility.cash && (
                  <Item key="cash" icon={Banknote} label="Dinheiro" hint="Carteira (Dashboard)" value={dashboardCash} tint="bg-success/15 text-success" />
                ),
                visibility.incomes && (
                  <Item key="incomes" icon={ArrowDownCircle} label="Saldo em Conta (Receitas)" hint="Receitas − Despesas pessoais" value={baseReceitas} tint="bg-warning/15 text-warning" loading={balanceLoading} />
                ),
              ].filter(Boolean);
              const reservasItems = [
                visibility.piggy && (
                  <Item key="piggy" icon={PiggyBank} label="Total dos Cofrinhos" hint={`${piggyBanks.length} ${piggyBanks.length === 1 ? "cofrinho" : "cofrinhos"}`} value={piggyTotal} tint="bg-pink-500/15 text-pink-500" onClick={() => setOpenPiggyBreakdown(true)} />
                ),
                visibility.vehicle && (
                  <Item key="vehicle" icon={Car} label="Saldo de Veículos" hint="Reserva vinculada a veículos" value={vehicleBalance} tint="bg-blue-500/15 text-blue-500" />
                ),
              ].filter(Boolean);

              return (
                <div className="space-y-4">
                  {contasItems.length > 0 && <Section title="Contas">{contasItems}</Section>}
                  {reservasItems.length > 0 && <Section title="Reservas">{reservasItems}</Section>}

                  {(() => {
                    const now = new Date();
                    const pad = (n: number) => String(n).padStart(2, "0");
                    const monthKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
                    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    const prevMonthKey = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}`;
                    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
                    const horizon = new Date(now);
                    horizon.setDate(horizon.getDate() + 7);
                    const horizon7 = `${horizon.getFullYear()}-${pad(horizon.getMonth() + 1)}-${pad(horizon.getDate())}`;
                    const horizon30Date = new Date(now);
                    horizon30Date.setDate(horizon30Date.getDate() + 30);
                    const horizon30 = `${horizon30Date.getFullYear()}-${pad(horizon30Date.getMonth() + 1)}-${pad(horizon30Date.getDate())}`;

                    const isPersonalPaid = (e: any) => e.paid && (e.scope ?? "business") === "personal";
                    const monthIncomes = incomes.filter((i: any) => i.status === "received" && (i.receivedDate || "").startsWith(monthKey));
                    const monthOutExp = expenses.filter((e: any) => isPersonalPaid(e) && ((e.paidDate || e.dueDate || "").startsWith(monthKey)));
                    const prevMonthIncomes = incomes.filter((i: any) => i.status === "received" && (i.receivedDate || "").startsWith(prevMonthKey));
                    const prevMonthOutExp = expenses.filter((e: any) => isPersonalPaid(e) && ((e.paidDate || e.dueDate || "").startsWith(prevMonthKey)));
                    const monthIn = monthIncomes.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
                    const monthOut = monthOutExp.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
                    const prevIn = prevMonthIncomes.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
                    const prevOut = prevMonthOutExp.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);

                    const CardBox = ({ icon: Icon, title, children }: { icon: typeof TrendingUp; title: string; children: React.ReactNode }) => (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1">
                          <Icon className="h-3 w-3" /> {title}
                        </p>
                        <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3">
                          {children}
                        </div>
                      </div>
                    );

                    const renderCard = (key: ExtraCardKey) => {
                      switch (key) {
                        case "composicao": {
                          const parts = [
                            { label: "Conta", value: Math.max(0, dashboardAccount), color: "bg-primary" },
                            { label: "Dinheiro", value: Math.max(0, dashboardCash), color: "bg-success" },
                            { label: "Receitas", value: Math.max(0, baseReceitas), color: "bg-warning" },
                            { label: "Cofrinhos", value: Math.max(0, piggyTotal), color: "bg-pink-500" },
                            { label: "Veículos", value: Math.max(0, vehicleBalance), color: "bg-blue-500" },
                          ];
                          const sum = parts.reduce((s, p) => s + p.value, 0);
                          if (sum <= 0) return null;
                          return (
                            <CardBox key={key} icon={PieChart} title="Composição do saldo">
                              <div className="space-y-3">
                                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                                  {parts.map((p) =>
                                    p.value > 0 ? (
                                      <div key={p.label} className={p.color} style={{ width: `${(p.value / sum) * 100}%` }} title={`${p.label}: ${formatBRL(p.value)}`} />
                                    ) : null,
                                  )}
                                </div>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                                  {parts.map((p) => {
                                    const pct = sum > 0 ? (p.value / sum) * 100 : 0;
                                    return (
                                      <div key={p.label} className="flex items-center gap-1.5 min-w-0">
                                        <span className={`h-2 w-2 rounded-full shrink-0 ${p.color}`} />
                                        <span className="text-[11px] text-muted-foreground truncate flex-1">{p.label}</span>
                                        <span className="text-[11px] font-semibold tabular-nums">{pct.toFixed(0)}%</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </CardBox>
                          );
                        }
                        case "projecao30": {
                          const endOfMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                          const endOfMonth = `${endOfMonthDate.getFullYear()}-${pad(endOfMonthDate.getMonth() + 1)}-${pad(endOfMonthDate.getDate())}`;
                          const inRange = (d?: string | null) => !!d && d >= todayStr && d <= endOfMonth;
                          // Entradas previstas: parcelas de empréstimos ainda não pagas com vencimento nos próximos 30 dias.
                          const activeLoanIds = new Set(loans.filter((l) => l.status !== "paid").map((l) => l.id));
                          const loanById = new Map(loans.map((l) => [l.id, l] as const));
                          const expectedIn = installmentSchedules
                            .filter((s: any) => {
                              const loan = loanById.get(s.loanId);
                              if (!loan || !activeLoanIds.has(s.loanId)) return false;
                              if (s.installmentNumber <= (loan.paidInstallments || 0)) return false;
                              return inRange(s.dueDate);
                            })
                            .reduce((sum: number, s: any) => sum + (Number(s.amount) || 0), 0);
                          // Saídas previstas: despesas EMPRESARIAIS a vencer nos próximos 30 dias.
                          const expectedOut = expenses.filter((e: any) => !e.paid && (e.scope ?? "business") === "business" && inRange(e.dueDate)).reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
                          const projected = totalEmMaos + expectedIn - expectedOut;
                          const delta = projected - totalEmMaos;
                          return (
                            <CardBox key={key} icon={TrendingUp} title="Projeção do mês">
                              <div className="space-y-2.5">
                                <div className="flex items-end justify-between">
                                  <div className="min-w-0">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Saldo projetado</p>
                                    <p className={`text-xl font-bold tabular-nums leading-tight ${projected < 0 ? "text-destructive" : "text-foreground"}`}>{formatBRL(projected)}</p>
                                  </div>
                                  <span className={`text-xs font-semibold tabular-nums flex items-center gap-0.5 ${delta < 0 ? "text-destructive" : "text-success"}`}>
                                    {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                                    {delta >= 0 ? "+" : ""}{formatBRL(delta)}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 pt-1">
                                  <div className="rounded-lg bg-success/10 p-2">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Entradas previstas</p>
                                    <p className="text-sm font-bold text-success tabular-nums">{formatBRL(expectedIn)}</p>
                                  </div>
                                  <div className="rounded-lg bg-destructive/10 p-2">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Saídas previstas</p>
                                    <p className="text-sm font-bold text-destructive tabular-nums">{formatBRL(expectedOut)}</p>
                                  </div>
                                </div>
                                <p className="text-[10px] text-muted-foreground">Considera parcelas de empréstimos a receber e despesas empresariais a vencer até o final do mês vigente.</p>
                              </div>
                            </CardBox>
                          );
                        }
                        case "savingsRate": {
                          const diff = monthIn - monthOut;
                          const rate = monthIn > 0 ? (diff / monthIn) * 100 : 0;
                          return (
                            <CardBox key={key} icon={Percent} title="Taxa de poupança do mês">
                              <div className="space-y-2.5">
                                <div className="flex items-end justify-between">
                                  <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">% economizado</p>
                                    <p className={`text-2xl font-bold tabular-nums leading-tight ${rate < 0 ? "text-destructive" : "text-success"}`}>{rate.toFixed(1)}%</p>
                                  </div>
                                  <span className={`text-xs font-semibold tabular-nums ${diff < 0 ? "text-destructive" : "text-success"}`}>{diff >= 0 ? "+" : ""}{formatBRL(diff)}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="rounded-lg bg-success/10 p-2">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Entradas</p>
                                    <p className="text-sm font-bold text-success tabular-nums">{formatBRL(monthIn)}</p>
                                  </div>
                                  <div className="rounded-lg bg-destructive/10 p-2">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Saídas</p>
                                    <p className="text-sm font-bold text-destructive tabular-nums">{formatBRL(monthOut)}</p>
                                  </div>
                                </div>
                              </div>
                            </CardBox>
                          );
                        }
                        case "runway": {
                          // média dos últimos 3 meses de saídas pessoais pagas
                          const sums: Record<string, number> = {};
                          for (let k = 1; k <= 3; k++) {
                            const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
                            sums[`${d.getFullYear()}-${pad(d.getMonth() + 1)}`] = 0;
                          }
                          expenses.forEach((e: any) => {
                            if (!isPersonalPaid(e)) return;
                            const mk = (e.paidDate || e.dueDate || "").slice(0, 7);
                            if (mk in sums) sums[mk] += Number(e.amount) || 0;
                          });
                          const vals = Object.values(sums);
                          const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                          const months = avg > 0 ? totalEmMaos / avg : 0;
                          return (
                            <CardBox key={key} icon={Hourglass} title="Fôlego financeiro">
                              <div className="space-y-2">
                                <div className="flex items-end justify-between">
                                  <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Meses cobertos</p>
                                    <p className={`text-2xl font-bold tabular-nums leading-tight ${months < 1 ? "text-destructive" : months < 3 ? "text-warning" : "text-success"}`}>
                                      {avg <= 0 ? "—" : months.toFixed(1)}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Gasto médio/mês</p>
                                    <p className="text-sm font-semibold tabular-nums">{formatBRL(avg)}</p>
                                  </div>
                                </div>
                                <p className="text-[10px] text-muted-foreground">Saldo total em mãos ÷ média de saídas dos últimos 3 meses.</p>
                              </div>
                            </CardBox>
                          );
                        }
                        case "topCategories": {
                          const byCat: Record<string, number> = {};
                          monthOutExp.forEach((e: any) => {
                            const cat = (e.category || "Sem categoria").toString();
                            byCat[cat] = (byCat[cat] || 0) + (Number(e.amount) || 0);
                          });
                          const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
                          const totalMonth = monthOut || 1;
                          return (
                            <CardBox key={key} icon={BarChart3} title="Top 3 categorias do mês">
                              {top.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Sem despesas pessoais no mês.</p>
                              ) : (
                                <div className="space-y-2">
                                  {top.map(([cat, val]) => {
                                    const pct = (val / totalMonth) * 100;
                                    return (
                                      <div key={cat} className="space-y-1">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-[11px] text-foreground truncate">{cat}</span>
                                          <span className="text-[11px] font-semibold tabular-nums">{formatBRL(val)}</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                          <div className="h-full bg-warning" style={{ width: `${Math.min(100, pct)}%` }} />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </CardBox>
                          );
                        }
                        case "biggest": {
                          const bigIn = monthIncomes.reduce((m: any, i: any) => (!m || (Number(i.amount) || 0) > (Number(m.amount) || 0) ? i : m), null as any);
                          const bigOut = monthOutExp.reduce((m: any, e: any) => (!m || (Number(e.amount) || 0) > (Number(m.amount) || 0) ? e : m), null as any);
                          return (
                            <CardBox key={key} icon={Trophy} title="Maior entrada e saída do mês">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-lg bg-success/10 p-2">
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Entrada</p>
                                  <p className="text-sm font-bold text-success tabular-nums leading-tight">{bigIn ? formatBRL(Number(bigIn.amount) || 0) : "—"}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{bigIn?.source || bigIn?.description || ""}</p>
                                </div>
                                <div className="rounded-lg bg-destructive/10 p-2">
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Saída</p>
                                  <p className="text-sm font-bold text-destructive tabular-nums leading-tight">{bigOut ? formatBRL(Number(bigOut.amount) || 0) : "—"}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{bigOut?.category || bigOut?.description || ""}</p>
                                </div>
                              </div>
                            </CardBox>
                          );
                        }
                        case "nextIncomes7": {
                          const list = incomes.filter((i: any) => i.status !== "received" && (i.receivedDate || "") >= todayStr && (i.receivedDate || "") <= horizon7);
                          const total = list.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
                          return (
                            <CardBox key={key} icon={CalendarClock} title="Próximos recebimentos (7 dias)">
                              <div className="flex items-end justify-between">
                                <div>
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total previsto</p>
                                  <p className="text-xl font-bold text-success tabular-nums leading-tight">{formatBRL(total)}</p>
                                </div>
                                <span className="text-xs text-muted-foreground">{list.length} {list.length === 1 ? "lançamento" : "lançamentos"}</span>
                              </div>
                            </CardBox>
                          );
                        }
                        case "nextBills7": {
                          const list = expenses.filter((e: any) => !e.paid && (e.scope ?? "business") === "personal" && (e.dueDate || "") >= todayStr && (e.dueDate || "") <= horizon7);
                          const total = list.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
                          return (
                            <CardBox key={key} icon={CalendarX} title="Contas a vencer (7 dias)">
                              <div className="flex items-end justify-between">
                                <div>
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total a pagar</p>
                                  <p className="text-xl font-bold text-destructive tabular-nums leading-tight">{formatBRL(total)}</p>
                                </div>
                                <span className="text-xs text-muted-foreground">{list.length} {list.length === 1 ? "conta" : "contas"}</span>
                              </div>
                            </CardBox>
                          );
                        }
                        case "piggySummary": {
                          const count = piggyBanks.length;
                          const avg = count > 0 ? piggyTotal / count : 0;
                          return (
                            <CardBox key={key} icon={PiggyBank} title="Resumo dos cofrinhos">
                              <div className="grid grid-cols-3 gap-2">
                                <div className="rounded-lg bg-pink-500/10 p-2">
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
                                  <p className="text-sm font-bold text-pink-500 tabular-nums">{formatBRL(piggyTotal)}</p>
                                </div>
                                <div className="rounded-lg bg-muted/40 p-2">
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cofrinhos</p>
                                  <p className="text-sm font-bold tabular-nums">{count}</p>
                                </div>
                                <div className="rounded-lg bg-muted/40 p-2">
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Média</p>
                                  <p className="text-sm font-bold tabular-nums">{formatBRL(avg)}</p>
                                </div>
                              </div>
                            </CardBox>
                          );
                        }
                        case "monthCompare": {
                          const dIn = prevIn > 0 ? ((monthIn - prevIn) / prevIn) * 100 : 0;
                          const dOut = prevOut > 0 ? ((monthOut - prevOut) / prevOut) * 100 : 0;
                          const Pill = ({ v }: { v: number }) => (
                            <span className={`text-[10px] font-semibold tabular-nums ${v >= 0 ? "text-success" : "text-destructive"}`}>
                              {v >= 0 ? "+" : ""}{v.toFixed(0)}%
                            </span>
                          );
                          return (
                            <CardBox key={key} icon={LineChart} title="Comparativo mês a mês">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] text-muted-foreground">Entradas</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-success tabular-nums">{formatBRL(monthIn)}</span>
                                    {prevIn > 0 && <Pill v={dIn} />}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] text-muted-foreground">Saídas</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-destructive tabular-nums">{formatBRL(monthOut)}</span>
                                    {prevOut > 0 && <Pill v={-dOut} />}
                                  </div>
                                </div>
                                <p className="text-[10px] text-muted-foreground pt-1">Mês anterior: {formatBRL(prevIn)} entradas / {formatBRL(prevOut)} saídas.</p>
                              </div>
                            </CardBox>
                          );
                        }
                        default:
                          return null;
                      }
                    };

                    return <>{extraCards.map((k) => renderCard(k))}</>;
                  })()}

                  <p className="text-[10px] text-muted-foreground text-center pt-1">
                    Fonte oficial: aba Receitas e Despesas. Atualizado em tempo real.
                  </p>
                </div>
              );
            })()}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={openSettings} onOpenChange={setOpenSettings}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4 text-muted-foreground" /> Configurações do saldo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground pb-2">
              Escolha quais cards aparecem no detalhamento abaixo do total. Não altera o valor do "Saldo Total em Mãos".
            </p>
            {([
              { key: "account", label: "Conta", hint: "Saldo bancário (Dashboard)" },
              { key: "cash", label: "Dinheiro em mãos", hint: "Carteira (Dashboard)" },
              { key: "incomes", label: "Saldo em Conta (Receitas)", hint: "Receitas − Despesas pessoais" },
              { key: "piggy", label: "Cofrinhos", hint: "Reserva dos cofrinhos" },
              { key: "vehicle", label: "Saldo de Veículos", hint: "Reserva vinculada a veículos" },
            ] as { key: keyof MaosVisibility; label: string; hint: string }[]).map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3 py-2.5 border-b border-border/40 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{row.label}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{row.hint}</p>
                </div>
                <Switch checked={visibility[row.key]} onCheckedChange={() => toggleVis(row.key)} />
              </div>
            ))}

            <div className="pt-5">
              <p className="text-sm font-semibold text-foreground">Cards extras</p>
              <p className="text-[11px] text-muted-foreground pb-2">
                Escolha 2 cards para exibir abaixo dos valores. ({extraCards.length}/2 selecionados)
              </p>
              {EXTRA_CARDS_META.map((row) => {
                const checked = extraCards.includes(row.key);
                const disabled = !checked && extraCards.length >= 2;
                return (
                  <div key={row.key} className="flex items-center justify-between gap-3 py-2.5 border-b border-border/40 last:border-0">
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${disabled ? "text-muted-foreground" : "text-foreground"}`}>{row.label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{row.hint}</p>
                    </div>
                    <Switch checked={checked} disabled={disabled} onCheckedChange={() => toggleExtra(row.key)} />
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-3 gap-3">
              <button
                type="button"
                onClick={() => { setVisibility(DEFAULT_VIS); setExtraCards(DEFAULT_EXTRA); }}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Restaurar padrão
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <PiggyBanksBreakdownDialog
        open={openPiggyBreakdown}
        onOpenChange={setOpenPiggyBreakdown}
        piggyBanks={piggyBanks}
        deposits={piggyDeposits}
        balances={piggyBalances}
      />
      <StockBreakdownDialog
        open={openStockBreakdown}
        onOpenChange={setOpenStockBreakdown}
        products={products}
      />
    </>

  );
}
