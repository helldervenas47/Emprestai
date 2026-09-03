import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { allocateInterestByPayment } from "@/features/financial/lib/interestAllocation";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Mesma fórmula oficial de `calculateTotalWithInterest` (useLoans). */
const totalWithInterest = (principal: number, rate: number) => Math.round(principal * (1 + rate / 100));

/**
 * Composição financeira oficial do saldo em aberto de um contrato.
 *
 * Cada campo representa UM único conceito financeiro — nunca reutilize
 * `contractualBalanceRemaining` como se fosse principal.
 */
export interface LoanOutstandingBreakdown {
  /** Principal originalmente emprestado (imutável no fluxo de pagamento). */
  originalPrincipal: number;
  /** Principal efetivamente amortizado pelos pagamentos registrados. */
  principalPaid: number;
  /** Principal ainda devido — 0 ≤ valor ≤ originalPrincipal. */
  principalRemaining: number;
  /** Saldo contratual restante (principal + juros contratuais embutidos). */
  contractualBalanceRemaining: number;
  /** Juros contratuais ainda embutidos no saldo contratual. */
  contractualInterestRemaining: number;
  /** Juros do ciclo corrente ainda em aberto (contratos de parcela única). */
  currentInterestPending: number;
  /**
   * true somente quando os juros do ciclo corrente REALMENTE são um subconjunto
   * de `contractualInterestRemaining` (cobrança já embutida no saldo).
   * Em contratos de juros recorrentes com amortização, o ciclo é cobrança NOVA
   * (calculada sobre o principal original) e pode exceder os juros embutidos —
   * nesse caso o valor é informativo e não pode ser somado nem chamado de "incluído".
   */
  currentInterestIncluded: boolean;

  /** Juros de atraso acumulados. */
  lateInterest: number;
  /** Multa por atraso. */
  penalty: number;
  /** Encargos de atraso (multa + juros de atraso). */
  lateFees: number;
  /** Valor sugerido de quitação = saldo contratual + encargos de atraso. */
  payoffTotal: number;
}

export interface OutstandingInput {
  loan: Loan;
  payments: Payment[];
  /** Encargos de atraso já calculados pela fonte oficial do card. */
  lateInterest?: number;
  penalty?: number;
  /** Juros do ciclo corrente pendentes (regra do módulo de juros avulsos). */
  currentInterestPending?: number;
  schedules?: InstallmentSchedule[];
}

/**
 * Principal efetivamente pago, respeitando o tipo de cada pagamento e a
 * alocação oficial (`allocateInterestByPayment`):
 *  - juros avulsos (0 / -2): 100% juros → não reduz principal;
 *  - amortização (-3): 100% principal;
 *  - parcial (-1): usa `metadata.principal_amount` quando persistido
 *    (allocation_version) e cai na regra oficial/legada caso contrário;
 *  - parcela regular (>= 1): usa a divisão principal/juros do cronograma.
 * Multas e juros de atraso nunca reduzem o principal.
 */
export function getPrincipalPaid(loan: Loan, payments: Payment[]): number {
  const loanPayments = payments.filter((p) => p.loanId === loan.id);
  if (loanPayments.length === 0) return 0;

  const interestByPayment = allocateInterestByPayment([loan as any], loanPayments as any);

  let principalPaid = 0;
  for (const p of loanPayments) {
    const amount = Number(p.amount) || 0;
    if (amount <= 0) continue;
    const inst = p.installmentNumber;
    const md = (p.metadata ?? null) as any;

    // Encargos puros (multa/juros de atraso) nunca abatem principal.
    if (md?.kind === "late_fee" || md?.kind === "penalty") continue;
    // Juros avulsos / juros parciais do ciclo.
    if (inst === 0 || inst === -2) continue;
    // Amortização: 100% principal.
    if (inst === -3) { principalPaid += amount; continue; }

    // Parcial com alocação persistida: honra o histórico.
    if (inst === -1 && md?.principal_amount != null && Number.isFinite(Number(md.principal_amount))) {
      principalPaid += Math.max(0, Number(md.principal_amount));
      continue;
    }

    const interest = interestByPayment.get(p.id) ?? 0;
    const feesPaid = Math.max(0, Number(md?.fees_amount ?? 0));
    principalPaid += Math.max(0, amount - interest - feesPaid);
  }

  return round2(principalPaid);
}

