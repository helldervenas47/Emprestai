import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, dataOwnerId: "owner-1" }),
}));

vi.mock("@/lib/readOnlyState", () => ({
  assertWritable: vi.fn(),
}));

vi.mock("@/lib/timezone", () => ({
  todayInAppTz: () => "2026-07-15",
}));

const parentRow = {
  id: "income-parent-1",
  description: "Mensalidade",
  amount: 100,
  category: "EXTRA",
  client_id: null,
  source: null,
  payment_method_id: null,
  received_date: "2026-07-10",
  actual_received_date: null,
  status: "pending",
  notes: null,
  recurrence: "monthly",
  parent_id: null,
  created_at: "2026-07-01T00:00:00Z",
};

let fetchedRows: any[] = [parentRow];
const updateCalls: any[] = [];
const insertCalls: any[] = [];

const makeQuery = (table: string) => {
  const q: any = {
    _select: undefined as string | undefined,
    _eq: [] as Array<[string, any]>,
  };

  q.select = vi.fn((columns?: string) => {
    q._select = columns;
    return q;
  });
  q.order = vi.fn(() => q);
  q.limit = vi.fn(() => q);
  q.eq = vi.fn((column: string, value: any) => {
    q._eq.push([column, value]);
    return q;
  });
  q.update = vi.fn((patch: any) => {
    updateCalls.push({ table, patch });
    return q;
  });
  q.insert = vi.fn((payload: any) => {
    insertCalls.push({ table, payload });
    return q;
  });
  q.single = vi.fn(async () => ({
    data: {
      ...parentRow,
      ...insertCalls[insertCalls.length - 1]?.payload,
      id: `inserted-${insertCalls.length}`,
      created_at: "2026-07-01T00:00:00Z",
    },
    error: null,
  }));
  q.then = (resolve: any) => {
    const parentEq = q._eq.find(([column]: [string, any]) => column === "parent_id");
    if (q._select === "received_date" && parentEq) {
      return resolve({ data: [], error: null });
    }
    return resolve({ data: fetchedRows, error: null });
  };
  return q;
};

vi.mock("@/integrations/supabase/userClient", () => {
  const supabase = {
    from: vi.fn((table: string) => makeQuery(table)),
    channel: vi.fn(() => {
      const channel: any = {
        on: vi.fn(() => channel),
        subscribe: vi.fn(() => channel),
      };
      return channel;
    }),
    removeChannel: vi.fn(),
  };
  return { supabase };
});

import { useIncomes } from "@/features/financial/hooks/useIncomes";

describe("useIncomes recurring backfill", () => {
  beforeEach(() => {
    fetchedRows = [parentRow];
    updateCalls.length = 0;
    insertCalls.length = 0;
  });

  it("usa lock global para executar o backfill apenas uma vez com duas instâncias montadas", async () => {
    renderHook(() => [useIncomes(true), useIncomes(true)]);

    await waitFor(() => expect(updateCalls.length).toBe(1));
    await waitFor(() => expect(insertCalls.length).toBeGreaterThan(0));

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({
      table: "incomes",
      patch: { notes: "[Expanded]" },
    });

    const uniqueChildDates = new Set(insertCalls.map((call) => call.payload.received_date));
    expect(insertCalls).toHaveLength(uniqueChildDates.size);
  });

  it("não atualiza novamente pai que já possui [Expanded]", async () => {
    fetchedRows = [{ ...parentRow, notes: "observação\n[Expanded]" }];

    renderHook(() => useIncomes(true));

    await waitFor(() => expect(updateCalls.length).toBe(0));
    expect(insertCalls).toHaveLength(0);
  });
});