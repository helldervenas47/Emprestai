import { useState, useCallback, useEffect, useId } from "react";
import { Client } from "@/types/loan";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { notifyRemoteUpdate } from "@/lib/realtimeToast";
import { toast } from "@/hooks/use-toast";
import {
  cacheRows,
  getCachedRows,
  upsertCachedRow,
  removeCachedRow,
  enqueueMutation,
  rewritePendingRecordId,
} from "@/lib/offline/sync";
import { isOnline } from "@/lib/offline/status";
import { assertWritable } from "@/lib/readOnlyState";
import {
  loadSharedResource,
  invalidateSharedResource,
  readSharedResource,
  subscribeSharedResource,
  writeSharedResource,
} from "@/lib/sharedResource";
import { applyClientRealtimeEvent } from "@/features/clients/utils/clientRealtimeState";

const CLIENT_COLUMNS =
  "id, name, phone, email, cpf, cnpj, rg, address, city, state, score, notes, active, created_at, is_vehicle_rental, nacionalidade, estado_civil, profissao, bairro, is_manager, default_interest_rate, auto_billing_enabled, score_risco, score_atualizado_em, score_tempo_real, qtd_pagamentos_total, qtd_pagamentos_atrasados, dias_atraso_acumulado, dias_atraso_excedente_acumulado, streak_atual, maior_streak, ultima_data_vencimento_processada, valor_em_atraso, qtd_emprestimos_quitados";

// P1-01: clientes mudam com pouca frequência dentro de uma sessão.
// 2 min é conservador — mutações locais invalidam o cache imediatamente.
const STALE_MS = 2 * 60_000;

async function triggerClientAnalysis(clientId: string) {
  await supabase.functions.invoke("sync-client-analysis", {
    body: { client_id: clientId, force: true },
  }).catch(() => { /* noop */ });
}

function rowToClient(c: any): Client {
  return {
    id: c.id, name: c.name, phone: c.phone, email: c.email,
    cpf: c.cpf, cnpj: c.cnpj, rg: c.rg, address: c.address,
    city: c.city, state: c.state, score: c.score, notes: c.notes,
    active: c.active, createdAt: c.created_at,
    isVehicleRental: c.is_vehicle_rental, nacionalidade: c.nacionalidade,
    estadoCivil: c.estado_civil, profissao: c.profissao, bairro: c.bairro,
    isManager: c.is_manager ?? false,
    defaultInterestRate: c.default_interest_rate ?? null,
    autoBillingEnabled: c.auto_billing_enabled ?? true,
    scoreRisco: c.score_risco != null ? Number(c.score_risco) : null,
    scoreTempoReal: c.score_tempo_real != null ? Number(c.score_tempo_real) : (c.score_risco != null ? Number(c.score_risco) : null),
    scoreAtualizadoEm: c.score_atualizado_em ?? null,
    qtdPagamentosTotal: c.qtd_pagamentos_total != null ? Number(c.qtd_pagamentos_total) : null,
    qtdPagamentosAtrasados: c.qtd_pagamentos_atrasados != null ? Number(c.qtd_pagamentos_atrasados) : null,
    diasAtrasoAcumulado: c.dias_atraso_acumulado != null ? Number(c.dias_atraso_acumulado) : null,
    diasAtrasoExcedenteAcumulado: c.dias_atraso_excedente_acumulado != null ? Number(c.dias_atraso_excedente_acumulado) : null,
    streakAtual: c.streak_atual != null ? Number(c.streak_atual) : null,
    maiorStreak: c.maior_streak != null ? Number(c.maior_streak) : null,
    ultimaDataVencimentoProcessada: c.ultima_data_vencimento_processada ?? null,
    valorEmAtraso: c.valor_em_atraso != null ? Number(c.valor_em_atraso) : null,
    qtdEmprestimosQuitados: c.qtd_emprestimos_quitados != null ? Number(c.qtd_emprestimos_quitados) : null,
  };
}

