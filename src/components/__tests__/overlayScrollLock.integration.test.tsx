/**
 * Teste de integração do fluxo real: lista longa → clique em "Pagar"/"Histórico"
 * → overlay abre com scroll-lock → posição deve permanecer.
 *
 * O jsdom não clampa scroll por altura, então simulamos explicitamente o que o
 * navegador fazia: quando o scroll-lock aplica `overflow: hidden` no <body>, a
 * altura do documento colapsava e o scroll caía para 0. O wrapper global precisa
 * detectar e restaurar essa posição.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cancelPendingScrollRestore } from "@/lib/scrollPolicy";

const setScrollY = (value: number) => {
  Object.defineProperty(window, "scrollY", { value, writable: true, configurable: true });
};

beforeEach(() => {
  setScrollY(0);
  window.scrollTo = vi.fn((a?: unknown, b?: unknown) => {
    if (typeof a === "number" && typeof b === "number") setScrollY(b);
    else if (a && typeof a === "object" && "top" in (a as Record<string, unknown>)) {
      setScrollY(Number((a as { top: number }).top));
    }
  }) as unknown as typeof window.scrollTo;
  // rAF assíncrono (como no browser): permite que o scroll-lock aplicado em um
  // commit posterior seja detectado pela validação do wrapper global.
  window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 0) as unknown as number) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id as unknown as NodeJS.Timeout)) as typeof window.cancelAnimationFrame;
});

/**
 * Simula o scroll-lock (react-remove-scroll/Vaul): roda em layout effect DEPOIS
 * do commit da abertura e zera a posição da página, exatamente como o navegador
 * fazia ao colapsar a altura do documento.
 */
function ScrollLockSimulator() {
  React.useLayoutEffect(() => {
    setScrollY(0);
  }, []);
  return null;
}

/** Lista longa com botões que abrem módulos internos (Dialog e Sheet). */
function LoanListHarness({ overlay = "dialog" as "dialog" | "sheet" }) {
  const [openId, setOpenId] = React.useState<number | null>(null);
  const rows = Array.from({ length: 40 }, (_, i) => i);

  const Overlay = overlay === "dialog" ? Dialog : Sheet;
  const Content = overlay === "dialog" ? DialogContent : SheetContent;
  const Title = overlay === "dialog" ? DialogTitle : SheetTitle;
  const Description = overlay === "dialog" ? DialogDescription : SheetDescription;

  return (
    <div data-app-scroll-container>
      {rows.map((i) => (
        <div key={i} data-testid={`row-${i}`}>
          <span>Contrato {i}</span>
          <button
            type="button"
            onClick={() => setOpenId(i)}
          >
            {`Pagar ${i}`}
          </button>
        </div>
      ))}
      <Overlay open={openId !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <Content>
          <Title>Módulo do contrato {openId}</Title>
          <Description>Detalhes</Description>
          <ScrollLockSimulator />
          <button type="button" onClick={() => setOpenId(null)}>
            Fechar módulo
          </button>
        </Content>
      </Overlay>
    </div>
  );
}

describe("abrir módulos internos a partir de uma lista longa", () => {
  it.each([
    ["dialog" as const, 1800],
    ["sheet" as const, 1200],
  ])("%s: abrir e fechar mantém window.scrollY", async (overlay, position) => {
    render(<LoanListHarness overlay={overlay} />);
    setScrollY(position);

    fireEvent.click(screen.getByRole("button", { name: `Pagar 30` }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    await waitFor(() => expect(window.scrollY).toBeCloseTo(position, 2));

    fireEvent.click(screen.getByRole("button", { name: "Fechar módulo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(window.scrollY).toBeCloseTo(position, 2));
    expect(screen.getByTestId("row-30")).toBeTruthy();
  });

  it("primeira e segunda abertura se comportam igual", async () => {
    render(<LoanListHarness />);
    for (const pos of [900, 2400]) {
      setScrollY(pos);
      fireEvent.click(screen.getByRole("button", { name: "Pagar 12" }));
      await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
      await waitFor(() => expect(window.scrollY).toBeCloseTo(pos, 2));
      fireEvent.click(screen.getByRole("button", { name: "Fechar módulo" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(window.scrollY).toBeCloseTo(pos, 2));
    }
  });

  it("cancelPendingScrollRestore é idempotente e não move a página", () => {
    setScrollY(640);
    cancelPendingScrollRestore();
    cancelPendingScrollRestore();
    expect(window.scrollY).toBe(640);
  });
});
