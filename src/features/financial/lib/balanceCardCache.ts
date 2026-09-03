/**
 * Cache persistente (localStorage, via sharedResource) dos dados auxiliares e
 * do último saldo válido do card "Saldo em Conta".
 *
 * NÃO altera a regra de cálculo: apenas guarda o último resultado válido para
 * pintar a UI imediatamente enquanto o refetch acontece em segundo plano.
 */
import { readSharedResource, writeSharedResource } from "@/lib/sharedResource";

export interface BalanceAuxCache {
  cardInvoicePaidByMonth: Record<string, number>;
  piggyNetByMonth: Record<string, number>;
  /** Aportes (depósitos) em cofrinhos por mês, sem descontar resgates. */
  piggyDepositsByMonth?: Record<string, number>;
}

const auxKey = (ownerId: string) => `income-balance-aux:${ownerId}`;
const valueKey = (ownerId: string) => `income-balance-value:${ownerId}`;

export function readBalanceAux(ownerId: string | null | undefined): BalanceAuxCache | undefined {
  if (!ownerId) return undefined;
  const v = readSharedResource<BalanceAuxCache>(auxKey(ownerId));
  if (!v || typeof v !== "object") return undefined;
  return {
    cardInvoicePaidByMonth: v.cardInvoicePaidByMonth ?? {},
    piggyNetByMonth: v.piggyNetByMonth ?? {},
    piggyDepositsByMonth: v.piggyDepositsByMonth ?? {},
  };
}


export function writeBalanceAux(ownerId: string | null | undefined, value: BalanceAuxCache) {
  if (!ownerId) return;
  writeSharedResource(auxKey(ownerId), value);
}

export function readCachedBalance(ownerId: string | null | undefined): number | undefined {
  if (!ownerId) return undefined;
  const v = readSharedResource<number>(valueKey(ownerId));
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function writeCachedBalance(ownerId: string | null | undefined, value: number) {
  if (!ownerId || !Number.isFinite(value)) return;
  if (readCachedBalance(ownerId) === value) return;
  writeSharedResource(valueKey(ownerId), value);
}
