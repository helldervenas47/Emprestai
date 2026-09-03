// Campos financeiros/administrativos do perfil, que virão da tabela `profiles`
// após a integração com o Asaas. Isolados aqui para que o Route Guard e demais
// consumidores tenham uma única fonte de verdade sobre o "status de conta".

export type FinancialStatus =
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "PENDING"
  | "INACTIVE";

export type ManualOverride = "BANNED" | "FREE_PASS" | null;

export interface AccountProfile {
  /** Status financeiro atual da conta (espelha o estado do gateway Asaas). */
  financial_status: FinancialStatus;
  /** Override manual do super-admin. Tem prioridade sobre o status financeiro. */
  manual_override: ManualOverride;
  /** Data ISO do fim do período pago atual. */
  current_period_end: string | null;
  /** ID da última transação processada no gateway. */
  last_payment_id?: string | null;
}
