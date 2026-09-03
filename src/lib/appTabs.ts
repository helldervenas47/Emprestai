// Single source of truth for the tabs that exist in the app.
// Used by:
// - src/pages/Index.tsx (navigation)
// - src/components/UserManagement.tsx (per-user permissions)
// - src/components/PlanManagement.tsx (per-plan permissions)
//
// Adding/removing a tab here automatically keeps permission UIs in sync
// and stale ids are stripped from saved permission lists on load/save.

export const APP_TABS = [
  { id: "overview", label: "Dashboard" },
  { id: "dashboard", label: "Empréstimos" },
  { id: "products", label: "Vendas" },
  { id: "vehicles", label: "Veículos" },
  { id: "calendar", label: "Calendário" },
  { id: "clients", label: "Cadastro" },
  { id: "expenses", label: "Receitas e Despesas" },
  { id: "boletos", label: "Boletos" },
  { id: "salary", label: "Salário" },
  { id: "accountant", label: "Contador" },
  { id: "overdue", label: "Relatório" },
  { id: "metas", label: "Metas" },
  { id: "settings", label: "Configurações" },
  { id: "system", label: "Sistema" },
  { id: "ajuda", label: "Ajuda" },
] as const;

export type AppTabId = (typeof APP_TABS)[number]["id"];

export const APP_TAB_IDS: string[] = APP_TABS.map((t) => t.id);

/** Keep only tab ids that still exist in the app. */
export function sanitizeAllowedTabs(ids: string[] | null | undefined): string[] {
  if (!Array.isArray(ids)) return APP_TAB_IDS.slice();
  return ids.filter((id) => APP_TAB_IDS.includes(id));
}
