import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, TrendingUp, TrendingDown, Receipt, Wallet, FileBarChart, Sparkles, Download, DollarSign, CreditCard, ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Button } from "@/components/ui/button";
// jspdf / jspdf-autotable são carregados dinamicamente dentro dos handlers de export
// para não incluir essas libs pesadas no bundle inicial. O type é usado apenas em
// anotações de parâmetros nos helpers (apagado em runtime).
import type jsPDF from "jspdf";
async function loadPdfLibs() {
  const [jsPdfMod, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF: jsPdfMod.default, autoTable: autoTableMod.default };
}
import { toast } from "sonner";
import { getPdfBranding } from "@/lib/pdfBranding";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AccountantAuditCard } from "@/components/AccountantAuditCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { AuditTotals } from "@/lib/accountantAudit";
import { calculateTotalWithInterest } from "@/features/loans/hooks/useLoans";
import { allocateInterestByPaymentUpTo } from "@/features/financial/lib/interestAllocation";
import { isVehicleExpenseCategory } from "@/features/vehicles/components/VehicleExpenseForm";

interface AccountantReportProps {
  loans: any[];
  payments: any[];
  sales: any[];
  expenses: any[];
}

const TAX_CATEGORIES = ["impostos", "imposto", "tributos", "tributo", "taxa", "taxas", "iss", "irpf", "irpj", "icms", "das", "mei", "simples"];