export function getLoanOutstandingBreakdown(input: OutstandingInput): LoanOutstandingBreakdown {
  const { loan, payments } = input;
  const originalPrincipal = Math.max(0, Number(loan.amount) || 0);
  const isPaid = loan.status === "paid";

  const totalContract = totalWithInterest(loan.amount, loan.interestRate);
  const totalPaid = payments
    .filter((p) => p.loanId === loan.id)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const contractualBalanceRemaining = isPaid
    ? 0
    : loan.remainingAmount != null && loan.remainingAmount > 0
      ? loan.remainingAmount
      : Math.max(0, totalContract - totalPaid);

  const principalPaid = isPaid ? originalPrincipal : Math.min(originalPrincipal, getPrincipalPaid(loan, payments));
  // Trava dupla: nunca negativo, nunca acima do principal emprestado.
  const principalRemaining = isPaid
    ? 0
    : round2(Math.min(originalPrincipal, Math.max(0, originalPrincipal - principalPaid)));

  // Principal nunca pode exceder o saldo contratual em aberto.
  const principalRemainingCapped = round2(Math.min(principalRemaining, contractualBalanceRemaining));
  const contractualInterestRemaining = round2(
    Math.max(0, contractualBalanceRemaining - principalRemainingCapped),
  );

  const lateInterest = isPaid ? 0 : round2(Math.max(0, input.lateInterest ?? 0));
  const penalty = isPaid ? 0 : round2(Math.max(0, input.penalty ?? 0));
  const lateFees = round2(lateInterest + penalty);

  const currentInterestPending = isPaid
    ? 0
    : round2(Math.max(0, input.currentInterestPending ?? contractualInterestRemaining));

  // Contenção real: o ciclo só é subconjunto dos juros embutidos se couber neles.
  const currentInterestIncluded =
    currentInterestPending > 0 && currentInterestPending <= contractualInterestRemaining + 0.01;

  if (
    process.env.NODE_ENV !== "production" &&
    currentInterestPending > 0 &&
    !currentInterestIncluded &&
    contractualInterestRemaining > 0
  ) {
    console.warn(
      "[loanOutstanding] Juros do ciclo atual excedem os juros contratuais restantes — tratados como cobrança independente.",
      { loanId: loan.id, contractualInterestRemaining, currentInterestPending },
    );
  }

  return {
    originalPrincipal,
    principalPaid: round2(principalPaid),
    principalRemaining: principalRemainingCapped,
    contractualBalanceRemaining: round2(contractualBalanceRemaining),
    contractualInterestRemaining,
    currentInterestPending,
    currentInterestIncluded,

    lateInterest,
    penalty,
    lateFees,
    payoffTotal: isPaid ? 0 : round2(contractualBalanceRemaining + lateFees),
  };
}

/** Uma linha do resumo financeiro apresentado ao usuário. */
export interface LoanSummaryLine {
  key: string;
  label: string;
  value: number;
  /** true = participa da soma exibida; false = apenas detalhamento (subconjunto). */
  summable: boolean;
  /** Linha de detalhe de outra linha (renderizada indentada). */
  detail?: boolean;
  emphasis?: "warn" | "muted";
}

export interface LoanSummaryPresentation {
  /** Contexto (não somável) — valor originalmente emprestado. */
  context: LoanSummaryLine[];
  /** Linhas somáveis + eventuais detalhes (summable=false). */
  lines: LoanSummaryLine[];
  /** Total exibido = soma exata de todas as linhas somáveis. */
  total: number;
  totalLabel: string;
  /** Informações fora da soma (cobranças independentes), exibidas após o total. */
  notes: LoanSummaryLine[];
}

/**
 * Composição OFICIAL de apresentação do resumo de um contrato.
 *
 * Regra de ouro: as linhas com `summable: true` somam EXATAMENTE `total`.
 * Os juros do ciclo corrente só aparecem como detalhe "(incluídos)" quando
 * `currentInterestIncluded` for true (isto é, quando realmente cabem nos juros
 * contratuais restantes). Caso contrário são exibidos em `notes`, como cobrança
 * independente do saldo. Nenhum cálculo financeiro é feito aqui.
 */
export function buildLoanSummaryPresentation(
  b: LoanOutstandingBreakdown,
  opts: { totalLabel?: string; currentInterestLabel?: string } = {},
): LoanSummaryPresentation {
  const lines: LoanSummaryLine[] = [
    { key: "principal", label: "Principal restante", value: b.principalRemaining, summable: true },
    { key: "interest", label: "Juros restantes", value: b.contractualInterestRemaining, summable: true },
  ];
  const notes: LoanSummaryLine[] = [];
  const cycleLabel = opts.currentInterestLabel ?? "Juros do ciclo atual";

  if (b.currentInterestPending > 0) {
    if (b.currentInterestIncluded) {
      lines.push({
        key: "current-interest",
        label: `${cycleLabel} (incluídos)`,
        value: b.currentInterestPending,
        summable: false,
        detail: true,
        emphasis: "muted",
      });
    } else {
      notes.push({
        key: "current-interest-independent",
        label: `${cycleLabel} (cobrança independente)`,
        value: b.currentInterestPending,
        summable: false,
        emphasis: "muted",
      });
    }
  }


  if (b.penalty > 0) {
    lines.push({ key: "penalty", label: "Multa", value: b.penalty, summable: true, emphasis: "warn" });
  }
  if (b.lateInterest > 0) {
    lines.push({ key: "late-interest", label: "Juros de atraso", value: b.lateInterest, summable: true, emphasis: "warn" });
  }

  const total = round2(lines.filter((l) => l.summable).reduce((s, l) => s + l.value, 0));

  return {
    context: [
      { key: "original", label: "Valor emprestado", value: b.originalPrincipal, summable: false, emphasis: "muted" },
    ],
    lines,
    total,
    totalLabel: opts.totalLabel ?? "Saldo sugerido",
    notes,
  };
}


