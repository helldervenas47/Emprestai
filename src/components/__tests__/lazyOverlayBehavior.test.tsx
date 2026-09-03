import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import * as React from "react";
import { LazyDialogBoundary } from "@/components/LazyDialogBoundary";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// jsdom não implementa scrollTo — instrumentamos window.scrollY manualmente.
const setScrollY = (value: number) => {
  Object.defineProperty(window, "scrollY", { value, writable: true, configurable: true });
};

beforeEach(() => {
  setScrollY(0);
  window.scrollTo = vi.fn((options?: unknown) => {
    if (options && typeof options === "object" && "top" in (options as Record<string, unknown>)) {
      setScrollY(Number((options as { top: number }).top));
    }
  }) as unknown as typeof window.scrollTo;
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  }) as typeof window.requestAnimationFrame;
});

function OverlayHarness({ load }: { load: () => Promise<{ default: React.ComponentType }> }) {
  const LazyBody = React.useMemo(() => React.lazy(load), [load]);
  const [open, setOpen] = React.useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Pagar
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Módulo de Pagamento</DialogTitle>
          <DialogDescription>Escolha o tipo de pagamento</DialogDescription>
          <LazyDialogBoundary fallback={<span>Carregando…</span>}>
            <LazyBody />
          </LazyDialogBoundary>
        </DialogContent>
      </Dialog>
      <p>lista de empréstimos</p>
    </div>
  );
}

const PaymentOptions = () => (
  <div>
    {["Juros", "Parcial", "Total", "Quitar Contrato", "Amortizar"].map((label) => (
      <button type="button" key={label}>
        {label}
      </button>
    ))}
  </div>
);

describe("overlays lazy — abertura, fechamento, foco e scroll", () => {
  it("primeira abertura carrega o chunk sem desmontar a aba nem subir a tela", async () => {
    const load = () => Promise.resolve({ default: PaymentOptions });
    render(<OverlayHarness load={load} />);

    setScrollY(840);
    fireEvent.click(screen.getByRole("button", { name: "Pagar" }));

    // A lista de fundo continua montada durante o carregamento do chunk.
    expect(screen.getByText("lista de empréstimos")).toBeTruthy();

    await waitFor(() => expect(screen.getByRole("button", { name: "Juros" })).toBeTruthy());
    expect(window.scrollY).toBe(840);
  });

  it("segunda abertura se comporta como a primeira e devolve o foco ao botão", async () => {
    const load = () => Promise.resolve({ default: PaymentOptions });
    render(<OverlayHarness load={load} />);

    const trigger = screen.getByRole("button", { name: "Pagar" });
    setScrollY(500);

    for (const _pass of [1, 2]) {
      trigger.focus();
      fireEvent.click(trigger);
      await waitFor(() => expect(screen.getByRole("button", { name: "Amortizar" })).toBeTruthy());

      await act(async () => {
        fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
      });

      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Amortizar" })).toBeNull(),
      );
      expect(window.scrollY).toBe(500);
      expect(document.activeElement).toBe(trigger);
    }
  });

  it("fechar pelo botão Fechar preserva a posição da página", async () => {
    const load = () => Promise.resolve({ default: PaymentOptions });
    render(<OverlayHarness load={load} />);

    setScrollY(1200);
    fireEvent.click(screen.getByRole("button", { name: "Pagar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Total" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Total" })).toBeNull());
    expect(window.scrollY).toBe(1200);
  });

  it("clique repetido não cria múltiplas instâncias do modal", async () => {
    const load = () => Promise.resolve({ default: PaymentOptions });
    render(<OverlayHarness load={load} />);

    const trigger = screen.getByRole("button", { name: "Pagar" });
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    fireEvent.click(trigger);

    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
  });

  it("falha no chunk exibe mensagem com nova tentativa sem quebrar a aba", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const load = () => Promise.reject(new Error("chunk load failed"));
    render(<OverlayHarness load={load} />);

    fireEvent.click(screen.getByRole("button", { name: "Pagar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
    expect(screen.getByText("lista de empréstimos")).toBeTruthy();
    consoleError.mockRestore();
  });
});
