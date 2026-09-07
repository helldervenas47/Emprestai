import { asaasFetch, billingJson } from "../_shared/asaas.ts";
import { requireAdmin, adminCors } from "../_shared/require-admin.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: adminCors });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return billingJson({ error: "method_not_allowed" }, 405);
  }

  try {
    // 1. Validar se o usuário é administrador
    const authResult = await requireAdmin(req);
    if (authResult instanceof Response) {
      return authResult;
    }

    // 2. Consultar saldo na API do Asaas (GET /v3/finance/balance)
    const balanceData = await asaasFetch("/finance/balance");

    return billingJson({
      balance: Number(balanceData?.balance ?? 0),
      pendingBalance: Number(balanceData?.pendingBalance ?? 0),
      retainedBalance: Number(balanceData?.retainedBalance ?? 0),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[asaas-balance] Erro ao consultar saldo:", err);
    return billingJson(
      { error: err?.message || "Erro ao consultar saldo no Asaas" },
      err?.status === 401 ? 401 : err?.status === 403 ? 403 : 500
    );
  }
});
