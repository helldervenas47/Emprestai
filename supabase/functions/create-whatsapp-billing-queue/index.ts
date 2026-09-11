import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { validateUserOwner } from "../_shared/auth-guard.ts";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
  const anon = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;
  const adminKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
  const token = req.headers.get("Authorization") || "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: token } } });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return json({ error: "unauthorized" }, 401);
  const admin = createClient(url, adminKey);
  const body = await req.json().catch(() => ({}));
  const ownerId = String(body.owner_id || auth.user.id);
  const ownership = await validateUserOwner(admin, req, ownerId);
  if (!ownership.ok) return json({ error: ownership.reason }, 403);
  const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  if (!items.length) return json({ error: "empty_queue" }, 400);
  const loanIds = [...new Set(items.map((item: any) => item.loan_id))];
  const { data: ownedLoans } = await admin.from("loans").select("id, borrower_id, status, paid_installments").eq("user_id", ownerId).in("id", loanIds);
  const owned = new Map((ownedLoans || []).map((loan: any) => [loan.id, loan]));
  const clientIds = [...new Set(items.map((item: any) => item.client_id))];
  const { data: ownedClients } = await admin.from("clients").select("id, phone").eq("user_id", ownerId).in("id", clientIds);
  const clients = new Map((ownedClients || []).map((client: any) => [client.id, client]));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const todayStart = new Date(`${today}T00:00:00-03:00`);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const { data: sentClients } = await admin.from("whatsapp_billing_queue")
    .select("client_id")
    .eq("user_id", ownerId)
    .eq("status", "sent")
    .gte("sent_at", todayStart.toISOString())
    .lt("sent_at", tomorrow.toISOString())
    .in("client_id", clientIds);
  const alreadyCharged = new Set((sentClients || []).map((row: any) => row.client_id));
  const batchId = crypto.randomUUID();
  const createdAt = new Date();
  const rows = items.flatMap((item: any, index: number) => {
    const loan = owned.get(item.loan_id);
    const client = clients.get(item.client_id);
    const phone = String(client?.phone || "").replace(/\D/g, "");
    const normalizedPhone = phone.startsWith("55") ? phone : `55${phone}`;
    if (!loan || !client || alreadyCharged.has(item.client_id) || loan.borrower_id !== client.id || loan.status === "paid" || Number(loan.paid_installments) >= Number(item.installment_number) || !/^55\d{10,11}$/.test(normalizedPhone)) return [];
    return [{
      batch_id: batchId, user_id: ownerId, client_id: item.client_id, loan_id: item.loan_id,
      installment_number: item.installment_number, phone: normalizedPhone, message: String(item.message || "").slice(0, 4096),
      amount: item.amount, due_date: item.due_date, force_resend: body.force_resend === true,
      scheduled_at: new Date(createdAt.getTime() + index * 30_000).toISOString(),
    }];
  });
  if (!rows.length) return json({ error: alreadyCharged.size ? "already_charged_today" : "no_valid_owned_items" }, alreadyCharged.size ? 409 : 400);
  const { data, error } = await admin.from("whatsapp_billing_queue").insert(rows).select("id, status, scheduled_at");
  if (error) return json({ error: error.code === "23505" ? "duplicate_today" : error.message }, 409);
  return json({ batch_id: batchId, items: data });
});
