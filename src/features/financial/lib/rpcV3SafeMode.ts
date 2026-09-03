/**
 * ============================================================================
 * MODO SEGURO DA RPC FINANCEIRA V3 (ETAPA 2 — FASE 2.3 / 2.15)
 * ============================================================================
 *
 * O módulo da RPC V3 deixou de ser uma ferramenta de correção e passou a ser
 * uma ferramenta de DIAGNÓSTICO. Enquanto o modo seguro estiver ativo:
 *
 *   • nenhuma aplicação real pode ser gerada;
 *   • nenhuma RPC de escrita pode ser disparada;
 *   • somente relatórios e dry-runs de LEITURA podem ser emitidos;
 *   • a interface exibe o aviso permanente de modo seguro.
 *
 * O padrão é SEMPRE seguro: na ausência da variável de ambiente, ou com
 * qualquer valor que não seja exatamente `"false"`, o modo seguro está ativo.
 * Não existe caminho pelo frontend que habilite escrita — desligar exige
 * mudança explícita de código + nova auditoria + a guarda no PostgreSQL
 * (`public.rpc_v3_validate_backfill_payload`).
 */

export const RPC_V3_SAFE_MODE_ENV_KEY = "VITE_RPC_V3_SAFE_MODE";

export const RPC_V3_SAFE_MODE_NOTICE = [
  "Modo seguro ativo.",
  "O estado consolidado dos contratos não será alterado.",
  "As divergências exibidas são diagnósticas e não representam autorização para backfill.",
].join(" ");

/** Erro lançado por qualquer tentativa de gerar/disparar escrita em modo seguro. */
export class RpcV3SafeModeError extends Error {
  readonly operation: string;

  constructor(operation: string) {
    super(
      `RPC V3 em modo seguro: a operação de escrita "${operation}" está bloqueada. `
      + "O estado consolidado de public.loans é oficial e não pode ser reconstruído "
      + "a partir do histórico legado.",
    );
    this.name = "RpcV3SafeModeError";
    this.operation = operation;
  }
}

type EnvLike = Record<string, unknown> | undefined | null;

function readEnv(): EnvLike {
  try {
    return (import.meta as unknown as { env?: Record<string, unknown> }).env ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * `true` (padrão seguro) sempre que a flag não estiver explicitamente em
 * `"false"`. Aceita um `env` injetado para testes.
 */
export function isRpcV3SafeMode(env: EnvLike = readEnv()): boolean {
  const raw = env?.[RPC_V3_SAFE_MODE_ENV_KEY];
  if (raw == null) return true;
  return String(raw).trim().toLowerCase() !== "false";
}

/**
 * Guarda usada por toda função que produziria aplicação real.
 * Em modo seguro lança `RpcV3SafeModeError`.
 */
export function assertRpcV3WriteAllowed(operation: string, env: EnvLike = readEnv()): void {
  if (isRpcV3SafeMode(env)) throw new RpcV3SafeModeError(operation);
}
