import { useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";
import { Income } from "@/features/financial/hooks/useIncomes";
import { Expense } from "@/types/loan";
import { usePiggyBanks } from "@/features/piggyBanks/hooks/usePiggyBanks";
import { useProducts } from "@/features/sales/hooks/useProducts";
import { Sale } from "@/types/loan";
import { useHideValues } from "@/contexts/HideValuesContext";
import { useCreditCards } from "@/features/creditCards/hooks/useCreditCards";
import { useCreditCardOpenings } from "@/features/creditCards/hooks/useCreditCardOpenings";
import { isCreditCardExpense, listPaidInvoicesInRange } from "@/features/creditCards/lib/creditCardInvoiceTotals";
import { useMonthFlow } from "@/features/financial/hooks/useMonthFlow";
import { useFinanceComponentDebug } from "@/lib/financeDebug";
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  Heart,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Shield,
  Wallet,
  PiggyBank,
  ArrowDownRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Gauge,
  Scale,
  Banknote,
  LineChart as LineChartIcon,
} from "lucide-react";

const COLOR_GREEN = "#10B981";
const COLOR_YELLOW = "#F59E0B";
const COLOR_RED = "#EF4444";
const DONUT_COLORS = ["#10B981", "#06B6D4", "#8B5CF6", "#F59E0B", "#EF4444", "#EC4899"];

type IndicatorKey = "control" | "reserve" | "debts" | "investments" | "stability";

const INDICATORS: { key: IndicatorKey; label: string; icon: React.ReactNode }[] = [
  { key: "control", label: "Controle", icon: <Wallet className="h-3.5 w-3.5" /> },
  { key: "reserve", label: "Reserva", icon: <Shield className="h-3.5 w-3.5" /> },
  { key: "debts", label: "Dívidas", icon: <Scale className="h-3.5 w-3.5" /> },
  { key: "investments", label: "Investim.", icon: <Banknote className="h-3.5 w-3.5" /> },
  { key: "stability", label: "Estabilid.", icon: <LineChartIcon className="h-3.5 w-3.5" /> },
];

function scoreColorOf(score: number): string {
  if (score >= 70) return COLOR_GREEN;
  if (score >= 40) return COLOR_YELLOW;
  return COLOR_RED;
}

function scoreLabelOf(score: number): string {
  if (score >= 70) return "Bom";
  if (score >= 40) return "Atenção";
  return "Ruim";
}

interface Props {
  incomes: Income[];
  expenses: Expense[];
  monthKey: string;
  /** Se "overall", o card reflete o resultado acumulado geral da aba Financeiro
   *  em vez de um espelho do mês selecionado. */
  mode?: "monthly" | "overall";
}

