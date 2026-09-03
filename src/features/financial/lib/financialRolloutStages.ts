/**
 * ============================================================================
 * ETAPAS OBRIGATÓRIAS DE ATIVAÇÃO + ALLOWLIST (FASE 5)
 * ============================================================================
 *
 * A ordem de ativação é FIXA (Empréstimos → Payment Hub → Dashboard → Metas →
 * Relatórios → Exportações → Telegram) e nenhuma etapa pode ser liberada sem
 * que a anterior esteja aprovada.
 *
 * Módulo PURO: só decide e descreve. Não liga flag, não escreve no banco,
 * não avança percentual automaticamente.
 */

import type { FinancialFeatureFlagState } from "@/features/financial/lib/financialFlagInventory";
import { hashUserId } from "@/features/financial/lib/financialObservability";

export const ACTIVATION_STAGES = [
  "loans",
  "payment_hub",
  "dashboard",
  "goals",
  "reports",
  "exports",
  "telegram",
] as const;

export type ActivationStage = (typeof ACTIVATION_STAGES)[number];

export interface ActivationStageDefinition {
  stage: ActivationStage;
  order: number;
  label: string;
  /** Flag que precisa ser ligada nesta etapa. */
  flag: keyof FinancialFeatureFlagState;
  scope: "build-time" | "edge-runtime";
  /** Campos financeiros que devem fechar dentro de R$ 0,01. */
  validations: string[];
}

export const ACTIVATION_STAGE_DEFINITIONS: ActivationStageDefinition[] = [
  {
    stage: "loans",
    order: 1,
    label: "Etapa 1 — Empréstimos",
    flag: "unifiedLoanCalculation",
    scope: "build-time",
    validations: [
      "principal", "principalPago", "jurosPagos", "jurosPendentes",
      "multaPendente", "jurosAtrasoPendentes", "saldoContratual",
      "totalAReceber", "parcelaVigente", "progresso", "statusFinanceiro",
    ],
  },
  {
    stage: "payment_hub",
    order: 2,
    label: "Etapa 2 — Payment Hub",
    flag: "unifiedLoanCalculation",
    scope: "build-time",
    validations: [
      "saldoAntes", "alocacaoPrevista", "saldoProjetado",
      "validacao", "payloadPersistencia",
    ],
  },
  {
    stage: "dashboard",
    order: 3,
    label: "Etapa 3 — Dashboard",
    flag: "unifiedDashboard",
    scope: "build-time",
    validations: [
      "totalAReceber", "capitalAtivo", "pendenteEmprestimos", "jurosRealizados",
      "principalRecebido", "recebimentosPeriodo", "inadimplencia",
      "contratosEmAtraso", "contratosQuitados", "lucroEstimado",
    ],
  },
  {
    stage: "goals",
    order: 4,
    label: "Etapa 4 — Metas",
    flag: "unifiedGoals",
    scope: "build-time",
    validations: [
      "capitalAtivo", "jurosRealizados", "inadimplencia", "recebimentos",
      "principalRecebido", "contratosQuitados",
      "pontuacaoMensal", "pontuacaoTrimestral", "pontuacaoSemestral", "pontuacaoAnual",
    ],
  },
  {
    stage: "reports",
    order: 5,
    label: "Etapa 5 — Relatórios internos",
    flag: "unifiedReports",
    scope: "build-time",
    validations: [
      "relatorioMensal", "relatorioAnual", "relatorioPorCliente", "relatorioPorContrato",
      "relatorioJuros", "relatorioMultas", "relatorioInadimplencia", "relatorioCapitalAtivo",
    ],
  },
  {
    stage: "exports",
    order: 6,
    label: "Etapa 6 — Exportações",
    flag: "unifiedReports",
    scope: "build-time",
    validations: ["csv", "json", "pdf", "excel", "formatacaoPtBr", "totalizadores"],
  },
  {
    stage: "telegram",
    order: 7,
    label: "Etapa 7 — Telegram",
    flag: "unifiedTelegramReports",
    scope: "edge-runtime",
    validations: [
      "capitalAtivo", "totalAReceber", "jurosRealizados", "principalRecebido",
      "inadimplencia", "multas", "jurosAtraso", "recebimentos",
    ],
  },
];

