// Seed inicial para novos usuários: copia categorias do "template owner"
// (usuário com maior número de categorias) para o user_id do chamador.
// Idempotente — não duplica categorias já existentes (case-insensitive por nome).
import { getExternalAdmin, getExternalUserClient } from "../_shared/external-supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  mode?: "preview" | "apply";
  selectedExpenseNames?: string[];
  selectedIncomeNames?: string[];
  displayName?: string;
  businessName?: string;
}

type CatRow = { name: string; icon: string; color: string };

async function getTemplateUserId(admin: ReturnType<typeof getExternalAdmin>): Promise<string | null> {
  // Pick the user with the most personal_expense_categories as the template.
  const { data } = await admin
    .from("personal_expense_categories")
    .select("user_id");
  if (!data || data.length === 0) return null;
  const counts = new Map<string, number>();
  for (const row of data as Array<{ user_id: string }>) {
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [uid, n] of counts) {
    if (n > bestN) { bestN = n; best = uid; }
  }
  return best;
}

async function fetchTemplateCategories(
  admin: ReturnType<typeof getExternalAdmin>,
  templateUserId: string,
) {
  const [exp, inc] = await Promise.all([
    admin.from("personal_expense_categories")
      .select("name, icon, color")
      .eq("user_id", templateUserId),
    admin.from("income_categories")
      .select("name, icon, color")
      .eq("user_id", templateUserId),
  ]);
  return {
    expense: (exp.data ?? []) as CatRow[],
    income: (inc.data ?? []) as CatRow[],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // --- Validate JWT
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "missing_token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = getExternalUserClient();
    const { data: userRes, error: authError } = await userClient.auth.getUser(token);
    if (authError || !userRes?.user) {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;

    const body: Body = await req.json().catch(() => ({}));
    const mode = body.mode ?? "preview";

    const admin = getExternalAdmin();

    // --- Find template owner
    const templateUserId = await getTemplateUserId(admin);
    if (!templateUserId) {
      return new Response(
        JSON.stringify({ ok: true, expense: [], income: [], note: "no_template_available" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tmpl = await fetchTemplateCategories(admin, templateUserId);

    // PREVIEW: just return what would be seeded (deduped by name)
    if (mode === "preview") {
      return new Response(
        JSON.stringify({
          ok: true,
          expense: tmpl.expense,
          income: tmpl.income,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // APPLY -----------------------------------------------------------------
    // Save display/business name if provided
    if (body.displayName || body.businessName) {
      const patch: Record<string, unknown> = {};
      if (body.displayName) {
        patch.display_name = body.displayName;
        patch.full_name = body.displayName;
      }
      if (body.businessName) patch.business_name = body.businessName;
      await admin
        .from("profiles")
        .update(patch)
        .eq("user_id", userId);
    }

    // Existing categories (lowercase names) so we skip duplicates
    const [existingExp, existingInc] = await Promise.all([
      admin.from("personal_expense_categories").select("name").eq("user_id", userId),
      admin.from("income_categories").select("name").eq("user_id", userId),
    ]);
    const existingExpNames = new Set(
      ((existingExp.data ?? []) as Array<{ name: string }>).map((r) => r.name.trim().toLowerCase()),
    );
    const existingIncNames = new Set(
      ((existingInc.data ?? []) as Array<{ name: string }>).map((r) => r.name.trim().toLowerCase()),
    );

    const wantedExp = new Set(
      (body.selectedExpenseNames ?? tmpl.expense.map((c) => c.name)).map((n) => n.trim().toLowerCase()),
    );
    const wantedInc = new Set(
      (body.selectedIncomeNames ?? tmpl.income.map((c) => c.name)).map((n) => n.trim().toLowerCase()),
    );

    const toInsertExp = tmpl.expense
      .filter((c) => wantedExp.has(c.name.trim().toLowerCase()))
      .filter((c) => !existingExpNames.has(c.name.trim().toLowerCase()))
      .map((c) => ({ user_id: userId, name: c.name, icon: c.icon, color: c.color }));

    const toInsertInc = tmpl.income
      .filter((c) => wantedInc.has(c.name.trim().toLowerCase()))
      .filter((c) => !existingIncNames.has(c.name.trim().toLowerCase()))
      .map((c) => ({ user_id: userId, name: c.name, icon: c.icon, color: c.color }));

    let insertedExp = 0;
    let insertedInc = 0;

    if (toInsertExp.length > 0) {
      const { error, count } = await admin
        .from("personal_expense_categories")
        .insert(toInsertExp, { count: "exact" });
      if (error) console.error("[seed-new-user] expense insert error", error);
      else insertedExp = count ?? toInsertExp.length;
    }

    if (toInsertInc.length > 0) {
      const { error, count } = await admin
        .from("income_categories")
        .insert(toInsertInc, { count: "exact" });
      if (error) console.error("[seed-new-user] income insert error", error);
      else insertedInc = count ?? toInsertInc.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        insertedExpenseCategories: insertedExp,
        insertedIncomeCategories: insertedInc,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[seed-new-user] fatal", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
