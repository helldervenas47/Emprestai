import { Sale } from "@/types/loan";
import { getSaleCategory, getSalePaidAmountHelper } from "./productSalesUtils";

export type SalesPeriodPreset =
  | "all"
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_month"
  | "custom";

export type SalesStatus = "pending" | "partial" | "received" | "overdue";

export interface SalesAdvancedFilters {
  period: SalesPeriodPreset;
  dateFrom: string;
  dateTo: string;
  statuses: SalesStatus[];
  client: string;
  seller: string;
  paymentMethod: string;
  category: string;
  amountMin: string;
  amountMax: string;
}

export const emptySalesFilters: SalesAdvancedFilters = {
  period: "all",
  dateFrom: "",
  dateTo: "",
  statuses: [],
  client: "all",
  seller: "all",
  paymentMethod: "all",
  category: "all",
  amountMin: "",
  amountMax: "",
};

export const salesPeriodOptions: { id: SalesPeriodPreset; label: string }[] = [
  { id: "all", label: "Todo período" },
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "this_week", label: "Esta semana" },
  { id: "this_month", label: "Este mês" },
  { id: "last_month", label: "Mês passado" },
  { id: "custom", label: "Personalizado" },
];

export const salesStatusOptions: {
  id: SalesStatus;
  label: string;
  color: string;
  activeColor: string;
}[] = [
  {
    id: "pending",
    label: "Pendente",
    color: "border-warning/30 text-warning",
    activeColor: "bg-warning text-warning-foreground border-warning",
  },
  {
    id: "partial",
    label: "Parcialmente paga",
    color: "border-primary/30 text-primary",
    activeColor: "bg-primary text-primary-foreground border-primary",
  },
  {
    id: "received",
    label: "Recebida",
    color: "border-success/30 text-success",
    activeColor: "bg-success text-success-foreground border-success",
  },
  {
    id: "overdue",
    label: "Atrasada",
    color: "border-destructive/30 text-destructive",
    activeColor: "bg-destructive text-destructive-foreground border-destructive",
  },
];

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Resolve o intervalo (inclusivo) de datas em formato YYYY-MM-DD para o preset escolhido. */
export function resolvePeriodRange(
  filters: SalesAdvancedFilters,
  now: Date = new Date(),
): { from: string | null; to: string | null } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (filters.period) {
    case "today":
      return { from: toISODate(today), to: toISODate(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: toISODate(y), to: toISODate(y) };
    }
    case "this_week": {
      // Semana começando no domingo (padrão pt-BR nos calendários do app).
      const start = new Date(today);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { from: toISODate(start), to: toISODate(end) };
    }
    case "this_month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: toISODate(start), to: toISODate(end) };
    }
    case "last_month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: toISODate(start), to: toISODate(end) };
    }
    case "custom":
      return { from: filters.dateFrom || null, to: filters.dateTo || null };
    default:
      return { from: null, to: null };
  }
}

/** Status "de negócio" da venda, derivado do estado de parcelas/pagamentos. */
export function getSaleStatus(sale: Sale): SalesStatus {
  const category = getSaleCategory(sale);
  if (category === "paid") return "received";
  const paid = getSalePaidAmountHelper(sale) + (sale.partialPaid || 0);
  if (paid > 0.005) return "partial";
  if (category === "overdue") return "overdue";
  return "pending";
}

/** Nomes de responsáveis (vendedor/recebedor) registrados nos pagamentos da venda. */
export function getSaleSellers(sale: Sale): string[] {
  const names = (sale.paymentHistory || [])
    .map((p) => (p.userName || "").trim())
    .filter(Boolean);
  return Array.from(new Set(names));
}

/** IDs de formas de pagamento usadas na venda. */
export function getSalePaymentMethodIds(sale: Sale): string[] {
  const ids = (sale.paymentHistory || [])
    .map((p) => p.paymentMethodId || "")
    .filter(Boolean);
  return Array.from(new Set(ids));
}

export function countActiveSalesFilters(filters: SalesAdvancedFilters): number {
  let n = 0;
  if (filters.period !== "all") n++;
  if (filters.statuses.length > 0) n++;
  if (filters.client !== "all") n++;
  if (filters.seller !== "all") n++;
  if (filters.paymentMethod !== "all") n++;
  if (filters.category !== "all") n++;
  if (filters.amountMin.trim() !== "" || filters.amountMax.trim() !== "") n++;
  return n;
}

/** Aplica os filtros avançados a uma venda. */
export function matchesSalesFilters(
  sale: Sale,
  filters: SalesAdvancedFilters,
  now: Date = new Date(),
): boolean {
  const { from, to } = resolvePeriodRange(filters, now);
  if (from && sale.date < from) return false;
  if (to && sale.date > to) return false;

  if (filters.statuses.length > 0 && !filters.statuses.includes(getSaleStatus(sale))) return false;

  if (filters.client !== "all" && (sale.customerName || "").trim() !== filters.client) return false;

  if (filters.seller !== "all" && !getSaleSellers(sale).includes(filters.seller)) return false;

  if (filters.paymentMethod !== "all" && !getSalePaymentMethodIds(sale).includes(filters.paymentMethod)) {
    return false;
  }

  if (filters.category !== "all") {
    if (filters.category === "__none__") {
      if (sale.category) return false;
    } else if (sale.category !== filters.category) {
      return false;
    }
  }

  const min = parseFloat(filters.amountMin.replace(",", "."));
  const max = parseFloat(filters.amountMax.replace(",", "."));
  if (!isNaN(min) && sale.total < min) return false;
  if (!isNaN(max) && sale.total > max) return false;

  return true;
}
