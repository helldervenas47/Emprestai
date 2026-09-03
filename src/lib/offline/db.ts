import Dexie, { Table } from "dexie";

export type OfflineTable =
  | "clients"
  | "incomes"
  | "expenses"
  | "products"
  | "sales"
  | "loans"
  | "loan_installments"
  | "payments";

export type MutationOp = "insert" | "update" | "delete";

export interface PendingMutation {
  id?: number;
  table: OfflineTable;
  op: MutationOp;
  payload: any; // for insert/update
  recordId: string; // local id (or temp id) — used for chaining mutations
  createdAt: number;
  retries: number;
  lastError?: string;
}

export interface CachedRow {
  id: string;
  user_id?: string;
  data: any; // raw supabase row
  cachedAt: number;
}

export interface MetaEntry {
  key: string;
  value: any;
}

class OfflineDB extends Dexie {
  clients!: Table<CachedRow, string>;
  incomes!: Table<CachedRow, string>;
  expenses!: Table<CachedRow, string>;
  products!: Table<CachedRow, string>;
  sales!: Table<CachedRow, string>;
  loans!: Table<CachedRow, string>;
  loan_installments!: Table<CachedRow, string>;
  payments!: Table<CachedRow, string>;
  pending_mutations!: Table<PendingMutation, number>;
  meta!: Table<MetaEntry, string>;

  constructor() {
    super("emprestaii_offline");
    this.version(1).stores({
      clients: "id, cachedAt",
      expenses: "id, cachedAt",
      loans: "id, cachedAt",
      loan_installments: "id, cachedAt",
      payments: "id, cachedAt",
      pending_mutations: "++id, table, recordId, createdAt",
      meta: "key",
    });
    this.version(2).stores({
      clients: "id, cachedAt",
      incomes: "id, cachedAt",
      expenses: "id, cachedAt",
      products: "id, cachedAt",
      sales: "id, cachedAt",
      loans: "id, cachedAt",
      loan_installments: "id, cachedAt",
      payments: "id, cachedAt",
      pending_mutations: "++id, table, recordId, createdAt",
      meta: "key",
    });
  }
}

export const offlineDB = new OfflineDB();

export const OFFLINE_TABLES: OfflineTable[] = [
  "clients",
  "incomes",
  "expenses",
  "products",
  "sales",
  "loans",
  "loan_installments",
  "payments",
];
