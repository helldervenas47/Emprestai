// Catálogo de limites e permissões usado pelo cadastro de planos.
// `key` é estável (vai pro JSON do banco). `label` é exibido na UI.

export const LIMIT_KEYS = [
  { key: "loans", label: "Empréstimos" },
  { key: "clients", label: "Clientes" },
  { key: "billings", label: "Cobranças" },
  { key: "contracts", label: "Contratos" },
  { key: "finance_records", label: "Registros financeiros" },
  { key: "users", label: "Usuários vinculados" },
  { key: "notifications", label: "Notificações enviadas" },
] as const;

export type LimitKey = (typeof LIMIT_KEYS)[number]["key"];

export const PERMISSION_GROUPS: { module: string; perms: { key: string; label: string }[] }[] = [
  {
    module: "Empréstimos",
    perms: [
      { key: "loans.create", label: "Criar empréstimos" },
      { key: "loans.edit", label: "Editar empréstimos" },
      { key: "loans.delete", label: "Excluir empréstimos" },
    ],
  },
  {
    module: "Clientes",
    perms: [
      { key: "clients.create", label: "Cadastrar clientes" },
      { key: "clients.import", label: "Importar clientes" },
      { key: "clients.export", label: "Exportar clientes" },
    ],
  },
  {
    module: "Relatórios",
    perms: [
      { key: "reports.basic", label: "Relatórios básicos" },
      { key: "reports.advanced", label: "Relatórios avançados" },
    ],
  },
  {
    module: "Integrações",
    perms: [
      { key: "integrations.use", label: "Usar integrações" },
      { key: "automations.use", label: "Usar automações" },
      { key: "api.use", label: "Acesso à API" },
    ],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) => g.perms.map((p) => p.key));

export type PlanLimits = Partial<Record<LimitKey, number | null>>;
export type PlanPermissions = Record<string, boolean>;

export function isPermitted(perms: PlanPermissions | null | undefined, action: string): boolean {
  if (!perms || perms[action] === undefined) return true; // default: permitido
  return perms[action] !== false;
}

export function isWithinLimit(
  limits: PlanLimits | null | undefined,
  key: LimitKey,
  currentCount: number
): boolean {
  const max = limits?.[key];
  if (max == null) return true; // ilimitado
  return currentCount < max;
}
