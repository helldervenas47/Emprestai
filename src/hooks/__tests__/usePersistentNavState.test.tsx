import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePersistentOption, usePersistentText } from "@/hooks/usePersistentNavState";
import { NAV_KEYS, setNavigationScope } from "@/lib/navigationState";

const LOAN_VIEWS = ["list", "cards"] as const;
const FINANCIAL_SUBTABS = ["incomes", "expenses"] as const;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  setNavigationScope("user-1");
});

describe("contexto preservado entre abas", () => {
  it("Empréstimos: modo Cards e filtro sobrevivem à ida ao Dashboard e à volta", () => {
    const mount = () => {
      const view = renderHook(() =>
        usePersistentOption("loans:view", LOAN_VIEWS, "list", { key: NAV_KEYS.viewModes, kind: "local" }),
      );
      const filter = renderHook(() =>
        usePersistentOption("loans:filter", ["all", "overdue", "active"] as const, "all", {
          key: NAV_KEYS.filters,
        }),
      );
      return { view, filter };
    };

    const first = mount();
    act(() => {
      first.view.result.current[1]("cards");
      first.filter.result.current[1]("overdue");
    });
    first.view.unmount();
    first.filter.unmount();

    // Voltando à aba Empréstimos (componentes remontados):
    const second = mount();
    expect(second.view.result.current[0]).toBe("cards");
    expect(second.filter.result.current[0]).toBe("overdue");
  });

  it("Financeiro: subaba Despesas e busca continuam após abrir e fechar um registro", () => {
    const mountFinancial = () => ({
      subTab: renderHook(() => usePersistentOption("financial", FINANCIAL_SUBTABS, "incomes")),
      search: renderHook(() => usePersistentText("financial:search")),
    });

    const before = mountFinancial();
    act(() => {
      before.subTab.result.current[1]("expenses");
      before.search.result.current[1]("aluguel");
    });
    before.subTab.unmount();
    before.search.unmount();

    const after = mountFinancial();
    expect(after.subTab.result.current[0]).toBe("expenses");
    expect(after.search.result.current[0]).toBe("aluguel");
  });

  it("Veículos: registro selecionado é lembrado ao voltar do histórico", () => {
    const mountSelection = () =>
      renderHook(() =>
        usePersistentOption("vehicles:selected", ["v-1", "v-2", "v-3"] as const, "v-1", {
          key: NAV_KEYS.selected,
        }),
      );

    const before = mountSelection();
    act(() => before.result.current[1]("v-3"));
    before.unmount();

    expect(mountSelection().result.current[0]).toBe("v-3");
  });

  it("preferência durável (Lista/Cards) usa localStorage; contexto de sessão usa sessionStorage", () => {
    const view = renderHook(() =>
      usePersistentOption("loans:view", LOAN_VIEWS, "list", { key: NAV_KEYS.viewModes, kind: "local" }),
    );
    const subTab = renderHook(() => usePersistentOption("financial", FINANCIAL_SUBTABS, "incomes"));

    act(() => {
      view.result.current[1]("cards");
      subTab.result.current[1]("expenses");
    });

    expect(localStorage.getItem(`${NAV_KEYS.viewModes}:u:user-1`)).toContain("cards");
    expect(sessionStorage.getItem(`${NAV_KEYS.subTabs}:u:user-1`)).toContain("expenses");
    expect(localStorage.getItem(`${NAV_KEYS.subTabs}:u:user-1`)).toBeNull();
  });

  it("valor persistido inexistente hoje cai no fallback sem quebrar", () => {
    sessionStorage.setItem(
      `${NAV_KEYS.subTabs}:u:user-1`,
      JSON.stringify({ version: 1, state: { financial: "subaba-removida" } }),
    );
    const { result } = renderHook(() => usePersistentOption("financial", FINANCIAL_SUBTABS, "incomes"));
    expect(result.current[0]).toBe("incomes");
  });
});
