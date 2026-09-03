/**
 * Lista de módulos do sistema que possuem permissão granular configurável
 * via `Administração → Papéis & Permissões`.
 *
 * Manter esta lista sincronizada com o seed em
 * `supabase/sql/role_permissions.sql`.
 */
export type PermissionAction = "view" | "create" | "edit" | "delete";

export interface PermissionModule {
  /** Identificador usado no banco (coluna `module`). */
  key: string;
  /** Rótulo apresentado na UI. */
  label: string;
  /** Breve descrição opcional. */
  description?: string;
}

export const PERMISSION_MODULES: PermissionModule[] = [
  { key: "loans", label: "Empréstimos" },
  { key: "clients", label: "Clientes" },
  { key: "payments", label: "Pagamentos" },
  { key: "expenses", label: "Despesas empresariais" },
  { key: "incomes", label: "Receitas" },
  { key: "payrolls", label: "Folha de pagamento" },
  { key: "reports", label: "Relatórios" },
  { key: "products", label: "Produtos" },
  { key: "sales", label: "Vendas" },
  { key: "credit_cards", label: "Cartões de crédito" },
  { key: "users_admin", label: "Administração de usuários" },
  { key: "settings", label: "Configurações do sistema" },
];

export const PERMISSION_ROLES = [
  { key: "admin", label: "Admin" },
  { key: "gerente", label: "Gerente" },
  { key: "cliente", label: "Cliente" },
  { key: "visualizador", label: "Visualizador" },
] as const;

export type RoleKey = typeof PERMISSION_ROLES[number]["key"];

export const PERMISSION_ACTIONS: { key: PermissionAction; label: string }[] = [
  { key: "view", label: "Ver" },
  { key: "create", label: "Criar" },
  { key: "edit", label: "Editar" },
  { key: "delete", label: "Excluir" },
];
