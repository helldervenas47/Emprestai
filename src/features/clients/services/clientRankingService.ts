import { supabase } from "@/integrations/supabase/userClient";
import {
  ClientRankingParams,
  ClientRankingResponse,
  ClientRankingItem,
} from "../types/clientRanking";

/**
 * Executa a RPC consolidada rpc_get_client_ranking no PostgreSQL.
 * Caso ocorra erro de RPC inexistente, utiliza fallback resiliente.
 */
export async function fetchClientRanking(
  params: ClientRankingParams
): Promise<ClientRankingResponse> {
  const {
    rankingType = "best",
    period = "all",
    startDate,
    endDate,
    page = 1,
    pageSize = 20,
    search = "",
  } = params;

  try {
    const { data, error } = await supabase.rpc("rpc_get_client_ranking" as any, {
      p_ranking_type: rankingType,
      p_period: period,
      p_start_date: startDate || null,
      p_end_date: endDate || null,
      p_page: page,
      p_page_size: pageSize,
      p_search: search.trim(),
    });

    if (error) {
      console.warn("[clientRankingService] RPC error, using fallback:", error.message);
      return await fallbackClientRanking(params);
    }

    if (data && typeof data === "object") {
      return {
        data: Array.isArray((data as any).data) ? (data as any).data : [],
        total_count: Number((data as any).total_count) || 0,
        page: Number((data as any).page) || page,
        page_size: Number((data as any).page_size) || pageSize,
        total_pages: Number((data as any).total_pages) || 0,
      };
    }

    return {
      data: [],
      total_count: 0,
      page,
      pageSize,
      total_pages: 0,
    };
  } catch (err) {
    console.error("[clientRankingService] Exception, falling back:", err);
    return await fallbackClientRanking(params);
  }
}

/**
 * Fallback resiliente caso a RPC ainda não tenha sido aplicada no banco.
 */
async function fallbackClientRanking(
  params: ClientRankingParams
): Promise<ClientRankingResponse> {
  const {
    rankingType = "best",
    search = "",
    page = 1,
    pageSize = 20,
  } = params;

  let query = supabase
    .from("vw_clientes_score" as any)
    .select("id, name, phone, cpf, cnpj, score_risco, score_tempo_real, qtd_pagamentos_total, qtd_pagamentos_atrasados, valor_em_atraso, qtd_emprestimos_quitados")
    .order("name", { ascending: true });

  if (search.trim()) {
    query = query.ilike("name", `%${search.trim()}%`);
  }

  const { data: clients, error } = await query;
  if (error || !clients) {
    return { data: [], total_count: 0, page, page_size: pageSize, total_pages: 0 };
  }

  // Agregações básicas dos clientes
  const items: ClientRankingItem[] = (clients as any[]).map((c) => {
    const score = c.score_tempo_real != null ? Number(c.score_tempo_real) : (c.score_risco != null ? Number(c.score_risco) : 100);
    const totalPayments = Number(c.qtd_pagamentos_total) || 0;
    const latePayments = Number(c.qtd_pagamentos_atrasados) || 0;
    const onTimePayments = Math.max(0, totalPayments - latePayments);
    const onTimePercentage = totalPayments > 0 ? Number(((onTimePayments / totalPayments) * 100).toFixed(1)) : 100;

    return {
      position: 1,
      client_id: c.id,
      client_name: c.name || "Sem Nome",
      client_phone: c.phone || null,
      client_cpf: c.cpf || null,
      client_cnpj: c.cnpj || null,
      score,
      total_loans: Number(c.qtd_emprestimos_quitados) || 0,
      total_borrowed: 0,
      open_amount: Number(c.valor_em_atraso) || 0,
      total_payments: totalPayments,
      total_received: 0,
      profit_generated: 0,
      on_time_payments: onTimePayments,
      late_payments: latePayments,
      on_time_percentage: onTimePercentage,
      max_delay_days: latePayments > 0 ? 5 : 0,
    };
  });

  // Ordenação de acordo com o ranking selecionado
  items.sort((a, b) => {
    switch (rankingType) {
      case "best":
        return b.score - a.score || b.on_time_percentage - a.on_time_percentage;
      case "on_time":
        return b.on_time_percentage - a.on_time_percentage || b.on_time_payments - a.on_time_payments;
      case "revenue":
        return b.profit_generated - a.profit_generated || b.total_received - a.total_received;
      case "volume":
        return b.total_borrowed - a.total_borrowed;
      case "frequent":
        return b.total_loans - a.total_loans || b.score - a.score;
      case "risk":
        return a.score - b.score || b.open_amount - a.open_amount;
      case "late":
        return b.max_delay_days - a.max_delay_days || b.late_payments - a.late_payments;
      default:
        return b.score - a.score;
    }
  });

  // Aplica posições
  items.forEach((it, idx) => {
    it.position = idx + 1;
  });

  const total = items.length;
  const offset = (page - 1) * pageSize;
  const paged = items.slice(offset, offset + pageSize);

  return {
    data: paged,
    total_count: total,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(total / pageSize),
  };
}
