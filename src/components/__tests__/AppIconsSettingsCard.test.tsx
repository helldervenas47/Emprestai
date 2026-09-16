import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { AppIconsSettingsCard } from "../AppIconsSettingsCard";
import { renderHook, act } from "@testing-library/react";
import { useAppIcons, DEFAULT_TAB_ICONS, ICON_PRESETS } from "@/hooks/useAppIcons";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Hook useAppIcons e AppIconsSettingsCard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("retorna os ícones padrões quando nenhum customizado está definido", () => {
    const { result } = renderHook(() => useAppIcons());
    expect(result.current.getTabIconName("dashboard")).toBe(DEFAULT_TAB_ICONS.dashboard);
    expect(result.current.getTabIconName("expenses")).toBe(DEFAULT_TAB_ICONS.expenses);
    expect(result.current.activePresetId).toBe("padrao");
  });

  it("permite alterar o ícone de um módulo específico e persiste em localStorage", async () => {
    const { result } = renderHook(() => useAppIcons());

    await act(async () => {
      await result.current.setIconForTab("dashboard", "HandCoins");
    });

    expect(result.current.getTabIconName("dashboard")).toBe("HandCoins");
    expect(localStorage.getItem("hvcred-app-custom-icons")).toContain("HandCoins");
  });

  it("permite aplicar um preset completo e restaurar para os padrões", async () => {
    const { result } = renderHook(() => useAppIcons());

    await act(async () => {
      await result.current.applyPreset("moderno");
    });

    const modernoPreset = ICON_PRESETS.find((p) => p.id === "moderno")!;
    expect(result.current.getTabIconName("dashboard")).toBe(modernoPreset.mapping.dashboard);
    expect(result.current.activePresetId).toBe("moderno");

    await act(async () => {
      await result.current.resetToDefaults();
    });

    expect(result.current.getTabIconName("dashboard")).toBe(DEFAULT_TAB_ICONS.dashboard);
    expect(result.current.activePresetId).toBe("padrao");
  });

  it("renderiza o card AppIconsSettingsCard com opções de estilos prontos e módulos", () => {
    render(<AppIconsSettingsCard />);

    expect(screen.getByText(/Ícones do aplicativo/i)).toBeInTheDocument();
    expect(screen.getByText(/Estilos prontos \(1-clique\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Padrão HV Cred/i)).toBeInTheDocument();
    expect(screen.getByText(/Moderno \/ Fintech/i)).toBeInTheDocument();
    expect(screen.getByText(/Comercial \/ Direto/i)).toBeInTheDocument();
    expect(screen.getByText(/Minimalista \/ Line/i)).toBeInTheDocument();

    // Verifica se os módulos principais aparecem
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Empréstimos")).toBeInTheDocument();
    expect(screen.getByText("Financeiro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Restaurar padrões/i })).toBeInTheDocument();
  });
});
