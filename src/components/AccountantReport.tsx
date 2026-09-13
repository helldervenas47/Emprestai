import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  Receipt,
  Wallet,
  FileBarChart,
  Sparkles,
  Download,
  DollarSign,
  CreditCard,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Info,
  FileSpreadsheet,
  Building2,
  Search,
  Percent,
} from "lucide-react";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type jsPDF from "jspdf";
import { toast } from "sonner";
import { getPdfBranding } from "@/lib/pdfBranding";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { AccountantAuditCard } from "@/components/AccountantAuditCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { AuditTotals } from "@/lib/accountantAudit";
import { allocateInterestByPaymentUpTo } from "@/features/financial/lib/interestAllocation";
import { isVehicleExpenseCategory } from "@/features/vehicles/components/VehicleExpenseForm";

async function loadPdfLibs() {
  const [jsPdfMod, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF: jsPdfMod.default, autoTable: autoTableMod.default };
}

interface AccountantReportProps {
  loans: any[];
  payments: any[];
  sales: any[];
  expenses: any[];
}

const TAX_CATEGORIES = [
  "impostos",
  "imposto",
  "tributos",
  "tributo",
  "taxa",
  "taxas",
  "iss",
  "irpf",
  "irpj",
  "icms",
  "das",
  "mei",
  "simples",
];

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
  const [kindFilter, setKindFilter] = useState<
    null | "juros_puro" | "parcela" | "quitacao" | "amortizacao" | "split" | "sem_vinculo" | "__all__"
  >(null);
  const [drillDown, setDrillDown] = useState<null | "in" | "out" | "net">(null);
  const [dreCategory, setDreCategory] = useState<null | "interest" | "expenses">(null);
  const [dreSearch, setDreSearch] = useState<string>("");

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentYear = String(now.getFullYear());

  const [period, setPeriod] = useState<"month" | "year">("month");
  const [tab, setTab] = useState<string>("dre");

  const handleTabChange = (value: string) => {
    setTab(value);
  };

  const [monthFilter, setMonthFilter] = useState(currentMonth);
  const [yearFilter, setYearFilter] = useState(currentYear);

  // Available months/years from data
  const { months, years } = useMemo(() => {
    const ms = new Set<string>();
    const ys = new Set<string>();
    [
      ...payments.map((p) => p.date),
      ...sales.map((s) => s.date ?? s.sale_date),
      ...expenses.map((e) => e.dueDate ?? e.due_date),
    ]
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
      return period === "month"
        ? getMonthKey(dateStr) === monthFilter
        : getYearKey(dateStr) === yearFilter;
    },
    [period, monthFilter, yearFilter]
  );

  // ===== DRE =====
  const dre = useMemo(() => {
    const periodPayments = payments.filter((p) => matchPeriod(p.date));
    const periodExpenses = expenses.filter((e) => {
      const dt = e.paidDate ?? e.paid_date ?? e.dueDate ?? e.due_date;
      return (
        e.paid &&
        (e.scope ?? "business") !== "personal" &&
        !isVehicleExpenseCategory(e.category) &&
        matchPeriod(dt)
      );
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

    const paymentsSorted = [...payments].sort((a, b) => {
      const d = (a.date || "").localeCompare(b.date || "");
      if (d !== 0) return d;
      return (
        (a.createdAt ?? (a as any).created_at ?? "").localeCompare(
          b.createdAt ?? (b as any).created_at ?? ""
        )
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

    const periodCutoff =
      period === "month"
        ? (() => {
            const [y, m] = monthFilter.split("-").map(Number);
            return `${y}-${String(m).padStart(2, "0")}-${String(
              new Date(y, m, 0).getDate()
            ).padStart(2, "0")}`;
          })()
        : `${yearFilter}-12-31`;

    const interestByPaymentId = allocateInterestByPaymentUpTo(
      allocLoans,
      allocPayments,
      periodCutoff
    );

    const lastPaymentByLoanId = new Map<string, string>();
    paymentsSorted.forEach((p) => {
      const lid = p.loanId ?? (p as any).loan_id;
      if (lid) lastPaymentByLoanId.set(lid, p.id);
    });
    const paidLoanIds = new Set<string>(
      loans.filter((l: any) => l.status === "paid").map((l: any) => l.id)
    );

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
      const pmName = pmId ? methodNameById.get(pmId) ?? "Não informado" : "Não informado";
      const description = p.description ?? (p as any).notes ?? "";

      const isLastOfPaid =
        loanId && paidLoanIds.has(loanId) && lastPaymentByLoanId.get(loanId) === p.id;
      let kind: Kind;
      let reason: string;
      if (isLastOfPaid) {
        kind = "quitacao";
        reason = `Quitação do contrato: juros alocado = ${interest.toFixed(2)}`;
      } else if (inst === 0 || inst === -2) {
        kind = "juros_puro";
        reason =
          inst === -2
            ? "Multa/encargos → 100% juros"
            : "Pagamento de juros puro → 100% juros";
      } else if (inst === -3) {
        kind = "amortizacao";
        reason = "Amortização de principal → 0% juros";
      } else if (!loan) {
        kind = "sem_vinculo";
        reason = "Pagamento sem empréstimo vinculado → assume 100% juros";
      } else if (inst === -1) {
        kind = "quitacao";
        reason = `Pagamento parcial: juros alocado = ${interest.toFixed(2)}`;
      } else {
        kind = "parcela";
        reason = `Parcela ${inst}: juros alocado pró-rata = ${interest.toFixed(2)}`;
      }

      const kindLabel = ({
        juros_puro: "Juros",
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

    const periodSales: any[] = [];
    const salesRevenue = 0;
    const totalRevenue = interestRevenue;
    const totalExpenses = periodExpenses.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const businessExp = totalExpenses;
    const personalExp = 0;
    const netProfit = totalRevenue - businessExp;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return {
      interestRevenue,
      salesRevenue,
      totalRevenue,
      businessExp,
      personalExp,
      totalExpenses,
      netProfit,
      profitMargin,
      principalReceived: Math.max(0, totalReceived - interestRevenue),
      breakdown,
      byKind,
      totalReceived,
      periodSales,
      periodExpenses,
    };
  }, [payments, expenses, loans, sales, period, monthFilter, yearFilter, paymentMethods, matchPeriod]);

  // ===== Impostos =====
  const taxes = useMemo(() => {
    const isTax = (cat: string) => {
      const c = (cat || "").toLowerCase();
      return TAX_CATEGORIES.some((t) => c.includes(t));
    };
    const periodTaxes = expenses.filter(
      (e) =>
        isTax(e.category) &&
        !isVehicleExpenseCategory(e.category) &&
        matchPeriod(e.dueDate ?? e.due_date)
    );
    const paid = periodTaxes
      .filter((e) => e.paid)
      .reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const pending = periodTaxes
      .filter((e) => !e.paid)
      .reduce((s, x) => s + (Number(x.amount) || 0), 0);
    return { items: periodTaxes, paid, pending, total: paid + pending };
  }, [expenses, matchPeriod]);

  // ===== Simulação de Impostos =====
  const [taxRegime, setTaxRegime] = useState<"simples" | "presumido" | "irpf">("simples");

  const taxSim = useMemo(() => {
    const base = dre.interestRevenue;
    const isYear = period === "year";

    // Simples Nacional - Anexo III
    const rbt12 = isYear ? base : base * 12;
    const simplesFaixas = [
      { ate: 180000, aliq: 0.06, ded: 0 },
      { ate: 360000, aliq: 0.112, ded: 9360 },
      { ate: 720000, aliq: 0.135, ded: 17640 },
      { ate: 1800000, aliq: 0.16, ded: 35640 },
      { ate: 3600000, aliq: 0.21, ded: 125640 },
      { ate: 4800000, aliq: 0.33, ded: 648000 },
    ];
    const faixa =
      simplesFaixas.find((f) => rbt12 <= f.ate) ||
      simplesFaixas[simplesFaixas.length - 1];
    const aliqEfetivaSimples =
      rbt12 > 0 ? Math.max(0, (rbt12 * faixa.aliq - faixa.ded) / rbt12) : faixa.aliq;
    const simplesTotal = base * aliqEfetivaSimples;

    // Lucro Presumido
    const baseIRCSLL = base * 0.32;
    const irpj = baseIRCSLL * 0.15;
    const limiteAdicional = isYear ? 240000 : 20000;
    const irpjAdicional =
      baseIRCSLL > limiteAdicional ? (baseIRCSLL - limiteAdicional) * 0.1 : 0;
    const csll = baseIRCSLL * 0.09;
    const pis = base * 0.0065;
    const cofins = base * 0.03;
    const iss = base * 0.05;
    const presumidoTotal = irpj + irpjAdicional + csll + pis + cofins + iss;

    // IRPF Pessoa Física (Tabela Progressiva)
    const baseMensal = isYear ? base / 12 : base;
    let aliqIRPF = 0;
    let dedIRPF = 0;
    if (baseMensal <= 2259.2) {
      aliqIRPF = 0;
      dedIRPF = 0;
    } else if (baseMensal <= 2826.65) {
      aliqIRPF = 0.075;
      dedIRPF = 169.44;
    } else if (baseMensal <= 3751.05) {
      aliqIRPF = 0.15;
      dedIRPF = 381.44;
    } else if (baseMensal <= 4664.68) {
      aliqIRPF = 0.225;
      dedIRPF = 662.77;
    } else {
      aliqIRPF = 0.275;
      dedIRPF = 896.0;
    }
    const irpfMes = Math.max(0, baseMensal * aliqIRPF - dedIRPF);
    const irpfTotal = isYear ? irpfMes * 12 : irpfMes;

    // Descobre o regime mais econômico
    const options = [
      { name: "Simples Nacional", total: simplesTotal, aliq: aliqEfetivaSimples, key: "simples" as const },
      { name: "Lucro Presumido", total: presumidoTotal, aliq: base > 0 ? presumidoTotal / base : 0, key: "presumido" as const },
      { name: "Pessoa Física (IRPF)", total: irpfTotal, aliq: base > 0 ? irpfTotal / base : 0, key: "irpf" as const },
    ];
    const bestOption = options.reduce((min, o) => (o.total < min.total ? o : min), options[0]);

    return {
      base,
      rbt12,
      bestOption,
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

    const outExpenses = expenses.filter((e) => {
      const dt = e.paidDate ?? e.paid_date ?? e.dueDate ?? e.due_date;
      return (
        e.paid &&
        (e.scope ?? "business") !== "personal" &&
        !isVehicleExpenseCategory(e.category) &&
        matchPeriod(dt)
      );
    });
    outExpenses.forEach((e) => {
      const d = e.paidDate ?? e.paid_date ?? e.dueDate ?? e.due_date;
      const k = period === "month" ? d : getMonthKey(d);
      const cur = map.get(k) || { in: 0, out: 0 };
      cur.out += Number(e.amount) || 0;
      map.set(k, cur);
      expenseCount += 1;
    });

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

    const rows = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({
        key: k,
        in: v.in,
        out: v.out,
        net: v.in - v.out,
      }));
    const totalIn = rows.reduce((s, r) => s + r.in, 0);
    const totalOut = rows.reduce((s, r) => s + r.out, 0);
    return {
      rows,
      totalIn,
      totalOut,
      net: totalIn - totalOut,
      paymentCount,
      saleCount,
      loanCount,
      expenseCount,
      totalLoanOutgoing,
      inPayments,
      outExpenses,
      outLoans,
    };
  }, [payments, expenses, loans, period, monthFilter, yearFilter, matchPeriod]);

  // Formas de Pagamento
  const methodsBreakdown = useMemo(() => {
    const periodPayments = payments.filter((p) => matchPeriod(p.date));
    const loanById = new Map<string, any>();
    loans.forEach((l) => loanById.set(l.id, l));
    type ContractAgg = { loanId: string; borrowerName: string; total: number; count: number };
    type MethodAgg = {
      id: string;
      name: string;
      icon: string | null;
      total: number;
      count: number;
      contracts: Map<string, ContractAgg>;
    };
    const map = new Map<string, MethodAgg>();
    const methodById = new Map(paymentMethods.map((m: any) => [m.id, m] as const));
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
  }, [payments, paymentMethods, loans, matchPeriod]);

  const formatDate = (k: string) => {
    if (k.length === 10) return new Date(k + "T00:00:00").toLocaleDateString("pt-BR");
    if (k.length === 7) {
      const [y, m] = k.split("-");
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      });
    }
    return k;
  };

  const drawBrandingLogo = (
    doc: jsPDF,
    branding: { logoDataUrl: string | null; logoSize: number; brandName: string }
  ) => {
    if (!branding.logoDataUrl) return;
    const sizeMm = Math.max(12, Math.min(40, branding.logoSize * 0.2645));
    const pageW = doc.internal.pageSize.getWidth();
    try {
      doc.addImage(
        branding.logoDataUrl,
        "PNG",
        pageW - sizeMm - 14,
        10,
        sizeMm,
        sizeMm,
        undefined,
        "FAST"
      );
    } catch (_) {}
  };

  const pdfHeader = (
    doc: jsPDF,
    title: string,
    branding?: { logoDataUrl: string | null; logoSize: number; brandName: string }
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
      const fmtBRL = (n: number) =>
        n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const periodLabel = pdfHeader(doc, "Demonstrativo de Resultado (DRE)", branding);

      autoTable(doc, {
        startY: 40,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [59, 130, 246] },
        head: [["Descrição", "Valor"]],
        body: [
          ["(+) Receita Operacional (Juros)", fmtBRL(dre.interestRevenue)],
          [
            { content: "(=) Receita Bruta", styles: { fontStyle: "bold", fillColor: [243, 244, 246] } },
            { content: fmtBRL(dre.totalRevenue), styles: { fontStyle: "bold", fillColor: [243, 244, 246] } },
          ],
          ["(−) Despesas Operacionais PJ", fmtBRL(dre.businessExp)],
          [
            { content: "(=) Lucro Líquido Contábil", styles: { fontStyle: "bold", fillColor: [219, 234, 254] } },
            { content: fmtBRL(dre.netProfit), styles: { fontStyle: "bold", fillColor: [219, 234, 254] } },
          ],
        ],
      });

      let y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Informações Complementares e Conciliação", 14, y);
      autoTable(doc, {
        startY: y + 3,
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [100, 116, 139] },
        head: [["Item", "Valor", "Observação"]],
        body: [
          ["Recuperação de Principal", fmtBRL(dre.principalReceived), "Devolução de capital (não tributável)"],
          ["Total Recebido em Caixa", fmtBRL(dre.totalReceived), "Juros + Principal"],
          ["Despesas Dedutíveis PJ", fmtBRL(dre.businessExp), "Dedutíveis da operação"],
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
      const fmtBRL = (n: number) =>
        n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const periodLabel = pdfHeader(doc, "Livro Caixa / Fluxo Financeiro", branding);

      autoTable(doc, {
        startY: 40,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [16, 185, 129] },
        head: [["Resumo", "Valor"]],
        body: [
          ["Total de Entradas", fmtBRL(cashflow.totalIn)],
          ["Total de Saídas (Empréstimos + Despesas)", fmtBRL(cashflow.totalOut)],
          [
            { content: "Saldo Líquido de Caixa", styles: { fontStyle: "bold", fillColor: [219, 234, 254] } },
            { content: fmtBRL(cashflow.net), styles: { fontStyle: "bold", fillColor: [219, 234, 254] } },
          ],
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
          foot: [
            [
              { content: "Total", styles: { fontStyle: "bold" } },
              { content: fmtBRL(cashflow.totalIn), styles: { fontStyle: "bold" } },
              { content: fmtBRL(cashflow.totalOut), styles: { fontStyle: "bold" } },
              { content: fmtBRL(cashflow.net), styles: { fontStyle: "bold" } },
            ],
          ],
        });
      }

      doc.save(`livro-caixa-${periodLabel.replace(/\s+/g, "-")}.pdf`);
      toast.success("PDF do Livro Caixa exportado!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF");
    }
  };

  const exportTaxSimulationPDF = async () => {
    try {
      const { jsPDF, autoTable } = await loadPdfLibs();
      const branding = await getPdfBranding();
      const doc = new jsPDF();
      const periodLabel = period === "month" ? formatDate(monthFilter) : yearFilter;
      const fmtBRL = (n: number) =>
        n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

      drawBrandingLogo(doc, branding);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Planejamento Tributário & Simulação", 14, 18);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      if (branding.brandName) doc.text(branding.brandName, 14, 13);
      doc.text(`Período: ${periodLabel} (${period === "month" ? "Mensal" : "Anual"})`, 14, 25);
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 31);
      doc.setTextColor(0);

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Base Tributável (Juros Recebidos)", 14, 42);
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
          ["ISS (5%)", fmtBRL(taxSim.presumido.iss)],
          ["Total estimado", fmtBRL(taxSim.presumido.total)],
          ["Alíquota efetiva", pct(taxSim.presumido.aliquotaEfetiva)],
          ["Líquido após imposto", fmtBRL(taxSim.presumido.liquido)],
        ],
      });

      y = (doc as any).lastAutoTable.finalY + 8;
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.text("Comparativo entre Regimes", 14, y);
      autoTable(doc, {
        startY: y + 3,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [30, 41, 59] },
        head: [["Regime", "Imposto", "Alíquota Efetiva", "Líquido"]],
        body: [
          [
            "Simples Nacional",
            fmtBRL(taxSim.simples.total),
            pct(taxSim.simples.aliquotaEfetiva),
            fmtBRL(taxSim.simples.liquido),
          ],
          [
            "Lucro Presumido",
            fmtBRL(taxSim.presumido.total),
            pct(taxSim.presumido.aliquotaEfetiva),
            fmtBRL(taxSim.presumido.liquido),
          ],
          [
            "Pessoa Física (IRPF)",
            fmtBRL(taxSim.irpf.total),
            pct(taxSim.irpf.aliquotaEfetiva),
            fmtBRL(taxSim.irpf.liquido),
          ],
        ],
      });

      doc.save(`planejamento-tributario-${periodLabel.replace(/\s+/g, "-")}.pdf`);
      toast.success("PDF da simulação exportado!");
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
      const fmtBRL = (n: number) =>
        n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
      const periodLabel = period === "month" ? formatDate(monthFilter) : yearFilter;

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

      // 1. DRE
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("1. Demonstrativo de Resultado (DRE)", 14, 55);

      autoTable(doc, {
        startY: 60,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [59, 130, 246] },
        head: [["Descrição", "Valor"]],
        body: [
          ["(+) Receita Operacional (Juros)", fmtBRL(dre.interestRevenue)],
          [
            { content: "(=) Receita Bruta", styles: { fontStyle: "bold", fillColor: [243, 244, 246] } },
            { content: fmtBRL(dre.totalRevenue), styles: { fontStyle: "bold", fillColor: [243, 244, 246] } },
          ],
          ["(−) Despesas Operacionais", fmtBRL(dre.businessExp)],
          [
            { content: "(=) Lucro Líquido", styles: { fontStyle: "bold", fillColor: [219, 234, 254] } },
            { content: fmtBRL(dre.netProfit), styles: { fontStyle: "bold", fillColor: [219, 234, 254] } },
          ],
          ["Recuperação de Principal (Devolução de capital)", fmtBRL(dre.principalReceived)],
        ],
      });

      // 2. Tributos
      doc.addPage();
      drawBrandingLogo(doc, branding);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("2. Controle de Impostos & Planejamento", 14, 20);

      autoTable(doc, {
        startY: 25,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [30, 41, 59] },
        head: [["Regime", "Imposto Estimado", "Alíq. Efetiva", "Líquido"]],
        body: [
          ["Simples Nacional", fmtBRL(taxSim.simples.total), pct(taxSim.simples.aliquotaEfetiva), fmtBRL(taxSim.simples.liquido)],
          ["Lucro Presumido", fmtBRL(taxSim.presumido.total), pct(taxSim.presumido.aliquotaEfetiva), fmtBRL(taxSim.presumido.liquido)],
          ["Pessoa Física (IRPF)", fmtBRL(taxSim.irpf.total), pct(taxSim.irpf.aliquotaEfetiva), fmtBRL(taxSim.irpf.liquido)],
        ],
      });

      // 3. Fluxo de Caixa
      let y = (doc as any).lastAutoTable.finalY + 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("3. Livro Caixa / Fluxo Financeiro", 14, y);

      autoTable(doc, {
        startY: y + 5,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [16, 185, 129] },
        head: [["Resumo", "Valor"]],
        body: [
          ["Total de Entradas", fmtBRL(cashflow.totalIn)],
          ["Total de Saídas", fmtBRL(cashflow.totalOut)],
          [
            { content: "Saldo Líquido", styles: { fontStyle: "bold", fillColor: [219, 234, 254] } },
            { content: fmtBRL(cashflow.net), styles: { fontStyle: "bold", fillColor: [219, 234, 254] } },
          ],
        ],
      });

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount}`, 14, 290);
        doc.text("Relatório Contábil Consolidado — Emprestaii", 196, 290, { align: "right" });
      }

      doc.save(`relatorio-contabil-consolidado-${periodLabel.replace(/\s+/g, "-")}.pdf`);
      toast.success("PDF consolidado exportado com sucesso!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF consolidado");
    }
  };

  const exportXLSX = async () => {
    try {
      const XLSX = await import("xlsx");
      const periodLabel = period === "month" ? formatDate(monthFilter) : yearFilter;

      // 1. Planilha DRE
      const dreData = [
        { Conceito: "(+) Receita de Juros (Ganho Real)", Valor: dre.interestRevenue },
        { Conceito: "(=) Receita Operacional Bruta", Valor: dre.totalRevenue },
        { Conceito: "(−) Despesas Operacionais PJ", Valor: dre.businessExp },
        { Conceito: "(=) Lucro Líquido Contábil", Valor: dre.netProfit },
        { Conceito: "Margem Líquida (%)", Valor: `${dre.profitMargin.toFixed(2)}%` },
        { Conceito: "Recuperação de Principal (Devolução)", Valor: dre.principalReceived },
        { Conceito: "Total Recebido em Caixa", Valor: dre.totalReceived },
      ];
      const wsDRE = XLSX.utils.json_to_sheet(dreData);

      // 2. Planilha Lançamentos de Juros
      const lancamentosData = dre.breakdown.map((b) => ({
        Data: b.date,
        Cliente: b.borrowerName,
        Tipo: b.kindLabel,
        "Valor Pago": b.amount,
        "Juros (Receita)": b.interest,
        "Principal (Amortização)": b.principal,
        "Forma de Pagamento": b.paymentMethodName,
        Descrição: b.description,
      }));
      const wsLanc = XLSX.utils.json_to_sheet(lancamentosData);

      // 3. Planilha Despesas
      const despesasData = dre.periodExpenses.map((e: any) => ({
        Data: e.paidDate ?? e.paid_date ?? e.dueDate ?? e.due_date,
        Descrição: e.description ?? e.name ?? "—",
        Categoria: e.category ?? "—",
        Valor: Number(e.amount) || 0,
        Status: e.paid ? "Pago" : "Pendente",
      }));
      const wsDesp = XLSX.utils.json_to_sheet(despesasData);

      // 4. Planilha Fluxo de Caixa
      const fluxoData = cashflow.rows.map((r) => ({
        Data: r.key,
        Entradas: r.in,
        Saídas: r.out,
        "Saldo Líquido": r.net,
      }));
      const wsFluxo = XLSX.utils.json_to_sheet(fluxoData);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsDRE, "DRE");
      XLSX.utils.book_append_sheet(wb, wsLanc, "Receitas_Juros");
      XLSX.utils.book_append_sheet(wb, wsDesp, "Despesas_PJ");
      XLSX.utils.book_append_sheet(wb, wsFluxo, "Livro_Caixa");

      XLSX.writeFile(wb, `contabilidade-${periodLabel.replace(/\s+/g, "-")}.xlsx`);
      toast.success("Planilha Excel (.xlsx) exportada com sucesso!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar planilha Excel");
    }
  };

  // Filtragem na tabela detalhada da DRE
  const filteredBreakdown = useMemo(() => {
    let list = dre.breakdown;
    if (dreSearch.trim()) {
      const q = dreSearch.toLowerCase().trim();
      list = list.filter(
        (b) =>
          b.borrowerName.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q) ||
          b.paymentMethodName.toLowerCase().includes(q) ||
          b.kindLabel.toLowerCase().includes(q)
      );
    }
    return list;
  }, [dre.breakdown, dreSearch]);

  return (
    <div className="space-y-4">
      {/* 1. Header Executivo de Contabilidade */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-xs font-bold">
              <Calculator className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-foreground">
                  Painel do Contador & Fiscal
                </h2>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] py-0 px-2">
                  Oficial
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Demonstrações contábeis (DRE), Livro Caixa, Apuração Tributária e Conciliação Financeira.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <Button
              size="sm"
              variant="outline"
              onClick={exportXLSX}
              className="h-9 gap-1.5 rounded-xl border-border/60 hover:bg-muted font-medium text-xs shadow-xs"
              title="Baixar planilha para software contábil"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span>Exportar Excel</span>
            </Button>

            <Button
              size="sm"
              onClick={exportConsolidatedPDF}
              className="h-9 gap-1.5 rounded-xl bg-primary text-primary-foreground font-medium text-xs shadow-xs"
              title="Gerar relatório completo em PDF"
            >
              <Download className="h-4 w-4" />
              <span>PDF Consolidado</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Seletor de Período Integrado */}
      <div className="rounded-2xl border border-border/60 bg-card p-3 sm:p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Select value={period} onValueChange={(v: "month" | "year") => setPeriod(v)}>
              <SelectTrigger className="w-[110px] sm:w-[130px] h-9 rounded-xl text-xs font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mensal</SelectItem>
                <SelectItem value="year">Anual</SelectItem>
              </SelectContent>
            </Select>

            {period === "month" ? (
              <div className="flex items-center gap-1.5 flex-1 md:flex-initial">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl shrink-0"
                  aria-label="Mês anterior"
                  onClick={() => {
                    const [y, m] = monthFilter.split("-").map(Number);
                    const d = new Date(y, m - 2, 1);
                    setMonthFilter(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <button
                  type="button"
                  onClick={() => setMonthFilter(currentMonth)}
                  className="flex-1 md:min-w-[170px] h-9 px-3 rounded-xl bg-primary/10 hover:bg-primary/15 border border-primary/20 text-center font-bold text-xs sm:text-sm text-primary capitalize flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Clique para voltar ao mês atual"
                >
                  <span className="truncate">{formatDate(monthFilter)}</span>
                  {monthFilter === currentMonth && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                  )}
                </button>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl shrink-0"
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
              <div className="flex items-center gap-1.5 flex-1 md:flex-initial">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl shrink-0"
                  aria-label="Ano anterior"
                  onClick={() => setYearFilter(String(Number(yearFilter) - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <button
                  type="button"
                  onClick={() => setYearFilter(currentYear)}
                  className="flex-1 md:min-w-[120px] h-9 px-3 rounded-xl bg-primary/10 hover:bg-primary/15 border border-primary/20 text-center font-bold text-xs sm:text-sm text-primary flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Clique para voltar ao ano atual"
                >
                  <span>{yearFilter}</span>
                  {yearFilter === currentYear && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                  )}
                </button>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl shrink-0"
                  aria-label="Próximo ano"
                  onClick={() => setYearFilter(String(Number(yearFilter) + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Atalhos Rápidos de Meses */}
          {period === "month" && (
            <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
              {months.slice(0, 6).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonthFilter(m)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 capitalize ${
                    monthFilter === m
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40"
                  }`}
                >
                  {formatDate(m).slice(0, 3)}/{m.slice(2, 4)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Cards com KPIs Executivos Principais */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 sm:gap-3.5">
        {/* Card 1: Receita Bruta (Juros) */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-border/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">Receita (Juros)</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <p className="text-base sm:text-xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {fmt(dre.interestRevenue, hidden)}
            </p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 truncate" title="Ganho real da empresa">
              Base tributável PJ
            </p>
          </div>
        </div>

        {/* Card 2: Despesas Operacionais */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-border/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">Despesas PJ</span>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </div>
          <div>
            <p className="text-base sm:text-xl font-extrabold text-destructive tabular-nums">
              {fmt(dre.businessExp, hidden)}
            </p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 truncate">
              {dre.periodExpenses.length} despesa(s) paga(s)
            </p>
          </div>
        </div>

        {/* Card 3: Lucro Líquido Contábil */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-border/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">Lucro Líquido</span>
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p
              className={`text-base sm:text-xl font-extrabold tabular-nums ${
                dre.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
              }`}
            >
              {fmt(dre.netProfit, hidden)}
            </p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 truncate">
              Margem: <strong>{dre.profitMargin.toFixed(1)}%</strong>
            </p>
          </div>
        </div>

        {/* Card 4: Menor Imposto Estimado */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-border/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">Melhor Tributação</span>
            <Sparkles className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <p className="text-base sm:text-xl font-extrabold text-foreground tabular-nums">
              {fmt(taxSim.bestOption.total, hidden)}
            </p>
            <p className="text-[10px] sm:text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
              {taxSim.bestOption.name} ({(taxSim.bestOption.aliq * 100).toFixed(1)}%)
            </p>
          </div>
        </div>

        {/* Card 5: Movimentação Total em Caixa */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-border/60 shadow-xs flex flex-col justify-between col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">Entrada em Caixa</span>
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-base sm:text-xl font-extrabold text-foreground tabular-nums">
              {fmt(cashflow.totalIn, hidden)}
            </p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 truncate" title="Devolução de principal + juros">
              Principal: {fmt(dre.principalReceived, hidden)}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Auditoria Contábil de Integridade */}
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

      {/* 5. Abas Principais de Relatório */}
      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-auto p-1 gap-1 bg-muted/60 rounded-2xl">
          <TabsTrigger
            value="dre"
            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-2 text-[11px] sm:text-sm font-semibold rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-xs data-[state=active]:text-primary transition-all"
          >
            <FileBarChart className="h-4 w-4 shrink-0" />
            <span className="truncate">DRE & Resultado</span>
          </TabsTrigger>
          <TabsTrigger
            value="simulation"
            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-2 text-[11px] sm:text-sm font-semibold rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-xs data-[state=active]:text-primary transition-all"
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="truncate">Tributação</span>
          </TabsTrigger>
          <TabsTrigger
            value="cashflow"
            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-2 text-[11px] sm:text-sm font-semibold rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-xs data-[state=active]:text-primary transition-all"
          >
            <Wallet className="h-4 w-4 shrink-0" />
            <span className="truncate">Livro Caixa</span>
          </TabsTrigger>
          <TabsTrigger
            value="methods"
            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-2 text-[11px] sm:text-sm font-semibold rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-xs data-[state=active]:text-primary transition-all"
          >
            <CreditCard className="h-4 w-4 shrink-0" />
            <span className="truncate">Contas & Meios</span>
          </TabsTrigger>
          <TabsTrigger
            value="taxes"
            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-2 text-[11px] sm:text-sm font-semibold rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-xs data-[state=active]:text-primary transition-all"
          >
            <Receipt className="h-4 w-4 shrink-0" />
            <span className="truncate">Guias Pagas</span>
          </TabsTrigger>
        </TabsList>

        {/* ABA 1: DRE & DEMONSTRATIVO DE RESULTADO */}
        <TabsContent value="dre" className="space-y-4 mt-4">
          {/* Card em Cascata de Resultado */}
          <Card className="rounded-2xl border-border/60 shadow-xs overflow-hidden">
            <CardHeader className="p-4 sm:p-5 pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base sm:text-lg font-bold">
                    Demonstração do Resultado do Exercício (DRE)
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Visão estruturada oficial do faturamento líquido de juros e custos operacionais.
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={exportDREPDF} className="h-8 gap-1 rounded-xl text-xs self-start sm:self-auto">
                  <Download className="h-3.5 w-3.5" />
                  <span>PDF DRE</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 pt-0 space-y-3">
              {/* Linha 1: Receita Operacional Bruta */}
              <div
                onClick={() => setDreCategory((c) => (c === "interest" ? null : "interest"))}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  dreCategory === "interest" ? "border-emerald-500 bg-emerald-500/5 shadow-xs" : "border-border/60 hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
                    (+)
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
                      Receita Operacional Bruta (Juros e Encargos)
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${dreCategory === "interest" ? "rotate-180" : ""}`} />
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Ganho efetivo gerado pelos empréstimos ({dre.breakdown.length} pagamentos)
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm sm:text-base font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {fmt(dre.interestRevenue, hidden)}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">100% da receita</span>
                </div>
              </div>

              {/* Linha 2: Despesas Operacionais */}
              <div
                onClick={() => setDreCategory((c) => (c === "expenses" ? null : "expenses"))}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  dreCategory === "expenses" ? "border-destructive bg-destructive/5 shadow-xs" : "border-border/60 hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-destructive/15 text-destructive flex items-center justify-center font-bold text-sm">
                    (−)
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
                      Despesas Operacionais e Administrativas PJ
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${dreCategory === "expenses" ? "rotate-180" : ""}`} />
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Custos dedutíveis da operação ({dre.periodExpenses.length} despesas)
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm sm:text-base font-extrabold text-destructive tabular-nums">
                    {fmt(dre.businessExp, hidden)}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {dre.totalRevenue > 0 ? `${((dre.businessExp / dre.totalRevenue) * 100).toFixed(1)}% da receita` : "—"}
                  </span>
                </div>
              </div>

              {/* Linha 3: Lucro Líquido Contábil */}
              <div className="p-4 rounded-xl border-2 border-primary/30 bg-primary/5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                    (=)
                  </div>
                  <div>
                    <p className="text-sm sm:text-base font-extrabold text-foreground">
                      Lucro Líquido do Exercício
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Resultado contábil antes dos tributos corporativos
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`text-base sm:text-xl font-extrabold tabular-nums ${
                      dre.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                    }`}
                  >
                    {fmt(dre.netProfit, hidden)}
                  </span>
                  <span className="block text-[10px] font-semibold text-primary">
                    Margem Líquida: {dre.profitMargin.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Nota Didática */}
              <div className="p-3 rounded-xl bg-muted/30 border border-border/40 text-[11px] text-muted-foreground flex items-start gap-2">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>
                  <strong>Nota Contábil:</strong> A recuperação do principal emprestado (
                  <strong>{fmt(dre.principalReceived, hidden)}</strong> no período) representa devolução de capital e
                  não compõe receita nem base de cálculo de impostos, de acordo com as normas da Receita Federal do Brasil.
                </span>
              </div>

              {/* Detalhamento Expandido de Receita ou Despesa */}
              {dreCategory && (
                <div className="mt-4 rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs sm:text-sm font-bold flex items-center gap-2">
                      {dreCategory === "interest" && `Lançamentos de Receita (${dre.breakdown.filter((b) => b.interest > 0).length})`}
                      {dreCategory === "expenses" && `Lançamentos de Despesas (${dre.periodExpenses.length})`}
                    </h4>
                    <Button size="sm" variant="ghost" onClick={() => setDreCategory(null)} className="h-7 text-xs">
                      Fechar
                    </Button>
                  </div>

                  {dreCategory === "interest" && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b pb-2">
                            <th className="py-2 pr-2">Data</th>
                            <th className="py-2 pr-2">Cliente / Contrato</th>
                            <th className="py-2 pr-2">Tipo</th>
                            <th className="py-2 pr-2 text-right">Valor Pago</th>
                            <th className="py-2 text-right text-emerald-600 font-bold">Juros (Receita)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dre.breakdown
                            .filter((b) => b.interest > 0)
                            .map((b) => (
                              <tr key={b.id} className="border-b last:border-0 hover:bg-muted/40">
                                <td className="py-2 pr-2 whitespace-nowrap">
                                  {b.date ? new Date(b.date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                                </td>
                                <td className="py-2 pr-2 font-medium">{b.borrowerName}</td>
                                <td className="py-2 pr-2">
                                  <Badge variant="outline" className="text-[10px] py-0">{b.kindLabel}</Badge>
                                </td>
                                <td className="py-2 pr-2 text-right tabular-nums">{fmt(b.amount, hidden)}</td>
                                <td className="py-2 text-right tabular-nums text-emerald-600 font-bold">{fmt(b.interest, hidden)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {dreCategory === "expenses" && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b pb-2">
                            <th className="py-2 pr-2">Data</th>
                            <th className="py-2 pr-2">Descrição</th>
                            <th className="py-2 pr-2">Categoria</th>
                            <th className="py-2 text-right text-destructive font-bold">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dre.periodExpenses.map((e: any) => {
                            const d = e.paidDate ?? e.paid_date ?? e.dueDate ?? e.due_date;
                            return (
                              <tr key={e.id} className="border-b last:border-0 hover:bg-muted/40">
                                <td className="py-2 pr-2 whitespace-nowrap">
                                  {d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                                </td>
                                <td className="py-2 pr-2 font-medium">{e.description ?? e.name ?? "—"}</td>
                                <td className="py-2 pr-2">
                                  <Badge variant="outline" className="text-[10px] py-0">{e.category ?? "Geral"}</Badge>
                                </td>
                                <td className="py-2 text-right tabular-nums text-destructive font-bold">
                                  {fmt(Number(e.amount) || 0, hidden)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tabela Interativa de Juros vs Principal por Pagamento */}
          <Card className="rounded-2xl border-border/60 shadow-xs">
            <CardHeader className="p-4 sm:p-5 pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold">
                    Conciliação de Pagamentos: Juros vs Principal
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Separação matemática de cada recebimento entre receita de juros e amortização do capital.
                  </CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cliente ou descrição..."
                    value={dreSearch}
                    onChange={(e) => setDreSearch(e.target.value)}
                    className="h-8 pl-8 text-xs rounded-xl"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b pb-2">
                      <th className="py-2 pr-2">Data</th>
                      <th className="py-2 pr-2">Cliente / Contrato</th>
                      <th className="py-2 pr-2">Tipo</th>
                      <th className="py-2 pr-2 text-right">Valor Total</th>
                      <th className="py-2 pr-2 text-right text-emerald-600 font-bold">Juros (Receita)</th>
                      <th className="py-2 text-right font-semibold">Principal (Amort.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground">
                          Nenhum pagamento encontrado para o período.
                        </td>
                      </tr>
                    ) : (
                      filteredBreakdown.map((b) => (
                        <tr key={b.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                          <td className="py-2 pr-2 whitespace-nowrap">
                            {b.date ? new Date(b.date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                          </td>
                          <td className="py-2 pr-2">
                            <p className="font-semibold text-foreground">{b.borrowerName}</p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                              {b.paymentMethodName} {b.description ? `· ${b.description}` : ""}
                            </p>
                          </td>
                          <td className="py-2 pr-2">
                            <Badge variant="outline" className="text-[10px] py-0 font-medium">
                              {b.kindLabel}
                            </Badge>
                          </td>
                          <td className="py-2 pr-2 text-right font-medium tabular-nums">{fmt(b.amount, hidden)}</td>
                          <td className="py-2 pr-2 text-right text-emerald-600 font-bold tabular-nums">
                            {fmt(b.interest, hidden)}
                          </td>
                          <td className="py-2 text-right font-medium tabular-nums text-muted-foreground">
                            {fmt(b.principal, hidden)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 2: PLANEJAMENTO TRIBUTÁRIO & SIMULADOR */}
        <TabsContent value="simulation" className="space-y-4 mt-4">
          <Card className="rounded-2xl border-border/60 shadow-xs">
            <CardHeader className="p-4 sm:p-5 pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base sm:text-lg font-bold">
                      Comparador de Regimes Tributários
                    </CardTitle>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px]">
                      Planejamento Fiscal
                    </Badge>
                  </div>
                  <CardDescription className="text-xs mt-0.5">
                    Comparação do imposto a pagar sobre os juros auferidos de <strong>{fmt(taxSim.base, hidden)}</strong>.
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={exportTaxSimulationPDF} className="h-8 gap-1 rounded-xl text-xs self-start sm:self-auto">
                  <Download className="h-3.5 w-3.5" />
                  <span>PDF Tributos</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 pt-0 space-y-4">
              {/* 3 Cards de Regimes Lado a Lado */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {/* Opção 1: Simples Nacional */}
                <div
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                    taxSim.bestOption.key === "simples"
                      ? "border-emerald-500 bg-emerald-500/[0.03] ring-2 ring-emerald-500/20 shadow-xs"
                      : "border-border/60 bg-card"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-bold flex items-center gap-1.5">
                        <Building2 className="h-4 w-4 text-primary" /> Simples Nacional
                      </h4>
                      {taxSim.bestOption.key === "simples" && (
                        <Badge className="bg-emerald-600 text-white text-[10px] py-0 px-2 font-bold">
                          Mais Econômico
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Anexo III (Serviços / Intermediação)</p>
                    <div className="my-3">
                      <p className="text-2xl font-black text-foreground tabular-nums">
                        {fmt(taxSim.simples.total, hidden)}
                      </p>
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                        Alíquota Efetiva: {(taxSim.simples.aliquotaEfetiva * 100).toFixed(2)}% (Faixa {taxSim.simples.faixa})
                      </p>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-border/40 text-xs space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span>RBT12 (Anualizada)</span>
                      <span>{fmt(taxSim.rbt12, hidden)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-foreground">
                      <span>Líquido após DAS</span>
                      <span>{fmt(taxSim.simples.liquido, hidden)}</span>
                    </div>
                  </div>
                </div>

                {/* Opção 2: Lucro Presumido */}
                <div
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                    taxSim.bestOption.key === "presumido"
                      ? "border-emerald-500 bg-emerald-500/[0.03] ring-2 ring-emerald-500/20 shadow-xs"
                      : "border-border/60 bg-card"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-bold flex items-center gap-1.5">
                        <Receipt className="h-4 w-4 text-amber-500" /> Lucro Presumido
                      </h4>
                      {taxSim.bestOption.key === "presumido" && (
                        <Badge className="bg-emerald-600 text-white text-[10px] py-0 px-2 font-bold">
                          Mais Econômico
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Presunção de 32% (IRPJ + CSLL + PIS/COFINS + ISS)</p>
                    <div className="my-3">
                      <p className="text-2xl font-black text-foreground tabular-nums">
                        {fmt(taxSim.presumido.total, hidden)}
                      </p>
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                        Alíquota Efetiva: {(taxSim.presumido.aliquotaEfetiva * 100).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-border/40 text-xs space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Base de Cálculo (32%)</span>
                      <span>{fmt(taxSim.presumido.baseCalculo, hidden)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-foreground">
                      <span>Líquido após Tributos</span>
                      <span>{fmt(taxSim.presumido.liquido, hidden)}</span>
                    </div>
                  </div>
                </div>

                {/* Opção 3: Pessoa Física / Carnê-Leão */}
                <div
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                    taxSim.bestOption.key === "irpf"
                      ? "border-emerald-500 bg-emerald-500/[0.03] ring-2 ring-emerald-500/20 shadow-xs"
                      : "border-border/60 bg-card"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-bold flex items-center gap-1.5">
                        <Percent className="h-4 w-4 text-purple-500" /> Pessoa Física (IRPF)
                      </h4>
                      {taxSim.bestOption.key === "irpf" && (
                        <Badge className="bg-emerald-600 text-white text-[10px] py-0 px-2 font-bold">
                          Mais Econômico
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Carnê-Leão Mensal (Tabela Progressiva)</p>
                    <div className="my-3">
                      <p className="text-2xl font-black text-foreground tabular-nums">
                        {fmt(taxSim.irpf.total, hidden)}
                      </p>
                      <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mt-0.5">
                        Alíquota Efetiva: {(taxSim.irpf.aliquotaEfetiva * 100).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-border/40 text-xs space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Parcela a Deduzir</span>
                      <span>{fmt(taxSim.irpf.deducao, hidden)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-foreground">
                      <span>Líquido após IRPF</span>
                      <span>{fmt(taxSim.irpf.liquido, hidden)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 3: LIVRO CAIXA & FLUXO */}
        <TabsContent value="cashflow" className="space-y-4 mt-4">
          <Card className="rounded-2xl border-border/60 shadow-xs">
            <CardHeader className="p-4 sm:p-5 pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base sm:text-lg font-bold">
                    Livro Caixa & Conciliação de Entradas e Saídas
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Registro cronológico completo de toda a movimentação de recursos no período.
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={exportCashflowPDF} className="h-8 gap-1 rounded-xl text-xs self-start sm:self-auto">
                  <Download className="h-3.5 w-3.5" />
                  <span>PDF Livro Caixa</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 pt-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                  <span className="text-xs font-semibold text-muted-foreground">Total de Entradas</span>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {fmt(cashflow.totalIn, hidden)}
                  </p>
                  <span className="text-[10px] text-muted-foreground">{cashflow.paymentCount} recebimento(s)</span>
                </div>

                <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/5">
                  <span className="text-xs font-semibold text-muted-foreground">Total de Saídas</span>
                  <p className="text-lg font-bold text-destructive tabular-nums">
                    {fmt(cashflow.totalOut, hidden)}
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    {cashflow.loanCount} empréstimo(s) + {cashflow.expenseCount} despesa(s)
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/5">
                  <span className="text-xs font-semibold text-muted-foreground">Saldo Líquido</span>
                  <p
                    className={`text-lg font-bold tabular-nums ${
                      cashflow.net >= 0 ? "text-primary" : "text-destructive"
                    }`}
                  >
                    {fmt(cashflow.net, hidden)}
                  </p>
                  <span className="text-[10px] text-muted-foreground">Variação de disponibilidades</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b pb-2">
                      <th className="py-2 pr-2">Data</th>
                      <th className="py-2 pr-2 text-right text-emerald-600 font-bold">Entradas</th>
                      <th className="py-2 pr-2 text-right text-destructive font-bold">Saídas</th>
                      <th className="py-2 text-right font-bold">Saldo do Dia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashflow.rows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-muted-foreground">
                          Sem movimentações registradas no período.
                        </td>
                      </tr>
                    ) : (
                      cashflow.rows.map((r) => (
                        <tr key={r.key} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="py-2 pr-2 whitespace-nowrap font-medium capitalize">
                            {formatDate(r.key)}
                          </td>
                          <td className="py-2 pr-2 text-right text-emerald-600 font-medium tabular-nums">
                            {fmt(r.in, hidden)}
                          </td>
                          <td className="py-2 pr-2 text-right text-destructive font-medium tabular-nums">
                            {fmt(r.out, hidden)}
                          </td>
                          <td
                            className={`py-2 text-right font-bold tabular-nums ${
                              r.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                            }`}
                          >
                            {fmt(r.net, hidden)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 4: FORMAS DE RECEBIMENTO & BANCOS */}
        <TabsContent value="methods" className="space-y-4 mt-4">
          <Card className="rounded-2xl border-border/60 shadow-xs">
            <CardHeader className="p-4 sm:p-5 pb-3">
              <CardTitle className="text-base sm:text-lg font-bold">
                Recebimentos por Forma de Pagamento & Conta
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Distribuição percentual dos recursos recebidos para conciliação bancária.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 pt-0 space-y-3">
              {methodsBreakdown.rows.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  Nenhum recebimento registrado no período selecionado.
                </p>
              ) : (
                <div className="space-y-3">
                  {methodsBreakdown.rows.map((m) => {
                    const pctOfTotal =
                      methodsBreakdown.grandTotal > 0
                        ? (m.total / methodsBreakdown.grandTotal) * 100
                        : 0;
                    const isExpanded = expandedMethod === m.id;

                    return (
                      <div key={m.id} className="rounded-xl border border-border/60 p-3.5 bg-card space-y-2">
                        <div
                          onClick={() => setExpandedMethod(isExpanded ? null : m.id)}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                              <CreditCard className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold text-foreground truncate">{m.name}</p>
                              <p className="text-[10px] text-muted-foreground">{m.count} transação(ões)</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs sm:text-sm font-extrabold text-foreground tabular-nums">
                              {fmt(m.total, hidden)}
                            </p>
                            <p className="text-[10px] text-primary font-semibold">{pctOfTotal.toFixed(1)}% do total</p>
                          </div>
                        </div>

                        {/* Barra Visual de Proporção */}
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${Math.min(100, Math.max(2, pctOfTotal))}%` }}
                          />
                        </div>

                        {/* Contratos Conciliados no Método */}
                        {isExpanded && (
                          <div className="pt-2 border-t border-border/40 space-y-1.5 mt-2">
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Clientes Recebidos</p>
                            {m.contracts.map((c) => (
                              <div key={c.loanId} className="flex justify-between text-xs py-1 border-b last:border-0">
                                <span className="font-medium text-foreground">{c.borrowerName}</span>
                                <span className="text-muted-foreground tabular-nums">
                                  {c.count}x · {fmt(c.total, hidden)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 5: GUIAS DE IMPOSTOS */}
        <TabsContent value="taxes" className="space-y-4 mt-4">
          <Card className="rounded-2xl border-border/60 shadow-xs">
            <CardHeader className="p-4 sm:p-5 pb-3">
              <CardTitle className="text-base sm:text-lg font-bold">
                Guias de Impostos e Tributos Pagos
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Despesas registradas com categoria fiscal (DAS, IRPF, ISS, Taxas).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 pt-0 space-y-3">
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="p-3 rounded-xl bg-muted/40 border border-border/40">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Total</span>
                  <p className="text-sm sm:text-base font-extrabold tabular-nums">{fmt(taxes.total, hidden)}</p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-[10px] uppercase font-bold text-emerald-600">Pagos</span>
                  <p className="text-sm sm:text-base font-extrabold text-emerald-600 tabular-nums">{fmt(taxes.paid, hidden)}</p>
                </div>
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                  <span className="text-[10px] uppercase font-bold text-destructive">Pendentes</span>
                  <p className="text-sm sm:text-base font-extrabold text-destructive tabular-nums">{fmt(taxes.pending, hidden)}</p>
                </div>
              </div>

              {taxes.items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Nenhuma guia ou despesa de imposto registrada neste período.
                </p>
              ) : (
                <div className="space-y-2 pt-2">
                  {taxes.items.map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-card">
                      <div>
                        <p className="text-xs font-bold text-foreground">{t.description}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {t.category} · Venc. {new Date((t.dueDate ?? t.due_date) + "T00:00:00").toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-extrabold tabular-nums">{fmt(Number(t.amount) || 0, hidden)}</p>
                        <Badge
                          variant="outline"
                          className={`text-[9px] py-0 ${t.paid ? "border-emerald-500 text-emerald-600" : "border-destructive text-destructive"}`}
                        >
                          {t.paid ? "Pago" : "Pendente"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
