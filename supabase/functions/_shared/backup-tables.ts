// Lista única de tabelas usadas pelo backup/restore/wipe.
// Manter sincronizada com a estrutura real. Ordem importa para restore:
// inserts seguem essa ordem; deletes (replace/wipe) seguem a ordem inversa.
export type BackupTable = { name: string; ownerCol: "owner_id" | "user_id"; replaceSafe?: boolean };

export const BACKUP_TABLES: BackupTable[] = [
  { name: "account_settings", ownerCol: "owner_id" },
  { name: "profiles", ownerCol: "user_id" },
  { name: "payment_methods", ownerCol: "user_id" },
  { name: "income_categories", ownerCol: "user_id" },
  { name: "personal_expense_categories", ownerCol: "user_id" },
  { name: "clients", ownerCol: "user_id", replaceSafe: true },
  { name: "client_financial_profiles", ownerCol: "owner_id", replaceSafe: true },
  { name: "client_credit_reports", ownerCol: "owner_id", replaceSafe: true },
  { name: "client_analysis_events", ownerCol: "owner_id", replaceSafe: true },
  { name: "credit_limits", ownerCol: "user_id", replaceSafe: true },
  { name: "credit_limit_history", ownerCol: "user_id", replaceSafe: true },
  { name: "credit_cards", ownerCol: "user_id", replaceSafe: true },
  { name: "credit_card_invoice_openings", ownerCol: "user_id", replaceSafe: true },
  { name: "loans", ownerCol: "user_id", replaceSafe: true },
  { name: "loan_installments", ownerCol: "user_id", replaceSafe: true },
  { name: "loan_renegotiations", ownerCol: "user_id", replaceSafe: true },
  { name: "payments", ownerCol: "user_id", replaceSafe: true },
  { name: "products", ownerCol: "user_id", replaceSafe: true },
  { name: "sales", ownerCol: "user_id", replaceSafe: true },
  { name: "vehicle_registry", ownerCol: "user_id", replaceSafe: true },
  { name: "vehicle_balance", ownerCol: "user_id", replaceSafe: true },
  { name: "expenses", ownerCol: "user_id", replaceSafe: true },
  { name: "expense_category_hints", ownerCol: "user_id" },
  { name: "incomes", ownerCol: "user_id", replaceSafe: true },
  { name: "income_category_hints", ownerCol: "user_id" },
  { name: "monthly_goals", ownerCol: "user_id", replaceSafe: true },
  { name: "monthly_goal_snapshots", ownerCol: "owner_id", replaceSafe: true },
  { name: "monthly_opening_balances", ownerCol: "owner_id", replaceSafe: true },
  { name: "active_capital_snapshots", ownerCol: "owner_id", replaceSafe: true },
  { name: "personal_budgets", ownerCol: "user_id", replaceSafe: true },
  // Nova arquitetura de cofrinhos: tabelas `cofrinhos`, `cofrinho_aportes`,
  // `cofrinho_resgates`, `cofrinho_eventos`, `cofrinho_rendimento_diario` e
  // `taxa_referencia`. Os legados (`piggy_banks`, `piggy_bank_deposits`,
  // `piggy_bank_recurrences`, `piggy_bank_rate_history`) foram removidos do
  // backup. A inclusão dos novos requer suporte a `usuario_id` em ownerCol e
  // será tratada num próximo passo do backup engine.

  { name: "manager_commissions", ownerCol: "user_id", replaceSafe: true },
  { name: "tracking_providers", ownerCol: "owner_id", replaceSafe: true },
  { name: "tracking_positions", ownerCol: "owner_id", replaceSafe: true },
  { name: "balance", ownerCol: "user_id", replaceSafe: true },
  { name: "chart_overrides", ownerCol: "user_id", replaceSafe: true },
  { name: "locador_info", ownerCol: "user_id", replaceSafe: true },
  { name: "simulation_settings", ownerCol: "owner_id", replaceSafe: true },
  { name: "user_goal_prefs", ownerCol: "user_id", replaceSafe: true },
  { name: "webhook_settings", ownerCol: "user_id", replaceSafe: true },
];

export const BACKUP_VERSION = 3;

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
