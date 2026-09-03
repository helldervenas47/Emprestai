import { describe, expect, it } from "vitest";
import { getLedgerDisplay } from "./ledgerDisplay";
import type { LedgerEntry } from "./ledger";

const baseEntry: LedgerEntry = {
  id: "1",
  user_id: "u1",
  direction: "out",
  category: "loan",
  amount: 1000,
  occurred_on: "2025-01-01",
  description: "",
  loan_id: "l1",
  expense_id: null,
  payment_id: null,
  source: "auto",
  metadata: {},
  wallet: "account",
  payment_method_id: null,
  transfer_group_id: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

describe("getLedgerDisplay", () => {
  it("usa metadata.borrower_name como título quando disponível", () => {
    const e: LedgerEntry = {
      ...baseEntry,
      description: "Empréstimo concedido - João Silva",
      metadata: { borrower_name: "Maria Oliveira" },
    };
    const d = getLedgerDisplay(e);
    expect(d.title).toBe("Maria Oliveira");
    expect(d.typeLabel).toBe("Empréstimo");
  });

  it("extrai o nome da descrição de empréstimo concedido", () => {
    const e: LedgerEntry = { ...baseEntry, description: "Empréstimo concedido - João Silva" };
    expect(getLedgerDisplay(e).title).toBe("João Silva");
  });

  it("extrai o nome da descrição de empréstimo quitado na criação", () => {
    const e: LedgerEntry = {
      ...baseEntry,
      direction: "in",
      category: "payment",
      description: "Empréstimo quitado na criação - Ana Paula Souza",
    };
    expect(getLedgerDisplay(e).title).toBe("Ana Paula Souza");
  });

  it("extrai o nome de juros/multa por atraso", () => {
    const e: LedgerEntry = {
      ...baseEntry,
      direction: "in",
      category: "loan",
      description: "Juros/multa por atraso - Carlos Eduardo",
    };
    expect(getLedgerDisplay(e).title).toBe("Carlos Eduardo");
  });

  it("extrai o nome de ajuste de saldo do empréstimo", () => {
    const e: LedgerEntry = {
      ...baseEntry,
      direction: "in",
      category: "adjustment",
      description: "Ajuste de saldo do empréstimo de Pedro Henrique",
      metadata: { borrower_name: "Pedro Henrique" },
    };
    expect(getLedgerDisplay(e).title).toBe("Pedro Henrique");
  });

  it("extrai o nome de edição manual do contrato", () => {
    const e: LedgerEntry = {
      ...baseEntry,
      direction: "in",
      category: "adjustment",
      description: "Edição manual do contrato de Fernanda Lima — amount: 1000 → 1200",
      metadata: { audit: true, borrower_name: "Fernanda Lima" },
    };
    expect(getLedgerDisplay(e).title).toBe("Fernanda Lima");
  });

  it("extrai o nome de pagamento de empréstimo (juros + multa)", () => {
    const e: LedgerEntry = {
      ...baseEntry,
      direction: "in",
      category: "payment",
      description: "Pagamento de empréstimo (juros + multa) - Luiza Ferreira",
    };
    expect(getLedgerDisplay(e).title).toBe("Luiza Ferreira");
  });

  it("reconhece nomes brasileiros longos com até 8 palavras", () => {
    const e: LedgerEntry = {
      ...baseEntry,
      description: "Empréstimo concedido - Ana Maria Braga da Silva Pereira",
    };
    expect(getLedgerDisplay(e).title).toBe("Ana Maria Braga da Silva Pereira");
  });

  it("mantém referência do registro quando não há nome identificável", () => {
    const e: LedgerEntry = { ...baseEntry, description: "Empréstimo concedido - 12345" };
    const d = getLedgerDisplay(e);
    expect(d.title).toBe("12345");
    expect(d.typeLabel).toBe("Empréstimo");
  });
});
