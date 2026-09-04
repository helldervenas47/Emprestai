export type ClientRankingType =
  | "best"
  | "on_time"
  | "revenue"
  | "volume"
  | "frequent"
  | "risk"
  | "late";

export type ClientRankingPeriod =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "this_year"
  | "all"
  | "custom";

export interface ClientRankingItem {
  position: number;
  client_id: string;
  client_name: string;
  client_phone: string | null;
  client_cpf: string | null;
  client_cnpj: string | null;
  score: number;
  total_loans: number;
  total_borrowed: number;
  open_amount: number;
  total_payments: number;
  total_received: number;
  profit_generated: number;
  on_time_payments: number;
  late_payments: number;
  on_time_percentage: number;
  max_delay_days: number;
  overdue_loans: number;
}

export interface ClientRankingResponse {
  data: ClientRankingItem[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ClientRankingParams {
  rankingType: ClientRankingType;
  period: ClientRankingPeriod;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
  search?: string;
}
