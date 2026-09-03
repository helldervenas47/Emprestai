/**
 * Smoke tests for large feature components.
 *
 * Goal: catch import-time crashes (bad imports, syntax errors, top-level
 * side effects) without instantiating the heavy prop/hook trees these
 * components need to fully render. All Supabase access is mocked.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";

// ---- Global mocks: never touch a real Supabase instance during tests. ----
vi.mock("@/integrations/supabase/userClient", () => {
  const query: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: (resolve: (v: any) => void) => resolve({ data: [], error: null }),
  };
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn(),
  };
  const supabase = {
    from: vi.fn(() => query),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: null, error: null }),
        download: vi.fn().mockResolvedValue({ data: null, error: null }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })),
      })),
    },
  };
  return { supabase, isSupabaseConfigured: true, missingSupabaseEnvVars: [] };
});

beforeAll(() => {
  // jsdom polyfills used by chart libs / animation helpers
  if (!(globalThis as any).ResizeObserver) {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!(globalThis as any).IntersectionObserver) {
    (globalThis as any).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  }
});

describe("heavy component modules — import smoke", () => {
  it("DashboardOverview module loads", async () => {
    const mod: any = await import("@/features/dashboard/components/DashboardOverview");
    expect(mod.default || mod.DashboardOverview).toBeDefined();
  });

  it("LoanList module loads", async () => {
    const mod: any = await import("@/features/loans/components/LoanList");
    expect(mod.default || mod.LoanList).toBeDefined();
  });

  it("ProductSalesView module loads", async () => {
    const mod: any = await import("@/features/sales/components/ProductSalesView");
    expect(mod.default || mod.ProductSalesView).toBeDefined();
  });

  it("PiggyBankList module loads", async () => {
    const mod: any = await import("@/features/piggyBanks/components/PiggyBankList");
    expect(mod.default || mod.PiggyBankList).toBeDefined();
  });
});
