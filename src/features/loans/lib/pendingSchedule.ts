/** Nunca use uma parcela paga como referência do vencimento ativo. */
export function getPendingScheduleRow<T extends { installmentNumber: number }>(
  rows: T[],
  paidInstallments: number,
): T | undefined {
  return rows.find((row) => row.installmentNumber === paidInstallments + 1);
}