export function stageDefinition(stage: ActivationStage): ActivationStageDefinition {
  return ACTIVATION_STAGE_DEFINITIONS.find((s) => s.stage === stage)!;
}

/* ==========================================================================
 * JANELA MÍNIMA DE OBSERVAÇÃO
 * ========================================================================== */

export type RolloutLevel = "allowlist" | "p5" | "p25" | "p50" | "p100";

export interface ObservationRequirement {
  level: RolloutLevel;
  label: string;
  percentage: number;
  minBusinessDays: number;
  /** Alternativa ao tempo quando o volume de uso é baixo. */
  minOperations: {
    loanViews: number;
    paymentHubOpens: number;
    controlledPayments: number;
    dashboardLoads: number;
    reports: number;
    telegramReports: number;
  };
}

export const OBSERVATION_REQUIREMENTS: ObservationRequirement[] = [
  {
    level: "allowlist",
    label: "Allowlist",
    percentage: 0,
    minBusinessDays: 1,
    minOperations: { loanViews: 50, paymentHubOpens: 20, controlledPayments: 10, dashboardLoads: 20, reports: 10, telegramReports: 5 },
  },
  {
    level: "p5",
    label: "5%",
    percentage: 5,
    minBusinessDays: 2,
    minOperations: { loanViews: 50, paymentHubOpens: 20, controlledPayments: 10, dashboardLoads: 20, reports: 10, telegramReports: 5 },
  },
  {
    level: "p25",
    label: "25%",
    percentage: 25,
    minBusinessDays: 3,
    minOperations: { loanViews: 50, paymentHubOpens: 20, controlledPayments: 10, dashboardLoads: 20, reports: 10, telegramReports: 5 },
  },
  {
    level: "p50",
    label: "50%",
    percentage: 50,
    minBusinessDays: 5,
    minOperations: { loanViews: 50, paymentHubOpens: 20, controlledPayments: 10, dashboardLoads: 20, reports: 10, telegramReports: 5 },
  },
  {
    level: "p100",
    label: "100%",
    percentage: 100,
    minBusinessDays: 5,
    minOperations: { loanViews: 50, paymentHubOpens: 20, controlledPayments: 10, dashboardLoads: 20, reports: 10, telegramReports: 5 },
  },
];

export interface UsageCounters {
  businessDaysObserved?: number;
  loanViews?: number;
  paymentHubOpens?: number;
  controlledPayments?: number;
  dashboardLoads?: number;
  reports?: number;
  telegramReports?: number;
}

export interface ObservationResult {
  level: RolloutLevel;
  satisfied: boolean;
  bySeason: "time" | "volume" | "none";
  missing: string[];
}

/** Janela satisfeita por TEMPO ou por VOLUME mínimo de operações. */
export function evaluateObservationWindow(level: RolloutLevel, usage: UsageCounters): ObservationResult {
  const req = OBSERVATION_REQUIREMENTS.find((r) => r.level === level)!;
  const timeOk = (usage.businessDaysObserved ?? 0) >= req.minBusinessDays;

  const volumeChecks: [string, number, number][] = [
    ["visualizações de contrato", usage.loanViews ?? 0, req.minOperations.loanViews],
    ["aberturas do Payment Hub", usage.paymentHubOpens ?? 0, req.minOperations.paymentHubOpens],
    ["pagamentos controlados", usage.controlledPayments ?? 0, req.minOperations.controlledPayments],
    ["carregamentos do Dashboard", usage.dashboardLoads ?? 0, req.minOperations.dashboardLoads],
    ["relatórios", usage.reports ?? 0, req.minOperations.reports],
    ["relatórios Telegram", usage.telegramReports ?? 0, req.minOperations.telegramReports],
  ];
  const missingVolume = volumeChecks
    .filter(([, actual, expected]) => actual < expected)
    .map(([label, actual, expected]) => `${label}: ${actual}/${expected}`);
  const volumeOk = missingVolume.length === 0;

  if (timeOk) return { level, satisfied: true, bySeason: "time", missing: [] };
  if (volumeOk) return { level, satisfied: true, bySeason: "volume", missing: [] };
  return {
    level,
    satisfied: false,
    bySeason: "none",
    missing: [
      `dias úteis: ${usage.businessDaysObserved ?? 0}/${req.minBusinessDays}`,
      ...missingVolume,
    ],
  };
}

