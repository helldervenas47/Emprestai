import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InstallmentScheduleEditor } from "../InstallmentScheduleEditor";

describe("InstallmentScheduleEditor Component", () => {
  it("renders collapsed initially with formatted summary", () => {
    const onChange = vi.fn();
    render(
      <InstallmentScheduleEditor
        totalInstallments={3}
        baseAmount={150}
        startDate="2026-09-18"
        customInstallments={[]}
        isCustomized={false}
        onChange={onChange}
      />
    );

    expect(screen.getByText("Valores das Parcelas")).toBeDefined();
    expect(screen.getByText(/3x de/)).toBeDefined();
    expect(screen.getByText("Personalizar")).toBeDefined();
  });

  it("toggles to customized view and renders installment list", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <InstallmentScheduleEditor
        totalInstallments={3}
        baseAmount={100}
        startDate="2026-09-18"
        customInstallments={[]}
        isCustomized={false}
        onChange={onChange}
      />
    );

    const toggleBtn = screen.getByRole("button", { name: /Personalizar/i });
    fireEvent.click(toggleBtn);

    expect(onChange).toHaveBeenCalledWith(expect.any(Array), true);

    // Simulate parent state update
    const generated = onChange.mock.calls[0][0];
    rerender(
      <InstallmentScheduleEditor
        totalInstallments={3}
        baseAmount={100}
        startDate="2026-09-18"
        customInstallments={generated}
        isCustomized={true}
        onChange={onChange}
      />
    );

    expect(screen.getByText("Ocultar")).toBeDefined();
    expect(screen.getByText("Igualar parcelas")).toBeDefined();
    expect(screen.getByText(/1ª \(1\/3\)/)).toBeDefined();
    expect(screen.getByText(/2ª \(2\/3\)/)).toBeDefined();
    expect(screen.getByText(/3ª \(3\/3\)/)).toBeDefined();
  });

  it("auto-balances remaining installments when editing an installment value to keep total constant", () => {
    const onChange = vi.fn();
    const initialInstallments = [
      { index: 0, amount: 666.67, dueDate: "2026-09-18", paid: false, description: "Parcela 1/3" },
      { index: 1, amount: 666.67, dueDate: "2026-10-18", paid: false, description: "Parcela 2/3" },
      { index: 2, amount: 666.66, dueDate: "2026-11-18", paid: false, description: "Parcela 3/3" },
    ];

    render(
      <InstallmentScheduleEditor
        totalInstallments={3}
        totalAmount={2000}
        startDate="2026-09-18"
        customInstallments={initialInstallments}
        isCustomized={true}
        onChange={onChange}
      />
    );

    // Encontra o input da 1ª parcela e altera para 500,00
    const inputs = screen.getAllByPlaceholderText("R$ 0,00");
    fireEvent.change(inputs[0], { target: { value: "500,00" } });

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    const updated = lastCall[0];

    // 1ª parcela deve ser 500
    expect(updated[0].amount).toBe(500);
    // 2ª e 3ª parcelas devem ter sido ajustadas para 750 cada
    expect(updated[1].amount).toBe(750);
    expect(updated[2].amount).toBe(750);
    // Total deve continuar 2000
    expect(updated[0].amount + updated[1].amount + updated[2].amount).toBe(2000);
  });
});