async function fetchClientsRows(ownerId?: string): Promise<Client[]> {
  // Tenta ler prioritariamente da view de score em tempo real (vw_clientes_score)
  let query = supabase
    .from("vw_clientes_score" as any)
    .select(CLIENT_COLUMNS)
    .order("created_at", { ascending: false });

  if (ownerId) {
    query = (query as any).eq("user_id", ownerId);
  }

  const { data, error } = await query;

  if (!error && data) {
    cacheRows("clients", data ?? []).catch(() => { /* noop */ });
    return data.map(rowToClient);
  }

  // Fallback seguro caso a view ainda não exista no schema local
  let fallbackQuery = supabase
    .from("clients")
    .select(CLIENT_COLUMNS)
    .order("created_at", { ascending: false });

  if (ownerId) {
    fallbackQuery = (fallbackQuery as any).eq("user_id", ownerId);
  }

  const { data: fallbackData, error: fallbackError } = await fallbackQuery;

  if (fallbackError) throw fallbackError;
  cacheRows("clients", fallbackData ?? []).catch(() => { /* noop */ });
  return (fallbackData ?? []).map(rowToClient);
}

export function useClients() {
  const { user, dataOwnerId } = useAuth();
  const instanceId = useId();
  const ownerKey = dataOwnerId ?? user?.id ?? "";
  const cacheKey = ownerKey ? `clients:${ownerKey}` : "";
  const [clients, setClients] = useState<Client[]>(
    () => readSharedResource<Client[]>(cacheKey) ?? [],
  );

  const fetchClients = useCallback(async () => {
    if (!user) return;
    if (isOnline() && cacheKey) {
      try {
        const rows = await loadSharedResource(cacheKey, () => fetchClientsRows(ownerKey), { staleTime: STALE_MS });
        setClients(rows);
        return;
      } catch {
        // cai no fallback offline abaixo
      }
    }
    const cached = await getCachedRows("clients", user?.id);
    if (cached.length > 0) {
      const list = cached
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        .map(rowToClient);
      setClients(list);
      if (cacheKey) writeSharedResource(cacheKey, list);
    }
  }, [user, cacheKey]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // Atualiza estado local e cache compartilhado atomicamente.
  const commit = useCallback((updater: (prev: Client[]) => Client[]) => {
    setClients((prev) => {
      const next = updater(prev);
      if (cacheKey) writeSharedResource(cacheKey, next);
      return next;
    });
  }, [cacheKey]);

  // Assina o cache compartilhado — se outra instância deste hook mutar,
  // esta tela também atualiza sem novo fetch.
  useEffect(() => {
    if (!cacheKey) return;
    return subscribeSharedResource(cacheKey, () => {
      const next = readSharedResource<Client[]>(cacheKey);
      if (next) setClients(next);
    });
  }, [cacheKey]);

  useEffect(() => {
    if (!user || !dataOwnerId) return;
    const channel = supabase
      .channel(`clients:${dataOwnerId}:${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients', filter: `user_id=eq.${dataOwnerId}` },
        (payload: any) => {
          // Realtime localizado: aplica apenas a mudança recebida, sem refetch da lista inteira.
          // Fallback para refetch caso o payload venha incompleto (ex: sem `new`/`old`).
          const result = applyClientRealtimeEvent(
            // usa referência atual através do setter para evitar dependência de estado stale
            [],
            payload,
            rowToClient,
          );
          if (!result.requiresRefetch) {
            commit((prev) => applyClientRealtimeEvent(prev, payload, rowToClient).clients);
            return;
          }
          if (cacheKey) invalidateSharedResource(cacheKey);
          fetchClients();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, dataOwnerId, fetchClients, cacheKey, instanceId, commit]);

  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.tables?.includes("clients")) {
        if (cacheKey) invalidateSharedResource(cacheKey);
        fetchClients();
      }
    };
    window.addEventListener("offline-sync:flushed", handler);
    return () => window.removeEventListener("offline-sync:flushed", handler);
  }, [fetchClients, cacheKey]);


  const addClient = useCallback(async (client: Omit<Client, "id" | "createdAt">): Promise<string | null> => {
    assertWritable();
    if (!user || !dataOwnerId) return null;
    const tempId = crypto.randomUUID();
    const optimistic: Client = { ...client, id: tempId, createdAt: new Date().toISOString() };
    commit((prev) => [optimistic, ...prev]);

    const insertPayload = {
      id: tempId,
      user_id: dataOwnerId, name: client.name, phone: client.phone, email: client.email,
      cpf: client.cpf, cnpj: client.cnpj, rg: client.rg, address: client.address,
      city: client.city, state: client.state, score: client.score, notes: client.notes,
      active: client.active, is_vehicle_rental: client.isVehicleRental || false,
      nacionalidade: client.nacionalidade || '', estado_civil: client.estadoCivil || '',
      profissao: client.profissao || '', bairro: client.bairro || '',
      is_manager: client.isManager || false,
      default_interest_rate: client.defaultInterestRate ?? null,
      auto_billing_enabled: client.autoBillingEnabled ?? true,
    };

    await upsertCachedRow("clients", { ...insertPayload, created_at: optimistic.createdAt });

    if (!isOnline()) {
      await enqueueMutation({ table: "clients", op: "insert", recordId: tempId, payload: insertPayload });
      return tempId;
    }

    const { data, error } = await supabase.from("clients").insert(insertPayload as any).select().single();
    if (error) {
      if (!error.message.toLowerCase().includes("row-level")) {
        await enqueueMutation({ table: "clients", op: "insert", recordId: tempId, payload: insertPayload });
        return tempId;
      } else {
        commit((prev) => prev.filter((c) => c.id !== tempId));
        await removeCachedRow("clients", tempId);
        return null;
      }
    } else if (data) {
      commit((prev) => prev.map((c) => c.id === tempId ? { ...c, id: data.id, createdAt: data.created_at } : c));
      await removeCachedRow("clients", tempId);
      await upsertCachedRow("clients", data);
      await rewritePendingRecordId("clients", tempId, data.id);
      await triggerClientAnalysis(data.id);
      return data.id;
    }
    return tempId;
  }, [user, dataOwnerId, commit]);

  const deleteClient = useCallback(async (id: string) => {
    assertWritable();
    const removed = clients.find((c) => c.id === id) ?? null;
    commit((prev) => prev.filter((c) => c.id !== id));
    await removeCachedRow("clients", id);
    if (!isOnline()) {
      await enqueueMutation({ table: "clients", op: "delete", recordId: id });
      return;
    }
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) {
      const code = (error as any).code as string | undefined;
      // 23503 = foreign_key_violation; 42501 = insufficient_privilege; PGRST = REST-level errors
      const isPermanent =
        code === "23503" ||
        code === "42501" ||
        (code ?? "").startsWith("PGRST") ||
        /row-level|foreign key|violates|permission/i.test(error.message);
      if (isPermanent) {
        // Restaura no estado local — o servidor ainda tem o registro.
        if (removed) commit((prev) => (prev.some((c) => c.id === id) ? prev : [removed, ...prev]));
        await upsertCachedRow("clients", {
          id: removed?.id ?? id,
          name: removed?.name,
          created_at: removed?.createdAt,
        });
        const msg = code === "23503"
          ? "Este cliente possui empréstimos, vendas ou pagamentos vinculados. Remova-os antes de excluir."
          : code === "42501"
            ? "Você não tem permissão para excluir este cliente."
            : (error.message || "Não foi possível excluir o cliente.");
        toast({ title: "Não foi possível excluir", description: msg, variant: "destructive" });
        return;
      }
      // Erro transitório (rede, etc.) — enfileira para retry offline.
      await enqueueMutation({ table: "clients", op: "delete", recordId: id });
    }
  }, [clients, commit]);

  const updateClient = useCallback(async (id: string, data: Partial<Omit<Client, "id" | "createdAt">>) => {
    assertWritable();
    commit((prev) => prev.map((c) => c.id === id ? { ...c, ...data } : c));
    const updatePayload: any = {
      name: data.name, phone: data.phone, email: data.email, cpf: data.cpf,
      cnpj: data.cnpj, rg: data.rg, address: data.address, city: data.city,
      state: data.state, score: data.score, notes: data.notes, active: data.active,
      is_vehicle_rental: data.isVehicleRental, nacionalidade: data.nacionalidade,
      estado_civil: data.estadoCivil, profissao: data.profissao, bairro: data.bairro,
      is_manager: data.isManager,
      default_interest_rate: data.defaultInterestRate,
      auto_billing_enabled: data.autoBillingEnabled,
    };
    Object.keys(updatePayload).forEach(k => updatePayload[k] === undefined && delete updatePayload[k]);

    if (!isOnline()) {
      await enqueueMutation({ table: "clients", op: "update", recordId: id, payload: updatePayload });
      return;
    }
    const { error } = await supabase.from("clients").update(updatePayload).eq("id", id);
    if (error) {
      await enqueueMutation({ table: "clients", op: "update", recordId: id, payload: updatePayload });
    } else {
      await triggerClientAnalysis(id);
    }
  }, [commit]);

  return { clients, addClient, deleteClient, updateClient };
}