function fmtBRL(n: number, hide: boolean) {
  if (hide) return "•••••";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function monthKeyOffset(base: string, offset: number): string {
  const [y, m] = base.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

interface MonthMetrics {
  income: number;
  expense: number;
  pendingExpense: number;
}

function monthlyExpenseAmount(e: Expense): number {
  const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
  return isRec ? Number(e.amount) / Number(e.installments) : Number(e.amount);
}

function saleReceivedTotal(sale: Sale): number {
  const history = sale.paymentHistory || [];
  const historyTotal = history.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
  const legacyTotal = (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
  return Math.max(historyTotal, legacyTotal);
}

function saleReceivedInMonth(sale: Sale, monthKey: string): number {
  const history = sale.paymentHistory || [];
  if (history.length > 0) {
    const historyMonthSum = history
      .filter((p) => (p.date || "").startsWith(monthKey))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const historyTotal = history.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
    const legacyTotal = (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
    if (historyTotal >= legacyTotal) return historyMonthSum;
    const missing = legacyTotal - historyTotal;
    return historyMonthSum + ((sale.date || "").startsWith(monthKey) ? missing : 0);
  }
  return (sale.date || "").startsWith(monthKey) ? saleReceivedTotal(sale) : 0;
}

function computeMonthMetrics(
  incomes: Income[],
  expenses: Expense[],
  sales: Sale[],
  cards: ReturnType<typeof useCreditCards>["cards"],
  openings: ReturnType<typeof useCreditCardOpenings>["openings"],
  key: string,
): MonthMetrics {
  const incomeFromIncomes = incomes
    .filter((i) => i.status === "received" && i.receivedDate.startsWith(key))
    .reduce((s, i) => s + i.amount, 0);
  const incomeFromSales = sales.reduce((s, sale) => s + saleReceivedInMonth(sale, key), 0);
  const income = incomeFromIncomes + incomeFromSales;
  const personal = expenses.filter((e) => (e.scope ?? "business") === "personal");
  // Saídas do mês = despesas pessoais pagas (exceto itens de cartão) + faturas de cartão quitadas no mês.
  const expensePaidNonCard = personal
    .filter((e) => e.paid && (e.paidDate || "").startsWith(key) && !isCreditCardExpense(e))
    .reduce((s, e) => s + monthlyExpenseAmount(e), 0);
  const [yy, mm] = key.split("-").map(Number);
  let invoicesPaid = 0;
  if (yy && mm) {
    const lastDay = new Date(yy, mm, 0).getDate();
    const fromISO = `${key}-01`;
    const toISO = `${key}-${String(lastDay).padStart(2, "0")}`;
    invoicesPaid = listPaidInvoicesInRange(expenses, cards, openings, fromISO, toISO)
      .reduce((s, inv) => s + inv.paidTotal, 0);
  }
  const expense = expensePaidNonCard + invoicesPaid;
  const pendingExpense = personal
    .filter((e) => !e.paid && (e.dueDate || "").startsWith(key))
    .reduce((s, e) => s + monthlyExpenseAmount(e), 0);
  return { income, expense, pendingExpense };
}

function computeOverallMetrics(
  incomes: Income[],
  expenses: Expense[],
  sales: Sale[],
  cards: ReturnType<typeof useCreditCards>["cards"],
  openings: ReturnType<typeof useCreditCardOpenings>["openings"],
): MonthMetrics {
  const incomeFromIncomes = incomes
    .filter((i) => i.status === "received")
    .reduce((s, i) => s + i.amount, 0);
  const incomeFromSales = sales.reduce((s, sale) => s + saleReceivedTotal(sale), 0);
  const income = incomeFromIncomes + incomeFromSales;
  const personal = expenses.filter((e) => (e.scope ?? "business") === "personal");
  const expensePaidNonCard = personal
    .filter((e) => e.paid && !isCreditCardExpense(e))
    .reduce((s, e) => s + monthlyExpenseAmount(e), 0);
  const invoicesPaid = listPaidInvoicesInRange(expenses, cards, openings, "1970-01-01", "2099-12-31")
    .reduce((s, inv) => s + inv.paidTotal, 0);
  const expense = expensePaidNonCard + invoicesPaid;
  // Contas em aberto relevantes = vencidas + do mês corrente. Parcelas futuras
  // não comprometem a renda atual e distorceriam o indicador de dívidas.
  const cutoff = (() => {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  })();
  const pendingExpense = personal
    .filter((e) => !e.paid && (e.dueDate || "").slice(0, 10) <= cutoff)
    .reduce((s, e) => s + monthlyExpenseAmount(e), 0);
  return { income, expense, pendingExpense };
}

function computeScore(
  m: MonthMetrics,
  piggyBalance: number,
  avgExpense: number,
  // Renda de referência para indicadores que comparam um SALDO (estoque) com a
  // renda. No modo acumulado a renda total distorceria a razão, então usamos a
  // renda mensal média.
  incomeRef: number = m.income,
  // Saldo dos cofrinhos marcados como "Reserva de emergência" (fallback: total).
  reserveBalance: number = piggyBalance,
): number {
  // Componentes (cada 0-100)
  const spendControl = m.income > 0 ? clamp(((m.income - m.expense) / m.income) * 200) : 30;
  const reserve = avgExpense > 0 ? clamp((reserveBalance / avgExpense / 6) * 100) : reserveBalance > 0 ? 60 : 30;
  const debts = incomeRef > 0 ? clamp(100 - (m.pendingExpense / incomeRef) * 100) : 50;
  const investments = incomeRef > 0 ? clamp((piggyBalance / (incomeRef * 3)) * 100) : 0;
  const stability = m.income > 0 && m.expense >= 0
    ? clamp(100 - Math.abs(m.expense / m.income - 0.6) * 120)
    : 50;
  return Math.round((spendControl + reserve + debts + investments + stability) / 5);
}

export function FinancialHealthDashboard({ incomes, expenses, monthKey, mode = "monthly" }: Props) {
  useFinanceComponentDebug("FinancialHealthDashboard");
  const isOverall = mode === "overall";
  const { hidden } = useHideValues();
  const { deposits, piggyBanks } = usePiggyBanks();
  const { sales: rawSales } = useProducts(true);
  // Aluguéis de veículo são isolados na aba "Veículos" e não impactam Receitas e Despesas.
  const sales = useMemo(
    () => (rawSales ?? []).filter((s) => s.businessType !== "aluguel_veiculo"),
    [rawSales],
  );
  const { cards } = useCreditCards();
  const { openings } = useCreditCardOpenings();
  const monthFlow = useMonthFlow(monthKey);
  const [expanded, setExpanded] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportContent, setReportContent] = useState<string>("");
  const [openIndicator, setOpenIndicator] = useState<IndicatorKey | null>(null);

  const data = useMemo(() => {
    const safeDeposits = deposits ?? [];
    const safePiggyBanks = piggyBanks ?? [];
    const piggyBalance = safeDeposits.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    // Reserva de emergência = apenas cofrinhos dessa categoria. Se nenhum estiver
    // marcado, usa o saldo total (comportamento anterior).
    const reserveIds = new Set(
      safePiggyBanks
        .filter((p) => {
          const tag = `${p.category ?? ""} ${p.name ?? ""}`.toLowerCase();
          return tag.includes("reserva") || tag.includes("emerg");
        })
        .map((p) => p.id),
    );
    const taggedReserve = deposits
      .filter((d) => reserveIds.has(d.piggyBankId))
      .reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const reserveBalance = reserveIds.size > 0 ? taggedReserve : piggyBalance;

    // Net cofrinhos por mês (positivo = aporte / negativo = resgate). Resgates
    // entram como "entrada" no mês (igual ao card "Entradas mês").
    const piggyNetByMonth: Record<string, number> = {};
    for (const d of deposits) {
      const mk = (d.depositDate || "").slice(0, 7);
      if (!mk) continue;
      piggyNetByMonth[mk] = (piggyNetByMonth[mk] ?? 0) + (Number(d.amount) || 0);
    }

    // Últimos 6 meses (incluindo o atual) — mantidos para evolução e referência.
    const months = Array.from({ length: 6 }, (_, i) => monthKeyOffset(monthKey, -(5 - i)));
    const monthsMetrics = months.map((k) => {
      const m = computeMonthMetrics(incomes, expenses, sales, cards, openings, k);
      const piggyIn = Math.max(0, -(piggyNetByMonth[k] ?? 0));
      return { ...m, income: m.income + piggyIn };
    });
    const avgExpense =
      monthsMetrics.reduce((s, m) => s + m.expense, 0) / Math.max(1, monthsMetrics.filter((m) => m.expense > 0).length);
    const avgIncome =
      monthsMetrics.reduce((s, m) => s + m.income, 0) / Math.max(1, monthsMetrics.filter((m) => m.income > 0).length);

    const evolution = months.map((k, idx) => ({
      month: monthLabel(k),
      score: computeScore(monthsMetrics[idx], piggyBalance, avgExpense, undefined, reserveBalance),
    }));

    // Resultado geral (acumulado) ou espelho mensal conforme prop.
    const overall = isOverall ? computeOverallMetrics(incomes, expenses, sales, cards, openings) : null;
    const current = overall ?? monthsMetrics[5];
    const previous = isOverall
      ? monthsMetrics[5]
      : monthsMetrics[4];
    // Indicadores que comparam um SALDO (cofrinhos, contas em aberto) com a
    // renda usam a renda MENSAL de referência, mesmo no modo acumulado.
    const incomeRef = isOverall ? avgIncome : current.income;
    const score = computeScore(current, piggyBalance, avgExpense, incomeRef, reserveBalance);
    const previousScore = computeScore(previous, piggyBalance, avgExpense, undefined, reserveBalance);
    const improvementPct = previousScore > 0 ? Math.round(((score - previousScore) / previousScore) * 100) : 0;

    // Radar
    const spendControl = current.income > 0 ? clamp(((current.income - current.expense) / current.income) * 200) : 30;
    const reserve = avgExpense > 0 ? clamp((reserveBalance / avgExpense / 6) * 100) : reserveBalance > 0 ? 60 : 30;
    const debts = incomeRef > 0 ? clamp(100 - (current.pendingExpense / incomeRef) * 100) : 50;
    const investments = incomeRef > 0 ? clamp((piggyBalance / (incomeRef * 3)) * 100) : 0;
    const stability = current.income > 0
      ? clamp(100 - Math.abs(current.expense / current.income - 0.6) * 120)
      : 50;

    const radar = [
      { axis: "Controle", value: Math.round(spendControl) },
      { axis: "Reserva", value: Math.round(reserve) },
      { axis: "Dívidas", value: Math.round(debts) },
      { axis: "Investim.", value: Math.round(investments) },
      { axis: "Estabilid.", value: Math.round(stability) },
    ];

    // Donut por categoria de despesa: acumulado no modo geral, do mês no mensal.
    const map = new Map<string, number>();
    expenses
      .filter((e) => {
        if ((e.scope ?? "business") !== "personal" || !e.paid) return false;
        return isOverall || (e.paidDate || "").startsWith(monthKey);
      })
      .forEach((e) => {
        const k = e.category || "Outros";
        map.set(k, (map.get(k) || 0) + monthlyExpenseAmount(e));
      });
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 4);
    const rest = sorted.slice(4).reduce((s, [, v]) => s + v, 0);
    const categories = [
      ...top.map(([name, value]) => ({ name, value })),
      ...(rest > 0 ? [{ name: "Outros", value: rest }] : []),
    ];

    // Insights
    const monthsCovered = avgExpense > 0 ? reserveBalance / avgExpense : 0;
    const expenseDelta = previous.expense > 0
      ? Math.round(((current.expense - previous.expense) / previous.expense) * 100)
      : 0;

    return {
      score,
      improvementPct,
      evolution,
      radar,
      categories,
      current,
      previous,
      monthsCovered,
      expenseDelta,
      piggyBalance,
      reserveBalance,
      avgExpense,
      incomeRef,
      indicatorScores: {
        control: Math.round(spendControl),
        reserve: Math.round(reserve),
        debts: Math.round(debts),
        investments: Math.round(investments),
        stability: Math.round(stability),
      },
    };
  }, [incomes, expenses, sales, cards, openings, monthKey, deposits, piggyBanks, isOverall]);

  const generateReport = async () => {
    setReportOpen(true);
    if (reportContent) return;
    setReportLoading(true);
    try {
      const [yy, mm] = monthKey.split("-").map(Number);
      const periodStart = `${monthKey}-01`;
      const lastDay = new Date(yy, mm, 0).getDate();
      const periodEnd = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
      const monthLabelFull = new Date(yy, mm - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      const { data: res, error } = await supabase.functions.invoke("generate-income-health-report", {
        body: {
          metrics: {
            score: data.score,
            improvementPct: data.improvementPct,
            monthsCovered: data.monthsCovered,
            expenseDelta: data.expenseDelta,
            piggyBalance: data.piggyBalance,
            current: data.current,
            previous: data.previous,
            radar: data.radar,
            categories: data.categories,
            monthKey,
            monthLabel: monthLabelFull,
            periodStart,
            periodEnd,
          },
        },
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      setReportContent((res as any)?.content || "Não foi possível gerar o relatório.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar relatório");
      setReportOpen(false);
    } finally {
      setReportLoading(false);
    }
  };

  const scoreColor =
    data.score >= 70 ? COLOR_GREEN : data.score >= 40 ? COLOR_YELLOW : COLOR_RED;
  const scoreLabel =
    data.score >= 70 ? "Saudável" : data.score >= 40 ? "Atenção" : "Crítico";

  const gaugeData = [{ name: "score", value: data.score, fill: scoreColor }];

  const toggleExpandedMobile = (e: React.MouseEvent) => {
    // Só age em mobile (sm:hidden equivalente). Ignora se o clique veio de um elemento interativo.
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, [role='button'], input, select, textarea")) return;
    setExpanded((v) => !v);
  };

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-card/95 via-card/85 to-card/95 dark:from-[#0B1120] dark:via-[#0F172A] dark:to-[#1E293B] p-5 sm:p-7 shadow-xl border border-border/70 backdrop-blur-2xl transition-all duration-300">
      {/* Luz ambiente de fundo */}
      <div
        className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full blur-3xl opacity-20 dark:opacity-25"
        style={{ background: `radial-gradient(circle, ${scoreColor}, transparent 70%)` }}
      />
      <div
        className="pointer-events-none absolute -top-24 -right-20 h-72 w-72 rounded-full blur-3xl opacity-15 dark:opacity-20"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)), transparent 70%)" }}
      />

      {/* Indicadores de saúde — 5 velocímetros modernos */}
      <div className="relative block">
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-xs transition-colors"
              style={{ background: `${scoreColor}1f`, color: scoreColor }}
            >
              <Gauge className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h4 className="truncate text-sm sm:text-base font-bold tracking-tight text-foreground flex items-center gap-2">
                Indicadores essenciais
                <span className="hidden sm:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Saúde Financeira
                </span>
              </h4>
              <p className="truncate text-xs text-muted-foreground mt-0.5">
                Diagnóstico inteligente e saúde patrimonial em tempo real • Toque para ver ações
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
            <div className="text-right hidden sm:block">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                Score Geral
              </span>
              <span className="text-sm font-bold text-foreground tabular-nums">
                {data.score} / 100
              </span>
            </div>
            <span
              className="inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-xs font-bold tabular-nums shadow-xs border"
              style={{
                background: `${scoreColor}18`,
                color: scoreColor,
                borderColor: `${scoreColor}33`,
              }}
            >
              <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: scoreColor }} />
              {data.score}/100 · {scoreLabel}
            </span>
          </div>
        </div>

        {/* Barra de Espectro do Score de Saúde */}
        <div className="mb-6 space-y-1.5 px-0.5">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Diagnóstico Consolidado</span>
            <span style={{ color: scoreColor }}>{scoreLabel} ({data.score}%)</span>
          </div>
          <div className="relative h-2 w-full rounded-full bg-muted/60 overflow-hidden p-0.5 border border-border/40">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out shadow-xs"
              style={{
                width: `${Math.max(data.score, 4)}%`,
                background: `linear-gradient(90deg, #EF4444 0%, #F59E0B 45%, #10B981 80%, #059669 100%)`,
              }}
            />
          </div>
        </div>

        {/* Grid de 5 indicadores essenciais: Mobile layout 1x2x2 (1º destaque largura cheia + 2 pares lado a lado) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-3.5">
          {INDICATORS.map((ind, idx) => (
            <IndicatorGaugeCard
              key={ind.key}
              title={ind.label}
              icon={ind.icon}
              score={data.indicatorScores[ind.key]}
              contextText={getContextMetric(ind.key, data, hidden)}
              onClick={() => setOpenIndicator(ind.key)}
              isFeatured={idx === 0}
              className={idx === 0 ? "col-span-2 md:col-span-1" : "col-span-1"}
            />
          ))}
        </div>
      </div>

      {/* Dialog: ações concretas por indicador */}
      <IndicatorActionsDialog
        open={openIndicator !== null}
        onOpenChange={(o) => !o && setOpenIndicator(null)}
        indicatorKey={openIndicator}
        data={data}
        hidden={hidden}
        mode={mode}
      />
    </div>
  );
}

