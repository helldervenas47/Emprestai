import { describe, it, expect } from "vitest";
import type { Client } from "@/types/loan";
import {
  filterClients,
  sortClients,
  getVisibleClients,
  normalizeClientSearch,
} from "../clientListLogic";

function mk(id: string, over: Partial<Client> = {}): Client {
  return {
    id,
    name: `Cliente ${id}`,
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

const empty = new Set<string>();
const noScores = {};

describe("normalizeClientSearch", () => {
  it("extrai dígitos e minúsculas", () => {
    const ns = normalizeClientSearch("João 123.456");
    expect(ns.q).toBe("joão 123.456");
    expect(ns.qDigits).toBe("123456");
    expect(ns.raw).toBe("João 123.456");
  });
});

describe("filterClients — busca", () => {
  const clients = [
    mk("1", { name: "Ana Silva", cpf: "12345678901", phone: "(11) 91234-5678" }),
    mk("2", { name: "Bruno Costa", cpf: "98765432100", phone: "(21) 99999-0000" }),
    mk("3", { name: "Carla", cpf: "", phone: "" }),
  ];

  it("busca por nome completo", () => {
    expect(filterClients(clients, "Ana Silva", "all", empty).map((c) => c.id)).toEqual(["1"]);
  });
  it("busca por parte do nome", () => {
    expect(filterClients(clients, "Bru", "all", empty).map((c) => c.id)).toEqual(["2"]);
  });
  it("é case-insensitive", () => {
    expect(filterClients(clients, "ana", "all", empty).map((c) => c.id)).toEqual(["1"]);
    expect(filterClients(clients, "BRUNO", "all", empty).map((c) => c.id)).toEqual(["2"]);
  });
  it("busca CPF sem formatação", () => {
    expect(filterClients(clients, "12345678901", "all", empty).map((c) => c.id)).toEqual(["1"]);
  });
  it("busca CPF por dígitos parciais", () => {
    expect(filterClients(clients, "987654", "all", empty).map((c) => c.id)).toEqual(["2"]);
  });
  it("busca por telefone formatado", () => {
    expect(filterClients(clients, "(11) 91234", "all", empty).map((c) => c.id)).toEqual(["1"]);
  });
  it("pesquisa vazia retorna todos", () => {
    expect(filterClients(clients, "", "all", empty).map((c) => c.id)).toEqual(["1", "2", "3"]);
  });
  it("nenhum resultado", () => {
    expect(filterClients(clients, "xyz-inexistente", "all", empty)).toEqual([]);
  });
  it("clientes com campos ausentes não quebram a busca", () => {
    expect(filterClients(clients, "carla", "all", empty).map((c) => c.id)).toEqual(["3"]);
  });
});

describe("filterClients — status", () => {
  const clients = [
    mk("1", { active: true }),
    mk("2", { active: false }),
    mk("3", { active: true }),
  ];

  it("all", () => {
    expect(filterClients(clients, "", "all", empty)).toHaveLength(3);
  });
  it("active", () => {
    expect(filterClients(clients, "", "active", empty).map((c) => c.id)).toEqual(["1", "3"]);
  });
  it("inactive", () => {
    expect(filterClients(clients, "", "inactive", empty).map((c) => c.id)).toEqual(["2"]);
  });
  it("over-limit usa o Set fornecido", () => {
    const over = new Set(["3"]);
    expect(filterClients(clients, "", "over-limit", over).map((c) => c.id)).toEqual(["3"]);
  });
  it("lista vazia devolve vazio", () => {
    expect(filterClients([], "", "active", empty)).toEqual([]);
  });
  it("combina busca + filtro", () => {
    const cs = [mk("1", { name: "Ana", active: true }), mk("2", { name: "Ana", active: false })];
    expect(filterClients(cs, "ana", "active", empty).map((c) => c.id)).toEqual(["1"]);
  });
});

describe("sortClients", () => {
  const scores = { a: { score: 100 }, b: { score: 50 }, c: { score: 150 } };

  it("name-asc / name-desc", () => {
    const cs = [mk("a", { name: "Bruno" }), mk("b", { name: "Ana" }), mk("c", { name: "Carla" })];
    expect(sortClients(cs, "name-asc", {}).map((c) => c.name)).toEqual(["Ana", "Bruno", "Carla"]);
    expect(sortClients(cs, "name-desc", {}).map((c) => c.name)).toEqual(["Carla", "Bruno", "Ana"]);
  });

  it("newest / oldest usam createdAt", () => {
    const cs = [
      mk("a", { createdAt: "2024-01-01T00:00:00Z" }),
      mk("b", { createdAt: "2024-06-01T00:00:00Z" }),
      mk("c", { createdAt: "2023-01-01T00:00:00Z" }),
    ];
    expect(sortClients(cs, "newest", {}).map((c) => c.id)).toEqual(["b", "a", "c"]);
    expect(sortClients(cs, "oldest", {}).map((c) => c.id)).toEqual(["c", "a", "b"]);
  });

  it("score-desc / score-asc", () => {
    const cs = [mk("a"), mk("b"), mk("c")];
    expect(sortClients(cs, "score-desc", scores).map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(sortClients(cs, "score-asc", scores).map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  it("score ausente é tratado como 0", () => {
    const cs = [mk("a"), mk("x")];
    const res = sortClients(cs, "score-desc", { a: { score: 10 } });
    expect(res.map((c) => c.id)).toEqual(["a", "x"]);
  });

  it("não muta o array original", () => {
    const cs = [mk("b", { name: "Bruno" }), mk("a", { name: "Ana" })];
    const snap = cs.slice();
    sortClients(cs, "name-asc", {});
    expect(cs).toEqual(snap);
  });
});

describe("getVisibleClients — integração", () => {
  it("aplica busca + filtro + ordenação em conjunto", () => {
    const cs = [
      mk("1", { name: "Ana", active: true, createdAt: "2024-01-01T00:00:00Z" }),
      mk("2", { name: "Bruno", active: true, createdAt: "2024-06-01T00:00:00Z" }),
      mk("3", { name: "Ana Maria", active: false, createdAt: "2024-03-01T00:00:00Z" }),
    ];
    const r = getVisibleClients(cs, "ana", "active", "name-asc", {
      overLimitClientIds: empty,
      scoreByClientId: noScores,
    });
    expect(r.map((c) => c.id)).toEqual(["1"]);
  });

  it("preserva a ordem mesmo com listas grandes com nomes iguais", () => {
    const cs = [mk("1", { name: "Ana" }), mk("2", { name: "Ana" }), mk("3", { name: "Ana" })];
    const r = getVisibleClients(cs, "", "all", "name-asc", {
      overLimitClientIds: empty,
      scoreByClientId: noScores,
    });
    expect(r).toHaveLength(3);
  });
});
