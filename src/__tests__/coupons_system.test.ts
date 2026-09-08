import { describe, it, expect } from "vitest";

describe("🎟️ Sistema de Cupons de Desconto - Regras de Negócio e Cálculos", () => {
  // Helper que replica a regra da RPC e da Edge Function
  function calculateCouponDiscount(
    basePriceCents: number,
    coupon: {
      active: boolean;
      discount_type: "percentage" | "fixed";
      discount_value: number;
      expires_at?: string | null;
      max_uses?: number | null;
      used_count: number;
      applicable_plan_ids?: string[];
    },
    planId: string,
    userUsagesCount = 0,
    maxUsesPerUser: number | null = null
  ) {
    if (!coupon.active) {
      return { valid: false, error: "Cupom inativo" };
    }

    if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
      return { valid: false, error: "Cupom expirado" };
    }

    if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) {
      return { valid: false, error: "Limite global de uso atingido" };
    }

    if (maxUsesPerUser != null && userUsagesCount >= maxUsesPerUser) {
      return { valid: false, error: "Limite de uso por usuário atingido" };
    }

    if (
      coupon.applicable_plan_ids &&
      coupon.applicable_plan_ids.length > 0 &&
      !coupon.applicable_plan_ids.includes(planId)
    ) {
      return { valid: false, error: "Cupom não aplicável a este plano" };
    }

    let discountCents = 0;
    if (coupon.discount_type === "percentage") {
      discountCents = Math.round((basePriceCents * coupon.discount_value) / 100);
    } else {
      discountCents = Math.round(coupon.discount_value * 100);
    }

    if (discountCents > basePriceCents) {
      discountCents = basePriceCents;
    }

    const finalCents = Math.max(0, basePriceCents - discountCents);

    return {
      valid: true,
      discountCents,
      finalCents,
      originalCents: basePriceCents,
    };
  }

  it("1. Normalização do código do cupom (case-insensitive e remoção de espaços)", () => {
    const rawInputs = [" promo20 ", "PROMO20", "Promo20", " promo 20 "];
    const normalized = rawInputs.map((i) => i.trim().toUpperCase().replace(/\s+/g, ""));
    normalized.forEach((code) => {
      expect(code).toBe("PROMO20");
    });
  });

  it("2. Cálculo de desconto percentual (20% em plano de R$ 37,90)", () => {
    const basePriceCents = 3790; // R$ 37,90
    const coupon = {
      active: true,
      discount_type: "percentage" as const,
      discount_value: 20,
      used_count: 5,
    };

    const result = calculateCouponDiscount(basePriceCents, coupon, "plan-1");
    expect(result.valid).toBe(true);
    expect(result.discountCents).toBe(758); // 20% de 3790 = 758 centavos (R$ 7,58)
    expect(result.finalCents).toBe(3032); // R$ 30,32
  });

  it("3. Cálculo de desconto de valor fixo (R$ 10,00 em plano de R$ 37,90)", () => {
    const basePriceCents = 3790;
    const coupon = {
      active: true,
      discount_type: "fixed" as const,
      discount_value: 10,
      used_count: 0,
    };

    const result = calculateCouponDiscount(basePriceCents, coupon, "plan-1");
    expect(result.valid).toBe(true);
    expect(result.discountCents).toBe(1000); // R$ 10,00
    expect(result.finalCents).toBe(2790); // R$ 27,90
  });

  it("4. Proteção contra valor negativo quando o desconto fixo supera o preço base", () => {
    const basePriceCents = 1490; // Add-on Telegram R$ 14,90
    const coupon = {
      active: true,
      discount_type: "fixed" as const,
      discount_value: 20, // R$ 20,00 de desconto
      used_count: 0,
    };

    const result = calculateCouponDiscount(basePriceCents, coupon, "telegram-addon");
    expect(result.valid).toBe(true);
    expect(result.discountCents).toBe(1490);
    expect(result.finalCents).toBe(0); // Não fica negativo
  });

  it("5. Rejeição de cupom inativo", () => {
    const basePriceCents = 3790;
    const coupon = {
      active: false,
      discount_type: "percentage" as const,
      discount_value: 15,
      used_count: 0,
    };

    const result = calculateCouponDiscount(basePriceCents, coupon, "plan-1");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Cupom inativo");
  });

  it("6. Rejeição de cupom expirado por data", () => {
    const basePriceCents = 3790;
    const pastDate = new Date(Date.now() - 3600000).toISOString();
    const coupon = {
      active: true,
      discount_type: "percentage" as const,
      discount_value: 10,
      expires_at: pastDate,
      used_count: 0,
    };

    const result = calculateCouponDiscount(basePriceCents, coupon, "plan-1");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Cupom expirado");
  });

  it("7. Rejeição quando atingido o limite máximo de usos global", () => {
    const basePriceCents = 3790;
    const coupon = {
      active: true,
      discount_type: "percentage" as const,
      discount_value: 50,
      max_uses: 100,
      used_count: 100,
    };

    const result = calculateCouponDiscount(basePriceCents, coupon, "plan-1");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Limite global de uso atingido");
  });

  it("8. Rejeição quando atingido o limite de usos por usuário", () => {
    const basePriceCents = 3790;
    const coupon = {
      active: true,
      discount_type: "fixed" as const,
      discount_value: 15,
      used_count: 10,
    };

    const result = calculateCouponDiscount(basePriceCents, coupon, "plan-1", 1, 1);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Limite de uso por usuário atingido");
  });

  it("9. Validação de restrição de plano (permitido vs não permitido)", () => {
    const basePriceCents = 5990;
    const coupon = {
      active: true,
      discount_type: "percentage" as const,
      discount_value: 10,
      used_count: 0,
      applicable_plan_ids: ["plan-pro", "plan-enterprise"],
    };

    // Plano compatível
    const validResult = calculateCouponDiscount(basePriceCents, coupon, "plan-pro");
    expect(validResult.valid).toBe(true);
    expect(validResult.discountCents).toBe(599);

    // Plano incompatível
    const invalidResult = calculateCouponDiscount(basePriceCents, coupon, "plan-basic");
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.error).toBe("Cupom não aplicável a este plano");
  });

  it("10. Cupom aberto para 'Todos os planos' (applicable_plan_ids vazio)", () => {
    const basePriceCents = 5990;
    const coupon = {
      active: true,
      discount_type: "percentage" as const,
      discount_value: 15,
      used_count: 0,
      applicable_plan_ids: [],
    };

    const result1 = calculateCouponDiscount(basePriceCents, coupon, "qualquer-plano-1");
    const result2 = calculateCouponDiscount(basePriceCents, coupon, "qualquer-plano-2");
    expect(result1.valid).toBe(true);
    expect(result2.valid).toBe(true);
  });
});
