import { addDays, addMonths, addWeeks } from "date-fns";
import { ShoppingCart, Tv, Car } from "lucide-react";
import { BusinessType, Sale } from "@/types/loan";

export function addByFrequency(date: Date, frequency: string, n: number): Date {
  if (["Diário", "Diária", "Diario", "Diaria", "daily"].includes(frequency)) return addDays(date, n);
  if (frequency === "Semanal") return addWeeks(date, n);
  if (frequency === "Quinzenal") return addDays(date, n * 15);
  return addMonths(date, n);
}

export function rawFormatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function getSaleCategory(sale: Sale): "paid" | "overdue" | "due_today" | "on_track" {
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const isPaid = isRecorrente ? sale.paidInstallments >= sale.installments : sale.paidInstallments >= 1;
  if (isPaid) return "paid";

  const baseDate = new Date(sale.date + "T00:00:00");
  const nextInstIdx = sale.paidInstallments;
  const customDate = sale.installmentDates && sale.installmentDates[nextInstIdx];
  const dueDate = customDate ? new Date(customDate + "T00:00:00") : (isRecorrente ? addByFrequency(baseDate, sale.frequency || "Mensal", nextInstIdx) : baseDate);
  const today = new Date();
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const diff = Math.floor((todayNorm.getTime() - dueNorm.getTime()) / (1000 * 60 * 60 * 24));

  if (diff > 0) return "overdue";
  if (diff === 0) return "due_today";
  return "on_track";
}

export const saleCategoryConfig = {
  paid: { label: "Pago", badge: "bg-success/20 text-success border-success/30", border: "border-success/50", bg: "bg-success/[0.22]", header: "bg-success/[0.45] border-success/30" },
  overdue: { label: "Vencida", badge: "bg-destructive/20 text-destructive border-destructive/30", border: "border-destructive/50", bg: "bg-destructive/[0.22]", header: "bg-destructive/[0.45] border-destructive/30" },
  due_today: { label: "Vence Hoje", badge: "bg-warning/20 text-warning border-warning/30", border: "border-warning/50", bg: "bg-warning/[0.22]", header: "bg-warning/[0.45] border-warning/30" },
  on_track: { label: "Em Dia", badge: "bg-primary/20 text-primary border-primary/30", border: "border-primary/50", bg: "bg-card", header: "bg-primary/8 border-border/50" },
};

export const businessTabs: { type: BusinessType; label: string; icon: React.ElementType }[] = [
  { type: "venda", label: "Vendas", icon: ShoppingCart },
  { type: "streaming", label: "Streaming", icon: Tv },
  { type: "aluguel_veiculo", label: "Aluguel de Veículos", icon: Car },
];

export const salesSubTabs: { type: BusinessType; label: string; icon: React.ElementType }[] = [
  { type: "venda", label: "Vendas", icon: ShoppingCart },
  { type: "streaming", label: "Streaming", icon: Tv },
];

export function getNextDueDateHelper(s: Sale): Date {
  const isRec = s.paymentMode === "recorrente" && s.installments > 1;
  const baseDate = new Date(s.date + "T00:00:00");
  const nextIdx = s.paidInstallments;
  const customDate = s.installmentDates && s.installmentDates[nextIdx];
  if (customDate) return new Date(customDate + "T00:00:00");
  return isRec ? addByFrequency(baseDate, s.frequency || "Mensal", nextIdx) : baseDate;
}

export function getNextInstallmentValueHelper(s: Sale): number {
  const nextIdx = s.paidInstallments;
  const amounts = s.installmentAmounts;
  if (amounts && amounts[nextIdx] != null) return amounts[nextIdx];
  return s.installments > 0 ? Math.max(0, s.total - (s.downPayment || 0)) / s.installments : s.total;
}

export function getSalePaidAmountHelper(s: Sale): number {
  const amounts = s.installmentAmounts;
  if (amounts && amounts.length > 0) {
    let paid = s.downPayment || 0;
    for (let i = 0; i < s.paidInstallments && i < amounts.length; i++) {
      paid += amounts[i] || 0;
    }
    return paid;
  }
  const vp = s.installments > 0 ? Math.max(0, s.total - (s.downPayment || 0)) / s.installments : s.total;
  return vp * s.paidInstallments + (s.downPayment || 0);
}
