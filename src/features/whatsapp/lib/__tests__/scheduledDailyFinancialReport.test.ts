import { describe, it, expect, vi } from "vitest";
import { isTimeDueToday, dueSlotKeys, timeToMinutes } from "../../../../../supabase/functions/_shared/schedule";
import { buildDailyFinancialData, formatDailyFinancialReportTelegram } from "../../../telegram/lib/dailyFinancialReport";

describe("Envio Automático do Relatório Financeiro pelo WhatsApp", () => {
  const TODAY = "2026-09-17";

  it("calcula minutos do horário configurado corretamente", () => {
    expect(timeToMinutes("08:30")).toBe(8 * 60 + 30); // 510 minutos
    expect(timeToMinutes("19:00")).toBe(19 * 60); // 1140 minutos
    expect(timeToMinutes(null)).toBeNull();
  });

  it("identifica que o horário 08:30 está pendente de disparo quando a hora atual for 08:30 ou superior", () => {
    const slots = [
      { key: "send_time_1" as const, time: "08:30" },
      { key: "send_time_2" as const, time: null },
      { key: "send_time_3" as const, time: null },
    ];

    // Antes das 08:30 (ex: 08:15 = 495 min) -> Não deve disparar
    const beforeDue = isTimeDueToday("08:30", 8 * 60 + 15);
    expect(beforeDue).toBe(false);

    // Às 08:30 em ponto (510 min) -> Deve disparar
    const atDue = isTimeDueToday("08:30", 8 * 60 + 30);
    expect(atDue).toBe(true);

    // Após 08:30 (ex: 08:35 = 515 min) -> Deve disparar se ainda não foi enviado hoje
    const afterDue = isTimeDueToday("08:30", 8 * 60 + 35);
    expect(afterDue).toBe(true);
  });

  it("filtra slots pendentes e bloqueia disparos duplicados no mesmo dia", () => {
    const slots = [
      { key: "send_time_1" as const, time: "08:30" },
      { key: "send_time_2" as const, time: "18:00" },
    ];

    const nowMin = 8 * 60 + 30; // 08:30
    let lastSent: Record<string, string> = {};

    // 1º disparo às 08:30
    const firedFirst = slots
      .filter((s) => isTimeDueToday(s.time, nowMin))
      .map((s) => ({ key: s.key, marker: `${TODAY}@${s.time}` }))
      .filter((s) => lastSent[s.key] !== s.marker);

    expect(firedFirst).toHaveLength(1);
    expect(firedFirst[0].key).toBe("send_time_1");
    expect(firedFirst[0].marker).toBe("2026-09-17@08:30");

    // Registra que o slot send_time_1 foi enviado hoje
    lastSent["send_time_1"] = firedFirst[0].marker;

    // 2ª verificação 15 minutos depois (ex: 08:45)
    const nowMinLater = 8 * 60 + 45;
    const firedSecond = slots
      .filter((s) => isTimeDueToday(s.time, nowMinLater))
      .map((s) => ({ key: s.key, marker: `${TODAY}@${s.time}` }))
      .filter((s) => lastSent[s.key] !== s.marker);

    // Não deve disparar novamente porque o marker "2026-09-17@08:30" já foi registrado em last_sent
    expect(firedSecond).toHaveLength(0);
  });

  it("gera o relatório financeiro consolidado formatado para envio no WhatsApp", () => {
    const data = buildDailyFinancialData({
      date: TODAY,
      incomes: [
        { id: "1", description: "Venda Loja", amount: 1500, status: "received", received_date: TODAY },
      ],
      sales: [],
      expenses: [
        { id: "2", description: "Energia", amount: 200, scope: "business", category: "Luz", paid: true, paid_date: TODAY },
      ],
    });

    const text = formatDailyFinancialReportTelegram(data);
    expect(text).toContain("📊 *RELATÓRIO FINANCEIRO DO DIA — 17/09/2026*");
    expect(text).toContain("💰 *RECEITAS*");
    expect(text).toContain("💸 *DESPESAS*");
    expect(text).toContain("📌 *RESUMO DO DIA*");
    expect(text).toContain("1.500,00");
    expect(text).toContain("200,00");
    expect(text).toContain("Saldo: *R$ 1.300,00*");
  });
});