/* ==========================================================================
 * ESTADO E PORTÕES DE CADA ETAPA
 * ========================================================================== */

export type StageStatus = "not_started" | "in_validation" | "approved" | "paused" | "rolled_back";

export interface StageState {
  stage: ActivationStage;
  status: StageStatus;
  /** Validação funcional + financeira dentro de R$ 0,01. */
  functionalValidated: boolean;
  financialValidated: boolean;
  parityOk: boolean;
  performanceOk: boolean;
  logsReviewed: boolean;
  alertsReviewed: boolean;
  rollbackTested: boolean;
  manuallyApproved: boolean;
  usage?: UsageCounters;
  notes?: string;
}

export function emptyStageState(stage: ActivationStage): StageState {
  return {
    stage,
    status: "not_started",
    functionalValidated: false,
    financialValidated: false,
    parityOk: false,
    performanceOk: false,
    logsReviewed: false,
    alertsReviewed: false,
    rollbackTested: false,
    manuallyApproved: false,
  };
}

export interface StageGate {
  stage: ActivationStage;
  label: string;
  canActivate: boolean;
  canApprove: boolean;
  blockers: string[];
  pendingChecks: string[];
}

const CHECK_LABELS: [keyof StageState, string][] = [
  ["functionalValidated", "validação funcional"],
  ["financialValidated", "validação financeira (R$ 0,01)"],
  ["parityOk", "paridade entre módulos"],
  ["performanceOk", "performance"],
  ["logsReviewed", "revisão de logs"],
  ["alertsReviewed", "revisão de alertas"],
  ["rollbackTested", "rollback da etapa testado"],
  ["manuallyApproved", "aprovação manual"],
];

/**
 * Portões por etapa. `canActivate` respeita a ORDEM OBRIGATÓRIA: a etapa N só
 * pode ser ligada quando 1..N-1 estão aprovadas e a prontidão real está ok.
 */
export function evaluateStageGates(
  states: StageState[],
  options: { readinessApproved: boolean; baselineComplete: boolean } = {
    readinessApproved: false,
    baselineComplete: false,
  },
): StageGate[] {
  const byStage = new Map(states.map((s) => [s.stage, s]));

  return ACTIVATION_STAGE_DEFINITIONS.map((def) => {
    const state = byStage.get(def.stage) ?? emptyStageState(def.stage);
    const previous = ACTIVATION_STAGE_DEFINITIONS.filter((d) => d.order < def.order);
    const unapprovedPrevious = previous.filter(
      (d) => (byStage.get(d.stage) ?? emptyStageState(d.stage)).status !== "approved",
    );

    const blockers: string[] = [];
    if (!options.baselineComplete) blockers.push("linha de base legada incompleta");
    if (!options.readinessApproved) blockers.push("checklist de prontidão não aprovado");
    if (unapprovedPrevious.length > 0) {
      blockers.push(`etapas anteriores pendentes: ${unapprovedPrevious.map((d) => d.label).join(", ")}`);
    }
    if (state.status === "paused") blockers.push("etapa pausada por incidente");

    const pendingChecks = CHECK_LABELS
      .filter(([key]) => state[key] !== true)
      .map(([, label]) => label);

    return {
      stage: def.stage,
      label: def.label,
      canActivate: blockers.length === 0,
      canApprove: blockers.length === 0 && pendingChecks.length === 0,
      blockers,
      pendingChecks,
    };
  });
}

/** Próxima etapa autorizada a ligar — ou `null` quando nada está liberado. */
export function nextActivatableStage(gates: StageGate[]): StageGate | null {
  return gates.find((g) => g.canActivate && !g.canApprove) ?? gates.find((g) => g.canActivate) ?? null;
}

