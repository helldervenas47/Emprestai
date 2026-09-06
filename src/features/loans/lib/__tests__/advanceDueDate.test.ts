import { describe, expect, it } from "vitest";
import { advanceLoanDueDate, advanceLoanDueDateAfter } from "../advanceDueDate";

describe("advanceLoanDueDate", () => {
  it("continues an adjusted monthly cycle from the active due date", () => {
    expect(advanceLoanDueDateAfter("2026-08-30", "Mensal")).toBe("2026-09-30");
    expect(advanceLoanDueDateAfter("2026-09-30", "Mensal")).toBe("2026-10-30");
  });

  it("does not use the original contract date as a hidden anchor", () => {
    // Contract originally due on the 20th, adjusted to the 30th.
    expect(advanceLoanDueDate("2026-08-30", "Mensal")).toBe("2026-09-30");
  });

  it("clamps monthly cycles to the last valid day of a shorter month", () => {
    expect(advanceLoanDueDate("2027-01-31", "Mensal")).toBe("2027-02-28");
  });
});
