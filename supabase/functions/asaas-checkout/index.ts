import { handleCheckout } from "../_shared/billing-checkout.ts";
Deno.serve((req) => handleCheckout(req));
