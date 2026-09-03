/**
 * FASE 7 — Persistência da PARADA AUTOMÁTICA do rollout da RPC V3.
 *
 * Problema corrigido: a parada vivia apenas em `useState`, então qualquer
 * remontagem do Dashboard, troca de aba ou refresh reabilitava a RPC mesmo
 * depois de uma divergência acima de R$ 0,01 já detectada.
 *
 * A parada agora é persistida por usuário + versão da migração, com TTL, e é
 * sempre "fail-safe": qualquer erro de storage resulta em NENHUMA parada
 * perdida silenciosamente (o chamador continua com o legado no mesmo render).
 */
import { RPC_V3_MIGRATION_VERSION } from "@/features/financial/lib/rpcV3Migration";

export const RPC_V3_HALT_TTL_MS = 24 * 60 * 60 * 1000;

export interface RpcV3HaltRecord {
  reason: string;
  haltedAt: number;
  migrationVersion: string;
}

export function rpcV3HaltStorageKey(userId?: string | null): string {
  return `rpc_v3_halt:${RPC_V3_MIGRATION_VERSION}:${userId ?? "anon"}`;
}

/** Pura: decide se um registro persistido ainda é válido. */
export function isHaltRecordValid(
  record: RpcV3HaltRecord | null,
  now = Date.now(),
  ttlMs = RPC_V3_HALT_TTL_MS,
): boolean {
  if (!record || !record.reason) return false;
  if (record.migrationVersion !== RPC_V3_MIGRATION_VERSION) return false;
  if (!Number.isFinite(record.haltedAt)) return false;
  return now - record.haltedAt < ttlMs;
}

/** Pura: interpreta o conteúdo bruto do storage. */
export function parseHaltRecord(raw: string | null): RpcV3HaltRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RpcV3HaltRecord;
    if (!parsed || typeof parsed.reason !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readRpcV3Halt(userId?: string | null, now = Date.now()): string | null {
  const store = storage();
  if (!store) return null;
  const record = parseHaltRecord(store.getItem(rpcV3HaltStorageKey(userId)));
  if (!isHaltRecordValid(record, now)) return null;
  return record!.reason;
}

export function writeRpcV3Halt(userId: string | null | undefined, reason: string, now = Date.now()): void {
  const store = storage();
  if (!store) return;
  const record: RpcV3HaltRecord = {
    reason,
    haltedAt: now,
    migrationVersion: RPC_V3_MIGRATION_VERSION,
  };
  try {
    store.setItem(rpcV3HaltStorageKey(userId), JSON.stringify(record));
  } catch {
    /* storage indisponível: a parada continua valendo em memória nesta sessão */
  }
}

export function clearRpcV3Halt(userId?: string | null): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(rpcV3HaltStorageKey(userId));
  } catch {
    /* noop */
  }
}
