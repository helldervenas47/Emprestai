/**
 * ============================================================================
 * OBSERVABILIDADE E ALERTAS FINANCEIROS (FASE 4)
 * ============================================================================
 *
 * Eventos estruturados, sem NENHUM dado pessoal: nada de nome, CPF, RG,
 * telefone, e-mail, dados bancários, token, JWT ou segredo. O identificador do
 * usuário entra apenas como hash curto e irreversível na prática.
 *
 * O sink default é o console (dev/preview) + buffer em memória consultável pelo
 * painel de diagnóstico. Nenhuma escrita em banco.
 */

import { UNIFIED_FINANCIAL_VERSION } from "@/features/financial/lib/financialVersion";
import { stableHash } from "@/features/financial/lib/financialRollout";

export const FINANCIAL_EVENTS = [
  "financial_unified_calculation_used",
  "financial_legacy_calculation_used",
  "financial_calculation_divergence",
  "financial_module_parity_failure",
  "financial_payment_simulation_mismatch",
  "financial_negative_balance_detected",
  "financial_settled_contract_positive_balance",
  "financial_cache_divergence",
  "financial_rollout_flag_changed",
  "financial_rollout_rollback",
] as const;

export type FinancialEventName = (typeof FINANCIAL_EVENTS)[number];
export type FinancialSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface FinancialObservationEvent {
  event: FinancialEventName;
  calculationVersion: string;
  loanId?: string;
  userIdHash?: string;
  module?: string;
  metric?: string;
  oldValue?: number;
  newValue?: number;
  difference?: number;
  severity?: FinancialSeverity;
  timestamp: string;
}

const FORBIDDEN_KEYS = [
  "name", "clientname", "borrowername", "cpf", "cnpj", "rg", "phone", "telefone",
  "email", "bank", "banco", "token", "jwt", "secret", "password", "apikey",
];

/** Remove qualquer campo com aparência de dado pessoal/sensível. */
export function sanitizeEventPayload<T extends Record<string, unknown>>(payload: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (FORBIDDEN_KEYS.some((f) => k.toLowerCase().includes(f))) continue;
    out[k] = v;
  }
  return out as T;
}

/** Hash curto e estável do usuário (não reversível na prática). */
export function hashUserId(userId?: string | null): string | undefined {
  if (!userId) return undefined;
  return stableHash(`observability:${userId}`).toString(16).padStart(8, "0");
}

const MAX_BUFFER = 200;
const buffer: FinancialObservationEvent[] = [];
let sink: ((event: FinancialObservationEvent) => void) | null = null;

/** Permite que o app envie os eventos para outro destino (ex.: log próprio). */
export function setFinancialObservabilitySink(fn: ((e: FinancialObservationEvent) => void) | null) {
  sink = fn;
}

export function getFinancialEventBuffer(): FinancialObservationEvent[] {
  return [...buffer];
}

export function clearFinancialEventBuffer() {
  buffer.length = 0;
  dedupe.clear();
}

export function recordFinancialEvent(
  event: FinancialEventName,
  data: Omit<Partial<FinancialObservationEvent>, "event" | "timestamp" | "calculationVersion"> = {},
): FinancialObservationEvent {
  const payload = sanitizeEventPayload({
    ...data,
    event,
    calculationVersion: UNIFIED_FINANCIAL_VERSION,
    timestamp: new Date().toISOString(),
  }) as FinancialObservationEvent;

  buffer.push(payload);
  if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
  if (sink) sink(payload);
  return payload;
}

/* ==========================================================================
 * ALERTAS OPERACIONAIS COM DEDUPLICAÇÃO
 * ========================================================================== */

export interface FinancialAlert {
  code: string;
  severity: FinancialSeverity;
  message: string;
  loanId?: string;
  module?: string;
  difference?: number;
}

const dedupe = new Map<string, number>();
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

/** `true` quando o alerta deve ser emitido (fora da janela de deduplicação). */
export function shouldEmitAlert(alert: FinancialAlert, now = Date.now()): boolean {
  const key = `${alert.code}:${alert.loanId ?? ""}:${alert.module ?? ""}`;
  const last = dedupe.get(key);
  if (last != null && now - last < DEDUPE_WINDOW_MS) return false;
  dedupe.set(key, now);
  return true;
}

