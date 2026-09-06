import { getExternalAdmin } from "../_shared/external-supabase.ts";
import { asaasFetch, authenticatedOwner, billingConfig, billingJson, planPriceCents } from "../_shared/asaas.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

export async function handleCheckout(req: Request, recurring = false) {
  if (req.method === "OPTIONS") return billingJson({});
  if (req.method !== "POST") return billingJson({ error: "method_not_allowed" },405);
  let admin: ReturnType<typeof getExternalAdmin> | undefined;
  let newOrderId: string | undefined;
  let gatewayAttempted = false;
  try {
    admin = getExternalAdmin();
    const user = await authenticatedOwner(admin, req);

    const allowed = await checkRateLimit({
      bucket: "billing:checkout",
      key: user.id,
      max: 10,
      windowSecs: 60,
    });
    if (!allowed) {
      return billingJson({ error: "Muitas tentativas de checkout. Aguarde 1 minuto." }, 429);
    }

    const { environment } = billingConfig();
    const body = await req.json();
    if (!/^[0-9a-f-]{36}$/i.test(body.requestKey ?? "")) return billingJson({ error: "invalid_request_key" },400);
    const { data: plan, error } = await admin.from("plans").select("*").eq("id",body.planId).eq("active",true).single();
    if (error || !plan) return billingJson({ error: "plan_not_found" },400);
    if (recurring && !body.planId && body.planName) {
      return billingJson({ error: "plan_id_required" },400);
    }
    const cents = planPriceCents(plan,body.cycle);
    const prepared = await admin.rpc("billing_prepare_order", {
      _uid:user.id,_env:environment,_key:body.requestKey,_plan:plan.id,_cycle:body.cycle,_cents:cents,_kind:recurring ? "recurring" : "pix",
    });
    if (prepared.error) throw new Error(prepared.error.message);
    const order = prepared.data.order;
    if (prepared.data.created) newOrderId = order.id;
    let payment: any;
    if (order.payment_id) {
      payment = await asaasFetch(`/payments/${encodeURIComponent(order.payment_id)}`);
    } else if (!prepared.data.created) {
      // A timed-out POST may have succeeded. Never blindly create a second charge.
      if (recurring) {
        const contracts=await asaasFetch(`/subscriptions?externalReference=${encodeURIComponent(order.id)}`);
        if (contracts.data?.length !== 1) return billingJson({error:"checkout_in_progress",orderId:order.id},409);
        const saved=await admin.from("billing_contracts").upsert({environment,subscription_id:contracts.data[0].id,order_id:order.id});
        if (saved.error) throw new Error("contract_save_failed");
      }
      const found = await asaasFetch(`/payments?externalReference=${encodeURIComponent(order.id)}`);
      if (found.data?.length !== 1) return billingJson({ error: "checkout_in_progress", orderId:order.id },409);
      payment=found.data[0];
    } else {
      const profile = await admin.from("profiles").select("display_name,cpf_cnpj").eq("user_id",user.id).maybeSingle();
      const cleanCpf = (
        (typeof body.cpfCnpj === "string" ? body.cpfCnpj : "") ||
        profile.data?.cpf_cnpj ||
        user.user_metadata?.cpf_cnpj ||
        user.raw_user_meta_data?.cpf_cnpj ||
        ""
      ).replace(/\D/g, "");

      if (cleanCpf && profile.data && !profile.data.cpf_cnpj) {
        await admin.from("profiles").update({ cpf_cnpj: cleanCpf }).eq("user_id", user.id).catch(() => {});
      }

      const customerRow = await admin.from("billing_customers").select("customer_id").eq("user_id",user.id).eq("environment",environment).maybeSingle();
      if (customerRow.error) throw new Error("customer_lookup_failed");
      let customerId=customerRow.data?.customer_id;
      if (!customerId) {
        const reference=`account:${user.id}:${environment}`;

        // 1. Busca por externalReference do usuário
        const found = await asaasFetch(`/customers?externalReference=${encodeURIComponent(reference)}`);
        if (found.data?.length > 1) throw new Error("duplicate_customers_review_required");
        let customer = found.data?.[0];

        // 2. Se não encontrou por externalReference e tem CPF, busca cliente existente por CPF no Asaas
        if (!customer && cleanCpf) {
          try {
            const foundByCpf = await asaasFetch(`/customers?cpfCnpj=${encodeURIComponent(cleanCpf)}`);
            if (foundByCpf.data?.length >= 1) {
              customer = foundByCpf.data[0];
            }
          } catch {
            // Continua para criação
          }
        }

        // 3. Se não encontrou, cria novo cliente no Asaas (com fallback se já existir)
        if (!customer) {
          try {
            customer = await asaasFetch("/customers", {
              method: "POST",
              body: JSON.stringify({
                name: profile.data?.display_name || user.email,
                email: user.email,
                cpfCnpj: cleanCpf || undefined,
                externalReference: reference,
                notificationDisabled: true,
              }),
            });
          } catch (createErr) {
            if (cleanCpf) {
              const retryCpf = await asaasFetch(`/customers?cpfCnpj=${encodeURIComponent(cleanCpf)}`).catch(() => null);
              if (retryCpf?.data?.[0]?.id) {
                customer = retryCpf.data[0];
              }
            }
            if (!customer && user.email) {
              const retryEmail = await asaasFetch(`/customers?email=${encodeURIComponent(user.email)}`).catch(() => null);
              if (retryEmail?.data?.[0]?.id) {
                customer = retryEmail.data[0];
              }
            }
            if (!customer) throw createErr;
          }
        }

        customerId = customer?.id;
        if (!customerId) throw new Error("invalid_customer_response");
        const saved = await admin.from("billing_customers").upsert({ user_id: user.id, environment, customer_id: customerId });
        if (saved.error) throw new Error("customer_save_failed");
      }
      const linked=await admin.from("billing_orders").update({customer_id:customerId}).eq("id",order.id);
      if(linked.error) throw new Error("order_save_failed");
      const due=new Date(Date.now()+86400000).toISOString().slice(0,10);
      gatewayAttempted = true;
      if (recurring) {
        const subscription=await asaasFetch("/subscriptions", {method:"POST",body:JSON.stringify({
          customer:customerId,billingType:"UNDEFINED",value:cents/100,nextDueDate:due,
          cycle:body.cycle === "annual" ? "YEARLY" : body.cycle === "semestral" ? "SEMIANNUALLY" : "MONTHLY",
          description:`Assinatura ${plan.name}`,externalReference:order.id,
        })});
        if (!subscription.id) throw new Error("invalid_subscription_response");
        const contract=await admin.from("billing_contracts").insert({environment,subscription_id:subscription.id,order_id:order.id});
        if (contract.error) throw new Error("contract_save_failed");
        payment=(await asaasFetch(`/subscriptions/${encodeURIComponent(subscription.id)}/payments`)).data?.[0];
        if (!payment) return billingJson({error:"checkout_in_progress",orderId:order.id},409);
      } else payment=await asaasFetch("/payments",{method:"POST",body:JSON.stringify({
        customer:customerId,billingType:"PIX",value:cents/100,dueDate:due,
        description:`Assinatura ${plan.name} (${body.cycle})`,externalReference:order.id,notificationDisabled:true,
      })});
    }
    if(!payment?.id || payment.externalReference!==order.id) throw new Error("invalid_payment_response");
    // Apply the authoritative gateway response transactionally, including early webhooks.
    const result=await admin.rpc("billing_apply_payment",{_env:environment,_event_id:`checkout:${crypto.randomUUID()}`,_event_type:"CHECKOUT_SYNC",_payment:payment});
    if(result.error || result.data?.review) throw new Error("payment_sync_review_required");
    let pix=null;
    if(!payment.deleted && ["PENDING","OVERDUE"].includes(payment.status)) {
      try { pix=await asaasFetch(`/payments/${encodeURIComponent(payment.id)}/pixQrCode`); } catch { /* invoice remains available */ }
    }
    return billingJson({checkoutUrl:payment.invoiceUrl,orderId:order.id,paymentId:payment.id,invoiceUrl:payment.invoiceUrl,status:payment.status,
      dueDate:payment.dueDate,value:payment.value,pix});
  } catch(e) {
    const message=(e as Error).message;
    console.error("[asaas-checkout]",message);
    if (admin && newOrderId) {
      await admin.from("billing_orders").update({
        status: "error",
        review_reason: message,
        checked_at: new Date().toISOString()
      }).eq("id", newOrderId).catch(() => {});
    }
    return billingJson({ error: message, message }, 400);
  }
}
