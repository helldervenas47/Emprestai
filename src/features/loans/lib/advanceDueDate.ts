/**
 * Calculates the following due date from the contract's current pending due
 * date. `original_due_date` is deliberately not an input: it is historical
 * information and must not reset a renegotiated or adjusted cycle.
 */
export function advanceLoanDueDate(currentDueDate: string, frequency: string, periods = 1): string {
  const date = new Date(`${currentDueDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return currentDueDate;

  if (frequency === "Diário") {
    date.setDate(date.getDate() + periods);
  } else if (frequency === "Semanal") {
    date.setDate(date.getDate() + (7 * periods));
  } else if (frequency === "Quinzenal") {
    date.setDate(date.getDate() + (15 * periods));
  } else {
    const anchorDay = date.getDate();
    const targetMonth = date.getMonth() + periods;
    const targetYear = date.getFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    date.setFullYear(targetYear, normalizedMonth, Math.min(anchorDay, lastDay));
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Advances at least once, then keeps advancing until it is after `boundaryDate`. */
export function advanceLoanDueDateAfter(
  currentDueDate: string,
  frequency: string,
  boundaryDate = currentDueDate,
): string {
  let dueDate = advanceLoanDueDate(currentDueDate, frequency);
  let guard = 0;
  while (dueDate <= boundaryDate && guard < 600) {
    dueDate = advanceLoanDueDate(dueDate, frequency);
    guard += 1;
  }
  return dueDate;
}
