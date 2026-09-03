import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateContract } from "@/lib/generateContract";
import { Sale, Client } from "@/types/loan";
import { LocadorInfo } from "@/features/vehicles/hooks/useLocadorInfo";
import { VehicleInfo } from "@/features/vehicles/hooks/useVehicleRegistry";

describe("generateContract - Cláusula 8ª e Cidade do Foro", () => {
  let capturedHtml = "";

  beforeEach(() => {
    capturedHtml = "";
    // Mock window.open
    const mockWindow = {
      document: {
        open: vi.fn(),
        write: vi.fn((content: string) => {
          capturedHtml += content;
        }),
        close: vi.fn(),
      },
    };
    vi.spyOn(window, "open").mockReturnValue(mockWindow as any);
  });

  const baseSale: Sale = {
    id: "sale-1",
    productName: "Honda CG 160",
    description: "Honda CG 160",
    quantity: 1,
    unitPrice: 1000,
    cost: 0,
    total: 1000,
    customerName: "João Silva",
    date: "2026-09-02",
    businessType: "aluguel_veiculo",
    paymentMode: "recorrente",
    installments: 1,
    paidInstallments: 0,
    downPayment: 0,
    frequency: "Mensal",
    partialPaid: 0,
    foroCity: "Feira de Santana - BA",
  };

  it("utiliza foroCity definido na venda para a Cláusula 8ª e para a data do rodapé", async () => {
    await generateContract(baseSale);

    expect(capturedHtml).toContain("CLÁUSULA 8ª – DO FORO");
    expect(capturedHtml).toContain("Fica eleito o foro da comarca de Feira de Santana - BA para dirimir");
    expect(capturedHtml).toContain('<p class="location-date">Feira de Santana - BA, ');
  });

  it("utiliza a cidade do cliente quando sale.foroCity não está preenchido", async () => {
    const saleWithoutForo: Sale = {
      ...baseSale,
      foroCity: null,
    };
    const client: Client = {
      id: "cli-1",
      name: "João Silva",
      phone: "71999999999",
      email: "joao@example.com",
      cpf: "123.456.789-00",
      cnpj: "",
      rg: "1234567",
      address: "Rua A",
      city: "Salvador",
      state: "BA",
      score: "A",
      active: true,
      createdAt: "2026-01-01",
    };

    await generateContract(saleWithoutForo, client);

    expect(capturedHtml).toContain("Fica eleito o foro da comarca de Salvador - BA para dirimir");
    expect(capturedHtml).toContain('<p class="location-date">Salvador - BA, ');
  });

  it("utiliza a cidade do locador quando nem a venda nem o cliente possuem cidade", async () => {
    const saleWithoutForo: Sale = {
      ...baseSale,
      foroCity: null,
    };
    const locador: LocadorInfo = {
      id: "loc-1",
      nome: "Locadora Bahia",
      rg: "12345",
      cpf: "98765432100",
      nacionalidade: "Brasileiro(a)",
      profissao: "Empresário",
      endereco: "Av Brasil",
      bairro: "Centro",
      cidade: "Camaçari",
      estado: "BA",
    };

    await generateContract(saleWithoutForo, undefined, locador);

    expect(capturedHtml).toContain("Fica eleito o foro da comarca de Camaçari - BA para dirimir");
    expect(capturedHtml).toContain('<p class="location-date">Camaçari - BA, ');
  });
});
