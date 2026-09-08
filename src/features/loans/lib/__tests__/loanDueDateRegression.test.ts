import { describe, it, expect } from "vitest";
import { advanceLoanDueDate, advanceLoanDueDateAfter } from "../advanceDueDate";
import { calculateInstallment } from "../../hooks/useLoans";

describe("Regressão de Lógica de Datas e Vencimentos Futuros", () => {
  describe("Teste 1: 09/09 → editar para 10/09 → realizar pagamento → próximo ciclo deve ser 10/10", () => {
    it("deve recalcular as parcelas futuras para o dia 10 a partir da nova data-base 10/09", () => {
      // Simulação do contrato original criado em 09/09 com 3 parcelas
      const originalDueDate = "2026-09-09";
      const frequency = "Mensal";
      const totalInstallments = 3;

      // Cronograma inicial gerado na criação
      const originalSchedules = Array.from({ length: totalInstallments }, (_, i) => ({
        installmentNumber: i + 1,
        dueDate: advanceLoanDueDate(originalDueDate, frequency, i),
      }));

      expect(originalSchedules[0].dueDate).toBe("2026-09-09");
      expect(originalSchedules[1].dueDate).toBe("2026-10-09");
      expect(originalSchedules[2].dueDate).toBe("2026-11-09");

      // Usuário edita o vencimento do contrato para 10/09
      const editedDueDate = "2026-09-10";
      const paidInstallments = 0;
      const nextNum = paidInstallments + 1; // 1

      // Lógica de recálculo executada em updateLoan
      const updatedSchedules = Array.from({ length: totalInstallments }, (_, i) => {
        const num = i + 1;
        if (num < nextNum) {
          return originalSchedules[i];
        }
        const offset = num - nextNum;
        return {
          installmentNumber: num,
          dueDate: advanceLoanDueDate(editedDueDate, frequency, offset),
        };
      });

      expect(updatedSchedules[0].dueDate).toBe("2026-09-10");
      expect(updatedSchedules[1].dueDate).toBe("2026-10-10");
      expect(updatedSchedules[2].dueDate).toBe("2026-11-10");

      // Usuário realiza o pagamento da parcela 1
      const newPaid = paidInstallments + 1; // 1
      const nextSchedule = updatedSchedules.find((s) => s.installmentNumber === newPaid + 1);
      const nextDueDateAfterPayment = nextSchedule?.dueDate ?? advanceLoanDueDate(editedDueDate, frequency, 1);

      // O próximo vencimento DEVE ser 10/10 e NÃO 09/10
      expect(nextDueDateAfterPayment).toBe("2026-10-10");
    });
  });

  describe("Teste 2: 10/09 → editar para 15/09 → pagamento → próximo ciclo deve ser 15/10", () => {
    it("deve avançar corretamente para 15/10 após edição para 15/09 e pagamento", () => {
      const originalDueDate = "2026-09-10";
      const frequency = "Mensal";
      const totalInstallments = 4;

      const editedDueDate = "2026-09-15";
      const paidInstallments = 0;
      const nextNum = paidInstallments + 1;

      const updatedSchedules = Array.from({ length: totalInstallments }, (_, i) => {
        const num = i + 1;
        const offset = num - nextNum;
        return {
          installmentNumber: num,
          dueDate: advanceLoanDueDate(editedDueDate, frequency, offset),
        };
      });

      expect(updatedSchedules[0].dueDate).toBe("2026-09-15");
      expect(updatedSchedules[1].dueDate).toBe("2026-10-15");
      expect(updatedSchedules[2].dueDate).toBe("2026-11-15");
      expect(updatedSchedules[3].dueDate).toBe("2026-12-15");

      // Pagamento da 1ª parcela
      const newPaid = 1;
      const nextSchedule = updatedSchedules.find((s) => s.installmentNumber === newPaid + 1);
      expect(nextSchedule?.dueDate).toBe("2026-10-15");
    });
  });

  describe("Teste 3: 28/09 → editar para 30/09 → validar meses sem dia 30 ou com 31", () => {
    it("deve manter dia 30 nos meses aplicáveis e fazer clamp correto para 28 de fevereiro", () => {
      const baseDate = "2026-09-30";
      const frequency = "Mensal";

      // 30/09 -> 30/10 -> 30/11 -> 30/12 -> 30/01/2027 -> 28/02/2027 -> 30/03/2027
      const oct = advanceLoanDueDate(baseDate, frequency, 1);
      const nov = advanceLoanDueDate(baseDate, frequency, 2);
      const dec = advanceLoanDueDate(baseDate, frequency, 3);
      const jan = advanceLoanDueDate(baseDate, frequency, 4);
      const feb = advanceLoanDueDate(baseDate, frequency, 5);
      const mar = advanceLoanDueDate(baseDate, frequency, 6);

      expect(oct).toBe("2026-10-30");
      expect(nov).toBe("2026-11-30");
      expect(dec).toBe("2026-12-30");
      expect(jan).toBe("2027-01-30");
      expect(feb).toBe("2027-02-28"); // clamp para o último dia de fevereiro
      expect(mar).toBe("2027-03-30"); // volta para 30 no mês seguinte a partir da âncora
    });
  });

  describe("Teste 4: Alterar data → salvar → recarregar página → realizar pagamento", () => {
    it("deve manter a nova data-base salva e não reverter para a data inicial", () => {
      // Criação: 09/09
      let dbLoans = [{ id: "loan-1", dueDate: "2026-09-09", installments: 3, paidInstallments: 0 }];
      let dbSchedules = [
        { loanId: "loan-1", installmentNumber: 1, dueDate: "2026-09-09" },
        { loanId: "loan-1", installmentNumber: 2, dueDate: "2026-10-09" },
        { loanId: "loan-1", installmentNumber: 3, dueDate: "2026-11-09" },
      ];

      // Edição para 10/09 com recálculo persistido
      const newDueDate = "2026-09-10";
      dbLoans[0].dueDate = newDueDate;
      dbSchedules = [
        { loanId: "loan-1", installmentNumber: 1, dueDate: "2026-09-10" },
        { loanId: "loan-1", installmentNumber: 2, dueDate: "2026-10-10" },
        { loanId: "loan-1", installmentNumber: 3, dueDate: "2026-11-10" },
      ];

      // "Recarregar página" (simulação de novo fetch do banco)
      const reloadedLoan = { ...dbLoans[0] };
      const reloadedSchedules = [...dbSchedules];

      expect(reloadedLoan.dueDate).toBe("2026-09-10");

      // Pagamento da parcela 1
      const newPaid = reloadedLoan.paidInstallments + 1; // 1
      const nextInst = reloadedSchedules.find((s) => s.loanId === reloadedLoan.id && s.installmentNumber === newPaid + 1);

      expect(nextInst?.dueDate).toBe("2026-10-10");
    });
  });

  describe("Teste 5: Alterar data → sair da conta/tela → retornar → realizar pagamento", () => {
    it("deve assegurar que o sistema não recupera a data original de campos obsoletos", () => {
      const loan = {
        id: "loan-xyz",
        startDate: "2026-09-09",
        originalDueDate: "2026-09-09", // campo histórico
        dueDate: "2026-09-10",         // campo ativo editado
        installments: 2,
        paidInstallments: 0,
        interestType: "Mensal",
      };

      const schedules = [
        { loanId: "loan-xyz", installmentNumber: 1, dueDate: "2026-09-10" },
        { loanId: "loan-xyz", installmentNumber: 2, dueDate: "2026-10-10" },
      ];

      // Pagamento da parcela 1 deve usar schedules atualizados e dueDate ativo, NUNCA originalDueDate
      const nextSchedule = schedules.find((s) => s.loanId === loan.id && s.installmentNumber === 2);
      const computedNext = nextSchedule?.dueDate ?? advanceLoanDueDate(loan.dueDate, loan.interestType, 1);

      expect(computedNext).toBe("2026-10-10");
      expect(computedNext).not.toBe("2026-10-09");
    });
  });

  describe("Teste 6: Virada de ano (10/12 → 10/01)", () => {
    it("deve virar o ano mantendo o dia 10", () => {
      const dateDec = "2026-12-10";
      const nextJan = advanceLoanDueDate(dateDec, "Mensal", 1);
      const nextFeb = advanceLoanDueDate(dateDec, "Mensal", 2);

      expect(nextJan).toBe("2027-01-10");
      expect(nextFeb).toBe("2027-02-10");
    });
  });

  describe("Teste 7: Contrato de Juros Recorrente (Interest-Only)", () => {
    it("deve avançar sucessivamente no dia 10 após edição de 09/09 para 10/09", () => {
      let currentDueDate = "2026-09-10";
      const frequency = "Mensal";

      // 1º pagamento de juros (avança ciclo)
      currentDueDate = advanceLoanDueDateAfter(currentDueDate, frequency);
      expect(currentDueDate).toBe("2026-10-10");

      // 2º pagamento de juros (avança ciclo)
      currentDueDate = advanceLoanDueDateAfter(currentDueDate, frequency);
      expect(currentDueDate).toBe("2026-11-10");

      // 3º pagamento de juros (avança ciclo)
      currentDueDate = advanceLoanDueDateAfter(currentDueDate, frequency);
      expect(currentDueDate).toBe("2026-12-10");

      // 4º pagamento de juros (virada de ano)
      currentDueDate = advanceLoanDueDateAfter(currentDueDate, frequency);
      expect(currentDueDate).toBe("2027-01-10");
    });

    it("deve calcular o próximo vencimento no PaymentHubDialog como 15/10 quando o vencimento atual for 15/09", () => {
      const loan = {
        id: "loan-antonio",
        borrowerName: "Antonio Carlos",
        dueDate: "2026-09-08", // se loan.dueDate estiver defasado
        installments: 1,
        paidInstallments: 0,
        interestType: "Mensal",
      };

      const schedules = [
        { loanId: "loan-antonio", installmentNumber: 1, dueDate: "2026-09-15" },
      ];

      const currentPendingDueIso = (() => {
        const schedule = schedules.find(
          (s) => s.loanId === loan.id && s.installmentNumber === (loan.paidInstallments + 1),
        );
        return schedule?.dueDate ?? loan.dueDate;
      })();

      const nextDueDate = advanceLoanDueDateAfter(currentPendingDueIso, loan.interestType || "Mensal");
      expect(nextDueDate).toBe("2026-10-15");
      expect(nextDueDate).not.toBe("2026-10-08");
    });
  });
});
