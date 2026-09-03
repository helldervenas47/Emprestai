import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeNextDueDate } from "@/features/loans/hooks/useLoans";
import { getDueStatus } from "@/features/financial/lib/dueStatus";

/**
 * Testes para a regra de avanço de vencimento em contratos
 * Parcelado/Semanal (e variantes), garantindo que o pagamento
 * de uma parcela avance corretamente para o próximo vencimento
 * sem deslocar parcelas futuras além do esperado.
 *
 * Cenário motivador (Manoel Santana):
 *  - Contrato semanal iniciado em 25/04/2026
 *  - Parcela 1 (25/04) paga em 27/04
 *  - Próxima parcela deve ser 02/05/2026 (não pode permanecer em 25/04)
 */
describe("computeNextDueDate - contratos semanais", () => {
  it("avança 7 dias após o pagamento da parcela 1 (Semanal)", () => {
    const next = computeNextDueDate("2026-04-25", "Semanal", 1);
    expect(next).toBe("2026-05-02");
  });

  it("avança apenas 1 período por chamada (não multiplica por parcelas pagas)", () => {
    // Bug anterior: usava paidCount como multiplicador, levando a saltos errados.
    // A regra atual SEMPRE avança apenas 1 período relativo ao dueDate atual.
    const afterFirst = computeNextDueDate("2026-04-25", "Semanal", 1);
    const afterSecond = computeNextDueDate(afterFirst, "Semanal", 1);
    const afterThird = computeNextDueDate(afterSecond, "Semanal", 1);

    expect(afterFirst).toBe("2026-05-02");
    expect(afterSecond).toBe("2026-05-09");
    expect(afterThird).toBe("2026-05-16");
  });

  it("respeita virada de mês (semanal cruzando meses)", () => {
    expect(computeNextDueDate("2026-04-28", "Semanal", 1)).toBe("2026-05-05");
    expect(computeNextDueDate("2026-05-30", "Semanal", 1)).toBe("2026-06-06");
  });

  it("respeita virada de ano", () => {
    expect(computeNextDueDate("2026-12-28", "Semanal", 1)).toBe("2027-01-04");
  });

  it("frequência Quinzenal avança 15 dias", () => {
    expect(computeNextDueDate("2026-04-25", "Quinzenal", 1)).toBe("2026-05-10");
  });

  it("frequência Mensal avança 1 mês", () => {
    expect(computeNextDueDate("2026-04-25", "Mensal", 1)).toBe("2026-05-25");
  });

  it("fallback (frequência desconhecida) trata como Mensal", () => {
    expect(computeNextDueDate("2026-04-25", "OutroQualquer", 1)).toBe("2026-05-25");
  });
});

describe("getDueStatus - status da parcela seguinte após pagamento (Semanal)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("contrato semanal não está vencido após avançar para a próxima parcela", () => {
    // Hoje = 28/04/2026 (cenário Manoel Santana)
    vi.setSystemTime(new Date("2026-04-28T12:00:00-03:00"));

    const originalDue = "2026-04-25";
    // Antes do ajuste: status seria "overdue" pois usava a due_date original.
    // Após o pagamento da parcela 1, due_date avança para 02/05/2026.
    const nextDue = computeNextDueDate(originalDue, "Semanal", 1);

    expect(nextDue).toBe("2026-05-02");
    expect(getDueStatus(nextDue, false)).toBe("upcoming");
    // Garante que a regra antiga (sem avançar) levaria a overdue
    expect(getDueStatus(originalDue, false)).toBe("overdue");
  });

  it("marca como 'vence hoje' quando a próxima parcela cai na data atual", () => {
    vi.setSystemTime(new Date("2026-05-02T09:00:00-03:00"));
    const nextDue = computeNextDueDate("2026-04-25", "Semanal", 1);
    expect(getDueStatus(nextDue, false)).toBe("due_today");
  });

  it("marca como 'vencida' quando a próxima parcela já passou", () => {
    vi.setSystemTime(new Date("2026-05-05T09:00:00-03:00"));
    const nextDue = computeNextDueDate("2026-04-25", "Semanal", 1);
    expect(getDueStatus(nextDue, false)).toBe("overdue");
  });
});
