import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Income } from "@/features/financial/hooks/useIncomes";
import { Expense } from "@/types/loan";
import { useHideValues } from "@/contexts/HideValuesContext";
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, Settings2, Receipt, Info, Clock, AlertCircle, LineChart, PiggyBank } from "lucide-react";
import { FinancialMetricCard, FinancialHeroCard, FinancialHealthCard } from "@/features/financial/components/financial";
import { useCreditCards } from "@/features/creditCards/hooks/useCreditCards";
import { useCreditCardOpenings } from "@/features/creditCards/hooks/useCreditCardOpenings";
import { isCreditCardExpense, listPaidInvoicesInRange } from "@/features/creditCards/lib/creditCardInvoiceTotals";
import { isVehicleExpenseForVehicles } from "@/features/vehicles/components/VehicleExpenseForm";
import { useProducts } from "@/features/sales/hooks/useProducts";
import { Sale } from "@/types/loan";
import { supabase } from "@/integrations/supabase/userClient";
import { useDataOwner } from "@/hooks/useDataOwner";
import { calculateIncomeProjectedSummary } from "@/features/financial/lib/incomeProjectedSummary";
import { readBalanceAux, writeBalanceAux, readCachedBalance, writeCachedBalance } from "@/features/financial/lib/balanceCardCache";
import { useFinanceComponentDebug, financeFetchStart, financeFetchSuccess, financeSetState, financeInvalidate } from "@/lib/financeDebug";

