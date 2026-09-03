/**
 * ============================================================================
 * FONTE ÚNICA DE CÁLCULO FINANCEIRO DE CONTRATOS
 * ============================================================================
 *
 * `calculateLoanFinancialState` é uma função PURA: não consulta Supabase, não
 * escreve no banco, não altera histórico. Recebe o contrato, os pagamentos, o
 * cronograma e (opcionalmente) as renegociações e devolve a composição
 * financeira completa, com cada valor tendo uma origem explícita:
 *
 *   principal | juros contratuais | multa | juros de atraso
 *
 * Regras oficiais implementadas aqui (ver docs/unified-financial-calculation.md):
 *   principalRemaining            = principal original − principal pago  (0..principal)
 *   contractualInterestRemaining  = juros contratuais totais − juros contratuais pagos
 *   penaltyPending                = multa aplicada − multa paga
 *   lateInterestPending           = juros de atraso calculados − juros de atraso pagos
 *   contractualBalanceRemaining   = principalRemaining + contractualInterestRemaining
 *   totalReceivable = payoffAmount = saldo contratual + multa pendente + juros atraso pendentes
 *
 * `loan.remainingAmount` é tratado como CACHE validável: o saldo é calculado
 * pelo histórico e apenas comparado com o campo persistido; divergências
 * acima de R$ 0,01 entram em `warnings`. Nada é gravado no banco.
 */

import type { InstallmentSchedule, Loan, Payment, LoanRenegotiation } from "@/types/loan";
import { roundCurrency, distributeCurrency, isMoneyDivergent } from "@/lib/money";
import { allocateInterestByPayment } from "@/features/financial/lib/interestAllocation";

const EPS = 0.01;

export interface LoanFinancialState {
  loanId: string;
  originalPrincipal: number;

  principalPaid: number;
  principalRemaining: number;

  contractualInterestTotal: number;
  contractualInterestPaid: number;
  contractualInterestRemaining: number;

  currentInstallmentNumber: number | null;
  currentInstallmentDue: number;
  currentInstallmentPrincipal: number;
  currentInstallmentInterest: number;
  currentInstallmentPaid: number;
  currentInstallmentRemaining: number;

  penaltyApplied: number;
  penaltyPaid: number;
  penaltyPending: number;

  lateInterestApplied: number;
  lateInterestPaid: number;
  lateInterestPending: number;

  daysOverdue: number;
  overdueAmount: number;

  contractualBalanceRemaining: number;
  totalReceivable: number;
  payoffAmount: number;

  calculationSource: string;
  warnings: string[];
}

/** Base sobre a qual o juro de atraso percentual incide. */
export type LateInterestBase = "contract_balance" | "overdue_installments";

export interface LoanFinancialInput {
  loan: Loan;
  payments: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  renegotiations?: LoanRenegotiation[];
  /** ISO date (YYYY-MM-DD). Default: hoje (chamador deve passar o TZ do app). */
  calculationDate?: string;
  /**
   * Regra atual do app = "contract_balance" (juro de atraso sobre o saldo).
   * Mantida como default para NÃO alterar silenciosamente a regra de negócio.
   */
  lateInterestBase?: LateInterestBase;
}

/** Mesma fórmula legada de `calculateTotalWithInterest` (mantida para paridade). */
function legacyTotalWithInterest(principal: number, rate: number): number {
  return Math.round(principal * (1 + rate / 100));
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`).getTime();
  const b = new Date(`${toIso}T00:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / 86_400_000);
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface PaymentComponents {
  principal: number;
  interest: number;
  penalty: number;
  lateInterest: number;
  /** Parcela à qual o pagamento pertence (quando identificável). */
  installmentNumber: number | null;
  source: "metadata" | "kind" | "type" | "allocation" | "schedule";
}

/**
 * Composição oficial dos valores devidos por parcela.
 * Prioridade: 1) interest_amount/principal_amount do cronograma persistido,
 * 2) composição do cadastro (valores reais do cronograma),
 * 3) divisão uniforme dos juros, 4) proporcional ao valor da parcela.
 */