function fmt(n: number, hidden: boolean) {
  if (hidden) return "R$ ••••";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getMonthKey(dateStr: string): string {
  return (dateStr || "").slice(0, 7);
}

function getYearKey(dateStr: string): string {
  return (dateStr || "").slice(0, 4);
}

export function AccountantReport({ loans, payments, sales, expenses }: AccountantReportProps) {
  const { hidden } = useHideValues();
  const { methods: paymentMethods } = usePaymentMethods();
  const [expandedMethod, setExpandedMethod] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<null | "juros_puro" | "parcela" | "quitacao" | "amortizacao" | "split" | "sem_vinculo" | "__all__">(null);
  const [drillDown, setDrillDown] = useState<null | "in" | "out" | "net">(null);
  const [dreCategory, setDreCategory] = useState<null | "interest" | "sales" | "expenses">(null);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentYear = String(now.getFullYear());

  const [period, setPeriod] = useState<"month" | "year">("month");
  const [tab, setTab] = useState<string>("dre");

  const handleTabChange = (value: string) => {
    setTab(value);
    // Fluxo de caixa abre por padrão em visão anual; demais abas, mensal.
    setPeriod(value === "cashflow" ? "year" : "month");
  };
  const [monthFilter, setMonthFilter] = useState(currentMonth);
  const [yearFilter, setYearFilter] = useState(currentYear);

  // Available months/years from data
  const { months, years } = useMemo(() => {
    const ms = new Set<string>();
    const ys = new Set<string>();
    [...payments.map((p) => p.date), ...sales.map((s) => s.date ?? s.sale_date), ...expenses.map((e) => e.dueDate ?? e.due_date)]
      .filter(Boolean)
      .forEach((d) => {
        ms.add(getMonthKey(d));
        ys.add(getYearKey(d));
      });
    ms.add(currentMonth);
    ys.add(currentYear);
    return {
      months: Array.from(ms).sort().reverse(),
      years: Array.from(ys).sort().reverse(),
    };
  }, [payments, sales, expenses, currentMonth, currentYear]);

  const matchPeriod = useCallback(
    (dateStr: string) => {
      if (!dateStr) return false;
      return period === "month" ? getMonthKey(dateStr) === monthFilter : getYearKey(dateStr) === yearFilter;
    },
    [period, monthFilter, yearFilter],
  );


  // ===== DRE =====
  const dre = useMemo(() => {
    const periodPayments = payments.filter((p) => matchPeriod(p.date));
    const periodExpenses = expenses.filter((e) => {
      const dt = e.paidDate ?? e.paid_date ?? e.dueDate ?? e.due_date;
      return e.paid && (e.scope ?? "business") !== "personal" && !isVehicleExpenseCategory(e.category) && matchPeriod(dt);
    });

    type Kind = "juros_puro" | "amortizacao" | "quitacao" | "parcela" | "sem_vinculo" | "split";
    type Breakdown = {
      id: string;
      date: string;
      loanId: string | null;
      borrowerName: string;
      amount: number;
      interest: number;
      principal: number;
      kind: Kind;
      kindLabel: string;
      reason: string;
      paymentMethodId: string;
      paymentMethodName: string;
      description: string;
    };
    const breakdown: Breakdown[] = [];

    // ===== Alocação pró-rata por parcela (fonte única) =====
    // Contratos parcelados distribuem juros proporcionalmente em cada parcela;
    // parcela única mantém regra legada. Reconciliação de centavos ≤ R$ 0,02
    // apenas no último pagamento de contratos quitados.
    const paymentsSorted = [...payments].sort((a, b) => {
      const d = (a.date || "").localeCompare(b.date || "");
      if (d !== 0) return d;
      return ((a.createdAt ?? (a as any).created_at) ?? "").localeCompare(
        ((b.createdAt ?? (b as any).created_at) ?? "")
      );
    });
    const allocLoans = loans.map((l: any) => ({
      id: l.id,
      amount: Number(l.amount) || 0,
      interestRate: Number(l.interestRate ?? l.interest_rate) || 0,
      installments: Number(l.installments) || 1,
      status: l.status,
      originalAmount: l.originalAmount ?? l.original_amount ?? null,
    }));
    const allocPayments = paymentsSorted.map((p: any) => ({
      id: p.id,
      loanId: p.loanId ?? p.loan_id ?? "",
      amount: Number(p.amount) || 0,
      date: p.date,
      installmentNumber: Number(p.installmentNumber ?? p.installment_number ?? 0),
      createdAt: p.createdAt ?? p.created_at,
    }));
    // Regime oficial: juros pertencem ao mês do PAGAMENTO e o período é
    // travado no seu próprio fechamento (sem reprocessar histórico).
    const periodCutoff = period === "month"
      ? (() => { const [y, m] = monthFilter.split("-").map(Number); return `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`; })()
      : `${yearFilter}-12-31`;
    const interestByPaymentId = allocateInterestByPaymentUpTo(allocLoans, allocPayments, periodCutoff);

    const lastPaymentByLoanId = new Map<string, string>();
    paymentsSorted.forEach((p) => {
      const lid = p.loanId ?? (p as any).loan_id;
      if (lid) lastPaymentByLoanId.set(lid, p.id);
    });
    const paidLoanIds = new Set<string>(
      loans.filter((l: any) => (l.status) === "paid").map((l: any) => l.id)
    );


    // ===== Monta breakdown do período usando o juros alocado =====
    const periodPaymentList = periodPayments;
    let totalReceived = 0;
    let interestRevenue = 0;

    const methodNameById = new Map(paymentMethods.map((m: any) => [m.id, m.name] as const));
    periodPaymentList.forEach((p) => {
      const loanId = p.loanId ?? (p as any).loan_id ?? null;
      const amt = Number(p.amount) || 0;
      totalReceived += amt;
      const loan: any = loans.find((l) => l.id === loanId);
      const borrowerName = loan?.borrowerName ?? loan?.borrower_name ?? "Sem contrato";
      const inst = Number(p.installmentNumber ?? (p as any).installment_number ?? 0);
      const interest = interestByPaymentId.get(p.id) ?? 0;
      interestRevenue += interest;
      const pmId = p.paymentMethodId ?? (p as any).payment_method_id ?? null;
      const pmName = pmId ? (methodNameById.get(pmId) ?? "Não informado") : "Não informado";
      const description = p.description ?? (p as any).notes ?? "";

      const isLastOfPaid = loanId && paidLoanIds.has(loanId) && lastPaymentByLoanId.get(loanId) === p.id;
      let kind: Kind;
      let reason: string;
      if (isLastOfPaid) {
        kind = "quitacao";
        reason = `Quitação do contrato: juros alocado (pró-rata por parcela) = ${interest.toFixed(2)}`;
      } else if (inst === 0 || inst === -2) {
        kind = "juros_puro";
        reason = inst === -2
          ? "Multa/encargos (installmentNumber = -2) → 100% juros"
          : "Pagamento de juros puro (installmentNumber = 0) → 100% juros";
      } else if (inst === -3) {
        kind = "amortizacao";
        reason = "Amortização de principal (installmentNumber = -3) → 0% juros";
      } else if (!loan) {
        kind = "sem_vinculo";
        reason = "Pagamento sem empréstimo vinculado → assume 100% juros";
      } else if (inst === -1) {
        kind = "quitacao";
        reason = `Pagamento parcial: juros alocado (juros-primeiro sobre saldo pendente) = ${interest.toFixed(2)}`;
      } else {
        kind = "parcela";
        reason = `Parcela ${inst}: juros alocado pró-rata (installmentAmount × ratio) = ${interest.toFixed(2)}`;
      }

      const kindLabel = ({
        juros_puro: "Juros\u00a0",
        amortizacao: "Amortização",
        quitacao: "Quitação",
        parcela: "Parcela",
        sem_vinculo: "Sem vínculo",
        split: "Split explícito",
      } as Record<Kind, string>)[kind];
      breakdown.push({
        id: p.id,
        date: p.date,
        loanId,
        borrowerName,
        amount: amt,
        interest,
        principal: Math.max(0, amt - interest),
        kind,
        kindLabel,
        reason,
        paymentMethodId: pmId ?? "__unset__",
        paymentMethodName: pmName,
        description,
      });
    });

    breakdown.sort((a, b) => (a.date < b.date ? 1 : -1));

    // Totais por tipo
    const byKind: Record<Kind, { count: number; amount: number; interest: number; principal: number }> = {
      juros_puro: { count: 0, amount: 0, interest: 0, principal: 0 },
      amortizacao: { count: 0, amount: 0, interest: 0, principal: 0 },
      quitacao: { count: 0, amount: 0, interest: 0, principal: 0 },
      parcela: { count: 0, amount: 0, interest: 0, principal: 0 },
      sem_vinculo: { count: 0, amount: 0, interest: 0, principal: 0 },
      split: { count: 0, amount: 0, interest: 0, principal: 0 },
    };
    breakdown.forEach((b) => {
      byKind[b.kind].count += 1;
      byKind[b.kind].amount += b.amount;
      byKind[b.kind].interest += b.interest;
      byKind[b.kind].principal += b.principal;
    });

    // Contador considera apenas receitas de empréstimos (juros) e despesas empresariais.
    // Vendas e despesas pessoais são intencionalmente excluídas do DRE.
    const periodSales: any[] = [];
    const salesRevenue = 0;
    const totalRevenue = interestRevenue;
    const totalExpenses = periodExpenses.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const businessExp = totalExpenses;
    const personalExp = 0;

    return {
      interestRevenue,
      salesRevenue,
      totalRevenue,
      businessExp,
      personalExp,
      totalExpenses,
      netProfit: totalRevenue - businessExp,
      principalReceived: Math.max(0, totalReceived - interestRevenue),
      breakdown,
      byKind,
      totalReceived,
      periodSales,
      periodExpenses,
    };
  }, [payments, expenses, loans, sales, period, monthFilter, yearFilter]);

  // ===== Impostos =====
  const taxes = useMemo(() => {
    const isTax = (cat: string) => {
      const c = (cat || "").toLowerCase();
      return TAX_CATEGORIES.some((t) => c.includes(t));
    };
    const periodTaxes = expenses.filter((e) => isTax(e.category) && !isVehicleExpenseCategory(e.category) && matchPeriod(e.dueDate ?? e.due_date));
    const paid = periodTaxes.filter((e) => e.paid).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const pending = periodTaxes.filter((e) => !e.paid).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    return { items: periodTaxes, paid, pending, total: paid + pending };
  }, [expenses, period, monthFilter, yearFilter]);

  // ===== Simulação de Impostos =====
  const [taxRegime, setTaxRegime] = useState<"simples" | "presumido" | "irpf">("simples");

  const taxSim = useMemo(() => {
    const base = dre.interestRevenue; // base = juros recebidos no período
    const isYear = period === "year";

    // --- Simples Nacional - Anexo III (Serviços) ---
    // Faixas RBT12 (receita bruta dos últimos 12 meses) - usamos base anualizada como proxy.
    const rbt12 = isYear ? base : base * 12;
    const simplesFaixas = [
      { ate: 180000, aliq: 0.06, ded: 0 },
      { ate: 360000, aliq: 0.112, ded: 9360 },
      { ate: 720000, aliq: 0.135, ded: 17640 },
      { ate: 1800000, aliq: 0.16, ded: 35640 },
      { ate: 3600000, aliq: 0.21, ded: 125640 },
      { ate: 4800000, aliq: 0.33, ded: 648000 },
    ];
    const faixa = simplesFaixas.find((f) => rbt12 <= f.ate) || simplesFaixas[simplesFaixas.length - 1];
    const aliqEfetivaSimples = rbt12 > 0 ? Math.max(0, (rbt12 * faixa.aliq - faixa.ded) / rbt12) : faixa.aliq;
    const simplesTotal = base * aliqEfetivaSimples;

    // --- Lucro Presumido (Serviços - presunção 32%) ---
    const baseIRCSLL = base * 0.32;
    const irpj = baseIRCSLL * 0.15;
    // adicional 10% sobre o que exceder R$ 20.000/mês (R$ 60.000 no trimestre, simplificado mensal)
    const limiteAdicional = isYear ? 240000 : 20000;
    const irpjAdicional = baseIRCSLL > limiteAdicional ? (baseIRCSLL - limiteAdicional) * 0.10 : 0;
    const csll = baseIRCSLL * 0.09;
    const pis = base * 0.0065;
    const cofins = base * 0.03;
    const iss = base * 0.05; // alíquota máxima de ISS para serviços financeiros (varia por município)
    const presumidoTotal = irpj + irpjAdicional + csll + pis + cofins + iss;

    // --- IRPF Pessoa Física (Tabela mensal 2024) ---
    const baseMensal = isYear ? base / 12 : base;
    let aliqIRPF = 0;
    let dedIRPF = 0;
    if (baseMensal <= 2259.20) { aliqIRPF = 0; dedIRPF = 0; }
    else if (baseMensal <= 2826.65) { aliqIRPF = 0.075; dedIRPF = 169.44; }
    else if (baseMensal <= 3751.05) { aliqIRPF = 0.15; dedIRPF = 381.44; }
    else if (baseMensal <= 4664.68) { aliqIRPF = 0.225; dedIRPF = 662.77; }
    else { aliqIRPF = 0.275; dedIRPF = 896.00; }
    const irpfMes = Math.max(0, baseMensal * aliqIRPF - dedIRPF);
    const irpfTotal = isYear ? irpfMes * 12 : irpfMes;

    return {
      base,
      rbt12,
      simples: {
        aliquotaEfetiva: aliqEfetivaSimples,
        faixa: simplesFaixas.indexOf(faixa) + 1,
        total: simplesTotal,
        liquido: base - simplesTotal,
      },
      presumido: {
        baseCalculo: baseIRCSLL,
        irpj,
        irpjAdicional,
        csll,
        pis,
        cofins,
        iss,
        total: presumidoTotal,
        aliquotaEfetiva: base > 0 ? presumidoTotal / base : 0,
        liquido: base - presumidoTotal,
      },
      irpf: {
        baseMensal,
        aliquota: aliqIRPF,
        deducao: dedIRPF,
        total: irpfTotal,
        aliquotaEfetiva: base > 0 ? irpfTotal / base : 0,
        liquido: base - irpfTotal,
      },
    };
  }, [dre.interestRevenue, period]);

  // ===== Fluxo de caixa =====
  const cashflow = useMemo(() => {
    const map = new Map<string, { in: number; out: number }>();
    let paymentCount = 0;
    let saleCount = 0;
    let loanCount = 0;
    let expenseCount = 0;
    let totalLoanOutgoing = 0;
    const inPayments = payments.filter((p) => matchPeriod(p.date));
    inPayments.forEach((p) => {
      const k = period === "month" ? p.date : getMonthKey(p.date);
      const cur = map.get(k) || { in: 0, out: 0 };
      cur.in += Number(p.amount) || 0;
      map.set(k, cur);
      paymentCount += 1;
    });
    // Vendas excluídas do contador (apenas empréstimos e despesas empresariais)
    const outExpenses = expenses.filter((e) => {
      const dt = e.paidDate ?? e.paid_date ?? e.dueDate ?? e.due_date;
      return e.paid && (e.scope ?? "business") !== "personal" && !isVehicleExpenseCategory(e.category) && matchPeriod(dt);
    });
    outExpenses.forEach((e) => {
      const d = e.paidDate ?? e.paid_date ?? e.dueDate ?? e.due_date;
      const k = period === "month" ? d : getMonthKey(d);
      const cur = map.get(k) || { in: 0, out: 0 };
      cur.out += Number(e.amount) || 0;
      map.set(k, cur);
      expenseCount += 1;
    });
    // Empréstimos concedidos no período (saída de caixa do operador)
    const outLoans = loans.filter((l) => matchPeriod(l.startDate ?? l.start_date));
    outLoans.forEach((l) => {
      const d = l.startDate ?? l.start_date;
      const k = period === "month" ? d : getMonthKey(d);
      const cur = map.get(k) || { in: 0, out: 0 };
      const amt = Number(l.amount) || 0;
      cur.out += amt;
      map.set(k, cur);
      totalLoanOutgoing += amt;
      loanCount += 1;
    });
    const rows = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({
      key: k,
      in: v.in,
      out: v.out,
      net: v.in - v.out,
    }));
    const totalIn = rows.reduce((s, r) => s + r.in, 0);
    const totalOut = rows.reduce((s, r) => s + r.out, 0);
    return { rows, totalIn, totalOut, net: totalIn - totalOut, paymentCount, saleCount, loanCount, expenseCount, totalLoanOutgoing, inPayments, outExpenses, outLoans };
  }, [payments, expenses, loans, period, monthFilter, yearFilter]);

  // Aggregation: payments by payment method for current period
  const methodsBreakdown = useMemo(() => {
    const periodPayments = payments.filter((p) => matchPeriod(p.date));
    const loanById = new Map<string, any>();
    loans.forEach((l) => loanById.set(l.id, l));
    type ContractAgg = { loanId: string; borrowerName: string; total: number; count: number };
    type MethodAgg = { id: string; name: string; icon: string | null; total: number; count: number; contracts: Map<string, ContractAgg> };
    const map = new Map<string, MethodAgg>();
    const methodById = new Map(paymentMethods.map((m) => [m.id, m] as const));
    let grandTotal = 0;
    for (const p of periodPayments) {
      const mid = p.paymentMethodId || "__unset__";
      const meta = methodById.get(p.paymentMethodId || "");
      if (!map.has(mid)) {
        map.set(mid, {
          id: mid,
          name: meta ? meta.name : "Não informado",
          icon: meta ? meta.icon : null,
          total: 0,
          count: 0,
          contracts: new Map(),
        });
      }
      const agg = map.get(mid)!;
      const amt = Number(p.amount) || 0;
      agg.total += amt;
      agg.count += 1;
      grandTotal += amt;
      const loan = loanById.get(p.loanId);
      const lid = p.loanId || "__noloan__";
      if (!agg.contracts.has(lid)) {
        agg.contracts.set(lid, {
          loanId: lid,
          borrowerName: loan?.borrowerName || "Sem contrato",
          total: 0,
          count: 0,
        });
      }
      const c = agg.contracts.get(lid)!;
      c.total += amt;
      c.count += 1;
    }
    const rows = Array.from(map.values())
      .map((m) => ({
        ...m,
        contracts: Array.from(m.contracts.values()).sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total);
    return { rows, grandTotal };
  }, [payments, paymentMethods, loans, period, monthFilter, yearFilter]);

  const formatDate = (k: string) => {
    if (k.length === 10) return new Date(k + "T00:00:00").toLocaleDateString("pt-BR");
    if (k.length === 7) {
      const [y, m] = k.split("-");
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    }
    return k;
  };

  const exportTaxSimulationPDF = async () => {
    try {
      const { jsPDF, autoTable } = await loadPdfLibs();
      const branding = await getPdfBranding();
      const doc = new jsPDF();
      const periodLabel = period === "month" ? formatDate(monthFilter) : yearFilter;
      const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

      // Cabeçalho
      drawBrandingLogo(doc, branding);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Simulação de Impostos", 14, 18);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      if (branding.brandName) doc.text(branding.brandName, 14, 13);
      doc.text(`Período: ${periodLabel} (${period === "month" ? "Mensal" : "Anual"})`, 14, 25);
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 31);
      doc.setTextColor(0);

      // Base
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Base de Cálculo", 14, 42);
      autoTable(doc, {
        startY: 45,
        theme: "grid",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [59, 130, 246] },
        head: [["Descrição", "Valor"]],
        body: [
          ["Receita base (juros recebidos)", fmtBRL(taxSim.base)],
          ["RBT12 (anualizada — Simples)", fmtBRL(taxSim.rbt12)],
        ],
      });

      // Simples Nacional
      let y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.text("Simples Nacional (Anexo III)", 14, y);
      autoTable(doc, {
        startY: y + 3,
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [16, 185, 129] },
        head: [["Item", "Valor"]],
        body: [
          ["Faixa", String(taxSim.simples.faixa)],
          ["Alíquota efetiva", pct(taxSim.simples.aliquotaEfetiva)],
          ["DAS estimado", fmtBRL(taxSim.simples.total)],
          ["Líquido após imposto", fmtBRL(taxSim.simples.liquido)],
        ],
      });

      // Lucro Presumido
      y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.text("Lucro Presumido (Serviços)", 14, y);
      autoTable(doc, {
        startY: y + 3,
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [234, 179, 8] },
        head: [["Tributo", "Valor"]],
        body: [
          ["Base de cálculo (32%)", fmtBRL(taxSim.presumido.baseCalculo)],
          ["IRPJ (15%)", fmtBRL(taxSim.presumido.irpj)],
          ["IRPJ Adicional (10%)", fmtBRL(taxSim.presumido.irpjAdicional)],
          ["CSLL (9%)", fmtBRL(taxSim.presumido.csll)],
          ["PIS (0,65%)", fmtBRL(taxSim.presumido.pis)],
          ["COFINS (3%)", fmtBRL(taxSim.presumido.cofins)],
          ["ISS (5% — máx.)", fmtBRL(taxSim.presumido.iss)],
          ["Total estimado", fmtBRL(taxSim.presumido.total)],
          ["Alíquota efetiva", pct(taxSim.presumido.aliquotaEfetiva)],
          ["Líquido após imposto", fmtBRL(taxSim.presumido.liquido)],
        ],
      });

      // IRPF
      y = (doc as any).lastAutoTable.finalY + 8;
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.text("Pessoa Física (IRPF / Carnê-Leão)", 14, y);
      autoTable(doc, {
        startY: y + 3,
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [168, 85, 247] },
        head: [["Item", "Valor"]],
        body: [
          ["Base mensal", fmtBRL(taxSim.irpf.baseMensal)],
          ["Alíquota nominal", pct(taxSim.irpf.aliquota)],
          ["Parcela a deduzir", fmtBRL(taxSim.irpf.deducao)],
          ["IRPF estimado", fmtBRL(taxSim.irpf.total)],
          ["Alíquota efetiva", pct(taxSim.irpf.aliquotaEfetiva)],
          ["Líquido após imposto", fmtBRL(taxSim.irpf.liquido)],
        ],
      });

      // Comparativo
      y = (doc as any).lastAutoTable.finalY + 8;
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.text("Comparativo entre Regimes", 14, y);
      autoTable(doc, {
        startY: y + 3,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [30, 41, 59] },
        head: [["Regime", "Imposto", "Alíquota Efetiva", "Líquido"]],
        body: [
          ["Simples Nacional", fmtBRL(taxSim.simples.total), pct(taxSim.simples.aliquotaEfetiva), fmtBRL(taxSim.simples.liquido)],
          ["Lucro Presumido", fmtBRL(taxSim.presumido.total), pct(taxSim.presumido.aliquotaEfetiva), fmtBRL(taxSim.presumido.liquido)],
          ["Pessoa Física", fmtBRL(taxSim.irpf.total), pct(taxSim.irpf.aliquotaEfetiva), fmtBRL(taxSim.irpf.liquido)],
        ],
      });

      // Rodapé
      y = (doc as any).lastAutoTable.finalY + 10;
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(120);
      doc.text(
        "Valores aproximados, baseados nos juros recebidos no período. Consulte um contador para precisão fiscal.",
        14, y, { maxWidth: 180 }
      );

      doc.save(`simulacao-impostos-${periodLabel.replace(/\s+/g, "-")}.pdf`);
      toast.success("PDF da simulação exportado!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF");
    }
  };

  const drawBrandingLogo = (
    doc: jsPDF,
    branding: { logoDataUrl: string | null; logoSize: number; brandName: string },
  ) => {
    if (!branding.logoDataUrl) return;
    // Convert configured px (report area) to mm. 1 px ≈ 0.2645 mm.
    const sizeMm = Math.max(12, Math.min(40, branding.logoSize * 0.2645));
    const pageW = doc.internal.pageSize.getWidth();
    try {
      doc.addImage(branding.logoDataUrl, "PNG", pageW - sizeMm - 14, 10, sizeMm, sizeMm, undefined, "FAST");
    } catch {
      // ignore image errors
    }
  };

  const pdfHeader = (
    doc: jsPDF,
    title: string,
    branding?: { logoDataUrl: string | null; logoSize: number; brandName: string },
  ) => {
    const periodLabel = period === "month" ? formatDate(monthFilter) : yearFilter;
    if (branding) drawBrandingLogo(doc, branding);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(title, 14, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    if (branding?.brandName) doc.text(branding.brandName, 14, 13);
    doc.text(`Período: ${periodLabel} (${period === "month" ? "Mensal" : "Anual"})`, 14, 25);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 31);
    doc.setTextColor(0);
    return periodLabel;
  };

  const exportDREPDF = async () => {
    try {
      const { jsPDF, autoTable } = await loadPdfLibs();
      const branding = await getPdfBranding();
      const doc = new jsPDF();
      const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const periodLabel = pdfHeader(doc, "Demonstrativo de Resultado (DRE)", branding);

      autoTable(doc, {
        startY: 40,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [59, 130, 246] },
        head: [["Descrição", "Valor"]],
        body: [
          ["(+) Receita de Juros", fmtBRL(dre.interestRevenue)],
          [{ content: "(=) Receita Bruta", styles: { fontStyle: "bold", fillColor: [243, 244, 246] } },
           { content: fmtBRL(dre.totalRevenue), styles: { fontStyle: "bold", fillColor: [243, 244, 246] } }],
          ["(−) Despesas Operacionais", fmtBRL(dre.businessExp)],
          [{ content: "(=) Lucro Líquido", styles: { fontStyle: "bold", fillColor: [219, 234, 254] } },
           { content: fmtBRL(dre.netProfit), styles: { fontStyle: "bold", fillColor: [219, 234, 254] } }],
        ],
      });

      let y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Informações Complementares", 14, y);
      autoTable(doc, {
        startY: y + 3,
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [100, 116, 139] },
        head: [["Item", "Valor"]],
        body: [
          ["Capital recuperado (principal)", fmtBRL(dre.principalReceived)],
          ["Despesas pessoais (não impacta DRE)", fmtBRL(dre.personalExp)],
          ["Total geral de despesas", fmtBRL(dre.totalExpenses)],
        ],
      });

      doc.save(`dre-${periodLabel.replace(/\s+/g, "-")}.pdf`);
      toast.success("PDF do DRE exportado!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF");
    }
  };

  const exportCashflowPDF = async () => {
    try {
      const { jsPDF, autoTable } = await loadPdfLibs();
      const branding = await getPdfBranding();
      const doc = new jsPDF();
      const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const periodLabel = pdfHeader(doc, "Fluxo de Caixa", branding);

      autoTable(doc, {
        startY: 40,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [16, 185, 129] },
        head: [["Resumo", "Valor"]],
        body: [
          ["Total de Entradas", fmtBRL(cashflow.totalIn)],
          ["Total de Saídas", fmtBRL(cashflow.totalOut)],
          [{ content: "Saldo Líquido", styles: { fontStyle: "bold", fillColor: [219, 234, 254] } },
           { content: fmtBRL(cashflow.net), styles: { fontStyle: "bold", fillColor: [219, 234, 254] } }],
        ],
      });

      let y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`Movimentações ${period === "month" ? "Diárias" : "Mensais"}`, 14, y);

      if (cashflow.rows.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text("Sem movimentações no período.", 14, y + 8);
      } else {
        autoTable(doc, {
          startY: y + 3,
          theme: "striped",
          styles: { fontSize: 9 },
          headStyles: { fillColor: [59, 130, 246] },
          head: [["Data", "Entrada", "Saída", "Saldo"]],
          body: cashflow.rows.map((r) => [
            formatDate(r.key),
            fmtBRL(r.in),
            fmtBRL(r.out),
            fmtBRL(r.net),
          ]),
          foot: [[
            { content: "Total", styles: { fontStyle: "bold" } },
            { content: fmtBRL(cashflow.totalIn), styles: { fontStyle: "bold" } },
            { content: fmtBRL(cashflow.totalOut), styles: { fontStyle: "bold" } },
            { content: fmtBRL(cashflow.net), styles: { fontStyle: "bold" } },
          ]],
        });
      }

      doc.save(`fluxo-caixa-${periodLabel.replace(/\s+/g, "-")}.pdf`);
      toast.success("PDF do Fluxo de Caixa exportado!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF");
    }
  };

  const exportConsolidatedPDF = async () => {
    try {
      const { jsPDF, autoTable } = await loadPdfLibs();
      const branding = await getPdfBranding();
      const doc = new jsPDF();
      const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
      const periodLabel = period === "month" ? formatDate(monthFilter) : yearFilter;

      // ===== Capa =====
      drawBrandingLogo(doc, branding);
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("Relatório Contábil Consolidado", 14, 25);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80);
      if (branding.brandName) doc.text(branding.brandName, 14, 15);
      doc.text(`Período: ${periodLabel} (${period === "month" ? "Mensal" : "Anual"})`, 14, 34);
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 40);
      doc.setTextColor(0);

      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(120);
      doc.text(
        "Este relatório consolida DRE, Controle de Impostos, Simulação Tributária e Fluxo de Caixa do período selecionado.",
        14, 50, { maxWidth: 180 }
      );
      doc.setTextColor(0);

      // ===== Seção 1: DRE =====
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("1. Demonstrativo de Resultado (DRE)", 14, 70);

      autoTable(doc, {
        startY: 75,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [59, 130, 246] },
        head: [["Descrição", "Valor"]],
        body: [
          ["(+) Receita de Juros", fmtBRL(dre.interestRevenue)],
          
          [{ content: "(=) Receita Bruta", styles: { fontStyle: "bold", fillColor: [243, 244, 246] } },
           { content: fmtBRL(dre.totalRevenue), styles: { fontStyle: "bold", fillColor: [243, 244, 246] } }],
          ["(−) Despesas Operacionais", fmtBRL(dre.businessExp)],
          [{ content: "(=) Lucro Líquido", styles: { fontStyle: "bold", fillColor: [219, 234, 254] } },
           { content: fmtBRL(dre.netProfit), styles: { fontStyle: "bold", fillColor: [219, 234, 254] } }],
          ["Capital recuperado (principal)", fmtBRL(dre.principalReceived)],
          ["Despesas pessoais (não impacta DRE)", fmtBRL(dre.personalExp)],
        ],
      });

      // ===== Seção 2: Impostos =====
      doc.addPage();
      drawBrandingLogo(doc, branding);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("2. Controle de Impostos", 14, 20);

      autoTable(doc, {
        startY: 25,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [234, 88, 12] },
        head: [["Resumo", "Valor"]],
        body: [
          ["Total no período", fmtBRL(taxes.total)],
          ["Pagos", fmtBRL(taxes.paid)],
          ["Pendentes", fmtBRL(taxes.pending)],
        ],
      });

      let y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Lançamentos de Impostos", 14, y);

      if (taxes.items.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text("Nenhum imposto registrado no período.", 14, y + 7);
        doc.setTextColor(0);
      } else {
        autoTable(doc, {
          startY: y + 3,
          theme: "striped",
          styles: { fontSize: 9 },
          headStyles: { fillColor: [100, 116, 139] },
          head: [["Descrição", "Categoria", "Vencimento", "Valor", "Status"]],
          body: taxes.items.map((t: any) => [
            t.description,
            t.category,
            new Date((t.dueDate ?? t.due_date) + "T00:00:00").toLocaleDateString("pt-BR"),
            fmtBRL(Number(t.amount) || 0),
            t.paid ? "Pago" : "Pendente",
          ]),
        });
      }

      // ===== Seção 3: Simulação =====
      doc.addPage();
      drawBrandingLogo(doc, branding);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("3. Simulação de Impostos", 14, 20);
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(120);
      doc.text(`Base de cálculo: juros recebidos no período (${fmtBRL(taxSim.base)})`, 14, 27);
      doc.setTextColor(0);

      autoTable(doc, {
        startY: 32,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [30, 41, 59] },
        head: [["Regime", "Imposto", "Alíq. Efetiva", "Líquido"]],
        body: [
          ["Simples Nacional", fmtBRL(taxSim.simples.total), pct(taxSim.simples.aliquotaEfetiva), fmtBRL(taxSim.simples.liquido)],
          ["Lucro Presumido", fmtBRL(taxSim.presumido.total), pct(taxSim.presumido.aliquotaEfetiva), fmtBRL(taxSim.presumido.liquido)],
          ["Pessoa Física (IRPF)", fmtBRL(taxSim.irpf.total), pct(taxSim.irpf.aliquotaEfetiva), fmtBRL(taxSim.irpf.liquido)],
        ],
      });

      y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Detalhamento - Lucro Presumido", 14, y);
      autoTable(doc, {
        startY: y + 3,
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [234, 179, 8] },
        head: [["Tributo", "Valor"]],
        body: [
          ["Base de cálculo (32%)", fmtBRL(taxSim.presumido.baseCalculo)],
          ["IRPJ (15%)", fmtBRL(taxSim.presumido.irpj)],
          ["IRPJ Adicional (10%)", fmtBRL(taxSim.presumido.irpjAdicional)],
          ["CSLL (9%)", fmtBRL(taxSim.presumido.csll)],
          ["PIS (0,65%)", fmtBRL(taxSim.presumido.pis)],
          ["COFINS (3%)", fmtBRL(taxSim.presumido.cofins)],
          ["ISS (5%)", fmtBRL(taxSim.presumido.iss)],
        ],
      });

      // ===== Seção 4: Fluxo de Caixa =====
      doc.addPage();
      drawBrandingLogo(doc, branding);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("4. Fluxo de Caixa", 14, 20);

      autoTable(doc, {
        startY: 25,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [16, 185, 129] },
        head: [["Resumo", "Valor"]],
        body: [
          ["Total de Entradas", fmtBRL(cashflow.totalIn)],
          ["Total de Saídas", fmtBRL(cashflow.totalOut)],
          [{ content: "Saldo Líquido", styles: { fontStyle: "bold", fillColor: [219, 234, 254] } },
           { content: fmtBRL(cashflow.net), styles: { fontStyle: "bold", fillColor: [219, 234, 254] } }],
        ],
      });

      y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Movimentações ${period === "month" ? "Diárias" : "Mensais"}`, 14, y);

      if (cashflow.rows.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text("Sem movimentações no período.", 14, y + 7);
        doc.setTextColor(0);
      } else {
        autoTable(doc, {
          startY: y + 3,
          theme: "striped",
          styles: { fontSize: 9 },
          headStyles: { fillColor: [59, 130, 246] },
          head: [["Data", "Entrada", "Saída", "Saldo"]],
          body: cashflow.rows.map((r) => [
            formatDate(r.key),
            fmtBRL(r.in),
            fmtBRL(r.out),
            fmtBRL(r.net),
          ]),
          foot: [[
            { content: "Total", styles: { fontStyle: "bold" } },
            { content: fmtBRL(cashflow.totalIn), styles: { fontStyle: "bold" } },
            { content: fmtBRL(cashflow.totalOut), styles: { fontStyle: "bold" } },
            { content: fmtBRL(cashflow.net), styles: { fontStyle: "bold" } },
          ]],
        });
      }

      // Numeração de páginas
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount}`, 14, 290);
        doc.text("Relatório Contábil Consolidado", 196, 290, { align: "right" });
      }

      doc.save(`relatorio-contabil-consolidado-${periodLabel.replace(/\s+/g, "-")}.pdf`);
      toast.success("PDF consolidado exportado!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF consolidado");
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtro de período */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calculator className="h-4 w-4 text-primary" /> Relatório Contábil
              </CardTitle>
              <CardDescription>DRE, controle de impostos e fluxo de caixa da empresa.</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={exportConsolidatedPDF}
              className="shrink-0 h-8 gap-1"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">PDF Consolidado</span>
              <span className="sm:hidden">PDF</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 items-center justify-center">
            <Select value={period} onValueChange={(v: "month" | "year") => setPeriod(v)}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mensal</SelectItem>
                <SelectItem value="year">Anual</SelectItem>
              </SelectContent>
            </Select>
            {period === "month" ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="Mês anterior"
                  onClick={() => {
                    const [y, m] = monthFilter.split("-").map(Number);
                    const d = new Date(y, m - 2, 1);
                    setMonthFilter(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="w-[180px] h-9 justify-center font-normal capitalize"
                  onClick={() => setMonthFilter(currentMonth)}
                  title="Voltar para o mês atual"
                >
                  {formatDate(monthFilter)}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="Próximo mês"
                  onClick={() => {
                    const [y, m] = monthFilter.split("-").map(Number);
                    const d = new Date(y, m, 1);
                    setMonthFilter(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="Ano anterior"
                  onClick={() => setYearFilter(String(Number(yearFilter) - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="w-[120px] h-9 justify-center font-normal"
                  onClick={() => setYearFilter(currentYear)}
                  title="Voltar para o ano atual"
                >
                  {yearFilter}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="Próximo ano"
                  onClick={() => setYearFilter(String(Number(yearFilter) + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {(() => {
        const shown: AuditTotals = {
          interestRevenue: dre.interestRevenue,
          salesRevenue: dre.salesRevenue,
          totalRevenue: dre.totalRevenue,
          totalExpenses: dre.totalExpenses,
          businessExp: dre.businessExp,
          personalExp: dre.personalExp,
          netProfit: dre.netProfit,
          cashIn: cashflow.totalIn,
          cashOut: cashflow.totalOut,
          cashNet: cashflow.net,
          paymentsCount: cashflow.paymentCount,
          loansOutgoing: cashflow.totalLoanOutgoing,
        };
        return (
          <AccountantAuditCard
            loans={loans}
            payments={payments}
            sales={sales}
            expenses={expenses}
            period={period}
            monthFilter={monthFilter}
            yearFilter={yearFilter}
            shown={shown}
          />
        );
      })()}

      {/* Resumo de Fluxo do Período */}
      {(() => {
        const totalOutFull = cashflow.totalOut;
        const netFull = cashflow.totalIn - totalOutFull;
        const periodLabelTxt = period === "month" ? formatDate(monthFilter) : yearFilter;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 items-stretch">
            <button type="button" onClick={() => setDrillDown("in")} className="text-left rounded-2xl p-4 sm:p-5 bg-card border border-success/20 flex flex-col hover:border-success/50 hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-success/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Entradas</span>
                <div className="h-8 w-8 rounded-xl bg-success/15 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-success" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-success">{fmt(cashflow.totalIn, hidden)}</p>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-auto pt-2 text-xs text-muted-foreground">
                <span>{cashflow.paymentCount} parcela(s)</span><span>·</span><span>{cashflow.saleCount} venda(s)</span>
                <span className="ml-auto text-[10px] text-success/80">ver registros →</span>
              </div>
            </button>

            <button type="button" onClick={() => setDrillDown("out")} className="text-left rounded-2xl p-4 sm:p-5 bg-card border border-warning/20 flex flex-col hover:border-warning/50 hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-warning/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saídas</span>
                <div className="h-8 w-8 rounded-xl bg-warning/15 flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 text-warning" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-warning">{fmt(totalOutFull, hidden)}</p>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-auto pt-2 text-xs text-muted-foreground">
                <span>{cashflow.loanCount} empréstimo(s)</span><span>·</span><span>{cashflow.expenseCount} despesa(s)</span>
                <span className="ml-auto text-[10px] text-warning/80">ver registros →</span>
              </div>
            </button>

            <button type="button" onClick={() => setDrillDown("net")} className={`text-left rounded-2xl p-4 sm:p-5 bg-card border flex flex-col hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 ${netFull >= 0 ? "border-primary/20 hover:border-primary/50 focus:ring-primary/40" : "border-destructive/20 hover:border-destructive/50 focus:ring-destructive/40"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saldo do Período</span>
                <div className={`h-8 w-8 rounded-xl ${netFull >= 0 ? "bg-primary/15" : "bg-destructive/15"} flex items-center justify-center`}>
                  <DollarSign className={`h-4 w-4 ${netFull >= 0 ? "text-primary" : "text-destructive"}`} />
                </div>
              </div>
              <p className={`text-xl sm:text-2xl font-bold ${netFull >= 0 ? "text-primary" : "text-destructive"}`}>{fmt(netFull, hidden)}</p>
              <div className="flex items-center justify-between mt-auto pt-2 text-xs text-muted-foreground">
                <span className="capitalize">{periodLabelTxt}</span>
                <span className={`text-[10px] ${netFull >= 0 ? "text-primary/80" : "text-destructive/80"}`}>ver cálculo →</span>
              </div>
            </button>
          </div>
        );
      })()}

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-auto p-1 gap-1 bg-muted/60 rounded-xl">
          <TabsTrigger
            value="dre"
            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-2 text-[11px] sm:text-sm font-medium rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all"
          >
            <FileBarChart className="h-4 w-4 shrink-0" />
            <span className="truncate">DRE</span>
          </TabsTrigger>
          <TabsTrigger
            value="taxes"
            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-2 text-[11px] sm:text-sm font-medium rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all"
          >
            <Receipt className="h-4 w-4 shrink-0" />
            <span className="truncate">Impostos</span>
          </TabsTrigger>
          <TabsTrigger
            value="simulation"
            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-2 text-[11px] sm:text-sm font-medium rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all"
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="truncate">Simulação</span>
          </TabsTrigger>
          <TabsTrigger
            value="cashflow"
            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-2 text-[11px] sm:text-sm font-medium rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all"
          >
            <Wallet className="h-4 w-4 shrink-0" />
            <span className="truncate">Fluxo</span>
          </TabsTrigger>
          <TabsTrigger
            value="methods"
            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-2 text-[11px] sm:text-sm font-medium rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all"
          >
            <CreditCard className="h-4 w-4 shrink-0" />
            <span className="truncate">Formas</span>
          </TabsTrigger>
        </TabsList>

        {/* DRE */}
        <TabsContent value="dre" className="space-y-3 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3 text-success" /> Receita Total</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold text-success">{fmt(dre.totalRevenue, hidden)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3 text-destructive" /> Despesas Empresa</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold text-destructive">{fmt(dre.businessExp, hidden)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Lucro Líquido</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-xl font-bold ${dre.netProfit >= 0 ? "text-success" : "text-destructive"}`}>{fmt(dre.netProfit, hidden)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm">Demonstrativo Detalhado</CardTitle>
                <Button size="sm" variant="outline" onClick={exportDREPDF} className="shrink-0 h-8">
                  <Download className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">PDF</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <button
                  type="button"
                  onClick={() => setDreCategory((c) => (c === "interest" ? null : "interest"))}
                  className={`w-full flex justify-between py-2 border-b text-left transition-colors hover:bg-muted/40 rounded px-2 -mx-2 ${dreCategory === "interest" ? "bg-muted/50" : ""}`}
                >
                  <span className="font-medium flex items-center gap-1">
                    <ChevronRight className={`h-3 w-3 transition-transform ${dreCategory === "interest" ? "rotate-90" : ""}`} />
                    (+) Receita de Juros
                  </span>
                  <span className="text-success">{fmt(dre.interestRevenue, hidden)}</span>
                </button>
                <div className="flex justify-between py-2 border-b font-semibold bg-muted/30 px-2 rounded">
                  <span>(=) Receita Bruta</span>
                  <span>{fmt(dre.totalRevenue, hidden)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDreCategory((c) => (c === "expenses" ? null : "expenses"))}
                  className={`w-full flex justify-between py-2 border-b text-left transition-colors hover:bg-muted/40 rounded px-2 -mx-2 ${dreCategory === "expenses" ? "bg-muted/50" : ""}`}
                >
                  <span className="font-medium flex items-center gap-1">
                    <ChevronRight className={`h-3 w-3 transition-transform ${dreCategory === "expenses" ? "rotate-90" : ""}`} />
                    (−) Despesas Operacionais
                  </span>
                  <span className="text-destructive">{fmt(dre.businessExp, hidden)}</span>
                </button>
                <div className="flex justify-between py-2 font-bold bg-primary/5 px-2 rounded">
                  <span>(=) Lucro Líquido</span>
                  <span className={dre.netProfit >= 0 ? "text-success" : "text-destructive"}>{fmt(dre.netProfit, hidden)}</span>
                </div>
                <div className="flex justify-between pt-3 text-xs text-muted-foreground">
                  <span>Capital recuperado (principal)</span>
                  <span>{fmt(dre.principalReceived, hidden)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Despesas pessoais (não impacta DRE)</span>
                  <span>{fmt(dre.personalExp, hidden)}</span>
                </div>

                {dreCategory && (
                  <div className="mt-3 rounded-lg border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold">
                        {dreCategory === "interest" && `Lançamentos — Receita de Juros (${(dre as any).breakdown.filter((b: any) => b.interest > 0).length})`}
                        {dreCategory === "expenses" && `Lançamentos — Despesas Operacionais (${(dre as any).periodExpenses.length})`}
                      </h4>
                      <button
                        type="button"
                        onClick={() => setDreCategory(null)}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Fechar
                      </button>
                    </div>

                    {dreCategory === "interest" && (
                      (dre as any).breakdown.filter((b: any) => b.interest > 0).length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2 text-center">Nenhum lançamento no período.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-muted-foreground border-b">
                                <th className="py-1.5 pr-2">Data</th>
                                <th className="py-1.5 pr-2">Cliente</th>
                                <th className="py-1.5 pr-2">Tipo</th>
                                <th className="py-1.5 pr-2 text-right">Valor</th>
                                <th className="py-1.5 text-right">Juros</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(dre as any).breakdown.filter((b: any) => b.interest > 0).map((b: any) => (
                                <tr key={b.id} className="border-b">
                                  <td className="py-1.5 pr-2 whitespace-nowrap">{b.date ? new Date(b.date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                                  <td className="py-1.5 pr-2">{b.borrowerName}</td>
                                  <td className="py-1.5 pr-2"><span className="inline-block px-1.5 py-0.5 rounded bg-muted text-[10px]">{b.kindLabel}</span></td>
                                  <td className="py-1.5 pr-2 text-right">{fmt(b.amount, hidden)}</td>
                                  <td className="py-1.5 text-right text-success">{fmt(b.interest, hidden)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}


                    {dreCategory === "expenses" && (
                      (dre as any).periodExpenses.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2 text-center">Nenhuma despesa no período.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-muted-foreground border-b">
                                <th className="py-1.5 pr-2">Data</th>
                                <th className="py-1.5 pr-2">Descrição</th>
                                <th className="py-1.5 pr-2">Categoria</th>
                                <th className="py-1.5 text-right">Valor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(dre as any).periodExpenses.map((e: any) => {
                                const d = e.paidDate ?? e.paid_date ?? e.dueDate ?? e.due_date;
                                const amt = Number(e.amount) || 0;
                                return (
                                  <tr key={e.id} className="border-b">
                                    <td className="py-1.5 pr-2 whitespace-nowrap">{d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                                    <td className="py-1.5 pr-2">{e.description ?? e.name ?? "—"}</td>
                                    <td className="py-1.5 pr-2">{e.category ?? "—"}</td>
                                    <td className="py-1.5 text-right text-destructive">{fmt(amt, hidden)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Detalhamento Juros vs Principal */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Juros vs Principal — por pagamento</CardTitle>
              <CardDescription className="text-xs">
                Conferência da receita de juros: cada pagamento, sua classificação e a parte considerada juros.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Resumo por tipo */}
              {(() => {
                const labels: Record<string, string> = {
                  juros_puro: "Juros\u00a0",
                  parcela: "Parcela",
                  quitacao: "Quitação",
                  amortizacao: "Amortização",
                  split: "Split explícito",
                  sem_vinculo: "Sem vínculo",
                };
                const order = ["juros_puro","parcela","quitacao","amortizacao","split","sem_vinculo"] as const;
                const rows = order
                  .map((k) => ({ k, v: (dre as any).byKind[k] }))
                  .filter((r) => r.v && r.v.count > 0);

                return (
                  <>
                    {/* Tabela em ≥sm */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b">
                            <th className="py-2 pr-2">Tipo</th>
                            <th className="py-2 pr-2 text-right">Qtd</th>
                            <th className="py-2 pr-2 text-right">PAGO</th>
                            <th className="py-2 pr-2 text-right">Juros</th>
                            <th className="py-2 text-right">Principal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(({ k, v }) => (
                            <tr
                              key={k}
                              className="border-b cursor-pointer hover:bg-muted/40 transition-colors"
                              onClick={() => setKindFilter(k as any)}
                            >
                              <td className="py-1.5 pr-2 font-medium">{labels[k]}</td>
                              <td className="py-1.5 pr-2 text-right">{v.count}</td>
                              <td className="py-1.5 pr-2 text-right">{fmt(v.amount, hidden)}</td>
                              <td className="py-1.5 pr-2 text-right text-success">{fmt(v.interest, hidden)}</td>
                              <td className="py-1.5 text-right">{fmt(v.principal, hidden)}</td>
                            </tr>
                          ))}
                          <tr
                            className="font-semibold bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => setKindFilter("__all__")}
                          >
                            <td className="py-1.5 pr-2">Total</td>
                            <td className="py-1.5 pr-2 text-right">{(dre as any).breakdown.length}</td>
                            <td className="py-1.5 pr-2 text-right">{fmt((dre as any).totalReceived, hidden)}</td>
                            <td className="py-1.5 pr-2 text-right text-success">{fmt(dre.interestRevenue, hidden)}</td>
                            <td className="py-1.5 text-right">{fmt(dre.principalReceived, hidden)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Cards em mobile */}
                    <div className="sm:hidden space-y-2">
                      {rows.map(({ k, v }) => (
                        <button
                          type="button"
                          key={k}
                          onClick={() => setKindFilter(k as any)}
                          className="w-full text-left rounded-lg border bg-muted/20 p-3 space-y-1.5 hover:bg-muted/40 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold">{labels[k]}</span>
                            <span className="text-[10px] text-muted-foreground">{v.count} pagto(s)</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                            <div>
                              <p className="text-[10px] text-muted-foreground">PAGO</p>
                              <p className="font-medium tabular-nums">{fmt(v.amount, hidden)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">Juros</p>
                              <p className="font-medium text-success tabular-nums">{fmt(v.interest, hidden)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">Principal</p>
                              <p className="font-medium tabular-nums">{fmt(v.principal, hidden)}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setKindFilter("__all__")}
                        className="w-full text-left rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-1.5 hover:bg-primary/10 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold">Total</span>
                          <span className="text-[10px] text-muted-foreground">{(dre as any).breakdown.length} pagto(s)</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                          <div>
                            <p className="text-[10px] text-muted-foreground">PAGO</p>
                            <p className="font-bold tabular-nums">{fmt((dre as any).totalReceived, hidden)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Juros</p>
                            <p className="font-bold text-success tabular-nums">{fmt(dre.interestRevenue, hidden)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Principal</p>
                            <p className="font-bold tabular-nums">{fmt(dre.principalReceived, hidden)}</p>
                          </div>
                        </div>
                      </button>
                    </div>
                  </>
                );
              })()}

              {/* Dialog de detalhamento por tipo (acionado pelo clique nos cards/linhas acima) */}
              <Dialog open={kindFilter !== null} onOpenChange={(o) => !o && setKindFilter(null)}>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                  {(() => {
                    if (!kindFilter) return null;
                    const labels: Record<string, string> = {
                      juros_puro: "Juros\u00a0",
                      parcela: "Parcela",
                      quitacao: "Quitação",
                      amortizacao: "Amortização",
                      split: "Split explícito",
                      sem_vinculo: "Sem vínculo",
                      __all__: "Total",
                    };
                    const items = (dre as any).breakdown.filter((b: any) =>
                      kindFilter === "__all__" ? true : b.kind === kindFilter
                    );
                    const tAmount = items.reduce((s: number, b: any) => s + b.amount, 0);
                    const tInterest = items.reduce((s: number, b: any) => s + b.interest, 0);
                    const tPrincipal = items.reduce((s: number, b: any) => s + b.principal, 0);
                    return (
                      <>
                        <DialogHeader>
                          <DialogTitle>{labels[kindFilter]}</DialogTitle>
                          <DialogDescription>
                            {items.length} pagamento(s) · PAGO {fmt(tAmount, hidden)} · Juros{" "}
                            <span className="text-success">{fmt(tInterest, hidden)}</span> · Principal {fmt(tPrincipal, hidden)}
                          </DialogDescription>
                        </DialogHeader>
                        {items.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-6 text-center">Nenhum pagamento.</p>
                        ) : (
                          <>
                            {/* Tabela em ≥sm */}
                            <div className="hidden sm:block overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-muted-foreground border-b">
                                    <th className="py-2 pr-2">Data</th>
                                    <th className="py-2 pr-2">Descrição</th>
                                    <th className="py-2 pr-2 text-right">Valor</th>
                                    <th className="py-2 pr-2 text-right">Juros</th>
                                    <th className="py-2 text-right">Principal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((b: any) => (
                                    <tr key={b.id} className="border-b align-top">
                                      <td className="py-1.5 pr-2 whitespace-nowrap">
                                        {b.date ? new Date(b.date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                                      </td>
                                      <td className="py-1.5 pr-2">
                                        <p className="truncate max-w-[280px]">{b.description || b.borrowerName}</p>
                                        <p className="text-[10px] text-muted-foreground">
                                          {b.borrowerName} · {b.kindLabel}
                                          {b.paymentMethodName ? ` · ${b.paymentMethodName}` : ""}
                                        </p>
                                      </td>
                                      <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(b.amount, hidden)}</td>
                                      <td className="py-1.5 pr-2 text-right tabular-nums text-success">{fmt(b.interest, hidden)}</td>
                                      <td className="py-1.5 text-right tabular-nums">{fmt(b.principal, hidden)}</td>
                                    </tr>
                                  ))}
                                  <tr className="font-semibold bg-muted/30">
                                    <td className="py-1.5 pr-2" colSpan={2}>Total</td>
                                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(tAmount, hidden)}</td>
                                    <td className="py-1.5 pr-2 text-right tabular-nums text-success">{fmt(tInterest, hidden)}</td>
                                    <td className="py-1.5 text-right tabular-nums">{fmt(tPrincipal, hidden)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>

                            {/* Cards em mobile */}
                            <div className="sm:hidden space-y-2">
                              {items.map((b: any) => (
                                <div key={b.id} className="rounded-lg border bg-card p-3 space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-semibold truncate">{b.description || b.borrowerName}</p>
                                      <p className="text-[10px] text-muted-foreground">
                                        {b.date ? new Date(b.date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                                        {b.paymentMethodName ? ` · ${b.paymentMethodName}` : ""}
                                      </p>
                                    </div>
                                    <span className="shrink-0 inline-block px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium">
                                      {b.kindLabel}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-1.5 text-[11px] pt-1 border-t">
                                    <div>
                                      <p className="text-[10px] text-muted-foreground">Valor</p>
                                      <p className="font-medium tabular-nums">{fmt(b.amount, hidden)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-muted-foreground">Juros</p>
                                      <p className="font-medium text-success tabular-nums">{fmt(b.interest, hidden)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-muted-foreground">Principal</p>
                                      <p className="font-medium tabular-nums">{fmt(b.principal, hidden)}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}
                </DialogContent>
              </Dialog>

            </CardContent>
          </Card>

        </TabsContent>

        {/* Impostos */}
        <TabsContent value="taxes" className="space-y-3 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total no período</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(taxes.total, hidden)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Pagos</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold text-success">{fmt(taxes.paid, hidden)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Pendentes</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold text-destructive">{fmt(taxes.pending, hidden)}</p></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Impostos e Tributos</CardTitle>
              <CardDescription className="text-xs">Despesas com categoria contendo: impostos, tributos, taxa, ISS, IRPF, IRPJ, ICMS, DAS, MEI, Simples.</CardDescription>
            </CardHeader>
            <CardContent>
              {taxes.items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum imposto registrado no período.</p>
              ) : (
                <div className="space-y-2">
                  {taxes.items.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-2 border-b text-sm">
                      <div>
                        <p className="font-medium">{t.description}</p>
                        <p className="text-xs text-muted-foreground">{t.category} · venc. {new Date(((t.dueDate ?? t.due_date) || "") + "T00:00:00").toLocaleDateString("pt-BR")}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{fmt(Number(t.amount) || 0, hidden)}</p>
                        <p className={`text-xs ${t.paid ? "text-success" : "text-destructive"}`}>{t.paid ? "Pago" : "Pendente"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Simulação de Impostos */}
        <TabsContent value="simulation" className="space-y-3 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> Simulador de Impostos
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Estimativa baseada nos juros recebidos no período selecionado ({fmt(taxSim.base, hidden)}).
                    Valores aproximados — consulte um contador para precisão fiscal.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={exportTaxSimulationPDF}
                  disabled={taxSim.base === 0}
                  className="shrink-0 h-8"
                >
                  <Download className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">PDF</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={taxRegime} onValueChange={(v: "simples" | "presumido" | "irpf") => setTaxRegime(v)}>
                <SelectTrigger className="w-full sm:w-[280px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simples">Simples Nacional (Anexo III)</SelectItem>
                  <SelectItem value="presumido">Lucro Presumido (Serviços)</SelectItem>
                  <SelectItem value="irpf">Pessoa Física (IRPF)</SelectItem>
                </SelectContent>
              </Select>

              {taxSim.base === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhum juro recebido no período selecionado para simular.
                </p>
              ) : (
                <>
                  {taxRegime === "simples" && (
                    <div className="space-y-2 text-sm">
                      <div className="bg-primary/5 rounded-lg p-3 mb-2">
                        <p className="text-xs text-muted-foreground">Imposto estimado a pagar</p>
                        <p className="text-2xl font-bold text-destructive">{fmt(taxSim.simples.total, hidden)}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Alíquota efetiva: <strong>{(taxSim.simples.aliquotaEfetiva * 100).toFixed(2)}%</strong> · Faixa {taxSim.simples.faixa}
                        </p>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>Receita base (juros)</span>
                        <span className="font-medium">{fmt(taxSim.base, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>RBT12 (anualizada)</span>
                        <span className="font-medium">{fmt(taxSim.rbt12, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>(−) DAS estimado</span>
                        <span className="text-destructive font-medium">{fmt(taxSim.simples.total, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 font-bold bg-success/5 px-2 rounded">
                        <span>(=) Líquido após imposto</span>
                        <span className="text-success">{fmt(taxSim.simples.liquido, hidden)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground pt-2">
                        Anexo III aplica-se a serviços de intermediação financeira. Cálculo: (RBT12 × alíquota − dedução) ÷ RBT12.
                      </p>
                    </div>
                  )}

                  {taxRegime === "presumido" && (
                    <div className="space-y-2 text-sm">
                      <div className="bg-primary/5 rounded-lg p-3 mb-2">
                        <p className="text-xs text-muted-foreground">Imposto estimado a pagar</p>
                        <p className="text-2xl font-bold text-destructive">{fmt(taxSim.presumido.total, hidden)}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Alíquota efetiva: <strong>{(taxSim.presumido.aliquotaEfetiva * 100).toFixed(2)}%</strong>
                        </p>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>Receita base</span>
                        <span className="font-medium">{fmt(taxSim.base, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>Base de cálculo IRPJ/CSLL (32%)</span>
                        <span className="font-medium">{fmt(taxSim.presumido.baseCalculo, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-xs">
                        <span className="text-muted-foreground">IRPJ (15%)</span>
                        <span>{fmt(taxSim.presumido.irpj, hidden)}</span>
                      </div>
                      {taxSim.presumido.irpjAdicional > 0 && (
                        <div className="flex justify-between py-1 text-xs">
                          <span className="text-muted-foreground">IRPJ Adicional (10%)</span>
                          <span>{fmt(taxSim.presumido.irpjAdicional, hidden)}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-1 text-xs">
                        <span className="text-muted-foreground">CSLL (9%)</span>
                        <span>{fmt(taxSim.presumido.csll, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-xs">
                        <span className="text-muted-foreground">PIS (0,65%)</span>
                        <span>{fmt(taxSim.presumido.pis, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-xs">
                        <span className="text-muted-foreground">COFINS (3%)</span>
                        <span>{fmt(taxSim.presumido.cofins, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-xs border-b pb-2">
                        <span className="text-muted-foreground">ISS (5% — máx., varia por município)</span>
                        <span>{fmt(taxSim.presumido.iss, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 font-bold bg-success/5 px-2 rounded">
                        <span>(=) Líquido após imposto</span>
                        <span className="text-success">{fmt(taxSim.presumido.liquido, hidden)}</span>
                      </div>
                    </div>
                  )}

                  {taxRegime === "irpf" && (
                    <div className="space-y-2 text-sm">
                      <div className="bg-primary/5 rounded-lg p-3 mb-2">
                        <p className="text-xs text-muted-foreground">Imposto estimado a pagar</p>
                        <p className="text-2xl font-bold text-destructive">{fmt(taxSim.irpf.total, hidden)}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Alíquota nominal: <strong>{(taxSim.irpf.aliquota * 100).toFixed(1)}%</strong> · Efetiva: <strong>{(taxSim.irpf.aliquotaEfetiva * 100).toFixed(2)}%</strong>
                        </p>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>Receita base (juros)</span>
                        <span className="font-medium">{fmt(taxSim.base, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>Base mensal</span>
                        <span className="font-medium">{fmt(taxSim.irpf.baseMensal, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>Parcela a deduzir</span>
                        <span className="font-medium">{fmt(taxSim.irpf.deducao, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>(−) IRPF / Carnê-Leão</span>
                        <span className="text-destructive font-medium">{fmt(taxSim.irpf.total, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 font-bold bg-success/5 px-2 rounded">
                        <span>(=) Líquido após imposto</span>
                        <span className="text-success">{fmt(taxSim.irpf.liquido, hidden)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground pt-2">
                        Tabela progressiva mensal vigente. Juros recebidos por PF são tributados via Carnê-Leão.
                      </p>
                    </div>
                  )}

                  {/* Comparativo */}
                  <Card className="mt-4 bg-muted/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs">Comparativo entre regimes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-xs">
                      <div className="flex justify-between py-1 border-b">
                        <span>Simples Nacional</span>
                        <span className="font-semibold">{fmt(taxSim.simples.total, hidden)} ({(taxSim.simples.aliquotaEfetiva * 100).toFixed(1)}%)</span>
                      </div>
                      <div className="flex justify-between py-1 border-b">
                        <span>Lucro Presumido</span>
                        <span className="font-semibold">{fmt(taxSim.presumido.total, hidden)} ({(taxSim.presumido.aliquotaEfetiva * 100).toFixed(1)}%)</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>Pessoa Física</span>
                        <span className="font-semibold">{fmt(taxSim.irpf.total, hidden)} ({(taxSim.irpf.aliquotaEfetiva * 100).toFixed(1)}%)</span>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fluxo de caixa */}
        <TabsContent value="cashflow" className="space-y-3 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Entradas</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold text-success">{fmt(cashflow.totalIn, hidden)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Saídas</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold text-destructive">{fmt(cashflow.totalOut, hidden)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Saldo</CardTitle></CardHeader>
              <CardContent><p className={`text-xl font-bold ${cashflow.net >= 0 ? "text-success" : "text-destructive"}`}>{fmt(cashflow.net, hidden)}</p></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm">Movimentações {period === "month" ? "diárias" : "mensais"}</CardTitle>
                <Button size="sm" variant="outline" onClick={exportCashflowPDF} className="shrink-0 h-8">
                  <Download className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">PDF</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {cashflow.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sem movimentações no período.</p>
              ) : (
                <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                  <div className="min-w-[520px] space-y-1">
                    <div className="grid grid-cols-4 gap-2 whitespace-nowrap text-xs font-semibold text-muted-foreground border-b pb-2">
                      <span>Data</span>
                      <span className="text-right">Entrada</span>
                      <span className="text-right">Saída</span>
                      <span className="text-right">Saldo</span>
                    </div>
                    {cashflow.rows.map((r) => (
                      <div key={r.key} className="grid grid-cols-4 gap-2 py-1.5 text-sm border-b whitespace-nowrap tabular-nums">
                        <span className="text-xs capitalize">{formatDate(r.key)}</span>
                        <span className="text-right text-success">{fmt(r.in, hidden)}</span>
                        <span className="text-right text-destructive">{fmt(r.out, hidden)}</span>
                        <span className={`text-right font-medium ${r.net >= 0 ? "text-success" : "text-destructive"}`}>{fmt(r.net, hidden)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Formas de pagamento */}
        <TabsContent value="methods" className="space-y-3 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-success" /> Total recebido por forma
              </CardTitle>
              <CardDescription className="text-base font-bold text-foreground">
                {fmt(methodsBreakdown.grandTotal, hidden)}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Detalhamento por forma de pagamento</CardTitle>
              <CardDescription className="text-xs">
                Período: {period === "month" ? formatDate(monthFilter) : yearFilter}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {methodsBreakdown.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Sem pagamentos registrados no período.
                </p>
              ) : (
                <div className="space-y-2">
                  {methodsBreakdown.rows.map((m) => {
                    const isOpen = expandedMethod === m.id;
                    const pct = methodsBreakdown.grandTotal > 0
                      ? (m.total / methodsBreakdown.grandTotal) * 100
                      : 0;
                    return (
                      <Collapsible
                        key={m.id}
                        open={isOpen}
                        onOpenChange={(o) => setExpandedMethod(o ? m.id : null)}
                      >
                        <div className="border rounded-lg overflow-hidden">
                          <CollapsibleTrigger className="w-full">
                            <div className="flex items-center justify-between gap-2 p-3 hover:bg-muted/40 transition-colors">
                              <div className="flex items-center gap-2 min-w-0">
                                {isOpen ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                )}
                                <CreditCard className="h-4 w-4 text-primary shrink-0" />
                                <div className="text-left min-w-0">
                                  <p className="text-sm font-medium truncate">{m.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {m.count} pagamento{m.count !== 1 ? "s" : ""} · {pct.toFixed(1)}%
                                  </p>
                                </div>
                              </div>
                              <p className="text-sm font-bold text-success shrink-0">
                                {fmt(m.total, hidden)}
                              </p>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="border-t bg-muted/20 px-3 py-2 space-y-1">
                              <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-muted-foreground border-b pb-1">
                                <span className="col-span-2">Contrato</span>
                                <span className="text-right">Total</span>
                              </div>
                              {m.contracts.map((c) => (
                                <div
                                  key={c.loanId}
                                  className="grid grid-cols-3 gap-2 py-1.5 text-sm border-b last:border-b-0"
                                >
                                  <div className="col-span-2 min-w-0">
                                    <p className="truncate font-medium">{c.borrowerName}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {c.count} pagamento{c.count !== 1 ? "s" : ""}
                                    </p>
                                  </div>
                                  <span className="text-right font-medium text-success self-center">
                                    {fmt(c.total, hidden)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Drill-down: registros que compõem cada card */}
      <Dialog open={drillDown !== null} onOpenChange={(o) => !o && setDrillDown(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {drillDown === "in" && (() => {
            const items = [...cashflow.inPayments].sort((a, b) => (a.date < b.date ? 1 : -1));
            const loanById = new Map<string, any>();
            loans.forEach((l) => loanById.set(l.id, l));
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-success" /> Entradas — registros</DialogTitle>
                  <DialogDescription>
                    {items.length} pagamento(s) recebidos no período. Total: <strong className="text-success">{fmt(cashflow.totalIn, hidden)}</strong>
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 mt-2">
                  {items.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Nenhum pagamento no período.</p>}
                  {items.map((p) => {
                    const loan = loanById.get(p.loanId ?? p.loan_id);
                    const inst = Number(p.installmentNumber ?? p.installment_number ?? 0);
                    const instLabel = inst === 0 ? "Juros\u00a0" : inst === -1 ? "Quitação" : inst === -3 ? "Amortização" : `Parcela ${inst}`;
                    return (
                      <div key={p.id} className="flex items-center justify-between rounded-lg border bg-muted/20 p-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{loan?.borrowerName ?? loan?.borrower_name ?? "Sem contrato"}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.date ? new Date(p.date + "T00:00:00").toLocaleDateString("pt-BR") : "—"} · {instLabel}
                          </p>
                        </div>
                        <span className="font-bold text-success tabular-nums">{fmt(Number(p.amount) || 0, hidden)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {drillDown === "out" && (() => {
            const exItems = [...cashflow.outExpenses].sort((a, b) => {
              const da = a.paidDate ?? a.paid_date ?? a.dueDate ?? a.due_date ?? "";
              const db = b.paidDate ?? b.paid_date ?? b.dueDate ?? b.due_date ?? "";
              return da < db ? 1 : -1;
            });
            const loanItems = [...cashflow.outLoans].sort((a, b) => {
              const da = a.startDate ?? a.start_date ?? "";
              const db = b.startDate ?? b.start_date ?? "";
              return da < db ? 1 : -1;
            });
            const totalEx = exItems.reduce((s, x) => s + (Number(x.amount) || 0), 0);
            const totalLoan = loanItems.reduce((s, x) => s + (Number(x.amount) || 0), 0);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><TrendingDown className="h-5 w-5 text-warning" /> Saídas — registros</DialogTitle>
                  <DialogDescription>
                    Total: <strong className="text-warning">{fmt(totalEx + totalLoan, hidden)}</strong> ({loanItems.length} empréstimo(s) + {exItems.length} despesa(s))
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 mt-2">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Empréstimos concedidos · {fmt(totalLoan, hidden)}</p>
                    {loanItems.length === 0 && <p className="text-xs text-muted-foreground py-2">Nenhum empréstimo iniciado no período.</p>}
                    <div className="space-y-1.5">
                      {loanItems.map((l) => (
                        <div key={l.id} className="flex items-center justify-between rounded-lg border bg-muted/20 p-3 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{l.borrowerName ?? l.borrower_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(() => { const d = l.startDate ?? l.start_date; return d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—"; })()} · Empréstimo concedido
                            </p>
                          </div>
                          <span className="font-bold text-warning tabular-nums">{fmt(Number(l.amount) || 0, hidden)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Despesas empresariais pagas · {fmt(totalEx, hidden)}</p>
                    {exItems.length === 0 && <p className="text-xs text-muted-foreground py-2">Nenhuma despesa empresarial paga no período.</p>}
                    <div className="space-y-1.5">
                      {exItems.map((e) => {
                        const d = e.paidDate ?? e.paid_date ?? e.dueDate ?? e.due_date;
                        return (
                          <div key={e.id} className="flex items-center justify-between rounded-lg border bg-muted/20 p-3 text-sm">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{e.description || e.category || "Despesa"}</p>
                              <p className="text-xs text-muted-foreground">
                                {d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—"}{e.category ? ` · ${e.category}` : ""}
                              </p>
                            </div>
                            <span className="font-bold text-warning tabular-nums">{fmt(Number(e.amount) || 0, hidden)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}

          {drillDown === "net" && (() => {
            const totalOutFull = cashflow.totalOut;
            const netFull = cashflow.totalIn - totalOutFull;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary" /> Saldo do Período — cálculo</DialogTitle>
                  <DialogDescription>Como o saldo é formado a partir das entradas e saídas do período.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 mt-2 text-sm">
                  <div className="flex items-center justify-between rounded-lg border bg-success/5 p-3">
                    <span className="text-muted-foreground">(+) Entradas — pagamentos recebidos ({cashflow.paymentCount})</span>
                    <span className="font-bold text-success tabular-nums">{fmt(cashflow.totalIn, hidden)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-warning/5 p-3">
                    <span className="text-muted-foreground">(−) Empréstimos concedidos ({cashflow.loanCount})</span>
                    <span className="font-bold text-warning tabular-nums">{fmt(cashflow.totalLoanOutgoing, hidden)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-warning/5 p-3">
                    <span className="text-muted-foreground">(−) Despesas empresariais pagas ({cashflow.expenseCount})</span>
                    <span className="font-bold text-warning tabular-nums">{fmt(Math.max(0, cashflow.totalOut - cashflow.totalLoanOutgoing), hidden)}</span>
                  </div>
                  <div className={`flex items-center justify-between rounded-lg border-2 p-3 ${netFull >= 0 ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5"}`}>
                    <span className="font-semibold">(=) Saldo do Período</span>
                    <span className={`font-bold tabular-nums ${netFull >= 0 ? "text-primary" : "text-destructive"}`}>{fmt(netFull, hidden)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pt-2">
                    Clique em <strong>Entradas</strong> ou <strong>Saídas</strong> nos cards para ver os registros individuais.
                  </p>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
