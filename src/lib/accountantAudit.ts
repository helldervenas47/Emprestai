// Auditoria do Contador: cruza os totais exibidos contra os dados de origem.
// Não altera dados de origem. Apenas detecta divergências e produz um relatório.
import { isVehicleExpenseCategory } from "@/features/vehicles/components/VehicleExpenseForm";

export type AuditSeverity = "ok" | "warn" | "error";

export interface AuditLine {
  id: string;
  date?: string;
  amount: number;
  label?: string;
  /** "payment" | "sale" | "expense" | "loan" */
  source: string;
  meta?: Record<string, any>;
}

export interface AuditBreakdown {
  /** linhas que compõem o valor esperado (recalculado da origem) */
  expectedLines: AuditLine[];
  /** linhas que compõem o valor exibido (heurística do que o componente somou) */
  shownLines: AuditLine[];
  /** linhas presentes em uma origem e ausentes na outra */
  missingInShown: AuditLine[];
  extraInShown: AuditLine[];
  /** explicação humana */
  reason: string;
}

export interface AuditIssue {
  metric: string;
  expected: number;
  shown: number;
  diff: number;
  origin: string;
  message: string;
  severity: AuditSeverity;
  breakdown?: AuditBreakdown;
}

export interface AuditTotals {
  interestRevenue: number;
  salesRevenue: number;
  totalRevenue: number;
  totalExpenses: number;
  businessExp: number;
  personalExp: number;
  netProfit: number;
  cashIn: number;
  cashOut: number;
  cashNet: number;
  paymentsCount: number;
  loansOutgoing: number;
}

export interface AuditCorrection {
  metric: string;
  from: number;
  to: number;
  reason: string;
}

export interface AuditReport {
  executedAt: string;
  periodStart?: string;
  periodEnd?: string;
  confidenceScore: number;
  totals: AuditTotals & { expected: AuditTotals };
  issues: AuditIssue[];
  corrections: AuditCorrection[];
}

interface AuditInput {
  loans: any[];
  payments: any[];
  sales: any[];
  expenses: any[];
  renegotiations?: any[];
  /** YYYY-MM ou YYYY */
  period: "month" | "year";
  monthFilter: string; // YYYY-MM
  yearFilter: string;  // YYYY
  /** totais atualmente exibidos no Contador */
  shown: AuditTotals;
}

const eq = (a: number, b: number, tol = 0.01) => Math.abs((a || 0) - (b || 0)) <= tol;

function getMonthKey(d: string) { return (d || "").slice(0, 7); }
function getYearKey(d: string) { return (d || "").slice(0, 4); }

function shortId(id: string | undefined): string {
  if (!id) return "—";
  return String(id).slice(0, 8);
}

