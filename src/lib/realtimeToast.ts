import { toast } from "sonner";

// Throttled per-table toast: avoids spamming when many rows change.
const lastShown = new Map<string, number>();
const THROTTLE_MS = 4000;

const LABELS: Record<string, string> = {
  loans: "Empréstimos",
  payments: "Pagamentos",
  expenses: "Despesas",
  clients: "Clientes",
  sales: "Vendas",
  products: "Produtos",
  personal_expense_categories: "Categorias",
};

export function notifyRemoteUpdate(table: string) {
  const now = Date.now();
  const last = lastShown.get(table) ?? 0;
  if (now - last < THROTTLE_MS) return;
  lastShown.set(table, now);

  const label = LABELS[table] ?? table;
  toast(`${label} atualizado em outro dispositivo`, {
    duration: 2500,
    position: "bottom-right",
    className: "text-xs",
  });
}
