import { ScenarioComputed, SimulationScenario, PaymentFrequency } from "@/types/loanSimulation";

/** Divisor da taxa mensal conforme frequência (parcelas dentro de um mês). */
export function frequencyDivisor(freq: PaymentFrequency | undefined): number {
  switch (freq) {
    case "biweekly": return 2;
    case "weekly": return 4;
    case "daily": return 30;
    case "monthly":
    default: return 1;
  }
}

export function frequencyLabel(freq: PaymentFrequency | undefined): string {
  switch (freq) {
    case "biweekly": return "Quinzenal";
    case "weekly": return "Semanal";
    case "daily": return "Diária";
    case "monthly":
    default: return "Mensal";
  }
}

/** Compute derived values from a scenario based on its mode/model. */
export function computeScenario(s: SimulationScenario): ScenarioComputed {
  const amount = Number(s.amount) || 0;
  const monthlyRate = Number(s.monthlyRate) || 0;
  const n = Math.max(1, Math.floor(Number(s.installments) || 1));
  const freq = s.frequency || "monthly";
  const divisor = frequencyDivisor(freq);
  const periodRate = monthlyRate / divisor; // % por parcela
  const r = periodRate / 100;

  let installmentValue = Number(s.installmentValue) || 0;
  let totalPayable = 0;
  let totalInterest = 0;

  if (s.calcMode === "auto") {
    if (s.interestModel === "simple") {
      totalInterest = amount * r * n;
      totalPayable = amount + totalInterest;
      installmentValue = totalPayable / n;
    } else {
      if (r === 0) {
        installmentValue = amount / n;
      } else {
        installmentValue = (amount * r) / (1 - Math.pow(1 + r, -n));
      }
      totalPayable = installmentValue * n;
      totalInterest = totalPayable - amount;
    }
  } else {
    totalPayable = installmentValue * n;
    totalInterest = totalPayable - amount;
  }

  const monthlyInterestValue = amount * (monthlyRate / 100);

  return {
    ...s,
    frequency: freq,
    installmentValue: round2(installmentValue),
    totalPayable: round2(totalPayable),
    totalInterest: round2(totalInterest),
    monthlyInterestValue: round2(monthlyInterestValue),
    periodRate: round4(periodRate),
  };
}

function round2(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function round4(v: number) {
  return Math.round((v + Number.EPSILON) * 10000) / 10000;
}

export function newScenario(partial?: Partial<SimulationScenario>): SimulationScenario {
  return {
    id: crypto.randomUUID(),
    amount: 1000,
    monthlyRate: 10,
    installments: 3,
    installmentValue: 0,
    interestModel: "simple",
    calcMode: "auto",
    frequency: "monthly",
    ...partial,
  };
}

export interface ScenarioHighlights {
  lowestTotalId?: string;
  lowestInstallmentId?: string;
  highestReturnId?: string;
  bestApprovalId?: string;
  bestReturnId?: string;
}

export function computeHighlights(scenarios: ScenarioComputed[]): ScenarioHighlights {
  if (scenarios.length === 0) return {};

  const lowestTotal = [...scenarios].sort((a, b) => a.totalPayable - b.totalPayable)[0];
  const lowestInstallment = [...scenarios].sort((a, b) => a.installmentValue - b.installmentValue)[0];
  const highestReturn = [...scenarios].sort((a, b) => b.totalInterest - a.totalInterest)[0];

  // Best approval: menor parcela relativa ao valor + menor prazo (mais fácil de aprovar)
  const bestApproval = [...scenarios].sort((a, b) => {
    const ratioA = (a.installmentValue / Math.max(1, a.amount)) + a.installments * 0.01;
    const ratioB = (b.installmentValue / Math.max(1, b.amount)) + b.installments * 0.01;
    return ratioA - ratioB;
  })[0];

  // Best return: maior juros total ponderado por taxa
  const bestReturn = [...scenarios].sort(
    (a, b) => b.totalInterest * (1 + b.monthlyRate / 100) - a.totalInterest * (1 + a.monthlyRate / 100),
  )[0];

  return {
    lowestTotalId: lowestTotal.id,
    lowestInstallmentId: lowestInstallment.id,
    highestReturnId: highestReturn.id,
    bestApprovalId: bestApproval.id,
    bestReturnId: bestReturn.id,
  };
}

export function formatBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}
