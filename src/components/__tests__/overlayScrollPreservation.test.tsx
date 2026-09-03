import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";

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

function DialogHarness() {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir módulo
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Módulo</DialogTitle>
          <DialogDescription>Conteúdo</DialogDescription>
          <button type="button" onClick={() => setOpen(false)}>
            Concluir
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SheetHarness() {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir painel
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetTitle>Painel</SheetTitle>
          <SheetDescription>Detalhes</SheetDescription>
        </SheetContent>
      </Sheet>
    </div>
  );
}

describe("overlays preservam o scroll da página", () => {
  it("Dialog: abrir não move a página e simula scroll-lock corrigido", async () => {
    render(<DialogHarness />);
    setScrollY(1450);

    fireEvent.click(screen.getByRole("button", { name: "Abrir módulo" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    // Simula um scroll-lock que zerou a página após a montagem.
    setScrollY(0);
    window.dispatchEvent(new Event("resize"));

    // A validação única do wrapper acontece no rAF da abertura; forçamos o
    // fechamento para garantir que a posição original seja reposta.
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.scrollY).toBe(1450);
  });

  it("Dialog: fechar sem desvio não chama window.scrollTo", async () => {
    render(<DialogHarness />);
    setScrollY(900);

    fireEvent.click(screen.getByRole("button", { name: "Abrir módulo" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    (window.scrollTo as unknown as ReturnType<typeof vi.fn>).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(window.scrollY).toBe(900);
  });

  it("Dialog: segunda abertura se comporta como a primeira", async () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Abrir módulo" });

    for (const pos of [600, 1200]) {
      setScrollY(pos);
      fireEvent.click(trigger);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
      expect(window.scrollY).toBe(pos);
      fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(window.scrollY).toBe(pos);
    }
  });

  it("Sheet: abrir e fechar preserva a posição e devolve o foco", async () => {
    render(<SheetHarness />);
    const trigger = screen.getByRole("button", { name: "Abrir painel" });
    trigger.focus();
    setScrollY(770);

    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(window.scrollY).toBe(770);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.scrollY).toBe(770);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
