// Regras puras de busca, filtragem e ordenação da lista de clientes.
// Extraído do useMemo do ClientList.tsx para permitir testes diretos.
// Preserva EXATAMENTE o comportamento anterior.
import type { Client } from "@/types/loan";
import { onlyDigits } from "@/lib/brDocuments";

export type ClientStatusFilter = "all" | "active" | "inactive" | "over-limit";
export type ClientSortOption =
  | "name-asc"
  | "name-desc"
  | "newest"
  | "oldest"
  | "score-desc"
  | "score-asc";

export interface ClientListLogicContext {
  /** Ids que estão acima do limite (usado apenas quando filter="over-limit"). */
  overLimitClientIds: ReadonlySet<string>;
  /** Score por id (usado apenas em ordenação por score). */
  scoreByClientId: Readonly<Record<string, { score: number } | undefined>>;
}

export interface NormalizedSearch {
  q: string;
  qDigits: string;
  raw: string;
}

export function normalizeClientSearch(search: string): NormalizedSearch {
  return { q: search.toLowerCase(), qDigits: onlyDigits(search), raw: search };
}

export function matchesClientSearch(client: Client, ns: NormalizedSearch): boolean {
  const { q, qDigits, raw } = ns;
  return (
    client.name.toLowerCase().includes(q) ||
    (qDigits.length > 0 && onlyDigits(client.cpf).includes(qDigits)) ||
    (client.cpf ?? "").toLowerCase().includes(q) ||
    client.phone.includes(raw)
  );
}

export function matchesClientStatus(
  client: Client,
  filter: ClientStatusFilter,
  overLimitClientIds: ReadonlySet<string>,
): boolean {
  return (
    filter === "all" ||
    (filter === "active" && client.active !== false) ||
    (filter === "inactive" && client.active === false) ||
    (filter === "over-limit" && overLimitClientIds.has(client.id))
  );
}

export function filterClients(
  clients: readonly Client[],
  search: string,
  filter: ClientStatusFilter,
  overLimitClientIds: ReadonlySet<string>,
): Client[] {
  const ns = normalizeClientSearch(search);
  return clients.filter(
    (c) => matchesClientSearch(c, ns) && matchesClientStatus(c, filter, overLimitClientIds),
  );
}

export function sortClients(
  clients: readonly Client[],
  sortOption: ClientSortOption,
  scoreByClientId: ClientListLogicContext["scoreByClientId"],
): Client[] {
  return clients.slice().sort((a, b) => {
    switch (sortOption) {
      case "name-asc":
        return a.name.localeCompare(b.name, "pt-BR");
      case "name-desc":
        return b.name.localeCompare(a.name, "pt-BR");
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "score-desc":
        return (scoreByClientId[b.id]?.score || 0) - (scoreByClientId[a.id]?.score || 0);
      case "score-asc":
        return (scoreByClientId[a.id]?.score || 0) - (scoreByClientId[b.id]?.score || 0);
      default:
        return 0;
    }
  });
}

export function getVisibleClients(
  clients: readonly Client[],
  search: string,
  filter: ClientStatusFilter,
  sortOption: ClientSortOption,
  ctx: ClientListLogicContext,
): Client[] {
  const filtered = filterClients(clients, search, filter, ctx.overLimitClientIds);
  return sortClients(filtered, sortOption, ctx.scoreByClientId);
}
