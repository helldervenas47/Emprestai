import { describe, it, expect } from "vitest";
import { sumOfficialBalance } from "@/features/financial/lib/accountLedgerBalance";

describe("sumOfficialBalance", () => {
  it("sums in as positive and out as negative", () => {
    expect(
      sumOfficialBalance([
        { amount: 100, direction: "in", metadata: null },
        { amount: 30, direction: "out", metadata: null },
        { amount: "20.5", direction: "in", metadata: {} },
      ]),
    ).toBe(90.5);
  });

  it("ignores vehicle-scoped rows", () => {
    expect(
      sumOfficialBalance([
        { amount: 200, direction: "in", metadata: { scope: "vehicle" } },
        { amount: 50, direction: "in", metadata: { scope: "general" } },
        { amount: 10, direction: "out", metadata: { scope: "vehicle" } },
      ]),
    ).toBe(50);
  });

  it("returns 0 for empty input", () => {
    expect(sumOfficialBalance([])).toBe(0);
  });
});