/* ==========================================================================
 * ALLOWLIST REGISTRADA
 * ========================================================================== */

export interface AllowlistEntry {
  userIdHash: string;
  addedAt: string;
  environment: string;
  flags: string[];
  responsible: string;
  reason: string;
  result?: "pending" | "validated" | "rolled_back";
}

export interface AllowlistRegistrationInput {
  userId: string;
  addedAt?: string;
  environment: string;
  flags: string[];
  responsible: string;
  reason: string;
  result?: AllowlistEntry["result"];
}

/** Registra a inclusão SEM guardar o userId em claro (apenas hash curto). */
export function registerAllowlistEntry(input: AllowlistRegistrationInput): AllowlistEntry {
  return {
    userIdHash: hashUserId(input.userId) ?? "unknown",
    addedAt: input.addedAt ?? new Date().toISOString(),
    environment: input.environment,
    flags: [...input.flags],
    responsible: input.responsible,
    reason: input.reason,
    result: input.result ?? "pending",
  };
}

/** Aumentar percentual nunca remove quem já está na allowlist. */
export function mergeAllowlist(current: AllowlistEntry[], incoming: AllowlistEntry[]): AllowlistEntry[] {
  const map = new Map(current.map((e) => [e.userIdHash, e]));
  for (const entry of incoming) {
    const existing = map.get(entry.userIdHash);
    map.set(entry.userIdHash, existing ? { ...existing, ...entry, addedAt: existing.addedAt } : entry);
  }
  return [...map.values()];
}

/* ==========================================================================
 * AVANÇO DE PERCENTUAL
 * ========================================================================== */

export interface PercentageAdvanceInput {
  currentLevel: RolloutLevel;
  usage: UsageCounters;
  criticalIncidents: number;
  wrongChargeIncidents: number;
  negativeBalanceIncidents: number;
  settledReappearIncidents: number;
  parityLargestDifference: number;
  errorRateStable: boolean;
  performanceAcceptable: boolean;
  manuallyApproved: boolean;
  allStagesApproved: boolean;
}

export interface PercentageAdvanceDecision {
  allowed: boolean;
  from: RolloutLevel;
  to: RolloutLevel | null;
  blockers: string[];
}

const LEVEL_ORDER: RolloutLevel[] = ["allowlist", "p5", "p25", "p50", "p100"];

/** Decide (nunca aplica) se o percentual pode avançar. */
export function evaluatePercentageAdvance(input: PercentageAdvanceInput): PercentageAdvanceDecision {
  const idx = LEVEL_ORDER.indexOf(input.currentLevel);
  const to = idx >= 0 && idx < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[idx + 1] : null;
  const blockers: string[] = [];

  if (!input.allStagesApproved) blockers.push("existem etapas de módulo não aprovadas");
  const window = evaluateObservationWindow(input.currentLevel, input.usage);
  if (!window.satisfied) blockers.push(`janela de observação incompleta (${window.missing.join("; ")})`);
  if (input.criticalIncidents > 0) blockers.push(`${input.criticalIncidents} incidente(s) crítico(s) em aberto`);
  if (input.wrongChargeIncidents > 0) blockers.push("cobrança indevida registrada");
  if (input.negativeBalanceIncidents > 0) blockers.push("saldo negativo registrado");
  if (input.settledReappearIncidents > 0) blockers.push("contrato quitado reaparecendo");
  if (Math.abs(input.parityLargestDifference) > 0.01) {
    blockers.push(`paridade fora da tolerância (R$ ${Math.abs(input.parityLargestDifference).toFixed(2)})`);
  }
  if (!input.errorRateStable) blockers.push("taxa de erro instável");
  if (!input.performanceAcceptable) blockers.push("performance inaceitável");
  if (!input.manuallyApproved) blockers.push("sem aprovação manual");
  if (!to) blockers.push("já está em 100%");

  return { allowed: blockers.length === 0 && to != null, from: input.currentLevel, to, blockers };
}
