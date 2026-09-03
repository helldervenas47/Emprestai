import { Sale } from "@/types/loan";

export type SaleCategory = "all" | "overdue" | "due_today" | "paid" | "on_track";

export interface SaleClientGroup {
  name: string;
  sales: Sale[];
  totalAmount: number;
  totalPaid: number;
  totalReceivable: number;
  hasOverdue: boolean;
}

export type SummaryBreakdownCard = "overdue" | "paid" | "receivable" | "ontrack";

export const saleCategoryFilters: {
  id: SaleCategory;
  label: string;
  color: string;
  activeColor: string;
}[] = [
  { id: "all", label: "Todos", color: "border-border text-muted-foreground", activeColor: "bg-primary text-primary-foreground border-primary" },
  { id: "overdue", label: "Atrasados", color: "border-destructive/30 text-destructive", activeColor: "bg-destructive text-destructive-foreground border-destructive" },
  { id: "paid", label: "Pagos", color: "border-success/30 text-success", activeColor: "bg-success text-success-foreground border-success" },
  { id: "due_today", label: "Vence Hoje", color: "border-warning/30 text-warning", activeColor: "bg-warning text-warning-foreground border-warning" },
  { id: "on_track", label: "Em Dia", color: "border-primary/30 text-primary", activeColor: "bg-primary text-primary-foreground border-primary" },
];