export function buildOfficialInstallmentPlan(
  loan: Loan,
  schedules: InstallmentSchedule[],
): { plan: { installmentNumber: number; due: number; principal: number; interest: number }[]; source: string } {
  const principal = Math.max(0, Number(loan.amount) || 0);
  const N = Math.max(1, Math.floor(Number(loan.installments) || 1));
  const own = schedules
    .filter((s) => s.loanId === loan.id && s.installmentNumber >= 1 && s.installmentNumber <= N)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);

  const hasFullSchedule = own.length === N;
  const persisted = own.map((s) => ({
    n: s.installmentNumber,
    due: roundCurrency(Number(s.amount) || 0),
    interest: num((s as any).interestAmount ?? (s as any).interest_amount),
    principal: num((s as any).principalAmount ?? (s as any).principal_amount),
  }));

  // 1) composição persistida por parcela (quando completa e coerente).
  if (hasFullSchedule && persisted.every((p) => p.interest != null && p.principal != null)) {
    return {
      source: "schedule_persisted_split",
      plan: persisted.map((p) => ({
        installmentNumber: p.n,
        due: p.due,
        principal: roundCurrency(p.principal!),
        interest: roundCurrency(p.interest!),
      })),
    };
  }

  const dues = hasFullSchedule
    ? persisted.map((p) => p.due)
    : distributeCurrency(legacyTotalWithInterest(principal, Number(loan.interestRate) || 0), N);
  const totalDue = roundCurrency(dues.reduce((s, v) => s + v, 0));
  const contractTotal = Math.max(totalDue, legacyTotalWithInterest(principal, Number(loan.interestRate) || 0));
  const interestTotal = roundCurrency(Math.max(0, contractTotal - principal));

  // 3) divisão uniforme dos juros; 4) proporcional ao valor da parcela quando
  //    o cronograma tem parcelas de valores diferentes.
  const uniform = dues.every((d) => Math.abs(d - dues[0]) <= EPS);
  const interests = uniform
    ? distributeCurrency(interestTotal, N)
    : distributeCurrency(interestTotal, N, dues);

  return {
    source: hasFullSchedule
      ? (uniform ? "schedule_uniform_interest" : "schedule_prorata_interest")
      : "computed_uniform_interest",
    plan: dues.map((due, i) => ({
      installmentNumber: i + 1,
      due,
      interest: interests[i],
      principal: roundCurrency(due - interests[i]),
    })),
  };
}

/**
 * Classifica UM pagamento em principal / juros contratuais / multa / juros de
 * atraso. Valores persistidos em `metadata` sempre têm prioridade — histórico
 * NUNCA é reinterpretado.
 */
function classifyPayment(
  p: Payment,
  ctx: {
    interestByPayment: Map<string, number>;
    plan: { installmentNumber: number; due: number; principal: number; interest: number }[];
    warnings: string[];
  },
): PaymentComponents {
  const amount = Math.max(0, Number(p.amount) || 0);
  const md = (p.metadata ?? null) as any;
  const declaredInstallment = num(md?.installment_number ?? md?.installmentNumber);
  const inst = p.installmentNumber;
  const installmentNumber = inst >= 1 ? inst : declaredInstallment;

  const zero: PaymentComponents = {
    principal: 0, interest: 0, penalty: 0, lateInterest: 0, installmentNumber, source: "type",
  };
  if (amount <= 0) return zero;

  // 1) Composição persistida no metadata (allocation_version ou legado).
  const mdPrincipal = num(md?.principal_amount);
  const mdInterest = num(md?.interest_amount);
  const mdPenalty = num(md?.penalty_amount);
  const mdLate = num(md?.late_interest_amount);
  if (mdPrincipal != null || mdInterest != null || mdPenalty != null || mdLate != null) {
    const principal = Math.max(0, mdPrincipal ?? 0);
    const interest = Math.max(0, mdInterest ?? 0);
    const penalty = Math.max(0, mdPenalty ?? 0);
    const lateInterest = Math.max(0, mdLate ?? 0);
    const sum = roundCurrency(principal + interest + penalty + lateInterest);
    if (isMoneyDivergent(sum, amount)) {
      // Não reinterpreta o que foi persistido: registra o resíduo como
      // principal (ou aviso quando o principal também está persistido).
      const residue = roundCurrency(amount - sum);
      if (mdPrincipal == null && residue > 0) {
        return { principal: residue, interest, penalty, lateInterest, installmentNumber, source: "metadata" };
      }
      ctx.warnings.push(
        `pagamento ${p.id}: composição persistida (R$ ${sum.toFixed(2)}) diverge do valor pago (R$ ${amount.toFixed(2)})`,
      );
    }
    return { principal, interest, penalty, lateInterest, installmentNumber, source: "metadata" };
  }

  // 2) Encargos puros identificados por `kind`.
  if (md?.kind === "penalty") {
    return { ...zero, penalty: roundCurrency(amount), source: "kind" };
  }
  if (md?.kind === "late_fee" || md?.kind === "late_interest") {
    return { ...zero, lateInterest: roundCurrency(amount), source: "kind" };
  }

  // 3) Tipos oficiais de pagamento.
  if (inst === 0 || inst === -2) {
    // Juros avulsos / juros do ciclo → 100% juros, 0% principal.
    return { ...zero, interest: roundCurrency(amount), source: "type" };
  }
  if (inst === -3) {
    // Amortização → 100% principal.
    return { ...zero, principal: roundCurrency(amount), source: "type" };
  }
  if (inst === -1) {
    // Parcial legado sem metadata: regra oficial vigente (juros primeiro),
    // lida da fonte única de alocação para preservar o histórico.
    const interest = roundCurrency(Math.min(amount, ctx.interestByPayment.get(p.id) ?? 0));
    return { ...zero, interest, principal: roundCurrency(amount - interest), source: "allocation" };
  }

  // 4) Parcela regular: composição oficial da parcela.
  const entry = ctx.plan.find((e) => e.installmentNumber === inst);
  if (entry) {
    const interest = roundCurrency(Math.min(entry.interest, amount));
    return { ...zero, interest, principal: roundCurrency(amount - interest), source: "schedule" };
  }
  const interest = roundCurrency(Math.min(amount, ctx.interestByPayment.get(p.id) ?? 0));
  return { ...zero, interest, principal: roundCurrency(amount - interest), source: "allocation" };
}

