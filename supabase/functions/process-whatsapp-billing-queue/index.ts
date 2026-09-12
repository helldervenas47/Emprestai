import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { validateCronSecret, unauthorized } from "../_shared/auth-guard.ts";
import { sendWhatsappText } from "../_shared/whatsapp-service.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("EXTERNAL_SUPABASE_URL")!, Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!);
  if (!(await validateCronSecret(admin, req))) return unauthorized(cors);
  const { data: claimed, error } = await admin.rpc("claim_whatsapp_billing_queue_item");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
  const item = claimed?.[0];
  if (!item) return new Response(JSON.stringify({ ok: true, idle: true }), { headers: cors });
  try {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
    const todayStart = new Date(`${today}T00:00:00-03:00`);
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const { data: previousSend } = await admin.from("whatsapp_billing_queue")
      .select("id")
      .eq("user_id", item.user_id)
      .eq("client_id", item.client_id)
      .eq("status", "sent")
      .gte("sent_at", todayStart.toISOString())
      .lt("sent_at", tomorrow.toISOString())
      .neq("id", item.id)
      .limit(1)
      .maybeSingle();
    if (previousSend) {
      await admin.from("whatsapp_billing_queue").update({ status: "cancelled", error_message: "Cliente já cobrado hoje" }).eq("id", item.id);
      return new Response(JSON.stringify({ ok: true, id: item.id, skipped: "client_already_charged_today" }), { headers: cors });
    }
    const loanIds = Array.isArray(item.loan_ids) && item.loan_ids.length ? item.loan_ids : [item.loan_id];
    const { data: loans } = await admin.from("loans").select("id, status, paid_installments").in("id", loanIds).eq("user_id", item.user_id);
    if (!loans?.length || loans.some((loan: any) => loan.status === "paid") || (loanIds.length === 1 && Number(loans[0].paid_installments) >= item.installment_number)) throw new Error("Parcela já quitada ou indisponível");
    const { data: config } = await admin.from("whatsapp_billing_schedule").select("provider, base_url, instance_id").eq("owner_id", item.user_id).single();
    const apiKey = config?.provider === "wppconnect"
      ? Deno.env.get("WPPCONNECT_TOKEN") || ""
      : config?.provider === "evolution"
        ? Deno.env.get("EVOLUTION_API_KEY") || Deno.env.get("WHATSMIAU_API_KEY") || ""
        : Deno.env.get("WHATSMIAU_API_KEY") || "";
    if (!config?.base_url || !config?.instance_id || !apiKey) throw new Error("WhatsApp não configurado");
    const result = await sendWhatsappText({ provider: config.provider, baseUrl: config.base_url, instanceId: config.instance_id, apiKey }, item.phone, item.message);
    if (!result.ok) throw new Error(`HTTP ${result.status}: ${result.body.slice(0, 300)}`);
    await admin.from("whatsapp_billing_queue").update({ status: "sent", sent_at: new Date().toISOString(), error_message: null }).eq("id", item.id);
    await admin.from("whatsapp_billing_log").insert(loanIds.map((loanId: string) => ({ owner_id: item.user_id, loan_id: loanId, client_id: item.client_id, installment_number: loanId === item.loan_id ? item.installment_number : 0, status_when_sent: item.billing_status || "central", phone: item.phone, message: item.message, success: true, sent_date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date()) })));
    return new Response(JSON.stringify({ ok: true, id: item.id }), { headers: cors });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await admin.from("whatsapp_billing_queue").update({ status: "failed", error_message: message }).eq("id", item.id);
    const failedLoanIds = Array.isArray(item.loan_ids) && item.loan_ids.length ? item.loan_ids : [item.loan_id];
    await admin.from("whatsapp_billing_log").insert(failedLoanIds.map((loanId: string) => ({ owner_id: item.user_id, loan_id: loanId, client_id: item.client_id, installment_number: loanId === item.loan_id ? item.installment_number : 0, status_when_sent: item.billing_status || "central", phone: item.phone, message: item.message, success: false, error_message: message, sent_date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date()) })));
    return new Response(JSON.stringify({ ok: false, id: item.id, error: message }), { status: 502, headers: cors });
  }
});
