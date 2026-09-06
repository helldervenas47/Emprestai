import { handleCheckout } from "../_shared/billing-checkout.ts";
import { billingCors, billingJson } from "../_shared/asaas.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: billingCors });
  }
  try {
    return await handleCheckout(req);
  } catch (err) {
    console.error("[asaas-checkout fatal]", err);
    return billingJson({ error: (err as Error).message, message: (err as Error).message }, 400);
  }
});
