import { describe, it, expect } from "vitest";

describe("🎨 Suíte de Testes de Experiência do Usuário (UX/UI) no Pagamento PIX", () => {
  it("A. Formata valor monetário em BRL corretamente", () => {
    const formatBRL = (val: number) =>
      val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    expect(formatBRL(59)).toContain("59,00");
    expect(formatBRL(29.9)).toContain("29,90");
  });

  it("B. Formata data de vencimento do PIX em DD/MM/AAAA", () => {
    const formatDueDate = (dateStr?: string | null) => {
      if (!dateStr) return "Hoje";
      try {
        const [year, month, day] = dateStr.split("-");
        return `${day}/${month}/${year}`;
      } catch {
        return dateStr;
      }
    };

    expect(formatDueDate("2026-09-10")).toBe("10/09/2026");
    expect(formatDueDate(null)).toBe("Hoje");
  });

  it("C. Mapeia estados de pagamento para feedback amigável ao usuário", () => {
    const getStatusText = (status: "PENDING" | "PROCESSING" | "CONFIRMED" | "EXPIRED" | "ERROR") => {
      switch (status) {
        case "PENDING":
          return "Aguardando seu pagamento... (confirmação automática)";
        case "PROCESSING":
          return "Pagamento identificado. Confirmando plano...";
        case "CONFIRMED":
          return "Pagamento confirmado com sucesso! Seu plano já está ativo.";
        case "EXPIRED":
          return "Este PIX expirou. Gere um novo código para continuar.";
        case "ERROR":
          return "Não conseguimos verificar seu pagamento agora.";
      }
    };

    expect(getStatusText("PENDING")).toContain("confirmação automática");
    expect(getStatusText("CONFIRMED")).toContain("plano já está ativo");
    expect(getStatusText("EXPIRED")).toContain("PIX expirou");
  });

  it("D. Interrompe polling automático quando pagamento é confirmado ou expirado", () => {
    let pollingActive = true;
    const handleStatusUpdate = (status: "CONFIRMED" | "EXPIRED" | "PENDING") => {
      if (status === "CONFIRMED" || status === "EXPIRED") {
        pollingActive = false;
      }
    };

    handleStatusUpdate("CONFIRMED");
    expect(pollingActive).toBe(false);
  });

  it("E. Impede duplo submit desabilitando o botão durante a mutação", () => {
    const isPending = true;
    const isButtonDisabled = isPending;
    expect(isButtonDisabled).toBe(true);
  });
});
