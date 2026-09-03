/**
 * PiggyBankList — component-level tests.
 *
 * The heavy `usePiggyBanks` adapter is mocked so we can exercise the
 * component with predictable, fake data. Deeper data-loading + edge-function
 * behaviour is covered in `src/hooks/__tests__/usePiggyBanks.test.tsx`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---- Mocks ----------------------------------------------------------------
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const updatePiggyBank = vi.fn().mockResolvedValue(true);
const createPiggyBank = vi.fn().mockResolvedValue("new-id");
const deletePiggyBank = vi.fn().mockResolvedValue(true);
const adjustBalance = vi.fn().mockResolvedValue(true);
const storeMoney = vi.fn().mockResolvedValue(true);
const withdrawMoney = vi.fn().mockResolvedValue(true);
const refreshCdiNow = vi.fn().mockResolvedValue(null);
const setPiggyRate = vi.fn().mockResolvedValue(undefined);
const setRecurrenceActive = vi.fn().mockResolvedValue(true);
const deleteRecurrence = vi.fn().mockResolvedValue(true);
const updateDeposit = vi.fn().mockResolvedValue(true);
const deleteDeposit = vi.fn().mockResolvedValue(true);

// Fake piggy banks — inclui um caso com `category`/`targetDate` nulos que
// simula o resultado do hook após `descricao = null` (defaults aplicados).
const fakePiggyBanks = [
  {
    id: "pb-1",
    shortId: 1,
    name: "Reserva de Emergência",
    color: "210 80% 55%",
    icon: "PiggyBank",
    annualRate: 11,
    autoRate: true,
    cdiPercent: 100,
    goalAmount: 5000,
    category: "Segurança",
    targetDate: "2026-12-31",
    createdAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "pb-2",
    shortId: null,
    name: "Cofrinho sem descrição",
    color: "210 80% 55%", // default aplicado pelo hook quando descricao=null
    icon: "PiggyBank",
    annualRate: 0,
    autoRate: true,
    cdiPercent: 100,
    goalAmount: null,
    category: null, // <- exercita o branch sem categoria
    targetDate: null,
    createdAt: "2025-02-01T00:00:00Z",
  },
];

const balances = new Map([
  ["pb-1", { principal: 1000, balance: 1200, yield: 200 }],
  ["pb-2", { principal: 0, balance: 0, yield: 0 }],
]);
const detailed = new Map();

vi.mock("@/features/piggyBanks/hooks/usePiggyBanks", () => ({
  usePiggyBanks: () => ({
    piggyBanks: fakePiggyBanks,
    deposits: [],
    recurrences: [],
    balances,
    detailed,
    cdiRate: { indicator: "cdi", annualRate: 11.15, source: "BCB", referenceDate: null, fetchedAt: new Date().toISOString() },
    loading: false,
    createPiggyBank,
    updatePiggyBank,
    deletePiggyBank,
    adjustBalance,
    updateDeposit,
    deleteDeposit,
    setPiggyRate,
    refreshCdiNow,
    storeMoney,
    withdrawMoney,
    setRecurrenceActive,
    deleteRecurrence,
  }),
}));

vi.mock("@/features/financial/hooks/useUnifiedAccountBalance", () => ({
  useUnifiedAccountBalance: () => 10_000,
}));

vi.mock("@/contexts/HideValuesContext", () => ({
  useHideValues: () => ({ mask: (v: string) => v, hidden: false, toggle: vi.fn() }),
}));

vi.mock("@/integrations/supabase/userClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      then: (r: any) => r({ data: [], error: null }),
    })),
  },
}));

// Polyfills for jsdom
beforeEach(() => {
  if (!(globalThis as any).ResizeObserver) {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  updatePiggyBank.mockClear();
  createPiggyBank.mockClear();
});

import { PiggyBankList } from "@/features/piggyBanks/components/PiggyBankList";

const renderList = () =>
  render(
    <MemoryRouter>
      <PiggyBankList />
    </MemoryRouter>,
  );

describe("PiggyBankList", () => {
  it("renderiza a lista de cofrinhos com dados mockados", () => {
    renderList();
    expect(screen.getByText("Reserva de Emergência")).toBeInTheDocument();
    expect(screen.getByText("Cofrinho sem descrição")).toBeInTheDocument();
  });

  it("trata cofrinho sem descrição/categoria sem quebrar", () => {
    renderList();
    // O nome aparece mesmo quando `category` e `targetDate` são null.
    expect(screen.getByText("Cofrinho sem descrição")).toBeInTheDocument();
    // A categoria "Segurança" só aparece para pb-1.
    expect(screen.getByText("Segurança")).toBeInTheDocument();
  });

  it("abre o modal de cadastro/edição ao clicar em Novo", () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: /nova|novo/i }));
    // Título do dialog: "Novo cofrinho" (modo criação) — mesma UI usada em edição.
    expect(screen.getByText(/novo cofrinho/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nome/i)).toBeInTheDocument();
  });

  it("dispara persistência ao salvar o formulário do modal", () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: /nova|novo/i }));

    const dialog = screen.getByRole("dialog");
    const nameInput = within(dialog).getByLabelText(/nome/i);
    fireEvent.change(nameInput, { target: { value: "Nova caixinha" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /criar cofrinho/i }));

    // Save flow no modal chama `createPiggyBank` (create) ou `updatePiggyBank`
    // (edit) — ambos acabam gravando na tabela `cofrinhos` via userClient
    // (validado no teste do hook).
    expect(createPiggyBank).toHaveBeenCalledTimes(1);
    const patch = createPiggyBank.mock.calls[0][0];
    expect(patch.name).toBe("Nova caixinha");
  });

  it("abre o modal de edição com dados preenchidos ao clicar em Editar no card", () => {
    renderList();

    // Botão de editar (ícone lápis) exposto por aria-label acessível.
    const editBtn = screen.getByRole("button", { name: /editar reserva de emergência/i });
    fireEvent.click(editBtn);

    const dialog = screen.getByRole("dialog");
    // Título indica modo edição.
    expect(within(dialog).getByText(/editar cofrinho/i)).toBeInTheDocument();
    // Campo Nome já vem preenchido com o cofrinho clicado.
    const nameInput = within(dialog).getByLabelText(/nome/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Reserva de Emergência");
  });

  it("chama updatePiggyBank ao salvar edição a partir do card", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: /editar reserva de emergência/i }));

    const dialog = screen.getByRole("dialog");
    const nameInput = within(dialog).getByLabelText(/nome/i);
    fireEvent.change(nameInput, { target: { value: "Reserva Atualizada" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /salvar/i }));

    expect(updatePiggyBank).toHaveBeenCalledTimes(1);
    const [id, patch] = updatePiggyBank.mock.calls[0];
    expect(id).toBe("pb-1");
    expect(patch.name).toBe("Reserva Atualizada");
    // createPiggyBank NÃO deve ser chamado no fluxo de edição.
    expect(createPiggyBank).not.toHaveBeenCalled();
  });
});
