// Regras puras do handler Realtime de clientes.
// Extraído de useClients.ts para permitir testes determinísticos sem
// dependência de Supabase, offline sync ou React. NÃO adicionar efeitos
// colaterais nem imports do runtime aqui.
import type { Client } from "@/types/loan";

export type ClientRealtimeEventType = "INSERT" | "UPDATE" | "DELETE";

export interface ClientRealtimePayload {
  eventType: ClientRealtimeEventType;
  new?: Client | null;
  old?: { id?: string | null } | null;
}

export interface ClientRealtimeResult {
  clients: Client[];
  requiresRefetch: boolean;
}

/**
 * Insere um cliente no topo da lista preservando o comportamento atual:
 * - idempotente por id (mesma referência de array quando já existe);
 * - preserva referência de todos os clientes anteriores.
 */
export function insertClientIntoState(
  prev: readonly Client[],
  inserted: Client,
): Client[] {
  if (prev.some((c) => c.id === inserted.id)) return prev as Client[];
  return [inserted, ...prev];
}

/**
 * Atualiza um cliente pelo id, mesclando o payload parcial com o estado atual.
 * - preserva a referência dos clientes não alterados;
 * - cria nova referência apenas para o cliente alterado;
 * - mantém a ordem da lista;
 * - se o cliente não existir, retorna o array original (mesma referência).
 */
export function updateClientInState(
  prev: readonly Client[],
  updated: Partial<Client> & { id: string },
): Client[] {
  let changed = false;
  const next = prev.map((c) => {
    if (c.id !== updated.id) return c;
    changed = true;
    return { ...c, ...updated };
  });
  return changed ? next : (prev as Client[]);
}

/**
 * Remove um cliente pelo id.
 * - idempotente (retorna a mesma referência se não encontrou);
 * - preserva a referência dos demais clientes.
 */
export function deleteClientFromState(
  prev: readonly Client[],
  removedId: string,
): Client[] {
  const idx = prev.findIndex((c) => c.id === removedId);
  if (idx === -1) return prev as Client[];
  const next = prev.slice();
  next.splice(idx, 1);
  return next;
}

/**
 * Aplica um evento Realtime completo ao estado. Retorna requiresRefetch=true
 * quando o payload é insuficiente e o chamador deve fazer fallback de refetch.
 * A função de conversão de linha para Client é injetada para manter esta
 * lógica pura (sem dependência do formato do banco).
 */
export function applyClientRealtimeEvent(
  prev: readonly Client[],
  payload: ClientRealtimePayload,
  rowToClient: (row: Client) => Client,
): ClientRealtimeResult {
  try {
    if (payload.eventType === "INSERT" && payload.new) {
      return { clients: insertClientIntoState(prev, rowToClient(payload.new)), requiresRefetch: false };
    }
    if (payload.eventType === "UPDATE" && payload.new) {
      const updated = rowToClient(payload.new);
      if (!updated.id) return { clients: prev as Client[], requiresRefetch: true };
      return { clients: updateClientInState(prev, updated), requiresRefetch: false };
    }
    if (payload.eventType === "DELETE" && payload.old?.id) {
      return { clients: deleteClientFromState(prev, payload.old.id), requiresRefetch: false };
    }
  } catch {
    return { clients: prev as Client[], requiresRefetch: true };
  }
  return { clients: prev as Client[], requiresRefetch: true };
}