export const ALERT_DIFFERENCE_THRESHOLD = 10;

export interface AlertInput {
  loanId?: string;
  module?: string;
  difference?: number;
  totalReceivable?: number;
  loanStatus?: string;
  allocationSum?: number;
  paymentAmount?: number;
  paymentHubTotal?: number;
  contractTotal?: number;
  dashboardValue?: number;
  telegramValue?: number;
  warningRateBefore?: number;
  warningRateAfter?: number;
  errorRateBefore?: number;
  errorRateAfter?: number;
}

/** Avalia todas as regras de alerta da Fase 4 para um contrato/módulo. */
export function evaluateFinancialAlerts(input: AlertInput): FinancialAlert[] {
  const alerts: FinancialAlert[] = [];
  const eps = 0.01;

  if (Math.abs(input.difference ?? 0) > ALERT_DIFFERENCE_THRESHOLD) {
    alerts.push({
      code: "DIFFERENCE_ABOVE_THRESHOLD",
      severity: "CRITICAL",
      message: `Diferença financeira acima de R$ ${ALERT_DIFFERENCE_THRESHOLD.toFixed(2)}`,
      loanId: input.loanId,
      module: input.module,
      difference: input.difference,
    });
  }

  if ((input.totalReceivable ?? 0) < -eps) {
    alerts.push({
      code: "NEGATIVE_BALANCE",
      severity: "CRITICAL",
      message: "Saldo negativo detectado",
      loanId: input.loanId,
    });
  }

  if ((input.loanStatus === "paid" || input.loanStatus === "completed") && (input.totalReceivable ?? 0) > eps) {
    alerts.push({
      code: "SETTLED_WITH_BALANCE",
      severity: "CRITICAL",
      message: "Contrato quitado com saldo positivo",
      loanId: input.loanId,
    });
  }

  if (
    input.paymentHubTotal != null && input.contractTotal != null
    && Math.abs(input.paymentHubTotal - input.contractTotal) > eps
  ) {
    alerts.push({
      code: "PAYMENT_HUB_MISMATCH",
      severity: "CRITICAL",
      message: "Payment Hub divergente do contrato",
      loanId: input.loanId,
      difference: input.paymentHubTotal - input.contractTotal,
    });
  }

  if (
    input.dashboardValue != null && input.telegramValue != null
    && Math.abs(input.dashboardValue - input.telegramValue) > eps
  ) {
    alerts.push({
      code: "DASHBOARD_TELEGRAM_MISMATCH",
      severity: "WARNING",
      message: "Dashboard divergente do relatório do Telegram",
      difference: input.dashboardValue - input.telegramValue,
    });
  }

  if (
    input.allocationSum != null && input.paymentAmount != null
    && Math.abs(input.allocationSum - input.paymentAmount) > eps
  ) {
    alerts.push({
      code: "ALLOCATION_SUM_MISMATCH",
      severity: "CRITICAL",
      message: "Soma das alocações diferente do valor do pagamento",
      loanId: input.loanId,
      difference: input.allocationSum - input.paymentAmount,
    });
  }

  if (
    input.warningRateBefore != null && input.warningRateAfter != null
    && input.warningRateAfter > input.warningRateBefore * 1.5 + 0.01
  ) {
    alerts.push({
      code: "WARNING_RATE_SPIKE",
      severity: "WARNING",
      message: "Aumento inesperado da taxa de warnings",
      difference: input.warningRateAfter - input.warningRateBefore,
    });
  }

  if (
    input.errorRateBefore != null && input.errorRateAfter != null
    && input.errorRateAfter > input.errorRateBefore * 1.2 + 0.001
  ) {
    alerts.push({
      code: "ERROR_RATE_SPIKE",
      severity: "CRITICAL",
      message: "Aumento de erros após ativação da flag",
      difference: input.errorRateAfter - input.errorRateBefore,
    });
  }

  return alerts;
}
