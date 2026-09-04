import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchClientRanking } from "../clientRankingService";
import { supabase } from "@/integrations/supabase/userClient";

vi.mock("@/integrations/supabase/userClient", () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe("clientRankingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chama rpc_get_client_ranking com os parâmetros corretos", async () => {
    const mockData = {
      data: [
        {
          position: 1,
          client_id: "client-1",
          client_name: "Cliente Teste",
          score: 140,
          total_loans: 5,
          total_borrowed: 10000,
          open_amount: 0,
          total_payments: 15,
          total_received: 12000,
          profit_generated: 2000,
          on_time_payments: 15,
          late_payments: 0,
          on_time_percentage: 100,
          max_delay_days: 0,
        },
      ],
      total_count: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    };

    (supabase.rpc as any).mockResolvedValue({ data: mockData, error: null });

    const result = await fetchClientRanking({
      rankingType: "best",
      period: "this_month",
      page: 1,
      pageSize: 20,
      search: "",
    });

    expect(supabase.rpc).toHaveBeenCalledWith("rpc_get_client_ranking", {
      p_ranking_type: "best",
      p_period: "this_month",
      p_start_date: null,
      p_end_date: null,
      p_page: 1,
      p_page_size: 20,
      p_search: "",
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].client_name).toBe("Cliente Teste");
    expect(result.total_count).toBe(1);
  });

  it("utiliza fallback quando a RPC retorna erro", async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: null,
      error: { message: "function rpc_get_client_ranking does not exist" },
    });

    const mockClients = [
      {
        id: "client-1",
        name: "Cliente Fallback A",
        score_tempo_real: 135,
        score_risco: 135,
        qtd_pagamentos_total: 10,
        qtd_pagamentos_atrasados: 0,
        valor_em_atraso: 0,
        qtd_emprestimos_quitados: 3,
      },
      {
        id: "client-2",
        name: "Cliente Fallback B",
        score_tempo_real: 90,
        score_risco: 90,
        qtd_pagamentos_total: 5,
        qtd_pagamentos_atrasados: 2,
        valor_em_atraso: 500,
        qtd_emprestimos_quitados: 1,
      },
    ];

    const chain: any = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockClients, error: null }),
      ilike: vi.fn().mockReturnThis(),
    };

    (supabase.from as any).mockReturnValue(chain);

    const result = await fetchClientRanking({
      rankingType: "best",
      period: "all",
      page: 1,
      pageSize: 20,
      search: "",
    });

    expect(result.data).toHaveLength(2);
    expect(result.data[0].client_name).toBe("Cliente Fallback A");
    expect(result.data[0].position).toBe(1);
    expect(result.data[1].position).toBe(2);
  });
});
