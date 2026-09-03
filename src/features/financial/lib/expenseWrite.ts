/**
 * Camada de escrita resiliente para a tabela `expenses`.
 *
 * Problema real observado em produção: o banco externo pode estar sem alguma
 * coluna recém-adicionada no app (ex.: `recurrence_type`). O PostgREST responde
 * 400 / PGRST204 ("Could not find the 'x' column of 'expenses' in the schema
 * cache") e o insert NUNCA é persistido — mas a UI mostrava a despesa como
 * criada (estado otimista + fila offline). Aqui centralizamos:
 *
 * 1. Detecção de coluna inexistente → remove a coluna do payload e refaz o
 *    insert/update, de modo que a despesa seja realmente gravada no banco.
 * 2. Classificação de erros "lógicos" (schema/RLS/constraint), que NÃO devem ser
 *    enfileirados para retry offline, pois nunca vão ter sucesso.
 */
import { supabase } from "@/integrations/supabase/userClient";

/** Colunas já detectadas como ausentes no banco (evita repetir o round-trip). */
const missingColumns = new Set<string>();

export function getKnownMissingExpenseColumns(): string[] {
  return [...missingColumns];
}

/** Retorna o nome da coluna ausente quando o erro é de schema (PGRST204/42703). */
export function extractMissingColumn(error: any): string | null {
  const msg = String(error?.message ?? "");
  const code = String(error?.code ?? "");
  if (code !== "PGRST204" && code !== "42703" && !/schema cache/i.test(msg)) return null;
  const m = msg.match(/'([^']+)' column/i) || msg.match(/column ["']?([\w.]+)["']?/i);
  if (!m) return null;
  return m[1].includes(".") ? m[1].split(".").pop()! : m[1];
}

/**
 * Erros que nunca vão passar em um retry (schema, RLS, constraint, tipo inválido).
 * Devem causar rollback + mensagem de erro, jamais um "sucesso" silencioso.
 */
export function isLogicalWriteError(error: any): boolean {
  const msg = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "");
  return (
    code === "PGRST204" ||
    code.startsWith("22") ||
    code.startsWith("23") ||
    code === "42501" ||
    code === "42703" ||
    msg.includes("row-level") ||
    msg.includes("schema cache") ||
    msg.includes("violates") ||
    msg.includes("duplicate key") ||
    msg.includes("permission denied") ||
    msg.includes("invalid input")
  );
}

function strip(payload: Record<string, any>) {
  if (!missingColumns.size) return payload;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) if (!missingColumns.has(k)) out[k] = v;
  return out;
}

/**
 * Detecta violação de FK em `payment_method_id` (ex.: id de cartão de crédito
 * gravado por engano nesse campo). O vínculo do cartão vive no marcador
 * {ID:uuid} da nota, então podemos anular o campo e persistir a despesa.
 */
function isPaymentMethodFkError(error: any): boolean {
  const msg = String(error?.message ?? "");
  return (
    String(error?.code ?? "") === "23503" &&
    /payment_method_id/i.test(msg + String(error?.details ?? ""))
  );
}

/** Insert em `expenses` com auto-recuperação de colunas ausentes. */
export async function insertExpenseRow(payload: Record<string, any>) {
  let body = strip(payload);
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await (supabase.from("expenses") as any)
      .insert(body)
      .select()
      .maybeSingle();
    if (!error) return { data, error: null as any };
    if (isPaymentMethodFkError(error) && body.payment_method_id) {
      console.warn("[expenses] payment_method_id inválido (FK) — regravando como null.");
      body = { ...body, payment_method_id: null };
      continue;
    }
    const col = extractMissingColumn(error);
    if (!col || !(col in body)) return { data: null, error };
    console.warn(`[expenses] coluna "${col}" ausente no banco — reenviando insert sem ela.`);
    missingColumns.add(col);
    body = strip(body);
  }
  return { data: null, error: { message: "Falha ao inserir despesa (schema incompatível)" } as any };
}


/** Update em `expenses` com auto-recuperação de colunas ausentes. */
export async function updateExpenseRow(id: string, patch: Record<string, any>) {
  let body = strip(patch);
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await (supabase.from("expenses") as any).update(body).eq("id", id);
    if (!error) return { error: null as any };
    if (isPaymentMethodFkError(error) && body.payment_method_id) {
      console.warn("[expenses] payment_method_id inválido (FK) — regravando como null.");
      body = { ...body, payment_method_id: null };
      continue;
    }
    const col = extractMissingColumn(error);
    if (!col || !(col in body)) return { error };
    console.warn(`[expenses] coluna "${col}" ausente no banco — reenviando update sem ela.`);
    missingColumns.add(col);
    body = strip(body);
  }
  return { error: { message: "Falha ao atualizar despesa (schema incompatível)" } as any };
}
