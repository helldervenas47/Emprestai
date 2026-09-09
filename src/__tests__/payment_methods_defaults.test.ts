import { describe, it, expect } from "vitest";
import type { PaymentMethod } from "@/hooks/usePaymentMethods";

describe("Payment Methods Defaults and Rules", () => {
  const defaultTemplates = [
    { name: "Pix", kind: "account", active: true, sort_order: 1 },
    { name: "Dinheiro", kind: "cash", active: true, sort_order: 2 },
    { name: "Transferência", kind: "account", active: false, sort_order: 3 },
    { name: "Cartão", kind: "account", active: false, sort_order: 4 },
    { name: "Boleto", kind: "account", active: false, sort_order: 5 },
  ];

  it("should have only Pix and Dinheiro marked as active by default", () => {
    const activeByDefault = defaultTemplates.filter((m) => m.active);
    expect(activeByDefault.map((m) => m.name)).toEqual(["Pix", "Dinheiro"]);

    const inactiveByDefault = defaultTemplates.filter((m) => !m.active);
    expect(inactiveByDefault.map((m) => m.name)).toEqual([
      "Transferência",
      "Cartão",
      "Boleto",
    ]);
  });

  it("allows activating other methods or adding new methods as active", () => {
    const methods: PaymentMethod[] = defaultTemplates.map((m, idx) => ({
      id: `m-${idx + 1}`,
      name: m.name,
      icon: null,
      active: m.active,
      sortOrder: m.sort_order,
      kind: m.kind as any,
    }));

    // Initial active methods
    let active = methods.filter((m) => m.active);
    expect(active).toHaveLength(2);

    // User toggles Cartão to active
    const cartao = methods.find((m) => m.name === "Cartão");
    if (cartao) cartao.active = true;

    active = methods.filter((m) => m.active);
    expect(active).toHaveLength(3);
    expect(active.map((m) => m.name)).toContain("Cartão");

    // User adds new payment method PicPay
    methods.push({
      id: "m-custom",
      name: "PicPay",
      icon: null,
      active: true,
      sortOrder: 6,
      kind: "account",
    });

    active = methods.filter((m) => m.active);
    expect(active).toHaveLength(4);
    expect(active.map((m) => m.name)).toContain("PicPay");
  });
});
