import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-emprestai-service-key",
};

const APP_TZ = "America/Sao_Paulo";

function todayStr(tz = APP_TZ): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function formatBRL(n: number): string {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatBRDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = dateStr.length >= 10 ? dateStr.substring(0, 10) : dateStr;
  const parts = d.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function diffDays(targetDate: string, baseDate: string): number {
  const da = new Date(targetDate + "T00:00:00").getTime();
  const db = new Date(baseDate + "T00:00:00").getTime();
  return Math.round((da - db) / (1000 * 60 * 60 * 24));
}

/**
 * Normaliza número de telefone brasileiro para múltiplos formatos comparáveis
 */
export function generatePhoneVariants(raw: string): string[] {
  let digits = (raw || "").replace(/\D/g, "");
  if (!digits) return [];

  let withoutCountry = digits;
  if (digits.startsWith("55") && digits.length >= 12) {
    withoutCountry = digits.substring(2);
  }

  const variants = new Set<string>();
  variants.add(digits);
  variants.add(withoutCountry);
  variants.add(`55${withoutCountry}`);

  if (withoutCountry.length === 11 && withoutCountry[2] === "9") {
    const eightDigits = withoutCountry.slice(0, 2) + withoutCountry.slice(3);
    variants.add(eightDigits);
    variants.add(`55${eightDigits}`);
  } else if (withoutCountry.length === 10) {
    const nineDigits = withoutCountry.slice(0, 2) + "9" + withoutCountry.slice(2);
    variants.add(nineDigits);
    variants.add(`55${nineDigits}`);
  }

  return Array.from(variants);
}

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/^\/whatsapp-customer-service/, "");
    const admin = getSupabaseAdmin();
    const today = todayStr();

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    // -------------------------------------------------------------
    // 1. LOOKUP DE CLIENTE, CREDOR E MEMÓRIA DE CONVERSA
    // -------------------------------------------------------------
    if (pathname === "/lookup" || pathname === "") {
      const { phone, provider_message_id } = body;
      if (!phone) {
        return new Response(JSON.stringify({ error: "Telefone é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const phoneVariants = generatePhoneVariants(phone);

      const { data: matchedClients, error: clientErr } = await admin
        .from("clients")
        .select("id, user_id, name, phone, cpf, active")
        .in("phone", phoneVariants)
        .eq("active", true);

      if (clientErr) throw clientErr;

      if (!matchedClients || matchedClients.length === 0) {
        return new Response(
          JSON.stringify({
            found: false,
            reason: "CLIENT_NOT_FOUND",
            message: "Nenhum cliente cadastrado correspondente a este número.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const distinctUsers = Array.from(new Set(matchedClients.map((c) => c.user_id)));
      if (distinctUsers.length > 1) {
        return new Response(
          JSON.stringify({
            found: true,
            ambiguous: true,
            reason: "MULTIPLE_CREDITORS_FOUND",
            message: "Número associado a múltiplos credores. Encaminhar para resolução segura.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const client = matchedClients[0];
      const userId = client.user_id;

      const [{ data: profile }, { data: branding }, { data: billingMessages }] = await Promise.all([
        admin.from("profiles").select("display_name, phone").eq("user_id", userId).maybeSingle(),
        admin.from("app_branding").select("app_title, company_name").eq("owner_id", userId).maybeSingle(),
        admin.from("whatsapp_billing_messages").select("pix_link").eq("owner_id", userId).maybeSingle(),
      ]);

      const creditorName = branding?.company_name || branding?.app_title || profile?.display_name || "Financeira";
      const hasPix = !!billingMessages?.pix_link?.trim();

      const { data: loans } = await admin
        .from("loans")
        .select("id, amount, installments, paid_installments, due_date, status, borrower_id, borrower_name")
        .eq("user_id", userId)
        .or(`borrower_id.eq.${client.id},borrower_name.ilike.%${client.name}%`)
        .neq("status", "paid");

      // Gerencia sessão de conversa
      const { data: conv } = await admin
        .from("whatsapp_customer_conversations")
        .select("*")
        .eq("user_id", userId)
        .eq("client_id", client.id)
        .maybeSingle();

      let conversationId = conv?.id;
      let humanSupportRequired = conv?.status === "human_support";

      if (!conv) {
        const { data: newConv } = await admin
          .from("whatsapp_customer_conversations")
          .insert({
            user_id: userId,
            client_id: client.id,
            phone: phoneVariants[0] || phone,
            status: "active",
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single();
        conversationId = newConv?.id;
      } else {
        await admin
          .from("whatsapp_customer_conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conv.id);
      }

      // Memória Conversacional
      let recentHistory: any[] = [];
      if (conversationId) {
        const { data: msgs } = await admin
          .from("whatsapp_customer_messages")
          .select("direction, intent, content, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(5);

        recentHistory = (msgs || []).reverse().map((m) => ({
          role: m.direction === "inbound" ? "user" : "assistant",
          intent: m.intent,
          content: m.content,
        }));
      }

      return new Response(
        JSON.stringify({
          found: true,
          ambiguous: false,
          conversation_id: conversationId,
          human_support_required: humanSupportRequired,
          client: {
            id: client.id,
            name: client.name,
            first_name: (client.name || "").split(" ")[0],
          },
          creditor: {
            user_id: userId,
            name: creditorName,
            has_pix_configured: hasPix,
          },
          loans_summary: {
            active_loans_count: loans?.length || 0,
            primary_loan_id: loans?.[0]?.id || null,
          },
          recent_history: recentHistory,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -------------------------------------------------------------
    // 2. TOOL: PRÓXIMA PARCELA
    // -------------------------------------------------------------
    if (pathname === "/tools/get-next-installment") {
      const { client_id, user_id, loan_id } = body;
      if (!client_id || !user_id) {
        return new Response(JSON.stringify({ error: "client_id e user_id são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let loanQuery = admin
        .from("loans")
        .select("id, amount, installments, paid_installments, due_date, status, borrower_id")
        .eq("user_id", user_id)
        .eq("borrower_id", client_id)
        .neq("status", "paid");

      if (loan_id) loanQuery = loanQuery.eq("id", loan_id);
      const { data: loans } = await loanQuery;

      if (!loans || loans.length === 0) {
        return new Response(
          JSON.stringify({ found: false, message: "Nenhum empréstimo em aberto localizado." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const activeLoan = loans[0];

      const { data: installments } = await admin
        .from("loan_installments")
        .select("id, installment_number, due_date, amount, paid")
        .eq("loan_id", activeLoan.id)
        .eq("user_id", user_id)
        .eq("paid", false)
        .order("installment_number", { ascending: true });

      const next = installments?.[0];

      if (next) {
        const daysDiff = diffDays(next.due_date, today);
        let statusDescription = "a vencer";
        if (daysDiff === 0) statusDescription = "vence hoje";
        else if (daysDiff < 0) statusDescription = `vencida há ${Math.abs(daysDiff)} dias`;
        else if (daysDiff === 1) statusDescription = "vence amanhã";

        return new Response(
          JSON.stringify({
            found: true,
            loan_id: activeLoan.id,
            installment_number: next.installment_number,
            total_installments: activeLoan.installments || installments?.length,
            due_date_iso: next.due_date,
            due_date_formatted: formatBRDate(next.due_date),
            amount: Number(next.amount),
            amount_formatted: formatBRL(Number(next.amount)),
            days_diff: daysDiff,
            status_description: statusDescription,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const fallbackAmount = Number(activeLoan.amount || 0);
      const fallbackDue = activeLoan.due_date;
      return new Response(
        JSON.stringify({
          found: true,
          loan_id: activeLoan.id,
          installment_number: Number(activeLoan.paid_installments || 0) + 1,
          total_installments: activeLoan.installments,
          due_date_iso: fallbackDue,
          due_date_formatted: formatBRDate(fallbackDue),
          amount: fallbackAmount,
          amount_formatted: formatBRL(fallbackAmount),
          days_diff: fallbackDue ? diffDays(fallbackDue, today) : 0,
          status_description: "parcela em aberto",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -------------------------------------------------------------
    // 3. TOOL: PARCELAS ATRASADAS
    // -------------------------------------------------------------
    if (pathname === "/tools/get-overdue-installments") {
      const { client_id, user_id, loan_id } = body;
      if (!client_id || !user_id) {
        return new Response(JSON.stringify({ error: "client_id e user_id são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let loanQuery = admin
        .from("loans")
        .select("id, amount, installments, paid_installments, status, borrower_id")
        .eq("user_id", user_id)
        .eq("borrower_id", client_id)
        .neq("status", "paid");

      if (loan_id) loanQuery = loanQuery.eq("id", loan_id);
      const { data: loans } = await loanQuery;

      if (!loans || loans.length === 0) {
        return new Response(
          JSON.stringify({ has_overdue: false, count: 0, items: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const loanIds = loans.map((l) => l.id);
      const { data: overdueList } = await admin
        .from("loan_installments")
        .select("id, loan_id, installment_number, due_date, amount, paid")
        .in("loan_id", loanIds)
        .eq("user_id", user_id)
        .eq("paid", false)
        .lt("due_date", today)
        .order("due_date", { ascending: true });

      const items = (overdueList || []).map((item) => ({
        installment_number: item.installment_number,
        due_date_iso: item.due_date,
        due_date_formatted: formatBRDate(item.due_date),
        amount: Number(item.amount),
        amount_formatted: formatBRL(Number(item.amount)),
        days_late: Math.abs(diffDays(item.due_date, today)),
      }));

      const totalOverdue = items.reduce((acc, curr) => acc + curr.amount, 0);

      return new Response(
        JSON.stringify({
          has_overdue: items.length > 0,
          count: items.length,
          total_overdue_amount: totalOverdue,
          total_overdue_formatted: formatBRL(totalOverdue),
          items,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -------------------------------------------------------------
    // 4. TOOL: SALDO DEVEDOR E PARCELAS RESTANTES
    // -------------------------------------------------------------
    if (pathname === "/tools/get-outstanding-balance") {
      const { client_id, user_id, loan_id } = body;
      if (!client_id || !user_id) {
        return new Response(JSON.stringify({ error: "client_id e user_id são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let loanQuery = admin
        .from("loans")
        .select("id, amount, installments, paid_installments, status, start_date, due_date, borrower_id")
        .eq("user_id", user_id)
        .eq("borrower_id", client_id)
        .neq("status", "paid");

      if (loan_id) loanQuery = loanQuery.eq("id", loan_id);
      const { data: loans } = await loanQuery;

      if (!loans || loans.length === 0) {
        return new Response(
          JSON.stringify({ has_active_loan: false, message: "Não constam débitos ou empréstimos ativos." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const activeLoan = loans[0];

      const { data: pendingInstallments } = await admin
        .from("loan_installments")
        .select("id, amount, paid")
        .eq("loan_id", activeLoan.id)
        .eq("user_id", user_id)
        .eq("paid", false);

      const remainingInstallmentsCount =
        pendingInstallments && pendingInstallments.length > 0
          ? pendingInstallments.length
          : Math.max(0, (activeLoan.installments || 0) - (activeLoan.paid_installments || 0));

      const totalRemaining =
        pendingInstallments && pendingInstallments.length > 0
          ? pendingInstallments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0)
          : Number(activeLoan.amount || 0);

      return new Response(
        JSON.stringify({
          has_active_loan: true,
          loan_id: activeLoan.id,
          total_amount: Number(activeLoan.amount),
          total_amount_formatted: formatBRL(Number(activeLoan.amount)),
          remaining_amount: totalRemaining,
          remaining_amount_formatted: formatBRL(totalRemaining),
          remaining_installments_count: remainingInstallmentsCount,
          total_installments: activeLoan.installments,
          paid_installments: activeLoan.paid_installments || 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -------------------------------------------------------------
    // 5. TOOL: PIX DO CREDOR
    // -------------------------------------------------------------
    if (pathname === "/tools/get-creditor-pix") {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [{ data: billingMessages }, { data: branding }, { data: profile }] = await Promise.all([
        admin.from("whatsapp_billing_messages").select("pix_link").eq("owner_id", user_id).maybeSingle(),
        admin.from("app_branding").select("company_name, app_title").eq("owner_id", user_id).maybeSingle(),
        admin.from("profiles").select("display_name").eq("user_id", user_id).maybeSingle(),
      ]);

      const pixKey = (billingMessages?.pix_link || "").trim();
      const holder = branding?.company_name || branding?.app_title || profile?.display_name || "Credor Responsável";

      if (!pixKey) {
        return new Response(
          JSON.stringify({
            has_pix: false,
            message: "A chave PIX não está configurada no momento. Por favor, consulte seu credor.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          has_pix: true,
          pix_key: pixKey,
          beneficiary_name: holder,
          instructions: "Após efetuar o pagamento, basta me avisar por aqui.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -------------------------------------------------------------
    // 6. TOOL: REGISTRAR AVISO DE PAGAMENTO ("JÁ PAGUEI")
    // -------------------------------------------------------------
    if (pathname === "/tools/report-payment") {
      const { client_id, user_id, loan_id, notes } = body;
      if (!client_id || !user_id) {
        return new Response(JSON.stringify({ error: "client_id e user_id são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await admin.from("whatsapp_payment_promises").insert({
        user_id: user_id,
        client_id: client_id,
        loan_id: loan_id || null,
        installment_number: 1,
        promised_at: today,
        status: "reported_by_client",
        notes: notes || "Cliente informou pelo WhatsApp que realizou o pagamento.",
      } as any);

      return new Response(
        JSON.stringify({
          success: true,
          payment_reported: true,
          message: "Aviso de pagamento registrado com sucesso. A baixa definitiva ocorrerá após conferência do credor.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -------------------------------------------------------------
    // 7. TOOL: SOLICITAR ATENDIMENTO HUMANO
    // -------------------------------------------------------------
    if (pathname === "/tools/request-human-support") {
      const { conversation_id, reason } = body;
      if (!conversation_id) {
        return new Response(JSON.stringify({ error: "conversation_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await admin
        .from("whatsapp_customer_conversations")
        .update({
          status: "human_support",
          metadata: { escalation_reason: reason || "Solicitação direta do cliente", escalated_at: new Date().toISOString() },
        })
        .eq("id", conversation_id);

      return new Response(
        JSON.stringify({
          success: true,
          status: "human_support",
          message: "Atendimento encaminhado para um atendente humano. O assistente virtual não enviará novas mensagens automáticas.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -------------------------------------------------------------
    // 8. LOG DE MENSAGENS E CONTROLE DE IDEMPOTÊNCIA
    // -------------------------------------------------------------
    if (pathname === "/log-message") {
      const { conversation_id, provider_message_id, direction, phone, intent, content, tool_called, tool_result } = body;

      if (provider_message_id) {
        const { data: existing } = await admin
          .from("whatsapp_customer_messages")
          .select("id")
          .eq("provider_message_id", provider_message_id)
          .maybeSingle();

        if (existing) {
          return new Response(
            JSON.stringify({ duplicate: true, message: "Mensagem já processada anteriormente (idempotência)." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      const { data: msg } = await admin
        .from("whatsapp_customer_messages")
        .insert({
          conversation_id,
          provider_message_id: provider_message_id || null,
          direction: direction || "inbound",
          phone: phone || "",
          intent: intent || null,
          content: content || "",
          tool_called: tool_called || null,
          tool_result: tool_result || null,
        })
        .select()
        .single();

      return new Response(JSON.stringify({ duplicate: false, message_id: msg?.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Endpoint não encontrado" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
