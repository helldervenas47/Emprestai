import { describe, it, expect } from "vitest";
import {
  formatBRL,
  isLearnableAnswer,
  isInsidePeriod,
  missingPeriodDisclosure,
  previousPeriod,
  redactSecrets,
  resolvePeriod,
  selectDomains,
  stripAccents,
} from "../../../../supabase/functions/ai-assistant/pure";

const TODAY = "2026-07-15";

describe("selectDomains", () => {
  it("sempre inclui architecture", () => {
    expect(selectDomains("qualquer coisa")[0]).toBe("architecture");
  });

  it("detecta domínio por palavra-chave sem acento", () => {
    expect(selectDomains("qual o total de juros pendentes dos empréstimos?")).toContain("loans");
  });

  it("prioriza o domínio da aba aberta", () => {
    expect(selectDomains("como funciona isso?", "salary")).toContain("payroll");
  });

  it("limita a quantidade de domínios", () => {
    const domains = selectDomains("emprestimo pagamento despesa venda meta relatorio telegram cofrinho");
    expect(domains.length).toBeLessThanOrEqual(4);
  });

  it("nunca retorna somente architecture", () => {
    expect(selectDomains("oi").length).toBeGreaterThan(1);
  });
});

describe("resolvePeriod", () => {
  it("usa o mês atual como padrão", () => {
    expect(resolvePeriod(null, TODAY)).toMatchObject({ kind: "month", startIso: "2026-07-01", endIso: "2026-07-31" });
  });

  it("resolve hoje", () => {
    expect(resolvePeriod("hoje", TODAY)).toMatchObject({ startIso: TODAY, endIso: TODAY });
  });

  it("resolve ontem", () => {
    expect(resolvePeriod("ontem", TODAY).startIso).toBe("2026-07-14");
  });

  it("resolve semana começando no domingo", () => {
    const p = resolvePeriod("esta semana", TODAY);
    expect(p).toMatchObject({ kind: "week", startIso: "2026-07-12", endIso: "2026-07-18" });
  });

  it("resolve mês nomeado com ano", () => {
    expect(resolvePeriod("janeiro de 2025", TODAY)).toMatchObject({ startIso: "2025-01-01", endIso: "2025-01-31" });
  });

  it("resolve mês nomeado sem ano usando o ano corrente", () => {
    expect(resolvePeriod("fevereiro", TODAY).endIso).toBe("2026-02-28");
  });

  it("resolve trimestre corrente", () => {
    expect(resolvePeriod("trimestre", TODAY)).toMatchObject({ startIso: "2026-07-01", endIso: "2026-09-30" });
  });

  it("resolve semestre corrente", () => {
    expect(resolvePeriod("semestre", TODAY)).toMatchObject({ startIso: "2026-07-01", endIso: "2026-12-31" });
  });

  it("resolve ano", () => {
    expect(resolvePeriod("ano", TODAY)).toMatchObject({ startIso: "2026-01-01", endIso: "2026-12-31" });
  });

  it("resolve intervalo explícito", () => {
    expect(resolvePeriod("2026-01-01 a 2026-03-31", TODAY)).toMatchObject({
      kind: "custom",
      startIso: "2026-01-01",
      endIso: "2026-03-31",
    });
  });

  it("é determinístico", () => {
    expect(resolvePeriod("mes passado", TODAY)).toEqual(resolvePeriod("mes passado", TODAY));
  });
});

describe("previousPeriod", () => {
  it("retorna o mês anterior", () => {
    expect(previousPeriod(resolvePeriod(null, "2026-01-10"))).toMatchObject({
      startIso: "2025-12-01",
      endIso: "2025-12-31",
    });
  });

  it("retorna o ano anterior", () => {
    expect(previousPeriod(resolvePeriod("ano", TODAY)).startIso).toBe("2025-01-01");
  });

  it("mantém a duração em períodos customizados", () => {
    const prev = previousPeriod(resolvePeriod("2026-03-10 a 2026-03-19", TODAY));
    expect(prev).toMatchObject({ startIso: "2026-02-28", endIso: "2026-03-09" });
  });
});

describe("isInsidePeriod", () => {
  const period = resolvePeriod(null, TODAY);

  it("inclui as bordas", () => {
    expect(isInsidePeriod("2026-07-01", period)).toBe(true);
    expect(isInsidePeriod("2026-07-31", period)).toBe(true);
  });

  it("exclui fora do intervalo", () => {
    expect(isInsidePeriod("2026-08-01", period)).toBe(false);
  });

  it("trata data nula como fora", () => {
    expect(isInsidePeriod(null, period)).toBe(false);
  });
});

describe("formatBRL", () => {
  it("formata com separador de milhar", () => {
    expect(formatBRL(1234.5)).toBe("R$ 1.234,50");
  });

  it("suporta 9 dígitos", () => {
    expect(formatBRL(123456789.99)).toBe("R$ 123.456.789,99");
  });

  it("formata negativos e zero", () => {
    expect(formatBRL(-50)).toBe("-R$ 50,00");
    expect(formatBRL(0)).toBe("R$ 0,00");
  });
});

describe("redactSecrets", () => {
  it("remove JWT", () => {
    const text = "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r";
    expect(redactSecrets(text)).not.toContain("eyJhbGci");
  });

  it("remove token de bot do Telegram", () => {
    const text = "bot 123456789:AAHkQwErTyUiOpAsDfGhJkLzXcVbNmQwErT";
    expect(redactSecrets(text)).toContain("[credencial omitida]");
  });

  it("preserva texto comum", () => {
    expect(redactSecrets("Recebido R$ 1.000,00 em julho")).toBe("Recebido R$ 1.000,00 em julho");
  });
});

describe("missingPeriodDisclosure", () => {
  it("sinaliza valor sem período", () => {
    expect(missingPeriodDisclosure("Você recebeu R$ 1.000,00.")).toBe(true);
  });

  it("aceita resposta com período", () => {
    expect(missingPeriodDisclosure("No mês de julho você recebeu R$ 1.000,00.")).toBe(false);
  });

  it("ignora respostas sem valores", () => {
    expect(missingPeriodDisclosure("Abra a aba Empréstimos e clique em Novo.")).toBe(false);
  });
});

describe("isLearnableAnswer", () => {
  it("recusa respostas com dados financeiros", () => {
    expect(isLearnableAnswer("quanto recebi?", "Você recebeu R$ 500,00.")).toBe(false);
  });

  it("aceita respostas conceituais", () => {
    expect(isLearnableAnswer("como quitar?", "Abra o Payment Hub e escolha Quitação.")).toBe(true);
  });

  it("recusa avisos e vazios", () => {
    expect(isLearnableAnswer("x", "⚠️ Não consegui")).toBe(false);
    expect(isLearnableAnswer("", "")).toBe(false);
  });
});

describe("stripAccents", () => {
  it("normaliza acentos e caixa", () => {
    expect(stripAccents("Empréstimo Múltiplo")).toBe("emprestimo multiplo");
  });
});
