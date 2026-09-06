import { getExternalAdmin } from "../_shared/external-supabase.ts";
import { asaasFetch, authenticatedOwner, billingConfig, billingJson } from "../_shared/asaas.ts";
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return billingJson({});
 if(req.method!=="POST")return billingJson({error:"method_not_allowed"},405);
 try{
  const admin=getExternalAdmin(); const user=await authenticatedOwner(admin,req); const {environment}=billingConfig();
  const {paymentId}=await req.json();
  const found=await admin.from("billing_orders").select("*").eq("user_id",user.id).eq("environment",environment).eq("payment_id",paymentId).single();
  if(found.error || !found.data)return billingJson({error:"payment_not_found"},404);
  const order=found.data;
  if(!order.checked_at || Date.now()-Date.parse(order.checked_at)>15_000){
   const payment=await asaasFetch(`/payments/${encodeURIComponent(paymentId)}`);
   const applied=await admin.rpc("billing_apply_payment",{_env:environment,_event_id:`status:${crypto.randomUUID()}`,_event_type:"STATUS_SYNC",_payment:payment});
   if(applied.error)throw new Error(applied.error.message);
  }
  const fresh=await admin.from("billing_orders").select("status,review_reason").eq("id",order.id).single();
  if(fresh.error)throw new Error("status_read_failed");
  return billingJson({status:fresh.data.status,paid:fresh.data.status==="paid",review:fresh.data.review_reason});
 }catch(e){return billingJson({error:(e as Error).message},(e as Error).message==="unauthorized"?401:500);}
});
