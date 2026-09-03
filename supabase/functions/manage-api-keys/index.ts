// Edge function: manage-api-keys
// Armazena/lista/atualiza/remove chaves de API do usuário SEM nunca
// devolver o valor completo da chave ao frontend.
//
// Padronizado no Passo 5:
// - client Supabase EXTERNO via helper `getExternalAdmin`
// - CORS via `_shared/cors.ts`
// - respostas JSON e erros via `_shared/json-response.ts`

import { handleCorsPreflight } from "../_shared/cors.ts";
import {
  badRequest,
  handleError,
  json,
  methodNotAllowed,
  notFound,
  unauthorized,
} from "../_shared/json-response.ts";
import { getExternalAdmin } from "../_shared/external-supabase.ts";

function last4(s: string): string {
  const trimmed = (s ?? "").trim();
  if (trimmed.length <= 4) return trimmed;
  return trimmed.slice(-4);
}

function sanitize(row: any) {
  return {
    id: row.id,
    name: row.name,
    key_last4: row.key_last4,
    active: row.active,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return unauthorized("missing_token");

  const admin = getExternalAdmin();

  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userRes?.user) return unauthorized("invalid_token");
  const userId = userRes.user.id;

  try {
    if (req.method === "GET") {
      const { data, error } = await admin
        .from("user_api_keys")
        .select("id,name,key_last4,active,created_at,last_used_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ keys: (data ?? []).map(sanitize) });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const id = typeof body?.id === "string" ? body.id : null;
      const name = String(body?.name ?? "").trim();
      const key = String(body?.key ?? "").trim();
      const active =
        typeof body?.active === "boolean" ? body.active : undefined;

      if (!name) return badRequest("name_required");
      if (name.length > 80) return badRequest("name_too_long");

      if (id) {
        // Update — key é opcional (permite só renomear / ativar)
        const patch: Record<string, unknown> = { name };
        if (key) {
          patch.key = key;
          patch.key_last4 = last4(key);
        }
        if (active !== undefined) patch.active = active;

        const { data, error } = await admin
          .from("user_api_keys")
          .update(patch)
          .eq("id", id)
          .eq("user_id", userId)
          .select("id,name,key_last4,active,created_at,last_used_at")
          .maybeSingle();
        if (error) throw error;
        if (!data) return notFound();
        return json({ key: sanitize(data) });
      }

      // Insert — key obrigatória
      if (!key) return badRequest("key_required");
      if (key.length > 4096) return badRequest("key_too_long");

      const { data, error } = await admin
        .from("user_api_keys")
        .upsert(
          {
            user_id: userId,
            name,
            key,
            key_last4: last4(key),
            active: active ?? true,
          },
          { onConflict: "user_id,name" },
        )
        .select("id,name,key_last4,active,created_at,last_used_at")
        .single();
      if (error) throw error;
      return json({ key: sanitize(data) });
    }

    if (req.method === "DELETE") {
      const body = await req.json().catch(() => ({}));
      const id = typeof body?.id === "string" ? body.id : null;
      if (!id) return badRequest("id_required");
      const { error } = await admin
        .from("user_api_keys")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
      return json({ ok: true });
    }

    return methodNotAllowed();
  } catch (e) {
    // Nunca logar a `key` em texto puro
    return handleError("manage-api-keys", e);
  }
});
