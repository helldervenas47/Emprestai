/**
 * Tests for the usePiggyBanks adapter (new architecture: `cofrinhos` +
 * `cofrinho_ledger` + edge functions). Ensures the hook never touches the
 * legacy `piggy_banks` / `piggy_bank_deposits` tables and that deposit/
 * withdraw flows dispatch to the correct edge functions.
 *
 * All Supabase access is mocked — no real network / DB calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/hooks/useDataOwner", () => ({
  useDataOwner: () => "user-1",
}));
vi.mock("@/lib/readOnlyState", () => ({
  assertWritable: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Shared spies observable from tests
// ---------------------------------------------------------------------------
const fromCalls: string[] = [];
const updateCalls: Array<{ table: string; patch: any }> = [];

const defaultCofrinho = {
  id: "cof-1",
  ativo: true,
  nome: "Viagem",
  descricao: null, // <- exercita fallback quando descricao é NULL
  percentual_cdi: 100,
  meta: 5000,
  created_at: "2025-01-01T00:00:00Z",
  saldo_principal: 100,
  saldo_total: 110,
  saldo_rendimento_bruto: 10,
  saldo_rendimento_liquido: 8,
};

let cofrinhosData: any[] = [defaultCofrinho];
const ledgerData = [
  {
    id: "l1",
    cofrinho_id: "cof-1",
    tipo: "DEPOSITO",
    valor: 100,
    data_evento: "2025-01-02",
    created_at: "2025-01-02T00:00:00Z",
    evento_id: "e1",
  },
  {
    id: "l2",
    cofrinho_id: "cof-1",
    tipo: "RESGATE",
    valor: 20,
    data_evento: "2025-01-03",
    created_at: "2025-01-03T00:00:00Z",
    evento_id: "e2",
  },
];

const makeQuery = (data: any, table: string) => {
  const q: any = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) {
    q[m] = vi.fn().mockReturnValue(q);
  }
  q.update = vi.fn((patch: any) => {
    updateCalls.push({ table, patch });
    return q;
  });
  q.insert = vi.fn().mockReturnValue(q);
  q.single = vi.fn().mockResolvedValue({ data: { id: "cof-1" }, error: null });
  q.then = (resolve: any) => resolve({ data, error: null });
  return q;
};

vi.mock("@/integrations/supabase/userClient", () => {
  const supabase = {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      if (table === "cofrinhos") return makeQuery(cofrinhosData, table);
      if (table === "cofrinho_ledger") return makeQuery(ledgerData, table);
      if (table === "cofrinho_eventos") return makeQuery([], table);
      if (table === "taxa_referencia") return makeQuery([], table);
      return makeQuery([], table);
    }),
    channel: vi.fn(() => {
      const ch: any = {
        on: vi.fn(() => ch),
        subscribe: vi.fn(() => ch),
      };
      return ch;
    }),
    removeChannel: vi.fn(),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "tok" } },
      }),
    },
  };
  return { supabase };
});

// Fetch is what callCofrinhoFn actually uses to call the edge function.
const fetchMock = vi.fn();

beforeEach(() => {
  fromCalls.length = 0;
  updateCalls.length = 0;
  cofrinhosData = [defaultCofrinho];
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ ok: true }),
  });
  (globalThis as any).fetch = fetchMock;
  vi.stubEnv("VITE_EXTERNAL_SUPABASE_URL", "https://ex.supabase.co");
  vi.stubEnv("VITE_EXTERNAL_SUPABASE_ANON_KEY", "anon-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Import AFTER mocks are set up.
import { usePiggyBanks } from "@/features/piggyBanks/hooks/usePiggyBanks";

describe("usePiggyBanks — data loading", () => {
  it("carrega cofrinhos da tabela `cofrinhos`", async () => {
    const { result } = renderHook(() => usePiggyBanks());
    await waitFor(() => expect(result.current.piggyBanks.length).toBe(1));
    expect(result.current.piggyBanks[0].id).toBe("cof-1");
    expect(result.current.piggyBanks[0].name).toBe("Viagem");
    expect(fromCalls).toContain("cofrinhos");
  });

  it("carrega timeline via `cofrinho_ledger`", async () => {
    const { result } = renderHook(() => usePiggyBanks());
    await waitFor(() => expect(result.current.deposits.length).toBe(2));
    expect(fromCalls).toContain("cofrinho_ledger");
    const dep = result.current.deposits.find((d) => d.source === "transfer_in");
    const wdw = result.current.deposits.find((d) => d.source === "transfer_out");
    expect(dep?.amount).toBe(100);
    expect(wdw?.amount).toBe(-20);
  });

  it("NUNCA consulta as tabelas legadas `piggy_banks` / `piggy_bank_deposits`", async () => {
    const { result } = renderHook(() => usePiggyBanks());
    await waitFor(() => expect(result.current.piggyBanks.length).toBe(1));
    expect(fromCalls).not.toContain("piggy_banks");
    expect(fromCalls).not.toContain("piggy_bank_deposits");
  });

  it("trata `descricao = null` sem quebrar (aplica cor/ícone padrão)", async () => {
    const { result } = renderHook(() => usePiggyBanks());
    await waitFor(() => expect(result.current.piggyBanks.length).toBe(1));
    const pb = result.current.piggyBanks[0];
    expect(pb.color).toBeTruthy();
    expect(pb.icon).toBeTruthy();
    expect(pb.category).toBeNull();
    expect(pb.targetDate).toBeNull();
  });
});

describe("usePiggyBanks — mutações via Edge Function", () => {
  it("storeMoney chama a edge function `processar-deposito-cofrinho`", async () => {
    const { result } = renderHook(() => usePiggyBanks());
    await waitFor(() => expect(result.current.piggyBanks.length).toBe(1));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.storeMoney("cof-1", 50);
    });

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("/functions/v1/processar-deposito-cofrinho");
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as any).body);
    expect(body.cofrinho_id).toBe("cof-1");
    expect(body.valor).toBe(50);
  });

  it("withdrawMoney chama a edge function `processar-resgate-cofrinho`", async () => {
    const { result } = renderHook(() => usePiggyBanks());
    await waitFor(() => expect(result.current.piggyBanks.length).toBe(1));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.withdrawMoney("cof-1", 30);
    });

    expect(ok).toBe(true);
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("/functions/v1/processar-resgate-cofrinho");
  });

  it("recarrega dados após sucesso de storeMoney", async () => {
    const { result } = renderHook(() => usePiggyBanks());
    await waitFor(() => expect(result.current.piggyBanks.length).toBe(1));
    const before = fromCalls.filter((t) => t === "cofrinhos").length;

    await act(async () => {
      await result.current.storeMoney("cof-1", 20);
    });

    const after = fromCalls.filter((t) => t === "cofrinhos").length;
    expect(after).toBeGreaterThan(before);
  });

  it("trata erro da edge function sem lançar", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: "boom" }),
    });
    const { result } = renderHook(() => usePiggyBanks());
    await waitFor(() => expect(result.current.piggyBanks.length).toBe(1));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.storeMoney("cof-1", 10);
    });

    expect(ok).toBe(false);
  });

  it("updatePiggyBank grava em `cofrinhos.update`", async () => {
    const { result } = renderHook(() => usePiggyBanks());
    await waitFor(() => expect(result.current.piggyBanks.length).toBe(1));

    await act(async () => {
      await result.current.updatePiggyBank("cof-1", {
        name: "Viagem 2026",
        goalAmount: 8000,
      });
    });

    const patchedCofrinhos = updateCalls.filter((u) => u.table === "cofrinhos");
    expect(patchedCofrinhos.length).toBeGreaterThan(0);
    expect(patchedCofrinhos[0].patch.nome).toBe("Viagem 2026");
    expect(patchedCofrinhos[0].patch.meta).toBe(8000);
  });
});