function getContextMetric(key: IndicatorKey, d: ActionsData, hidden: boolean): string {
  const fmt = (n: number) => fmtBRL(Math.max(0, n), hidden);
  switch (key) {
    case "control": {
      const inc = d.current.income;
      const exp = d.current.expense;
      if (inc <= 0) return exp > 0 ? `${fmt(exp)} gastos` : "Sem receitas";
      const ratio = (exp / inc) * 100;
      return `${ratio.toFixed(0)}% da renda gasta`;
    }
    case "reserve": {
      if (d.avgExpense <= 0) return d.reserveBalance > 0 ? `${fmt(d.reserveBalance)} guardados` : "Em formação";
      return `${d.monthsCovered.toFixed(1)} meses cobertos`;
    }
    case "debts": {
      const incRef = d.incomeRef;
      const pend = d.current.pendingExpense;
      if (pend <= 0) return "Nenhuma pendência";
      if (incRef <= 0) return `${fmt(pend)} a pagar`;
      const ratio = (pend / incRef) * 100;
      return `${ratio.toFixed(0)}% comprometido`;
    }
    case "investments": {
      if (d.piggyBalance <= 0) return "Sem aportes";
      if (d.incomeRef <= 0) return `${fmt(d.piggyBalance)} em cofrinhos`;
      return `${(d.piggyBalance / d.incomeRef).toFixed(1)}× a renda`;
    }
    case "stability": {
      const inc = d.current.income;
      const exp = d.current.expense;
      if (inc <= 0) return "Equilibrado";
      const ratio = (exp / inc) * 100;
      return `${ratio.toFixed(0)}% comprometido`;
    }
  }
}

function GlassCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-black/10 dark:border-white/10 bg-foreground/[0.03] backdrop-blur-xl p-4 shadow-[0_8px_32px_-12px_hsl(220_30%_8%/0.18)] dark:shadow-[0_8px_32px_-12px_rgba(0,0,0,0.4)] ${className}`}
    >
      <h4 className="text-foreground/80 text-xs font-semibold uppercase tracking-wider mb-3">{title}</h4>
      {children}
    </div>
  );
}

function InsightCard({
  icon,
  accent,
  title,
  value,
}: {
  icon: React.ReactNode;
  accent: string;
  title: string;
  value: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 bg-foreground/[0.03] backdrop-blur-xl p-4 transition-all hover:bg-foreground/[0.06] hover:scale-[1.02]">
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div className="flex items-center gap-2 mb-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: `${accent}22`, color: accent }}
        >
          {icon}
        </span>
        <span className="text-muted-foreground text-xs">{title}</span>
      </div>
      <div className="text-foreground text-xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

// =====================================================================
// Indicadores essenciais — 5 velocímetros clicáveis
// =====================================================================

function RingGauge({ score, color, size, stroke }: { score: number; color: string; size: number; stroke: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const dash = (pct / 100) * c;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="block drop-shadow-xs"
      role="img"
      aria-label={`Pontuação ${score} de 100`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeOpacity={0.6}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
      />
    </svg>
  );
}

function IndicatorGaugeCard({
  title,
  icon,
  score,
  contextText,
  onClick,
  isFeatured = false,
  className,
}: {
  title: string;
  icon: React.ReactNode;
  score: number;
  contextText?: string;
  onClick: () => void;
  isFeatured?: boolean;
  className?: string;
}) {
  const color = scoreColorOf(score);
  const label = scoreLabelOf(score);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full overflow-hidden rounded-3xl border border-border/70 bg-card/85 hover:bg-card p-3.5 sm:p-4 text-left transition-all duration-200 hover:shadow-xl hover:border-primary/40 hover:-translate-y-1 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-xs flex flex-col justify-between",
        className,
      )}
    >
      {/* Accent de cor superior com glow dinâmico */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-25"
        style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }}
        aria-hidden
      />

      <div className={cn("min-w-0 w-full", isFeatured && "sm:flex sm:items-center sm:justify-between md:block")}>
        {/* Top Header com Ícone e Título */}
        <div className="flex items-center gap-2 mb-2 sm:mb-3 min-w-0 w-full">
          <span
            className="flex h-6.5 w-6.5 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
            style={{ background: `${color}18`, color }}
          >
            {icon}
          </span>
          <span className="truncate text-xs font-bold text-foreground group-hover:text-primary transition-colors">
            {title}
          </span>
        </div>

        {/* Anel de Pontuação Centralizado */}
        <div className={cn("relative my-1.5 sm:my-2 flex items-center justify-center", isFeatured && "md:my-2")}>
          <RingGauge score={score} color={color} size={isFeatured ? 84 : 76} stroke={8} />
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className={cn("font-black tabular-nums tracking-tight text-foreground", isFeatured ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl")}>
              {score}
            </span>
            <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
              de 100
            </span>
          </div>
        </div>
      </div>

      {/* Footer com Status Badge e Métrica Contextual */}
      <div className="mt-2 sm:mt-2.5 pt-1.5 sm:pt-2 border-t border-border/40 w-full text-center space-y-1">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border"
          style={{ background: `${color}14`, color, borderColor: `${color}28` }}
        >
          <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: color }} />
          {label}
        </span>
        {contextText && (
          <p className="text-[10px] font-medium text-muted-foreground truncate" title={contextText}>
            {contextText}
          </p>
        )}
      </div>
    </button>
  );
}

interface ActionsData {
  current: MonthMetrics;
  previous: MonthMetrics;
  piggyBalance: number;
  reserveBalance: number;
  avgExpense: number;
  incomeRef: number;
  monthsCovered: number;
  indicatorScores: Record<IndicatorKey, number>;
  mode?: "monthly" | "overall";
}

function buildActions(key: IndicatorKey, d: ActionsData, hidden: boolean): {
  title: string;
  subtitle: string;
  bullets: string[];
} {
  const fmt = (n: number) => fmtBRL(Math.max(0, n), hidden);
  const inc = d.current.income;
  const exp = d.current.expense;
  const periodLabel = d.mode === "overall" ? "no total acumulado" : "neste mês";
  const periodLabelShort = d.mode === "overall" ? "acumulado" : "mês";
  // Renda de referência mensal (média dos últimos meses no modo acumulado).
  const incRef = d.incomeRef;
  const incRefLabel = d.mode === "overall" ? "renda mensal média" : "renda";


  switch (key) {
    case "control": {
      const ratio = inc > 0 ? (exp / inc) * 100 : 0;
      const target = inc * 0.65; // gastar até 65% para entrar em zona saudável
      const gap = exp - target;
      return {
        title: "Controle de gastos",
        subtitle:
          inc <= 0
            ? `Sem receitas registradas ${periodLabel} — registre seus recebimentos para medir o controle.`
            : `Você gastou ${ratio.toFixed(0)}% da sua renda ${periodLabel}.`,
        bullets:
          inc <= 0
            ? ["Registre suas receitas para que o app calcule o seu controle."]
            : gap > 0
            ? [
                `Reduza ${fmt(gap)} nas despesas do ${periodLabelShort} para chegar à meta de 65% da renda.`,
                "Abra o donut de categorias e revise as 1-2 categorias com maior gasto.",
                "Adie despesas não essenciais para o próximo ciclo.",
              ]
            : [
                "Você já está dentro da meta — mantenha o ritmo.",
                "Direcione a sobra ao cofrinho de reserva.",
              ],
      };

    }
    case "reserve": {
      const target = d.avgExpense * 6;
      const missing = target - d.reserveBalance;
      return {
        title: "Reserva de emergência",
        subtitle:
          d.avgExpense > 0
            ? `Sua reserva cobre ${d.monthsCovered.toFixed(1)} meses de despesa (meta: 6 meses).`
            : "Ainda não há despesas suficientes para calcular a reserva ideal.",
        bullets:
          missing > 0
            ? [
                `Aporte ${fmt(missing)} no cofrinho para alcançar 6 meses de despesa.`,
                "Programe um aporte recorrente mensal para o cofrinho de reserva.",
                "Evite usar a reserva para gastos não emergenciais.",
              ]
            : [
                "Reserva completa — parabéns!",
                "Considere mover o excedente para um cofrinho de investimento.",
              ],
      };
    }
    case "debts": {
      const ratio = incRef > 0 ? (d.current.pendingExpense / incRef) * 100 : 0;
      const safe = incRef * 0.3;
      const overdue = d.current.pendingExpense - safe;
      return {
        title: "Dívidas e contas em aberto",
        subtitle:
          incRef > 0
            ? `${ratio.toFixed(0)}% da sua ${incRefLabel} está comprometida com contas em aberto.`
            : "Sem receitas para calcular o comprometimento.",
        bullets:
          d.current.pendingExpense <= 0
            ? ["Nenhuma despesa pendente — saúde excelente neste indicador."]
            : overdue > 0
            ? [
                `Antecipe ${fmt(overdue)} em pagamentos para reduzir o comprometimento abaixo de 30%.`,
                "Priorize quitar as contas com maior valor primeiro.",
                `Renegocie prazos das despesas que não couberem no orçamento ${periodLabelShort}.`,
              ]
            : [
                "Comprometimento dentro da faixa segura (<30%).",
                "Quite as contas pendentes para manter o score em alta.",
              ],
      };

    }
    case "investments": {
      const target = incRef * 3;
      const missing = target - d.piggyBalance;
      return {
        title: "Investimentos / patrimônio",
        subtitle:
          incRef > 0
            ? `Saldo investido equivale a ${(d.piggyBalance / incRef).toFixed(1)}× sua ${incRefLabel} (meta: 3×).`
            : "Registre receitas para que o app calcule sua meta de investimento.",
        bullets:
          missing > 0
            ? [
                `Acumule ${fmt(missing)} em cofrinhos para alcançar 3× a ${incRefLabel}.`,
                "Aumente em 5-10% o aporte recorrente do cofrinho.",
                "Crie um cofrinho separado da reserva, voltado a longo prazo.",
              ]
            : [
                `Você atingiu a meta de patrimônio (3× a ${incRefLabel}).`,
                "Reavalie sua estratégia: diversifique os cofrinhos por objetivo.",
              ],
      };
    }
    case "stability": {
      const ratio = inc > 0 ? exp / inc : 0;
      const diff = (ratio - 0.6) * 100;
      return {
        title: "Estabilidade financeira",
        subtitle:
          inc > 0
            ? `Seus gastos estão em ${(ratio * 100).toFixed(0)}% da renda (faixa ideal: ~60%).`
            : "Sem receitas para medir a estabilidade.",
        bullets:
          inc <= 0
            ? ["Registre as receitas para o cálculo."]
            : Math.abs(diff) <= 10
            ? [
                "Você está dentro da faixa ideal de estabilidade.",
                "Mantenha receitas e despesas equilibradas ao longo do tempo.",
              ]
            : diff > 10
            ? [
                `Reduza ${fmt(inc * (ratio - 0.6))} nas despesas para voltar à faixa ideal.`,
                "Evite picos de gasto: divida compras grandes em parcelas planejadas.",
              ]
            : [
                "Você está gastando bem abaixo de 60% — ótimo controle.",
                "Direcione o excedente para reserva ou investimento, em vez de deixar parado.",
              ],
      };
    }
  }
}

function IndicatorActionsDialog({
  open,
  onOpenChange,
  indicatorKey,
  data,
  hidden,
  mode,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  indicatorKey: IndicatorKey | null;
  data: ActionsData;
  hidden: boolean;
  mode: "monthly" | "overall";
}) {
  // Mantém a última chave conhecida para renderizar o conteúdo durante a
  // animação de fechamento. Se desmontarmos o Dialog quando `indicatorKey`
  // volta a `null`, o Radix perde o portal e o foco cai no <body>, o que
  // faz o navegador rolar a página para o topo.
  const lastKeyRef = useRef<IndicatorKey | null>(indicatorKey);
  if (indicatorKey) lastKeyRef.current = indicatorKey;
  const activeKey = indicatorKey ?? lastKeyRef.current;
  if (!activeKey) return null;

  const score = data.indicatorScores[activeKey];
  const color = scoreColorOf(score);
  const label = scoreLabelOf(score);
  const content = buildActions(activeKey, { ...data, mode }, hidden);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: `${color}22`, color }}
            >
              <Gauge className="h-4 w-4" />
            </span>
            <div className="flex flex-col">
              <span>{content.title}</span>
              <span className="text-xs font-normal text-muted-foreground">
                Score atual: <span className="font-semibold" style={{ color }}>{score}/100</span> · {label}
              </span>
            </div>
          </DialogTitle>
          <DialogDescription className="pt-1.5">{content.subtitle}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 pt-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            O que fazer agora
          </p>
          <ul className="space-y-2">
            {content.bullets.map((b, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 rounded-xl border border-black/5 dark:border-white/5 bg-foreground/[0.02] p-3"
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5"
                  style={{ background: `${color}22`, color }}
                >
                  {i + 1}
                </span>
                <span className="text-sm text-foreground/90 leading-snug">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