export function calculateLoanFinancialState(input: LoanFinancialInput): LoanFinancialState {
  const { loan, payments } = input;
  const schedules = input.installmentSchedules ?? [];
  const calculationDate = input.calculationDate ?? new Date().toISOString().slice(0, 10);
  const lateInterestBase: LateInterestBase = input.lateInterestBase ?? "contract_balance";
  const warnings: string[] = [];

  const originalPrincipal = roundCurrency(Math.max(0, Number(loan.amount) || 0));
  const isPaid = loan.status === "paid";
  const loanPayments = payments.filter((p) => p.loanId === loan.id);

  const { plan, source: planSource } = buildOfficialInstallmentPlan(loan, schedules);
  const contractualInterestTotal = roundCurrency(plan.reduce((s, e) => s + e.interest, 0));

  const interestByPayment = allocateInterestByPayment([loan as any], loanPayments as any);
  const ctx = { interestByPayment, plan, warnings };

  const components = loanPayments.map((p) => ({ p, c: classifyPayment(p, ctx) }));

  const rawPrincipalPaid = roundCurrency(components.reduce((s, x) => s + x.c.principal, 0));
  const rawInterestPaid = roundCurrency(components.reduce((s, x) => s + x.c.interest, 0));
  const penaltyPaid = roundCurrency(components.reduce((s, x) => s + x.c.penalty, 0));
  const lateInterestPaid = roundCurrency(components.reduce((s, x) => s + x.c.lateInterest, 0));

  const principalPaid = rawPrincipalPaid;
  const principalRemaining = isPaid ? 0 : roundCurrency(Math.max(0, originalPrincipal - principalPaid));

  // Juros contratuais pagos
  const contractualInterestPaid = rawInterestPaid;
  const contractualInterestRemaining = isPaid
    ? 0
    : roundCurrency(Math.max(0, contractualInterestTotal - contractualInterestPaid));

  const contractualBalanceRemaining = roundCurrency(principalRemaining + contractualInterestRemaining);

  // --- remainingAmount é CACHE: valida, avisa, nunca grava. -----------------
  const persistedRemaining = num(loan.remainingAmount);
  let calculationSource = `computed:${planSource}`;
  if (!isPaid && persistedRemaining != null && persistedRemaining > 0) {
    if (isMoneyDivergent(persistedRemaining, contractualBalanceRemaining)) {
      warnings.push(
        `remainingAmount diverge do cálculo por pagamentos em R$ ${Math.abs(
          roundCurrency(persistedRemaining - contractualBalanceRemaining),
        ).toFixed(2)}`,
      );
      calculationSource += "+remainingAmount_divergent";
    } else {
      calculationSource += "+remainingAmount_ok";
    }
  }

  // --- Parcela vigente ------------------------------------------------------
  const paidByInstallment = new Map<number, number>();
  for (const { c } of components) {
    if (c.installmentNumber == null || c.installmentNumber < 1) continue;
    const applied = roundCurrency(c.principal + c.interest); // encargos não quitam parcela
    paidByInstallment.set(c.installmentNumber, roundCurrency((paidByInstallment.get(c.installmentNumber) ?? 0) + applied));
  }

  let current: (typeof plan)[number] | null = null;
  if (!isPaid) {
    current = plan.find((e) => roundCurrency(e.due - (paidByInstallment.get(e.installmentNumber) ?? 0)) > EPS) ?? null;
    if (!current) current = null;
  }
  const counterNext = Math.min(plan.length, Math.max(1, (Number(loan.paidInstallments) || 0) + 1));
  if (!isPaid && current && current.installmentNumber !== counterNext) {
    warnings.push(
      `paidInstallments (${loan.paidInstallments}) divergente do cronograma — parcela vigente pelo saldo é ${current.installmentNumber}`,
    );
  }
  const currentPaid = current ? roundCurrency(Math.min(current.due, paidByInstallment.get(current.installmentNumber) ?? 0)) : 0;

  // --- Encargos de atraso (granular por parcela) ----------------------------
  const dueDateOf = (n: number) =>
    schedules.find((s) => s.loanId === loan.id && s.installmentNumber === n)?.dueDate ?? loan.dueDate;

  const overdueEntries = isPaid
    ? []
    : plan.filter((e) => {
        const paid = paidByInstallment.get(e.installmentNumber) ?? 0;
        
        // Verificamos se há principal pendente nesta parcela específica.
        // Já calculamos isso na classifyPayment, mas aqui estamos analisando o estado ATUAL.
        
        // Para simplificar e ser fiel à regra: uma parcela está "vencida" se 
        // seu saldo pendente total for > 0 e a data passou.
        // Atraso considera apenas parcelas nominais (installmentNumber > 0).
        return e.installmentNumber > 0 && roundCurrency(e.due - paid) > EPS && dueDateOf(e.installmentNumber) < calculationDate;
      });

  let lateInterestApplied = 0;
  let penaltyApplied = 0;

  if (!isPaid) {
    // Multa: compõe o valor devido mesmo que o contrato/parcela não esteja vencido
    if (loan.penaltyValue != null && Number(loan.penaltyValue) > 0) {
      const multiplier = overdueEntries.length > 0 ? overdueEntries.length : 1;
      penaltyApplied = roundCurrency(Math.max(0, Number(loan.penaltyValue)) * multiplier);
    }

    // Mora (juros diários): calculada estritamente para entradas vencidas (comportamento inalterado)
    for (const entry of overdueEntries) {
      const dueDate = dueDateOf(entry.installmentNumber);
      const days = Math.max(0, daysBetween(dueDate, calculationDate));
      if (days <= 0) continue;

      const pendingAmount = roundCurrency(entry.due - (paidByInstallment.get(entry.installmentNumber) ?? 0));
      const lateBase = lateInterestBase === "contract_balance" ? contractualBalanceRemaining : pendingAmount;
      
      if (loan.lateInterestValue != null && loan.lateInterestValue > 0) {
        const mora = loan.lateInterestType === "fixed"
          ? roundCurrency(loan.lateInterestValue * days)
          : roundCurrency(lateBase * (loan.lateInterestValue / 100) * days);
        lateInterestApplied = roundCurrency(lateInterestApplied + mora);
      }
    }
  }

  const daysOverdue = isPaid ? 0 : (current ? Math.max(0, daysBetween(dueDateOf(current.installmentNumber), calculationDate)) : 0);
  const overdueAmount = roundCurrency(
    overdueEntries.reduce((s, e) => s + Math.max(0, e.due - (paidByInstallment.get(e.installmentNumber) ?? 0)), 0),
  );

  // Encargos pagos abatem os encargos aplicados — nunca o saldo contratual.
  const penaltyPending = roundCurrency(Math.max(0, penaltyApplied - penaltyPaid));
  const lateInterestPending = roundCurrency(Math.max(0, lateInterestApplied - lateInterestPaid));

  const payoffAmount = isPaid
    ? 0
    : roundCurrency(principalRemaining + contractualInterestRemaining + penaltyPending + lateInterestPending);

  return {
    loanId: loan.id,
    originalPrincipal,

    principalPaid,
    principalRemaining,

    contractualInterestTotal,
    contractualInterestPaid,
    contractualInterestRemaining,

    currentInstallmentNumber: current?.installmentNumber ?? null,
    currentInstallmentDue: current ? roundCurrency(current.due) : 0,
    currentInstallmentPrincipal: current ? roundCurrency(current.principal) : 0,
    currentInstallmentInterest: current ? roundCurrency(current.interest) : 0,
    currentInstallmentPaid: currentPaid,
    currentInstallmentRemaining: current ? roundCurrency(Math.max(0, current.due - currentPaid)) : 0,

    penaltyApplied,
    penaltyPaid,
    penaltyPending,

    lateInterestApplied,
    lateInterestPaid,
    lateInterestPending,

    daysOverdue,
    overdueAmount,

    contractualBalanceRemaining,
    totalReceivable: payoffAmount,
    payoffAmount,

    calculationSource,
    warnings,
  };
}
