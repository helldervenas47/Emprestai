import type { Category } from "./types";

export const categoryConfig: { id: Category; label: string; color: string; activeColor: string }[] = [
  { id: "all", label: "Todos", color: "border-border text-muted-foreground", activeColor: "bg-primary text-primary-foreground border-primary" },
  { id: "overdue", label: "Atrasados", color: "border-destructive/30 text-destructive", activeColor: "bg-destructive text-destructive-foreground border-destructive" },
  { id: "paid_interest", label: "Juros", color: "border-purple/30 text-purple", activeColor: "bg-purple text-purple-foreground border-purple" },
  { id: "due_today", label: "Vence Hoje", color: "border-warning/30 text-warning", activeColor: "bg-warning text-warning-foreground border-warning" },
  { id: "on_track", label: "Em Dia", color: "border-primary/30 text-primary", activeColor: "bg-primary text-primary-foreground border-primary" },
  { id: "parcelado", label: "Parcelados", color: "border-blue-400/30 text-blue-400", activeColor: "bg-blue-500 text-white border-blue-500" },
  { id: "venda", label: "Vendas", color: "border-amber-500/30 text-amber-600 dark:text-amber-400", activeColor: "bg-amber-500 text-white border-amber-500" },
  { id: "paid", label: "Quitado", color: "border-success/30 text-success", activeColor: "bg-success text-success-foreground border-success" },
];

export const statusMap = {
  paid: { label: "Quitado", className: "bg-success/10 text-success border-success/20" },
  paid_interest: { label: "Juros", className: "bg-purple/10 text-purple border-purple/20" },
  overdue: { label: "Atrasado", className: "bg-destructive/10 text-destructive border-destructive/20" },
  due_today: { label: "Vence Hoje", className: "bg-warning/10 text-warning border-warning/20" },
  on_track: { label: "Em Dia", className: "bg-primary/10 text-primary border-primary/20" },
};
