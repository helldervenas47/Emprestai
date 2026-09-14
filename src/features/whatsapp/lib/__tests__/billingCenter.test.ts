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

  it("ignora Nova Data quando for menor que a data de vencimento atual", () => {
    const result = buildBillingCandidates({
      loans: [loan("invalid-promise", "2026-09-27")],
      clients: [client], schedules: [], payments: [], today: "2026-09-12",
      promises: [{ loan_id: "invalid-promise", installment_number: 1, promised_date: "2026-09-15" }],
    });
    expect(result[0]).toMatchObject({
      dueDate: "2026-09-27",
      billingDate: "2026-09-27",
      promisedDate: undefined,
    });
  });

  it("elimina resíduos de ponto flutuante nos juros exibidos na Central", () => {
    const result = buildBillingCandidates({
      loans: [
        { ...loan("lucas", "2026-09-10"), amount: 1099.96, remainingAmount: 1150, installments: 2 },
        { ...loan("thiago", "2026-09-10"), amount: 299.98, remainingAmount: 1000, installments: 2 },
      ],
      clients: [client], schedules: [], payments: [], today: "2026-09-10",
    });
    expect(result.find((i) => i.loanId === "lucas")?.interestAmount % 1).toBe(0);
    expect(result.find((i) => i.loanId === "thiago")?.interestAmount % 1).toBe(0);
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

  it("separa principal e juros em contrato com modalidade Juros", () => {
    const result = buildBillingCandidates({
      loans: [{
        ...loan("interest-mode", "2026-09-10"),
        amount: 1100,
        remainingAmount: 1430,
        interestRate: 30,
        paymentType: "Juros",
      }],
      clients: [client], schedules: [], payments: [], today: "2026-09-10",
    });

    expect(result[0].amount).toBe(1430);
    expect(result[0].interestAmount).toBe(330);
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

  it("soma apenas as parcelas devidas até o dia atual em contratos parcelados e não inclui parcelas futuras", () => {
    const result = buildBillingCandidates({
      loans: [{
        ...loan("installments-due-today", "2026-09-01"),
        installments: 10,
        amount: 1000,
        remainingAmount: 1000,
      }],
      clients: [client],
      payments: [],
      today: "2026-09-10",
      schedules: [
        { loanId: "installments-due-today", installmentNumber: 1, dueDate: "2026-09-01", amount: 100 },
        { loanId: "installments-due-today", installmentNumber: 2, dueDate: "2026-09-10", amount: 100 },
        { loanId: "installments-due-today", installmentNumber: 3, dueDate: "2026-09-20", amount: 100 },
        { loanId: "installments-due-today", installmentNumber: 4, dueDate: "2026-10-01", amount: 100 },
      ],
    });

    expect(result).toHaveLength(1);
    // Parcelas 1 (01/09) e 2 (10/09) são <= today (10/09). Total a cobrar: 200, NÃO 1000.
    expect(result[0].baseAmount).toBe(200);
    expect(result[0].amount).toBe(200);
  });

  it("traz apenas o valor de 1 parcela quando o contrato parcelado tem vencimento futuro", () => {
    const result = buildBillingCandidates({
      loans: [{
        ...loan("future-installments", "2026-09-12"),
        installments: 5,
        amount: 1000,
        remainingAmount: 1000,
      }],
      clients: [client],
      payments: [],
      today: "2026-09-10",
      schedules: [
        { loanId: "future-installments", installmentNumber: 1, dueDate: "2026-09-12", amount: 200 },
        { loanId: "future-installments", installmentNumber: 2, dueDate: "2026-10-12", amount: 200 },
        { loanId: "future-installments", installmentNumber: 3, dueDate: "2026-11-12", amount: 200 },
      ],
    });

    expect(result).toHaveLength(1);
    // Próxima parcela vence em 12/09 (D+2). Deve trazer apenas 200 (1 parcela), e NÃO os 1000 de remainingAmount
    expect(result[0].amount).toBe(200);
    expect(result[0].baseAmount).toBe(200);
    expect(result[0].priority).toBe("in_two_days");
  });

  it("não duplica nem soma renegotiationPenaltyTotal quando o contrato já possui remainingAmount definido", () => {
    const result = buildBillingCandidates({
      loans: [{
        ...loan("thiago-ferraz-1", "2026-06-20"),
        installments: 1,
        amount: 400,
        remainingAmount: 500,
        renegotiationPenaltyTotal: 400,
      }],
      clients: [client],
      schedules: [],
      payments: [],
      today: "2026-09-14",
    });

    expect(result).toHaveLength(1);
    // Deve ser exatamente 500 (e não 500 + 400 = 900)
    expect(result[0].baseAmount).toBe(500);
    expect(result[0].amount).toBe(500);
  });
});


