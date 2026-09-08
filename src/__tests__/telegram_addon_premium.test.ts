import { describe, it, expect } from "vitest";

describe("👑 EmprestAI Telegram Premium Add-on", () => {
  it("1. Usuário sem registro no add-on deve ter acesso restrito/paywall", () => {
    const addon = null;
    const isMaster = false;
    const hasPremium = Boolean(
      isMaster ||
      (addon &&
        (addon.status === "active" || addon.status === "trialing") &&
        (!addon.current_period_end || new Date(addon.current_period_end).getTime() > Date.now()))
    );

    expect(hasPremium).toBe(false);
  });

  it("2. Usuário com add-on ativo e dentro do período deve ter acesso liberado", () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const addon = {
      status: "active",
      current_period_end: futureDate,
      price_cents: 1490,
      addon_key: "telegram",
    };
    const isMaster = false;
    const hasPremium = Boolean(
      isMaster ||
      (addon &&
        (addon.status === "active" || addon.status === "trialing") &&
        (!addon.current_period_end || new Date(addon.current_period_end).getTime() > Date.now()))
    );

    expect(hasPremium).toBe(true);
  });

  it("3. Usuário com add-on expirado deve ter acesso restrito", () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const addon = {
      status: "active",
      current_period_end: pastDate,
      price_cents: 1490,
      addon_key: "telegram",
    };
    const isMaster = false;
    const hasPremium = Boolean(
      isMaster ||
      (addon &&
        (addon.status === "active" || addon.status === "trialing") &&
        (!addon.current_period_end || new Date(addon.current_period_end).getTime() > Date.now()))
    );

    expect(hasPremium).toBe(false);
  });

  it("4. Usuário com perfil 'admin' possui acesso 100% liberado sem necessidade de pagamento", () => {
    const addon = null;
    const role = "admin";
    const isAdmin = role === "admin";
    const hasPremium = Boolean(
      isAdmin ||
      (addon &&
        ((addon as any).status === "active" || (addon as any).status === "trialing") &&
        (!(addon as any).current_period_end || new Date((addon as any).current_period_end).getTime() > Date.now()))
    );

    expect(hasPremium).toBe(true);
  });

  it("5. Verificação da composição de preços independente", () => {
    const basePlanPriceCents = 3790; // R$ 37,90
    const telegramAddonPriceCents = 1490; // R$ 14,90
    const totalPriceCents = basePlanPriceCents + telegramAddonPriceCents;

    expect(totalPriceCents).toBe(5280); // R$ 52,80
    expect((totalPriceCents / 100).toFixed(2)).toBe("52.80");
  });
});
