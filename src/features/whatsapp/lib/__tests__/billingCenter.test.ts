import { describe, expect, it } from "vitest";
import { buildBillingCandidates, isValidWhatsappPhone } from "../billingCenter";

const client: any = { id: "c1", name: "João", phone: "(11) 99999-9999", active: true };
const loan = (id: string, dueDate: string, status = "active"): any => ({
  id, borrowerId: "c1", borrowerName: "João", dueDate, status,
  installments: 1, paidInstallments: 0, amount: 100, remainingAmount: 100,
});

describe("Central de Cobranças", () => {
  it("classifica vencidas, hoje e futuras até D+4", () => {
    const result = buildBillingCandidates({
      loans: [loan("late", "2026-09-09"), loan("today", "2026-09-10"), loan("tomorrow", "2026-09-11"), loan("two", "2026-09-12"), loan("three", "2026-09-13"), loan("four", "2026-09-14")],
      clients: [client], schedules: [], payments: [], today: "2026-09-10",
    });
    expect(result.map((r) => r.priority)).toEqual(["today", "overdue", "tomorrow", "in_two_days", "in_three_days", "in_four_days"]);
  });

  it("prioriza promessa para hoje e ignora quitadas", () => {
    const result = buildBillingCandidates({
      loans: [loan("promised", "2026-09-01"), loan("paid", "2026-09-01", "paid")],
      clients: [client], schedules: [], payments: [], today: "2026-09-10",
      promises: [{ loan_id: "promised", installment_number: 1, promised_date: "2026-09-10" }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].priority).toBe("requested_today");
  });

  it("usa a Nova Data estruturada sem mudar o vencimento nem o atraso", () => {
    const result = buildBillingCandidates({
      loans: [loan("new-date", "2026-09-05")],
      clients: [client], schedules: [], payments: [], today: "2026-09-12",
      promises: [{ loan_id: "new-date", installment_number: 1, promised_date: "2026-09-12" }],
    });
    expect(result[0]).toMatchObject({
      priority: "requested_today",
      dueDate: "2026-09-05",
      promisedDate: "2026-09-12",
      promisedDateSource: "stored",
      daysOverdue: 7,
    });
  });

  it("organiza Nova Data futura pela data prevista", () => {
    const result = buildBillingCandidates({
      loans: [loan("future-date", "2026-09-01")],
      clients: [client], schedules: [], payments: [], today: "2026-09-10",
      promises: [{ loan_id: "future-date", installment_number: 1, promised_date: "2026-09-12" }],
    });
    expect(result[0]).toMatchObject({ priority: "in_two_days", dueDate: "2026-09-01", promisedDate: "2026-09-12", daysOverdue: 9 });
    expect(result[0].message).toContain("Venc. 12/09/2026");
    expect(result[0].message).not.toContain("01/09/2026");
    expect(result[0].message).not.toContain("9 dia");
  });

  it("ordena pela Nova Data priorizada e usa o vencimento quando ela não existe", () => {
    const result = buildBillingCandidates({
      loans: [loan("original-first", "2026-09-01"), loan("new-date-first", "2026-09-05")],
      clients: [client], schedules: [], payments: [], today: "2026-08-30",
      promises: [{ loan_id: "original-first", installment_number: 1, promised_date: "2026-09-02" }],
    });
    expect(result.find((item) => item.loanId === "original-first")?.billingDate).toBe("2026-09-02");
    expect(result.find((item) => item.loanId === "new-date-first")?.billingDate).toBe("2026-09-05");
  });

  it("mantém cobranças além de D+4 somente para a visão Total", () => {
    const result = buildBillingCandidates({ loans: [loan("later", "2026-09-20")], clients: [client], schedules: [], payments: [], today: "2026-09-10" });
    expect(result[0].priority).toBe("future_later");
  });

  it("valida telefone brasileiro para WhatsApp", () => {
    expect(isValidWhatsappPhone("(11) 99999-9999")).toBe(true);
    expect(isValidWhatsappPhone("123")).toBe(false);
  });

  it("mantém contratos pendentes de clientes inativos e não os oculta por histórico de pagamento", () => {
    const result = buildBillingCandidates({
      loans: [loan("pending", "2026-09-09")],
      clients: [{ ...client, active: false }],
      schedules: [],
      payments: [{ loanId: "pending", installmentNumber: 1 } as any],
      today: "2026-09-10",
    });
    expect(result).toHaveLength(1);
    expect(result[0].priority).toBe("overdue");
  });

  it("exibe contrato pendente mesmo quando o cadastro do cliente não está mais disponível", () => {
    const result = buildBillingCandidates({
      loans: [{ ...loan("orphan", "2026-09-09"), borrowerName: "Cliente preservado" }],
      clients: [], schedules: [], payments: [], today: "2026-09-10",
    });
    expect(result[0]).toMatchObject({ clientName: "Cliente preservado", validPhone: false, priority: "overdue" });
  });

  it("usa o nome do cliente quando o contrato não possui etiqueta", () => {
    const result = buildBillingCandidates({
      loans: [loan("today", "2026-09-10")],
      clients: [client], schedules: [], payments: [], today: "2026-09-10",
    });
    expect(result[0].contractLabel).toBe("João");
  });

  it("usa a parcela pendente em contratos parcelados e o restante em parcela única", () => {
    const installmentLoan = { ...loan("installments", "2026-09-10"), installments: 3, remainingAmount: 200 };
    const singleLoan = { ...loan("single", "2026-09-10"), remainingAmount: 75 };
    const result = buildBillingCandidates({
      loans: [installmentLoan, singleLoan], clients: [client], payments: [], today: "2026-09-10",
      schedules: [
        { loanId: "installments", installmentNumber: 1, dueDate: "2026-09-10", amount: 100 },
        { loanId: "installments", installmentNumber: 2, dueDate: "2026-10-10", amount: 100 },
      ],
    });
    expect(result.find((item) => item.loanId === "installments")?.amount).toBe(100);
    expect(result.find((item) => item.loanId === "single")?.amount).toBe(75);
  });

  it("mantém um valor válido em contratos antigos e soma juros e multa ao saldo", () => {
    const result = buildBillingCandidates({
      loans: [{
        ...loan("legacy", "2026-09-09"),
        amount: 600,
        remainingAmount: 500,
        interestRate: undefined,
        lateInterestType: "fixed",
        lateInterestValue: 10,
        penaltyValue: 25,
      }],
      clients: [client], schedules: [], payments: [], today: "2026-09-10",
    });
    expect(Number.isFinite(result[0].amount)).toBe(true);
    expect(result[0].amount).toBe(535);
    expect(result[0].message).not.toContain("NaN");
  });

  it("soma e informa múltiplas parcelas vencidas", () => {
    const result = buildBillingCandidates({
      loans: [{ ...loan("multiple-overdue", "2026-07-10"), installments: 3, remainingAmount: 300 }],
      clients: [client], payments: [], today: "2026-09-10",
      schedules: [
        { loanId: "multiple-overdue", installmentNumber: 1, dueDate: "2026-07-10", amount: 100 },
        { loanId: "multiple-overdue", installmentNumber: 2, dueDate: "2026-08-10", amount: 100 },
        { loanId: "multiple-overdue", installmentNumber: 3, dueDate: "2026-10-10", amount: 100 },
      ],
    });
    expect(result[0]).toMatchObject({ overdueInstallmentCount: 2, amount: 200 });
    expect(result[0].message).toContain("2 parcelas vencidas");
    expect(result[0].message).toContain("R$ 200,00");
  });

  it("usa a mensagem de vencido e inclui a etiqueta do contrato", () => {
    const result = buildBillingCandidates({
      loans: [{ ...loan("late", "2026-09-01"), tags: ["Contrato Ouro"] }],
      clients: [client], schedules: [], payments: [], today: "2026-09-10",
      messages: {
        message_due_today: "vence hoje",
        message_overdue: "venceu há {dias_atraso} dias — {etiqueta}",
        very_overdue_days: 30,
      },
    });
    expect(result[0].message).toBe("venceu há 9 dias — Contrato Ouro");
    expect(result[0].contractLabel).toBe("Contrato Ouro");
  });
});
