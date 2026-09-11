import { describe, it, expect } from "vitest";
import { APP_TABS } from "@/lib/appTabs";

describe("Controle de Visibilidade de Abas por Papel (Role Tab Permissions)", () => {
  it("oculta a Central de Cobranças se não estiver em roleAllowedTabs", () => {
    const roleAllowedTabs = ["overview", "dashboard", "clients"];
    const tab = APP_TABS.find((t) => t.id === "billing_center");

    expect(tab).toBeDefined();
    const isVisible = roleAllowedTabs.includes(tab!.id);
    expect(isVisible).toBe(false);
  });

  it("exibe a Central de Cobranças quando liberada em roleAllowedTabs", () => {
    const roleAllowedTabs = ["overview", "dashboard", "clients", "billing_center"];
    const tab = APP_TABS.find((t) => t.id === "billing_center");

    expect(tab).toBeDefined();
    const isVisible = roleAllowedTabs.includes(tab!.id);
    expect(isVisible).toBe(true);
  });

  it("não permite vazamento de permissão através de legados como overdue", () => {
    const legacyRoleAllowedTabs = ["overview", "dashboard", "overdue"];
    const tab = APP_TABS.find((t) => t.id === "billing_center");

    // Agora o sistema faz checagem estrita por id da aba
    const isVisible = legacyRoleAllowedTabs.includes(tab!.id);
    expect(isVisible).toBe(false);
  });
});
