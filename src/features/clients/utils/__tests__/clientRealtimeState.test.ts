import { describe, it, expect } from "vitest";
import type { Client } from "@/types/loan";
import {
  insertClientIntoState,
  updateClientInState,
  deleteClientFromState,
  applyClientRealtimeEvent,
} from "../clientRealtimeState";

function mk(id: string, over: Partial<Client> = {}): Client {
  return {
    id,
    name: `C ${id}`,
    phone: "",
    email: "",
    cpf: "",
    cnpj: "",
    rg: "",
    address: "",
    city: "",
    state: "",
    score: "",
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    ...over,
  };
}

const identity = (c: Client) => c;

describe("clientRealtimeState — INSERT", () => {
  it("adiciona novo cliente no topo", () => {
    const prev = [mk("a")];
    const next = insertClientIntoState(prev, mk("b"));
    expect(next.map((c) => c.id)).toEqual(["b", "a"]);
    expect(next[1]).toBe(prev[0]);
  });

  it("não duplica cliente existente e devolve a mesma referência do array", () => {
    const prev = [mk("a"), mk("b")];
    const next = insertClientIntoState(prev, mk("a", { name: "novo" }));
    expect(next).toBe(prev);
  });

  it("evento repetido é idempotente", () => {
    const prev = [mk("a")];
    const once = insertClientIntoState(prev, mk("b"));
    const twice = insertClientIntoState(once, mk("b"));
    expect(twice).toBe(once);
  });

  it("payload sem cliente válido solicita refetch", () => {
    const prev = [mk("a")];
    const r = applyClientRealtimeEvent(prev, { eventType: "INSERT", new: null }, identity);
    expect(r.requiresRefetch).toBe(true);
    expect(r.clients).toBe(prev);
  });
});

describe("clientRealtimeState — UPDATE", () => {
  it("atualiza somente o cliente correto e preserva as demais referências", () => {
    const prev = [mk("a"), mk("b"), mk("c")];
    const next = updateClientInState(prev, { id: "b", name: "novo" });
    expect(next[0]).toBe(prev[0]);
    expect(next[1]).not.toBe(prev[1]);
    expect(next[1].name).toBe("novo");
    expect(next[2]).toBe(prev[2]);
  });

  it("preserva a ordem da lista", () => {
    const prev = [mk("a"), mk("b"), mk("c")];
    const next = updateClientInState(prev, { id: "b", name: "novo" });
    expect(next.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("mescla payload parcial sem apagar campos antigos", () => {
    const prev = [mk("a", { name: "Antigo", phone: "111" })];
    const next = updateClientInState(prev, { id: "a", phone: "222" });
    expect(next[0].name).toBe("Antigo");
    expect(next[0].phone).toBe("222");
  });

  it("cliente inexistente devolve a mesma referência do array", () => {
    const prev = [mk("a")];
    const next = updateClientInState(prev, { id: "x", name: "y" });
    expect(next).toBe(prev);
  });

  it("evento repetido mantém o resultado consistente", () => {
    const prev = [mk("a")];
    const once = updateClientInState(prev, { id: "a", name: "x" });
    const twice = updateClientInState(once, { id: "a", name: "x" });
    expect(twice[0].name).toBe("x");
  });

  it("payload de UPDATE sem id solicita refetch", () => {
    const prev = [mk("a")];
    const r = applyClientRealtimeEvent(
      prev,
      { eventType: "UPDATE", new: { ...mk("a"), id: "" } },
      identity,
    );
    expect(r.requiresRefetch).toBe(true);
  });
});

describe("clientRealtimeState — DELETE", () => {
  it("remove somente o cliente e preserva referências dos demais", () => {
    const prev = [mk("a"), mk("b"), mk("c")];
    const next = deleteClientFromState(prev, "b");
    expect(next.map((c) => c.id)).toEqual(["a", "c"]);
    expect(next[0]).toBe(prev[0]);
    expect(next[1]).toBe(prev[2]);
  });

  it("excluir cliente inexistente não lança e devolve mesma referência", () => {
    const prev = [mk("a")];
    const next = deleteClientFromState(prev, "zzz");
    expect(next).toBe(prev);
  });

  it("evento repetido é idempotente", () => {
    const prev = [mk("a"), mk("b")];
    const once = deleteClientFromState(prev, "a");
    const twice = deleteClientFromState(once, "a");
    expect(twice).toBe(once);
  });

  it("payload de DELETE sem id solicita refetch", () => {
    const prev = [mk("a")];
    const r = applyClientRealtimeEvent(prev, { eventType: "DELETE", old: {} }, identity);
    expect(r.requiresRefetch).toBe(true);
    expect(r.clients).toBe(prev);
  });
});

describe("applyClientRealtimeEvent — caminho normal", () => {
  it("INSERT válido não solicita refetch", () => {
    const prev = [mk("a")];
    const r = applyClientRealtimeEvent(prev, { eventType: "INSERT", new: mk("b") }, identity);
    expect(r.requiresRefetch).toBe(false);
    expect(r.clients.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("UPDATE válido não solicita refetch", () => {
    const prev = [mk("a", { name: "old" })];
    const r = applyClientRealtimeEvent(
      prev,
      { eventType: "UPDATE", new: mk("a", { name: "new" }) },
      identity,
    );
    expect(r.requiresRefetch).toBe(false);
    expect(r.clients[0].name).toBe("new");
  });

  it("DELETE válido não solicita refetch", () => {
    const prev = [mk("a"), mk("b")];
    const r = applyClientRealtimeEvent(prev, { eventType: "DELETE", old: { id: "a" } }, identity);
    expect(r.requiresRefetch).toBe(false);
    expect(r.clients.map((c) => c.id)).toEqual(["b"]);
  });

  it("rowToClient que lança dispara fallback de refetch", () => {
    const prev = [mk("a")];
    const r = applyClientRealtimeEvent(
      prev,
      { eventType: "INSERT", new: mk("b") },
      () => {
        throw new Error("boom");
      },
    );
    expect(r.requiresRefetch).toBe(true);
    expect(r.clients).toBe(prev);
  });
});