export function runAccountantAudit(input: AuditInput): AuditReport {
  const { loans, payments, sales, expenses, period, monthFilter, yearFilter, shown } = input;

  const matchPeriod = (d: string) => {
    if (!d) return false;
    return period === "month" ? getMonthKey(d) === monthFilter : getYearKey(d) === yearFilter;
  };

  const periodPayments = payments.filter((p) => matchPeriod(p.date));
  const periodSales = sales.filter((s) => matchPeriod(s.sale_date));
  const periodExpenses = expenses.filter((e) => e.paid && !isVehicleExpenseCategory(e.category) && matchPeriod(e.paid_date || e.due_date));

  const loanById = new Map<string, any>();
  loans.forEach((l) => loanById.set(l.id, l));

  // --- Receita de juros esperada (mesma fórmula do componente, com dedupe por id) ---
  let totalReceived = 0;
  let interestRevenue = 0;
  const seenPaymentIds = new Set<string>();
  const duplicateLines: AuditLine[] = [];
  const interestLines: AuditLine[] = [];
  const paymentLines: AuditLine[] = [];

  for (const p of periodPayments) {
    if (p.id) {
      if (seenPaymentIds.has(p.id)) {
        duplicateLines.push({
          id: p.id,
          date: p.date,
          amount: Number(p.amount) || 0,
          label: `Pagamento duplicado #${shortId(p.id)}`,
          source: "payment",
          meta: { loanId: p.loanId || p.loan_id },
        });
        continue;
      }
      seenPaymentIds.add(p.id);
    }
    const amt = Number(p.amount) || 0;
    totalReceived += amt;
    const loan = loanById.get(p.loanId || p.loan_id);
    const principalPerInstall = loan
      ? Number(loan.amount) / Math.max(1, Number(loan.installments) || 1)
      : 0;
    const interestPart = loan ? Math.max(0, amt - principalPerInstall) : 0;
    interestRevenue += interestPart;

    paymentLines.push({
      id: p.id || `${p.loanId}-${p.date}`,
      date: p.date,
      amount: amt,
      label: loan ? `${loan.borrowerName || loan.borrower_name || "Empréstimo"} #${shortId(loan.id)}` : `Pagamento #${shortId(p.id)}`,
      source: "payment",
      meta: { loanId: p.loanId || p.loan_id, principalPart: principalPerInstall, interestPart },
    });
    if (interestPart > 0) {
      interestLines.push({
        id: p.id || `${p.loanId}-${p.date}`,
        date: p.date,
        amount: interestPart,
        label: loan ? `Juros de ${loan.borrowerName || loan.borrower_name} (#${shortId(loan.id)})` : `Juros #${shortId(p.id)}`,
        source: "payment",
        meta: { paymentAmount: amt, principalPart: principalPerInstall, loanId: p.loanId || p.loan_id },
      });
    }
  }

  // --- Vendas ---
  const salesLines: AuditLine[] = periodSales.map((s) => ({
    id: s.id,
    date: s.sale_date,
    amount: Number(s.total) || 0,
    label: s.description || s.product_name || `Venda #${shortId(s.id)}`,
    source: "sale",
  }));
  const salesRevenue = salesLines.reduce((acc, x) => acc + x.amount, 0);
  const totalRevenue = interestRevenue + salesRevenue;

  // --- Despesas ---
  const businessLines: AuditLine[] = periodExpenses
    .filter((e) => e.scope !== "personal")
    .map((e) => ({
      id: e.id,
      date: e.paid_date || e.due_date,
      amount: Number(e.amount) || 0,
      label: `${e.description || e.category || "Despesa"} #${shortId(e.id)}`,
      source: "expense",
      meta: { category: e.category, scope: e.scope },
    }));
  const personalLines: AuditLine[] = periodExpenses
    .filter((e) => e.scope === "personal")
    .map((e) => ({
      id: e.id,
      date: e.paid_date || e.due_date,
      amount: Number(e.amount) || 0,
      label: `${e.description || e.category || "Despesa"} #${shortId(e.id)}`,
      source: "expense",
      meta: { category: e.category, scope: e.scope },
    }));
  const businessExp = businessLines.reduce((s, x) => s + x.amount, 0);
  const personalExp = personalLines.reduce((s, x) => s + x.amount, 0);
  const totalExpenses = businessExp + personalExp;
  const netProfit = totalRevenue - businessExp;

  // --- Fluxo de caixa esperado ---
  const cashIn = totalReceived + salesRevenue;
  const cashOut = businessExp;
  const cashNet = cashIn - cashOut;

  // --- Empréstimos concedidos no período (saída) ---
  const loanOutgoingLines: AuditLine[] = loans
    .filter((l) => matchPeriod(l.start_date || l.startDate))
    .map((l) => ({
      id: l.id,
      date: l.start_date || l.startDate,
      amount: Number(l.amount) || 0,
      label: `${l.borrowerName || l.borrower_name || "Empréstimo"} #${shortId(l.id)}`,
      source: "loan",
    }));
  const loansOutgoing = loanOutgoingLines.reduce((s, l) => s + l.amount, 0);

  const expected: AuditTotals = {
    interestRevenue,
    salesRevenue,
    totalRevenue,
    totalExpenses,
    businessExp,
    personalExp,
    netProfit,
    cashIn,
    cashOut,
    cashNet,
    paymentsCount: periodPayments.length - duplicateLines.length,
    loansOutgoing,
  };

  // Mapa: para cada métrica, breakdown padrão (linhas esperadas).
  // Como o componente atualmente exibe os mesmos números recalculados,
  // shownLines = expectedLines + ajuste pela diferença numérica.
  const breakdownMap: Record<string, { lines: AuditLine[]; reason: string }> = {
    interestRevenue: {
      lines: interestLines,
      reason:
        "Para cada pagamento do período, somamos amount − (loan.amount / loan.installments). Se um pagamento estiver vinculado a um empréstimo errado, ou o número de parcelas estiver inflado/reduzido, o juros muda.",
    },
    salesRevenue: {
      lines: salesLines,
      reason: "Soma direta do campo total de cada venda no período.",
    },
    totalRevenue: {
      lines: [...interestLines, ...salesLines],
      reason: "Receita de Juros + Receita de Vendas. Aportes não entram aqui.",
    },
    businessExp: {
      lines: businessLines,
      reason: "Somente despesas pagas, com scope diferente de 'personal'.",
    },
    personalExp: {
      lines: personalLines,
      reason: "Somente despesas pagas, com scope = 'personal'.",
    },
    totalExpenses: {
      lines: [...businessLines, ...personalLines],
      reason: "Soma de todas as despesas pagas (empresa + pessoal).",
    },
    netProfit: {
      lines: [
        ...interestLines.map((l) => ({ ...l, label: `+ ${l.label}`, meta: { ...l.meta, sign: "+" } })),
        ...salesLines.map((l) => ({ ...l, label: `+ ${l.label}`, meta: { sign: "+" } })),
        ...businessLines.map((l) => ({ ...l, amount: -l.amount, label: `− ${l.label}`, meta: { ...l.meta, sign: "-" } })),
      ],
      reason: "Receita Total − Despesas (Empresa). Pessoais não reduzem o lucro do negócio.",
    },
    cashIn: {
      lines: [...paymentLines, ...salesLines],
      reason: "Total bruto recebido (todos os pagamentos) + total de vendas no período.",
    },
    cashOut: {
      lines: businessLines,
      reason: "Saídas reais de caixa = despesas empresa pagas no período.",
    },
    cashNet: {
      lines: [
        ...paymentLines.map((l) => ({ ...l, label: `+ ${l.label}` })),
        ...salesLines.map((l) => ({ ...l, label: `+ ${l.label}` })),
        ...businessLines.map((l) => ({ ...l, amount: -l.amount, label: `− ${l.label}` })),
      ],
      reason: "Entradas (pagamentos + vendas) − Saídas (despesas empresa).",
    },
    loansOutgoing: {
      lines: loanOutgoingLines,
      reason: "Empréstimos cuja start_date cai no período selecionado.",
    },
  };

  const issues: AuditIssue[] = [];
  const corrections: AuditCorrection[] = [];

  const compare = (
    metric: keyof AuditTotals,
    label: string,
    origin: string,
    severity: AuditSeverity = "warn",
  ) => {
    const e = expected[metric] as number;
    const s = shown[metric] as number;
    if (!eq(e, s)) {
      const diff = (s || 0) - (e || 0);
      const bd = breakdownMap[metric as string];
      const expectedLines = bd?.lines || [];
      // shownLines: como não temos rastreio do que o componente somou, indicamos
      // o conjunto esperado e marcamos a diferença bruta.
      const shownLines: AuditLine[] = expectedLines.slice();
      issues.push({
        metric: label,
        expected: e,
        shown: s,
        diff,
        origin,
        severity,
        message: `Esperado ${fmtBRL(e)}, exibido ${fmtBRL(s)} → diferença ${fmtBRL(diff)}`,
        breakdown: {
          expectedLines,
          shownLines,
          missingInShown: diff < 0 ? [{ id: "diff", amount: -diff, source: "diff", label: "Valor faltando no exibido" }] : [],
          extraInShown: diff > 0 ? [{ id: "diff", amount: diff, source: "diff", label: "Valor a mais no exibido" }] : [],
          reason: `${bd?.reason || ""} A diferença pode vir de: lançamentos fora do filtro de período, pagamentos vinculados ao empréstimo errado, despesas pagas em datas diferentes da paid_date, ou aportes classificados como receita/despesa.`,
        },
      });
      corrections.push({ metric: label, from: s, to: e, reason: `Recalculado a partir de ${origin}` });
    }
  };

  compare("interestRevenue", "Receita de Juros", "pagamentos − principal por parcela", "error");
  compare("salesRevenue", "Receita de Vendas", "tabela de vendas", "warn");
  compare("totalRevenue", "Receita Total", "juros + vendas (aportes excluídos)", "error");
  compare("businessExp", "Despesas (Empresa)", "expenses pagas, scope ≠ personal");
  compare("personalExp", "Despesas (Pessoal)", "expenses pagas, scope = personal");
  compare("totalExpenses", "Despesas Totais", "soma de todas as despesas pagas");
  compare("netProfit", "Lucro Líquido", "receita total − despesas empresa", "error");
  compare("cashIn", "Entradas de Caixa", "pagamentos + vendas");
  compare("cashOut", "Saídas de Caixa", "despesas empresa");
  compare("cashNet", "Saldo do Período", "entradas − saídas");
  compare("loansOutgoing", "Empréstimos Concedidos", "loans com start_date no período");

  if (duplicateLines.length > 0) {
    const v = duplicateLines.reduce((s, x) => s + x.amount, 0);
    issues.push({
      metric: "Pagamentos Duplicados",
      expected: 0,
      shown: duplicateLines.length,
      diff: duplicateLines.length,
      origin: "tabela payments (mesmo id repetido)",
      severity: "error",
      message: `${duplicateLines.length} pagamento(s) com id duplicado no período (${fmtBRL(v)} no total)`,
      breakdown: {
        expectedLines: [],
        shownLines: duplicateLines,
        missingInShown: [],
        extraInShown: duplicateLines,
        reason:
          "Estes pagamentos aparecem mais de uma vez na tabela payments com o mesmo id. Provável reentrega de webhook ou inserção duplicada offline.",
      },
    });
  }

  // --- Validação extra: aportes não devem entrar como receita/despesa ---
  const aportesIndevidos = periodExpenses.filter(
    (e) => /aporte/i.test(e.category || "") || /aporte/i.test(e.description || ""),
  );
  if (aportesIndevidos.length > 0) {
    const lines: AuditLine[] = aportesIndevidos.map((e) => ({
      id: e.id,
      date: e.paid_date || e.due_date,
      amount: Number(e.amount) || 0,
      label: `${e.description || e.category} #${shortId(e.id)}`,
      source: "expense",
      meta: { category: e.category },
    }));
    const v = lines.reduce((s, x) => s + x.amount, 0);
    issues.push({
      metric: "Aportes em Despesas",
      expected: 0,
      shown: v,
      diff: v,
      origin: "expenses com categoria/descrição contendo 'aporte'",
      severity: "warn",
      message: `${aportesIndevidos.length} lançamento(s) classificados como aporte estão somando em despesas (${fmtBRL(v)})`,
      breakdown: {
        expectedLines: [],
        shownLines: lines,
        missingInShown: [],
        extraInShown: lines,
        reason:
          "Aporte é entrada/saída de capital próprio e não deve compor receita nem despesa do negócio. Mude a categoria desses lançamentos para algo diferente de 'aporte' ou registre-os como movimentação de saldo/caixinha.",
      },
    });
  }

  // --- Score de confiabilidade ---
  let score = 100;
  for (const i of issues) {
    score -= i.severity === "error" ? 8 : i.severity === "warn" ? 3 : 1;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    executedAt: new Date().toISOString(),
    periodStart: period === "month" ? `${monthFilter}-01` : `${yearFilter}-01-01`,
    periodEnd: period === "month" ? `${monthFilter}-31` : `${yearFilter}-12-31`,
    confidenceScore: score,
    totals: { ...shown, expected },
    issues,
    corrections,
  };
}

function fmtBRL(n: number) {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
