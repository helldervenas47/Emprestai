import { getExternalAdmin } from "../_shared/external-supabase.ts";
import { asaasFetch, billingConfig, billingJson } from "../_shared/asaas.ts";
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return billingJson({});
  if(req.method!=="POST")return billingJson({error:"method_not_allowed"},405);
  const secret=Deno.env.get("ASAAS_WEBHOOK_SECRET");
  if(!secret)return billingJson({error:"server_misconfigured"},500);
  if(req.headers.get("asaas-access-token")!==secret)return billingJson({error:"unauthorized"},403);
  try {
    const body=await req.json();
    if(typeof body.id!=="string" || typeof body.event!=="string")return billingJson({error:"invalid_event"},400);
    const {environment}=billingConfig();
    const admin=getExternalAdmin();
    if(!body.payment?.id) {
      const logged=await admin.from("asaas_webhook_events").upsert({event_id:`${environment}:${body.id}`,event_type:body.event,
        environment,payload:{event:body.event},status:"ignored",error_message:"not_a_payment_event",processed_at:new Date().toISOString()},{onConflict:"event_id"});
      if(logged.error)throw new Error("event_log_failed");
      return billingJson({received:true,ignored:true});
    }
    let payment;
    try { payment=await asaasFetch(`/payments/${encodeURIComponent(body.payment.id)}`); }
    catch(error) {
      // A removed payment may no longer be available for GET. The signed event
      // is allowed only for deletion, and the RPC still verifies its order/value/customer.
      if ((error as Error).message !== "asaas_http_404" || body.event !== "PAYMENT_DELETED") throw error;
      payment={...body.payment,deleted:true};
    }
    const result=await admin.rpc("billing_apply_payment",{_env:environment,_event_id:body.id,_event_type:body.event,_payment:payment});
    if(result.error)throw new Error(result.error.message);
    return billingJson({received:true,...result.data});
  }catch(e){console.error("[asaas-webhook]",(e as Error).message);return billingJson({error:"processing_failed"},500);}
});