/** Total efetivamente recebido de uma venda (não os lançamentos previstos). */
function saleReceivedTotal(sale: Sale): number {
  const historyTotal = (sale.paymentHistory || []).reduce(
    (s, p) => s + (Number(p.amount) || 0),
    0,
  );
  const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
  const legacyTotal = (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
  // Usa o maior dos dois para cobrir vendas antigas cujas parcelas pagas
  // não foram registradas no paymentHistory.
  return Math.max(historyTotal, legacyTotal);
}

/** Total recebido de uma venda no mês (YYYY-MM). */
function saleReceivedInMonth(sale: Sale, monthKey: string): number {
  const history = sale.paymentHistory || [];
  if (history.length > 0) {
    const historyMonthSum = history
      .filter((p) => (p.date || "").startsWith(monthKey))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    // Se o histórico cobre o total recebido, usa o filtro por mês.
    const historyTotal = history.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
    const legacyTotal = (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
    if (historyTotal >= legacyTotal) return historyMonthSum;
    // Caso histórico esteja incompleto, atribui a diferença ao mês da venda.
    const missing = legacyTotal - historyTotal;
    return historyMonthSum + ((sale.date || "").startsWith(monthKey) ? missing : 0);
  }
  // Sem histórico: considera o total recebido no mês da venda.
  return (sale.date || "").startsWith(monthKey) ? saleReceivedTotal(sale) : 0;
}

interface PiggyDepositRecord {
  id: string;
  date: string;
  amount: number;
  bankName: string;
}

function fmt(n: number, hide: boolean) {
  if (hide) return "•••••";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface Props {
  incomes: Income[];
  expenses: Expense[];
  onAdjust?: (delta: number) => Promise<void> | void;
  readOnly?: boolean;
  onOpenIncomes?: () => void;
  onOpenExpenses?: () => void;
  onOpenPendingIncomes?: () => void;
  onOpenPendingExpenses?: () => void;
  onOpenStatement?: () => void;
  statementLeftSlot?: React.ReactNode;
  monthKey?: string;
};

export function IncomeBalanceCard({ incomes, expenses, onAdjust, readOnly, onOpenIncomes, onOpenExpenses, onOpenPendingIncomes, onOpenPendingExpenses, onOpenStatement, statementLeftSlot, monthKey: monthKeyProp }: Props) {
  useFinanceComponentDebug("IncomeBalanceCard");
  const { hidden: hide } = useHideValues();
  const { cards } = useCreditCards();
  const { openings } = useCreditCardOpenings();
  const { sales: rawSales } = useProducts(true);
  // Aluguéis de veículo são isolados na aba "Veículos" e não impactam este saldo.
  const sales = useMemo(
    () => rawSales.filter((s) => s.businessType !== "aluguel_veiculo"),
    [rawSales],
  );
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [projInfoOpen, setProjInfoOpen] = useState(false);
  const ownerId = useDataOwner();
  // Pagamentos de fatura de cartão registrados no extrato (account_ledger).
  // Usados para debitar o "Saldo em Conta" exatamente pelo valor pago da fatura,
  // independente do escopo dos itens (pessoais/empresa) ou do saldo inicial.
  // Hidratados do cache persistente para pintar o último saldo válido de imediato.
  const [cardInvoicePaidByMonth, setCardInvoicePaidByMonth] = useState<Record<string, number>>(
    () => readBalanceAux(ownerId)?.cardInvoicePaidByMonth ?? {},
  );
  const cardInvoicePaidTotal = useMemo(
    () => Object.values(cardInvoicePaidByMonth).reduce((s, v) => s + v, 0),
    [cardInvoicePaidByMonth],
  );
  // Aportes (positivos) e resgates (negativos) dos cofrinhos.
  // Aporte sai do "Saldo em Conta"; resgate retorna ao "Saldo em Conta".
  const [piggyNetByMonth, setPiggyNetByMonth] = useState<Record<string, number>>(
    () => readBalanceAux(ownerId)?.piggyNetByMonth ?? {},
  );
  const [piggyDepositRecords, setPiggyDepositRecords] = useState<PiggyDepositRecord[]>([]);
  const [piggyDialogOpen, setPiggyDialogOpen] = useState(false);
  // Aportes brutos por mês (sem descontar resgates) — usado no card "Aporte em cofrinhos".
  const [piggyDepositsByMonth, setPiggyDepositsByMonth] = useState<Record<string, number>>(
    () => readBalanceAux(ownerId)?.piggyDepositsByMonth ?? {},
  );
  const piggyNetTotal = useMemo(
    () => Object.values(piggyNetByMonth).reduce((s, v) => s + v, 0),
    [piggyNetByMonth],
  );

  // `true` assim que existe base confiável (cache hidratado ou fetch concluído).
  const [auxReady, setAuxReady] = useState(() => Boolean(readBalanceAux(ownerId)));
  const [cachedBalance, setCachedBalance] = useState<number | undefined>(() => readCachedBalance(ownerId));

  // Ao resolver/trocar o owner, hidrata imediatamente do cache daquele usuário.
  useEffect(() => {
    if (!ownerId) return;
    const aux = readBalanceAux(ownerId);
    if (aux) {
      setCardInvoicePaidByMonth(aux.cardInvoicePaidByMonth);
      setPiggyNetByMonth(aux.piggyNetByMonth);
      setPiggyDepositsByMonth(aux.piggyDepositsByMonth ?? {});

      setAuxReady(true);
    }
    setCachedBalance(readCachedBalance(ownerId));
  }, [ownerId]);


  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    const load = async () => {
      financeFetchStart("IncomeBalanceCard", "account_ledger/cofrinhos/cofrinho_aportes", { ownerId: "present" });
      // Nova arquitetura de cofrinhos: cruza `cofrinhos` (do owner) com
      // `cofrinho_aportes` (depósitos) usando `data_aporte` como data financeira.
      // Os resgates já estão refletidos no saldo via `cofrinhos.saldo_principal`,
      // então ajustamos o total para casar com o saldo principal corrente.
      const [{ data: ledger }, { data: banks }] = await Promise.all([
        supabase
          .from("account_ledger")
          .select("amount, occurred_on, metadata")
          .eq("user_id", ownerId)
          .eq("direction", "out")
          .eq("metadata->>kind", "credit_card_invoice_payment"),
        supabase
          .from("cofrinhos" as any)
          .select("id, nome, saldo_principal, ativo")
          .eq("usuario_id", ownerId),
      ]);
      const activeBanks = ((banks as any[]) ?? []).filter((b) => b.ativo !== false);
      const bankIds = activeBanks.map((b) => b.id);
      const principalTotal = activeBanks.reduce(
        (s, b) => s + (Number(b.saldo_principal) || 0),
        0,
      );
      let aportes: any[] = [];
      if (bankIds.length > 0) {
        const { data: ap } = await supabase
          .from("cofrinho_aportes" as any)
          .select("id, cofrinho_id, valor_original, data_aporte, created_at")
          .in("cofrinho_id", bankIds);
        aportes = (ap as any[]) ?? [];
      }
      if (cancelled) return;
      const cardByMonth: Record<string, number> = {};
      for (const r of (ledger as any[]) ?? []) {
        const mk = ((r.occurred_on as string) || "").slice(0, 7);
        if (!mk) continue;
        cardByMonth[mk] = (cardByMonth[mk] ?? 0) + (Number(r.amount) || 0);
      }
      financeSetState("IncomeBalanceCard", "cardInvoicePaidByMonth", { months: Object.keys(cardByMonth).length });
      setCardInvoicePaidByMonth(cardByMonth);
      const bankNameById: Record<string, string> = {};
      for (const b of activeBanks) bankNameById[String(b.id)] = String(b.nome ?? "Cofrinho");
      const piggyByMonth: Record<string, number> = {};
      const depositsByMonth: Record<string, number> = {};
      const depositRecords: PiggyDepositRecord[] = [];
      let aportesTotal = 0;
      for (const r of aportes) {
        const raw = (r.data_aporte as string) || (r.created_at as string) || "";
        const mk = raw.slice(0, 7);
        const v = Math.abs(Number(r.valor_original) || 0);
        aportesTotal += v;
        if (!mk) continue;
        piggyByMonth[mk] = (piggyByMonth[mk] ?? 0) + v;
        depositsByMonth[mk] = (depositsByMonth[mk] ?? 0) + v;
        depositRecords.push({
          id: String(r.id ?? `${mk}-${depositRecords.length}`),
          date: raw.slice(0, 10),
          amount: v,
          bankName: bankNameById[String(r.cofrinho_id)] ?? "Cofrinho",
        });
      }
      // Reconcilia com o saldo_principal atual: a diferença (aportes − saldo)
      // representa resgates já realizados; é distribuída no mês corrente como
      // entrada negativa, mantendo o saldo total alinhado.
      const resgatesTotal = aportesTotal - principalTotal;
      if (Math.abs(resgatesTotal) > 0.005) {
        const nowMk = new Date().toISOString().slice(0, 7);
        piggyByMonth[nowMk] = (piggyByMonth[nowMk] ?? 0) - resgatesTotal;
      }
      financeSetState("IncomeBalanceCard", "piggyNetByMonth", { months: Object.keys(piggyByMonth).length });
      setPiggyNetByMonth(piggyByMonth);
      setPiggyDepositsByMonth(depositsByMonth);
      setPiggyDepositRecords(depositRecords);
      writeBalanceAux(ownerId, {
        cardInvoicePaidByMonth: cardByMonth,
        piggyNetByMonth: piggyByMonth,
        piggyDepositsByMonth: depositsByMonth,
      });

      setAuxReady(true);
      financeFetchSuccess("IncomeBalanceCard", "account_ledger/cofrinhos/cofrinho_aportes", {
        ledgerRows: ((ledger as any[]) ?? []).length,
        bankRows: ((banks as any[]) ?? []).length,
        aporteRows: aportes.length,
      });

    };

    load();
    const handler = (event: Event) => {
      financeInvalidate("IncomeBalanceCard", "account_ledger/cofrinhos/cofrinho_aportes", { event: event.type });
      load();
    };
    window.addEventListener("ledger:changed", handler);
    window.addEventListener("balance:changed", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("ledger:changed", handler);
      window.removeEventListener("balance:changed", handler);
    };
  }, [ownerId]);

  const now = new Date();
  const monthKey = monthKeyProp ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [mkY, mkM] = monthKey.split("-").map(Number);
  const prevDate = new Date(mkY, mkM - 2, 1);
  const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const calc = useMemo(() => {
    // Saldo em Conta (aba Receitas) = receitas recebidas + vendas recebidas − despesas pessoais pagas
    // (exceto itens de cartão, que são contabilizados pelo pagamento real da fatura no extrato).
    const totalIncomeReceived = incomes
      .filter((i) => i.status === "received")
      .reduce((s, i) => s + i.amount, 0);
    const totalSalesReceived = sales.reduce((s, sale) => s + saleReceivedTotal(sale), 0);
    const totalExpensePaid = expenses
      .filter((e) => e.paid && (e.scope ?? "business") === "personal" && !isCreditCardExpense(e) && !isVehicleExpenseForVehicles(e))
      .reduce((s, e) => s + e.amount, 0);
    const balance = totalIncomeReceived + totalSalesReceived - totalExpensePaid - cardInvoicePaidTotal - piggyNetTotal;

    // Movimentação do mês vigente — alinhada ao total exibido em MonthTransactionsSheet
    // (Entradas/Saídas do mês), considerando todas as ocorrências do mês (pagas + pendentes).
    // Apenas receitas efetivamente recebidas no mês entram em "Entradas mês".
    const monthInIncomes = incomes.reduce((s, i) => {
      if (i.source === "Ajuste manual") return s;
      if (i.status !== "received") return s;
      if (!i.receivedDate.startsWith(monthKey)) return s;
      return s + i.amount;
    }, 0);
    const monthInSales = sales.reduce((s, sale) => s + saleReceivedInMonth(sale, monthKey), 0);
    const monthIn = monthInIncomes + monthInSales;
    // Will be adjusted with piggy withdrawals below.
    // Saídas do mês: despesas pessoais pagas (exceto itens de cartão, que entram
    // pelo total consolidado da fatura quitada no mês) + faturas de cartão quitadas
    // dentro do mês. Mesma base usada no detalhamento "Saídas do mês" (sheet).
    const monthOutExpenses = expenses.reduce((s, e) => {
      if ((e.scope ?? "business") !== "personal") return s;
      if (!e.paid) return s;
      if (isCreditCardExpense(e)) return s;
      const d = e.paidDate || e.dueDate || "";
      if (!d.startsWith(monthKey)) return s;
      const amt = e.type === "recorrente" && e.installments && e.installments > 1
        ? e.amount / e.installments
        : e.amount;
      return s + amt;
    }, 0);
    const [mY, mM] = monthKey.split("-").map(Number);
    const lastDay = new Date(mY, mM, 0).getDate();
    const monthFromISO = `${monthKey}-01`;
    const monthToISO = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
    const monthInvoicesPaid = listPaidInvoicesInRange(
      expenses,
      cards,
      openings,
      monthFromISO,
      monthToISO,
    ).reduce((s, inv) => s + inv.paidTotal, 0);
    const monthOut = monthOutExpenses + monthInvoicesPaid;


    const projectedSummary = calculateIncomeProjectedSummary({
      baseBalance: balance,
      incomes,
      expenses,
      cards,
      openings,
      monthKey,
    });

    const prevIn = incomes
      .filter((i) => i.status === "received" && i.receivedDate.startsWith(prevKey))
      .reduce((s, i) => s + i.amount, 0);

    // Saídas do mês anterior (mesma base de "Saídas mês")
    const prevOutExpenses = expenses.reduce((s, e) => {
      if ((e.scope ?? "business") !== "personal") return s;
      if (!e.paid) return s;
      if (isCreditCardExpense(e)) return s;
      const d = e.paidDate || e.dueDate || "";
      if (!d.startsWith(prevKey)) return s;
      const amt = e.type === "recorrente" && e.installments && e.installments > 1
        ? e.amount / e.installments
        : e.amount;
      return s + amt;
    }, 0);
    const [pY, pM] = prevKey.split("-").map(Number);
    const prevLastDay = new Date(pY, pM, 0).getDate();
    const prevInvoicesPaid = listPaidInvoicesInRange(
      expenses,
      cards,
      openings,
      `${prevKey}-01`,
      `${prevKey}-${String(prevLastDay).padStart(2, "0")}`,
    ).reduce((s, inv) => s + inv.paidTotal, 0);
    const prevOut = prevOutExpenses + prevInvoicesPaid;

    // Entradas do mês = apenas receitas recebidas + vendas recebidas.
    // Resgates de cofrinhos não entram neste card.
    return { balance, monthIn, monthOut, prevIn, prevOut, ...projectedSummary };

  }, [incomes, expenses, monthKey, prevKey, cards, openings, sales, cardInvoicePaidByMonth, cardInvoicePaidTotal, piggyNetByMonth, piggyNetTotal]);

  const piggyDepositsMonth = piggyDepositsByMonth[monthKey] ?? 0;
  const piggyDepositsPrevMonth = piggyDepositsByMonth[prevKey] ?? 0;
  const piggyDepositsDiff = piggyDepositsMonth - piggyDepositsPrevMonth;
  const piggyDepositsPct =
    piggyDepositsPrevMonth > 0 ? (piggyDepositsDiff / piggyDepositsPrevMonth) * 100 : null;
  const piggyMonthRecords = useMemo(
    () =>
      piggyDepositRecords
        .filter((r) => (r.date || "").startsWith(monthKey))
        .slice()
        .sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [piggyDepositRecords, monthKey],
  );


  const diff = calc.monthIn - calc.prevIn;
  const pct = calc.prevIn > 0 ? (diff / calc.prevIn) * 100 : 0;
  const outDiff = calc.monthOut - calc.prevOut;
  const outPct = calc.prevOut > 0 ? (outDiff / calc.prevOut) * 100 : 0;
  const trend: "up" | "down" | "neutral" = diff > 0 ? "up" : diff < 0 ? "down" : "neutral";
  const trendColor = trend === "up" ? "text-emerald-600 dark:text-emerald-400"
    : trend === "down" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground";

  const balanceColor = calc.balance > 0 ? "text-emerald-600 dark:text-emerald-400"
    : calc.balance < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground";

  // Persiste o último saldo válido (somente quando a base auxiliar está pronta).
  useEffect(() => {
    if (!auxReady || !ownerId) return;
    writeCachedBalance(ownerId, calc.balance);
    setCachedBalance(calc.balance);
  }, [auxReady, ownerId, calc.balance]);

  // Enquanto a base auxiliar não chega, mostra o último saldo em cache.
  // Sem cache algum, mostra skeleton (nunca R$ 0,00 falso).
  const displayBalance = auxReady ? calc.balance : cachedBalance;
  const balanceLoading = displayBalance === undefined;


  return (
    <div className="space-y-3 animate-fade-in">
      {(() => {
        const trendLabel = calc.prevIn > 0
          ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs mês anterior`
          : "Sem histórico";
        const variationTone: "positive" | "negative" | "neutral" =
          trend === "up" ? "positive" : trend === "down" ? "negative" : "neutral";

        // Score simples: saldo positivo + baixa razão de despesas pendentes vs entradas do mês.
        const baseIn = Math.max(1, calc.monthIn + Math.max(0, calc.balance));
        const pendingRatio = Math.min(1, calc.futureOut / baseIn);
        let health = 100;
        health -= pendingRatio * 50;
        if (calc.balance < 0) health -= 25;
        if (calc.projected < 0) health -= 20;
        if (calc.projected > calc.balance) health += 5;
        const healthScore = Math.max(0, Math.min(100, Math.round(health)));

        const action = (
          <div className="flex items-center gap-2">
            {statementLeftSlot}
            {onOpenStatement && (
              <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9 bg-white/15 text-primary-foreground hover:bg-white/25 border-none"
                onClick={onOpenStatement}
                aria-label="Extrato"
                title="Extrato"
              >
                <Receipt className="h-4 w-4" />
              </Button>
            )}
            {!readOnly && onAdjust && (
              <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9 bg-white/15 text-primary-foreground hover:bg-white/25 border-none"
                onClick={() => { setTarget(calc.balance.toFixed(2)); setAdjustOpen(true); }}
                aria-label="Ajustar saldo"
                title="Ajustar saldo"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        );

        return (
          <div className="w-full">
            <FinancialHeroCard
              eyebrow="Saldo em Conta"
              value={hide ? "•••••" : fmt(displayBalance ?? 0, false)}
              valueLoading={!hide && balanceLoading}
              variation={{ label: trendLabel, direction: trend === "neutral" ? "flat" : trend, tone: variationTone }}
              action={action}
            />

          </div>
        );
      })()}

      <Card no3d className="p-3 sm:p-4 border border-border/50">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6 items-stretch">
          <FinancialMetricCard
            icon={ArrowUpRight}
            label="Entradas mês"
            value={fmt(calc.monthIn, hide)}
            tone="success"
            onClick={onOpenIncomes}
            ariaLabel="Ver entradas do mês"
            hint={
              <span
                className={
                  calc.prevIn <= 0
                    ? "text-muted-foreground"
                    : diff > 0
                      ? "text-success"
                      : diff < 0
                        ? "text-destructive"
                        : "text-muted-foreground"
                }
              >
                {calc.prevIn > 0
                  ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs. mês anterior`
                  : calc.monthIn > 0
                    ? "novo vs. mês anterior"
                    : "sem entradas no mês anterior"}
              </span>
            }
          />
          <FinancialMetricCard
            icon={ArrowDownRight}
            label="Saídas mês"
            value={fmt(calc.monthOut, hide)}
            tone="destructive"
            onClick={onOpenExpenses}
            ariaLabel="Ver saídas do mês"
            hint={
              <span
                className={
                  calc.prevOut <= 0
                    ? "text-muted-foreground"
                    : outDiff > 0
                      ? "text-destructive"
                      : outDiff < 0
                        ? "text-success"
                        : "text-muted-foreground"
                }
              >
                {calc.prevOut > 0
                  ? `${outPct >= 0 ? "+" : ""}${outPct.toFixed(1)}% vs. mês anterior`
                  : calc.monthOut > 0
                    ? "novo vs. mês anterior"
                    : "sem saídas no mês anterior"}
              </span>
            }
          />

          <FinancialMetricCard
            icon={Clock}
            label="Receitas pendentes"
            value={fmt(calc.futureIn, hide)}
            tone="warning"
            hint={`${calc.pendingInCount} pendente${calc.pendingInCount === 1 ? "" : "s"}`}
            onClick={onOpenPendingIncomes}
            ariaLabel="Ver receitas pendentes"
          />
          <FinancialMetricCard
            icon={AlertCircle}
            label="Despesas pendentes"
            value={fmt(calc.futureOut, hide)}
            tone="destructive"
            hint={calc.futureOut > 0 ? "a vencer" : "Tudo pago"}
            onClick={onOpenPendingExpenses}
            ariaLabel="Ver despesas pendentes"
          />
          <FinancialMetricCard
            icon={PiggyBank}
            label="COFRINHOS"
            value={fmt(piggyDepositsMonth, hide)}
            tone="info"
            hint={
              <span
                className={
                  piggyDepositsDiff > 0
                    ? "text-success"
                    : piggyDepositsDiff < 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                }
              >
                {piggyDepositsPct == null
                  ? piggyDepositsMonth > 0
                    ? "novo vs. mês anterior"
                    : "sem aportes no mês anterior"
                  : `${piggyDepositsDiff >= 0 ? "+" : ""}${piggyDepositsPct.toFixed(1)}% vs. mês anterior`}
              </span>
            }
            onClick={() => setPiggyDialogOpen(true)}
            ariaLabel="Ver aportes em cofrinhos do mês"
          />

          <FinancialMetricCard
            icon={LineChart}
            label="Saldo previsto"
            value={fmt(calc.projected, hide)}
            tone={calc.projected >= 0 ? "info" : "destructive"}
            hint={
              <span className={calc.projectedDiff >= 0 ? "text-success" : "text-destructive"}>
                {calc.projectedDiff >= 0 ? "+" : ""}
                {fmt(calc.projectedDiff, hide)} vs atual
              </span>
            }
            onClick={() => setProjInfoOpen(true)}
            ariaLabel="Ver dados usados no cálculo do saldo previsto"
          />

        </div>
      </Card>




      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajustar saldo em conta</DialogTitle>
            <DialogDescription>
              Informe o novo saldo desejado. Será criado um lançamento de ajuste para chegar ao valor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="text-xs text-muted-foreground">Saldo atual</div>
              <div className="font-semibold">{fmt(calc.balance, false)}</div>
            </div>
            <div>
              <Label>Novo saldo</Label>
              <Input
                type="number"
                step="0.01"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="0,00"
              />
              {target !== "" && !isNaN(Number(target)) && (
                <p className="text-xs text-muted-foreground mt-1">
                  Diferença: <span className={Number(target) - calc.balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                    {Number(target) - calc.balance >= 0 ? "+" : ""}{fmt(Number(target) - calc.balance, false)}
                  </span>
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancelar</Button>
            <Button
              disabled={saving || target === "" || isNaN(Number(target)) || Number(target) === calc.balance}
              onClick={async () => {
                if (!onAdjust) return;
                setSaving(true);
                await onAdjust(Number(target) - calc.balance);
                setSaving(false);
                setAdjustOpen(false);
              }}
            >
              {saving ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={piggyDialogOpen} onOpenChange={setPiggyDialogOpen}>
        <SheetContent side="bottom" className="h-[85vh] sm:h-[80vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              <PiggyBank className="h-5 w-5 text-primary" />
              Aportes em cofrinhos
            </SheetTitle>
            <SheetDescription>
              {piggyMonthRecords.length} lançamento{piggyMonthRecords.length === 1 ? "" : "s"} · Total{" "}
              <span className="text-primary font-semibold">{fmt(piggyDepositsMonth, hide)}</span>
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-2 pb-6 animate-fade-in">
            {piggyMonthRecords.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Nenhum aporte registrado neste mês
              </div>
            ) : (
              piggyMonthRecords.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-border/40 bg-card/60 hover:border-border/80 transition-all overflow-hidden"
                >
                  <div className="p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{r.bankName}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                        {r.date && <span>{r.date.split("-").reverse().join("/")}</span>}
                        <span>Aporte</span>
                      </div>
                    </div>
                    <div className="text-base font-bold text-primary whitespace-nowrap">
                      {fmt(r.amount, hide)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>



      <Dialog open={projInfoOpen} onOpenChange={setProjInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              Como o Saldo previsto é calculado
            </DialogTitle>
            <DialogDescription>
              Projeção do saldo no último dia do mês selecionado ({monthKey}), encadeando dia a dia receitas e despesas previstas a partir do saldo atual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-muted/40 p-3 font-mono text-xs leading-relaxed">
              Saldo previsto = Saldo em conta<br />
              &nbsp;&nbsp;+ Receitas pendentes do mês<br />
              &nbsp;&nbsp;− Despesas pessoais a pagar do mês<br />
              &nbsp;&nbsp;− Faturas de cartão pendentes do mês
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border/40 p-2">
                <p className="text-[10px] text-muted-foreground uppercase">Saldo em conta</p>
                <p className="font-semibold">{fmt(calc.balance, false)}</p>
              </div>
              <div className="rounded-md border border-border/40 p-2">
                <p className="text-[10px] text-muted-foreground uppercase">Receitas pendentes</p>
                <p className="font-semibold text-warning">+ {fmt(calc.futureIn, false)}</p>
              </div>
              <div className="rounded-md border border-border/40 p-2">
                <p className="text-[10px] text-muted-foreground uppercase">A pagar no mês</p>
                <p className="font-semibold text-destructive">− {fmt(calc.futureOut, false)}</p>
              </div>
              <div className="rounded-md border border-border/40 p-2">
                <p className="text-[10px] text-muted-foreground uppercase">Variação vs atual</p>
                <p className={`font-semibold ${calc.projectedDiff >= 0 ? "text-success" : "text-destructive"}`}>
                  {calc.projectedDiff >= 0 ? "+" : ""}{fmt(calc.projectedDiff, false)}
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-[10px] text-muted-foreground uppercase">Saldo previsto (fim do mês)</p>
              <p className="text-lg font-bold text-primary">{fmt(calc.projected, false)}</p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Observação: a projeção dia a dia considera receitas recebidas, vendas, despesas pessoais pagas/a pagar, faturas de cartão e aportes ao cofrinho. Despesas da empresa não afetam este saldo.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjInfoOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
